import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid";
import { SheetwriteStore } from "../src/store";
import type { CellScalar, Store, Workbook } from "../src/types";
import { makeColumnarData, makeWorkbook } from "./fixtures";

// jsdom has no 2D canvas context, so record draw calls against a stub.
interface RecordingCtx {
  calls: Record<string, number>;
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  [op: string]: unknown;
}

function makeRecordingCtx(): RecordingCtx {
  const calls: Record<string, number> = {};
  const ctx: RecordingCtx = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
  };
  for (const op of [
    "setTransform",
    "fillRect",
    "fillText",
    "beginPath",
    "rect",
    "clip",
    "save",
    "restore",
    "moveTo",
    "lineTo",
    "stroke",
  ]) {
    ctx[op] = () => {
      calls[op] = (calls[op] ?? 0) + 1;
    };
  }
  return ctx;
}

/** A pure-JS Store double; `getCell` is a tripwire for hot-path misuse. */
function makeFakeStore(
  workbook: Workbook,
  hooks: { onGetCell?: () => void; onWindow?: () => void } = {},
): Store {
  return {
    getWorkbook: () => workbook,
    getCell: () => {
      hooks.onGetCell?.();
      throw new Error("Store.getCell must not be called in the render hot path");
    },
    getVisibleWindow: (sheet, rows, cols) => {
      hooks.onWindow?.();
      const n = Math.max(0, (rows.end - rows.start) * cols.length);
      const values: CellScalar[] = new Array(n);
      for (let i = 0; i < n; i++) values[i] = `v${i}`;
      return { sheet, rows, cols, values, styleIds: new Uint32Array(n), styles: [{}] };
    },
    applyTransaction: () => {},
    on: () => () => {},
    getDirty: () => [],
    markClean: () => {},
  };
}

let recording: RecordingCtx;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  recording = makeRecordingCtx();
  // Stub: cast the function (not an inline member read) to the method's type.
  const stub = (): CanvasRenderingContext2D => recording as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("Grid render hot path", () => {
  it("paints the visible window via getVisibleWindow and never getCell per cell", () => {
    const workbook = makeWorkbook(50);
    let getCellCalls = 0;
    let getWindowCalls = 0;
    const store = makeFakeStore(workbook, {
      onGetCell: () => {
        getCellCalls++;
      },
      onWindow: () => {
        getWindowCalls++;
      },
    });

    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    expect(getCellCalls).toBe(0);
    expect(getWindowCalls).toBeGreaterThan(0);
    expect(recording.calls.fillText).toBeGreaterThan(0);

    grid.destroy();
  });

  it("reports a selection through getSelection after setSelection", () => {
    const workbook = makeWorkbook(50);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, makeFakeStore(workbook));

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 1 } });
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 4, col: 1 } });

    grid.destroy();
  });
});

describe("Grid editing (Layer 3)", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("commits a typed edit through the editor into the store", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    // editor textarea mounts synchronously; well-known DOM node, narrow then read
    const node = host.querySelector("textarea.sheetwrite-editor");
    expect(node).not.toBeNull();
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.value = "Edited!";
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Edited!");
    grid.destroy();
  });
});
