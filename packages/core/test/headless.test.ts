import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellAddress, Renderer, Viewport, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

// happy-dom has no 2D canvas context and no layout engine, so the grid needs a
// stubbed context and hard-coded element dimensions to construct and paint.
// Renders are forced synchronous so a scheduled repaint is observable without
// racing a real animation-frame timer. (Same harness as grid-interaction.test.ts.)
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const originalRaf = globalThis.requestAnimationFrame;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  const rec: Record<string, unknown> = {
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
    rec[op] = () => {};
  }
  const stub = (): CanvasRenderingContext2D => rec as unknown as CanvasRenderingContext2D;
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
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
  if (origClientHeight)
    Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
  globalThis.requestAnimationFrame = originalRaf;
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

const A = (row: number, col: number): CellAddress => ({ sheet: "s1", row, col });

interface PaintRecorder extends Renderer {
  readonly paints: Array<{ rowHeights: number[] | null }>;
}

function makePaintRecorder(): PaintRecorder {
  let lastViewport: Viewport | null = null;
  const paints: Array<{ rowHeights: number[] | null }> = [];
  return {
    paints,
    mount() {},
    setLayout() {},
    setViewport(viewport: Viewport) {
      lastViewport = viewport;
    },
    paint() {
      paints.push({
        rowHeights: lastViewport?.rowHeights ? Array.from(lastViewport.rowHeights) : null,
      });
    },
    setTheme() {},
    setRenderers() {},
    destroy() {},
  };
}

describe("config.keyboard: false (headless key policy)", () => {
  // Contract: `keyboard: false` drops EVERY stock binding. A keydown on the host
  // must not navigate, start an edit, clear a cell, or open the find bar. The
  // policy gates keys only — pointer input still selects.
  it("ignores arrow navigation, type-to-edit, Delete, and Ctrl+F", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { keyboard: false } }, store);

    grid.setSelection({ kind: "cell", addr: A(2, 0) });

    // Arrow navigation is gated: selection stays put (stock ArrowDown -> row 3).
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const sel = grid.getSelection();
    expect(sel?.kind).toBe("cell");
    expect(sel?.kind === "cell" ? sel.addr.row : -1).toBe(2);

    // Type-to-edit is gated: no editor opens (stock printable key seeds one).
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();

    // Destructive clear is gated: Delete leaves the selected cell intact.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(store.getCell(A(2, 0)).resolved).toBe("Customer 2");

    // Find is gated: Ctrl+F does not open the (constructed-but-hidden) find bar.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    const findBar = host.querySelector(".sheetwrite-find");
    expect(findBar).toBeInstanceOf(HTMLElement);
    expect((findBar as HTMLElement).style.display).toBe("none");

    grid.destroy();
  });

  it("still routes mouse selection (policy gates keys, not pointers)", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { keyboard: false } }, store);
    expect(grid.getSelection()).toBeNull();

    // getBoundingClientRect is all-zeros in happy-dom, so client coords map
    // directly onto content geometry: clientY 70 -> content row 1 (past the
    // 32px header, second 28px row); clientX 100 -> col 0 (past the 48px gutter).
    const scroller = scrollerOf(host);
    scroller.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 100, clientY: 70, button: 0, bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 100, clientY: 70, bubbles: true }));

    const sel = grid.getSelection();
    expect(sel?.kind).toBe("cell");
    if (sel?.kind === "cell") {
      expect(sel.addr.row).toBe(1);
      expect(sel.addr.col).toBe(0);
    }

    grid.destroy();
  });
});

describe("config.keyboard: (e, grid) => boolean (host interceptor)", () => {
  // Contract: the handler runs before the stock bindings. Returning true consumes
  // the event (the stock binding must NOT also run); returning false falls
  // through to the stock binding. The handler receives the grid instance.
  it("consumes on true, falls through on false, and receives the grid", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();

    let received: unknown = null;
    const grid = new GridImpl(
      host,
      {
        workbook,
        // Consume ArrowDown; let everything else fall through to stock bindings.
        config: {
          keyboard: (e, g) => {
            received = g;
            return e.key === "ArrowDown";
          },
        },
      },
      store,
    );

    grid.setSelection({ kind: "cell", addr: A(2, 0) });

    // Returning true consumes: stock ArrowDown navigation must NOT run.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const afterDown = grid.getSelection();
    expect(afterDown?.kind === "cell" ? afterDown.addr.row : -1).toBe(2);
    expect(received).toBe(grid);

    // Returning false falls through: stock ArrowRight navigation moves the cell.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const afterRight = grid.getSelection();
    expect(afterRight?.kind).toBe("cell");
    if (afterRight?.kind === "cell") {
      expect(afterRight.addr.row).toBe(2);
      expect(afterRight.addr.col).toBe(1);
    }

    grid.destroy();
  });
});

describe("grid.styleRange", () => {
  // Contract: merge `style` over every cell of the rect as ONE undoable
  // transaction; preserve formulas; `null` clears cell styles.
  it("styles the whole rect and a single undo reverts every cell", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const cells: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];

    grid.styleRange(
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      {
        bold: true,
      },
    );
    for (const [r, c] of cells) expect(store.getCell(A(r, c)).style.bold).toBe(true);

    // One transaction: a single undo restores ALL four cells (per-cell commits
    // would leave the earlier cells still bold).
    grid.undo();
    for (const [r, c] of cells) expect(store.getCell(A(r, c)).style.bold).toBeUndefined();

    grid.destroy();
  });

  it("merges over an existing cell style rather than replacing it", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    grid.styleRange(range, { color: "#ff0000" });
    grid.styleRange(range, { bold: true });

    const style = store.getCell(A(0, 0)).style;
    expect(style.color).toBe("#ff0000");
    expect(style.bold).toBe(true);

    grid.destroy();
  });

  it("preserves a formula cell's source while styling it", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    store.applyTransaction({
      patches: [{ op: "set", addr: A(0, 1), value: { kind: "formula", src: "=6*7" } }],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    expect(store.getCell(A(0, 1)).resolved).toBe(42);

    grid.styleRange(
      { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
      {
        bold: true,
      },
    );

    // The formula (and its resolved value) survive; only style changed.
    expect(store.getFormula(A(0, 1))).toBe("=6*7");
    expect(store.getCell(A(0, 1)).resolved).toBe(42);
    expect(store.getCell(A(0, 1)).style.bold).toBe(true);

    grid.destroy();
  });

  it("clears cell styles when passed null", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    grid.styleRange(range, { bold: true, color: "#123456" });
    expect(store.getCell(A(0, 0)).style.bold).toBe(true);

    grid.styleRange(range, null);
    for (let r = 0; r <= 1; r++) {
      for (let c = 0; c <= 1; c++) {
        const style = store.getCell(A(r, c)).style;
        expect(style.bold).toBeUndefined();
        expect(style.color).toBeUndefined();
      }
    }

    grid.destroy();
  });
});

describe("grid.setRowHeight / grid.setColumnWidth (public geometry API)", () => {
  // Contract: the public setRowHeight forces a fresh paint carrying the new
  // per-row geometry (the same observable the row-header drag test pins, but
  // via the headless entry point).
  it("setRowHeight repaints with the new row geometry", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makePaintRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    // Construction's paint went to the real renderer; the recorder starts clean.
    expect(recorder.paints.length).toBe(0);

    grid.setRowHeight(0, 58);

    // A 5-row sheet keeps every row in-window, so no other paint-signature
    // component moves; only the row-height epoch can force this repaint.
    expect(recorder.paints.length).toBeGreaterThan(0);
    expect(recorder.paints.at(-1)?.rowHeights?.[0]).toBe(58);

    grid.destroy();
  });

  it("setColumnWidth commits an undoable width change", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const before = store.getWorkbook().sheets[0]!.columns[0]!.width;

    grid.setColumnWidth(0, before + 80);
    expect(store.getWorkbook().sheets[0]!.columns[0]!.width).toBe(before + 80);

    // Undoable: one undo restores the prior width.
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.columns[0]!.width).toBe(before);

    grid.destroy();
  });
});

describe("grid.dataEdge (Ctrl+Arrow jump target for headless keymaps)", () => {
  // Contract: data-space edges without a view; VIEW positions in and out under
  // an active sort view. The fixture makes the two answers differ: data rows
  // are B, A, <empty>, C, so the data-space run from row 0 ends at row 1,
  // while the ascending-sorted view (A, B, C, empties last) runs 0..2.
  it("returns the data-run edge in data space and view positions under a view", () => {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 0), value: { kind: "literal", value: "B" } },
        { op: "set", addr: A(1, 0), value: { kind: "literal", value: "A" } },
        { op: "set", addr: A(3, 0), value: { kind: "literal", value: "C" } },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    // Data space: rows 0-1 are a run, row 2 is empty → edge is row 1.
    expect(grid.dataEdge(0, 0, 1, 0)).toBe(1);

    // Ascending sort: view = A, B, C, then empties → view run 0..2, edge 2.
    grid.sortBy(0, true);
    expect(grid.dataEdge(0, 0, 1, 0)).toBe(2);

    grid.destroy();
  });
});

describe("config.tabs: false (headless tab bar suppression)", () => {
  function makeMultiSheetWorkbook(): Workbook {
    const column = { key: "name", header: "Name", width: 160, type: "text" as const };
    return {
      activeSheet: "s1",
      sheets: [
        { id: "s1", name: "Sheet 1", rowCount: 5, columns: [{ ...column }] },
        { id: "s2", name: "Sheet 2", rowCount: 5, columns: [{ ...column }] },
      ],
    };
  }

  // Contract: `tabs: false` renders no `.sheetwrite-tabbar` even for a
  // multi-sheet workbook.
  it("suppresses the tab bar on a multi-sheet workbook", () => {
    const host = mountHost();
    const grid = new GridImpl(
      host,
      { workbook: makeMultiSheetWorkbook(), config: { tabs: false } },
      new SheetwriteStore(makeMultiSheetWorkbook()),
    );
    expect(host.querySelector(".sheetwrite-tabbar")).toBeNull();
    grid.destroy();

    // Control: the same multi-sheet workbook with tabs explicitly enabled DOES
    // render the bar, so the null above is a real suppression, not a vacuous
    // query.
    const host2 = mountHost();
    const grid2 = new GridImpl(
      host2,
      { workbook: makeMultiSheetWorkbook(), config: { tabs: true } },
      new SheetwriteStore(makeMultiSheetWorkbook()),
    );
    expect(host2.querySelector(".sheetwrite-tabbar")).toBeInstanceOf(HTMLElement);
    grid2.destroy();
  });
});
