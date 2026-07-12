import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Grid, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

// happy-dom has no 2D canvas or layout; stub both exactly like grid.test.ts.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  const noop = (): void => {};
  const recording = new Proxy(
    { canvas: null, fillStyle: "", strokeStyle: "", font: "", lineWidth: 1 },
    {
      get(target, prop) {
        if (prop in target) return Reflect.get(target, prop);
        return noop;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value);
        return true;
      },
    },
  );
  const stub = (): CanvasRenderingContext2D => recording as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 400,
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
  if (origClientHeight)
    Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

/** Pointer-capture recorder: happy-dom lacks the capture API entirely. */
interface CaptureLog {
  set: number[];
  released: number[];
}

function stubCapture(scroller: HTMLDivElement): CaptureLog {
  const log: CaptureLog = { set: [], released: [] };
  const captured = new Set<number>();
  Object.assign(scroller, {
    setPointerCapture: (id: number) => {
      log.set.push(id);
      captured.add(id);
    },
    releasePointerCapture: (id: number) => {
      log.released.push(id);
      captured.delete(id);
    },
    hasPointerCapture: (id: number) => captured.has(id),
  });
  return log;
}

function cellPoint(
  row: number,
  col: number,
  workbook: Workbook,
): { clientX: number; clientY: number } {
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");

  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c < col; c++) x += sheet.columns[c]?.width ?? 0;
  x += (sheet.columns[col]?.width ?? DEFAULT_THEME.rowHeight) / 2;

  const y =
    DEFAULT_THEME.headerHeight + row * DEFAULT_THEME.rowHeight + DEFAULT_THEME.rowHeight / 2;

  return { clientX: x, clientY: y };
}

/** Bottom-right corner of a cell — where the fill handle renders. */
function fillHandlePoint(
  row: number,
  col: number,
  workbook: Workbook,
): { clientX: number; clientY: number } {
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");

  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c <= col; c++) x += sheet.columns[c]?.width ?? 0;
  const y = DEFAULT_THEME.headerHeight + (row + 1) * DEFAULT_THEME.rowHeight;
  return { clientX: x, clientY: y };
}

type PointerInit = {
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerId?: number;
  pointerType?: string;
};

function pointer(type: string, init: PointerInit): PointerEvent {
  return new PointerEvent(type, {
    button: 0,
    pointerId: 1,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function makeGrid(): {
  grid: Grid;
  store: SheetwriteStore;
  workbook: Workbook;
  scroller: HTMLDivElement;
  capture: CaptureLog;
} {
  const workbook = makeWorkbook(10);
  const store = new SheetwriteStore(workbook, makeColumnarData(10));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  const scroller = scrollerOf(host);
  const capture = stubCapture(scroller);
  return { grid, store, workbook, scroller, capture };
}

describe("pointer input: mouse parity", () => {
  it("drag across cells produces a range selection and takes capture", () => {
    const { grid, scroller, workbook, capture } = makeGrid();

    scroller.dispatchEvent(pointer("pointerdown", { ...cellPoint(0, 0, workbook) }));
    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(2, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointerup", { ...cellPoint(2, 1, workbook) }));

    const sel = grid.getSelection();
    expect(sel?.kind).toBe("range");
    if (sel?.kind === "range") {
      expect(sel.range).toMatchObject({ start: { row: 0, col: 0 }, end: { row: 2, col: 1 } });
    }
    expect(capture.set).toEqual([1]);
    expect(capture.released).toEqual([1]);
  });

  it("drag on a column boundary commits a width patch", () => {
    const { store, scroller, workbook } = makeGrid();
    const boundaryX = DEFAULT_THEME.rowHeaderWidth + (workbook.sheets[0]?.columns[0]?.width ?? 0);

    scroller.dispatchEvent(pointer("pointerdown", { clientX: boundaryX, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointermove", { clientX: boundaryX + 30, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointerup", { clientX: boundaryX + 30, clientY: 10 }));

    expect(store.getWorkbook().sheets[0]?.columns[0]?.width).toBe(190);
  });
});

describe("pointer input: touch policy", () => {
  it("touch tap selects the cell without taking capture", () => {
    const { grid, scroller, workbook, capture } = makeGrid();

    scroller.dispatchEvent(
      pointer("pointerdown", { ...cellPoint(1, 1, workbook), pointerType: "touch" }),
    );

    expect(grid.getSelection()).toMatchObject({ kind: "cell", addr: { row: 1, col: 1 } });
    expect(capture.set).toEqual([]);
  });

  it("touch drag from a plain cell leaves selection alone (native scroll)", () => {
    const { grid, scroller, workbook, capture } = makeGrid();

    const down = pointer("pointerdown", { ...cellPoint(1, 1, workbook), pointerType: "touch" });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    scroller.dispatchEvent(
      pointer("pointermove", { ...cellPoint(4, 2, workbook), pointerType: "touch" }),
    );
    scroller.dispatchEvent(
      pointer("pointerup", { ...cellPoint(4, 2, workbook), pointerType: "touch" }),
    );

    expect(grid.getSelection()).toMatchObject({ kind: "cell", addr: { row: 1, col: 1 } });
    expect(capture.set).toEqual([]);
  });

  it("touch drag on the fill handle captures, previews, and commits the fill", () => {
    const { grid, store, scroller, workbook, capture } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });

    const handle = fillHandlePoint(0, 1, workbook);
    const down = pointer("pointerdown", { ...handle, pointerType: "touch" });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(capture.set).toEqual([1]);

    scroller.dispatchEvent(
      pointer("pointermove", { ...cellPoint(2, 1, workbook), pointerType: "touch" }),
    );
    scroller.dispatchEvent(
      pointer("pointerup", { ...cellPoint(2, 1, workbook), pointerType: "touch" }),
    );

    // Single-source fill repeats the source value down the dragged range.
    const source = store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved;
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(source);
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(source);
    expect(capture.released).toEqual([1]);
  });
});

describe("pointer input: drag lifecycle", () => {
  it("pointercancel mid fill-drag clears the preview and commits nothing", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const before = store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved;

    scroller.dispatchEvent(pointer("pointerdown", { ...fillHandlePoint(0, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(2, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointercancel", { ...cellPoint(2, 1, workbook) }));

    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(before);

    // The drag is fully torn down: a later pointerup must not commit either.
    scroller.dispatchEvent(pointer("pointerup", { ...cellPoint(3, 1, workbook) }));
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(before);
  });

  it("a second pointer's events are ignored during an active drag", () => {
    const { grid, scroller, workbook } = makeGrid();

    scroller.dispatchEvent(pointer("pointerdown", { ...cellPoint(0, 0, workbook), pointerId: 1 }));
    // Foreign pointer tries to extend the drag — must be ignored.
    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(5, 2, workbook), pointerId: 2 }));

    expect(grid.getSelection()).toMatchObject({ kind: "cell", addr: { row: 0, col: 0 } });

    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(1, 1, workbook), pointerId: 1 }));
    scroller.dispatchEvent(pointer("pointerup", { ...cellPoint(1, 1, workbook), pointerId: 1 }));

    const sel = grid.getSelection();
    expect(sel?.kind).toBe("range");
    if (sel?.kind === "range") {
      expect(sel.range).toMatchObject({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    }
  });
});
