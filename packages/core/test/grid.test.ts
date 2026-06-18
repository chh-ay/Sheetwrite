import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl } from "../src/grid";
import type { CellScalar, Store, Workbook } from "../src/types";
import { makeWorkbook } from "./fixtures";

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
