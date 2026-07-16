import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  Column,
  ColumnarData,
  PanePaint,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
  Workbook,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

// Renders are forced synchronous so a scheduled repaint is observable without
// racing a real animation-frame timer. (Same harness as grid-interaction.test.ts.)
const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  restoreStubs();
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

// A renderer that records the frame contracts each test inspects: plain paints
// (with a snapshot of the frame's row geometry, since Viewport.rowHeights aliases
// a reused scratch buffer), frozen-pane frames, layouts, and themes. `panes:false`
// omits `paintPanes` so the grid must fall back to `paint`.
interface PaintCapture {
  view: VisibleWindowView;
  rowHeights: number[] | null;
}
interface Recorder extends Renderer {
  readonly paints: PaintCapture[];
  readonly paneFrames: Array<{
    panes: readonly PanePaint[];
    divider: { x: number | null; y: number | null };
  }>;
  readonly layouts: RenderLayout[];
  readonly themes: Theme[];
}

function makeRecorder(opts: { panes?: boolean } = {}): Recorder {
  const paints: PaintCapture[] = [];
  const paneFrames: Recorder["paneFrames"] = [];
  const layouts: RenderLayout[] = [];
  const themes: Theme[] = [];
  let lastViewport: Viewport | null = null;
  const rec: Recorder = {
    paints,
    paneFrames,
    layouts,
    themes,
    mount() {},
    setLayout(layout: RenderLayout) {
      layouts.push(layout);
    },
    setViewport(viewport: Viewport) {
      lastViewport = viewport;
    },
    paint(view: VisibleWindowView) {
      paints.push({
        view,
        rowHeights: lastViewport?.rowHeights ? Array.from(lastViewport.rowHeights) : null,
      });
    },
    setTheme(theme: Theme) {
      themes.push(theme);
    },
    setRenderers() {},
    destroy() {},
  };
  if (opts.panes !== false) {
    rec.paintPanes = (panes, divider) => {
      paneFrames.push({ panes, divider });
    };
  }
  return rec;
}

/** A uniform sheet whose content overflows the 800x400 stubbed viewport so
 *  horizontal and vertical scroll are both valid production states. */
function makeGridSheet(
  rowCount: number,
  colCount: number,
  width: number,
): { workbook: Workbook; data: ColumnarData } {
  const columns: Column[] = [];
  const cols: Record<string, string[]> = {};
  for (let c = 0; c < colCount; c++) {
    const key = `c${c}`;
    columns.push({ key, header: `C${c}`, width, type: "text" });
    const values = new Array<string>(rowCount);
    for (let r = 0; r < rowCount; r++) values[r] = `r${r}c${c}`;
    cols[key] = values;
  }
  return {
    workbook: { activeSheet: "s1", sheets: [{ id: "s1", name: "Sheet 1", rowCount, columns }] },
    data: { rowCount, columns: cols },
  };
}

describe("frozen panes", () => {
  // Contract: with rows AND columns frozen and a renderer exposing paintPanes,
  // a frame arrives as four clipped panes (corner/top/left/body) that tile the
  // viewport; pinned axes paint at scroll 0 while the body carries the live
  // scroll; the freeze dividers sit at the split; and the frozen band's panes
  // read the pinned window [0, frozenRows) while the body reads rows past it.
  it("paints four tiled panes with pinned axes and freeze dividers", () => {
    // 12x100px columns (1200px) over an 800px viewport, 50 rows over 400px:
    // both scroll offsets below are real, in-range positions.
    const { workbook, data } = makeGridSheet(50, 12, 100);
    const store = new SheetwriteStore(workbook, data);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    // Force a concrete, valid scroll position; the grid reads these on render.
    const scroller = scrollerOf(host);
    Object.defineProperty(scroller, "scrollTop", {
      value: 120,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollLeft", {
      value: 200,
      writable: true,
      configurable: true,
    });

    grid.setFrozen(2, 1);

    const frame = recorder.paneFrames.at(-1);
    expect(frame).toBeDefined();
    if (!frame) throw new Error("expected a pane frame");
    expect(recorder.paints.length).toBe(0); // frozen frames never take the plain paint() path
    expect(frame.panes.length).toBe(4);

    const [corner, top, left, body] = frame.panes as [PanePaint, PanePaint, PanePaint, PanePaint];

    // Clips tile the viewport around the split at (xSplit, ySplit) = corner's size.
    expect(corner.clip.x).toBe(0);
    expect(corner.clip.y).toBe(0);
    expect(corner.clip.w).toBeGreaterThan(0);
    expect(corner.clip.h).toBeGreaterThan(0);

    expect(top.clip.x).toBe(corner.clip.w);
    expect(top.clip.y).toBe(0);
    expect(top.clip.h).toBe(corner.clip.h);
    expect(top.clip.w).toBe(body.clip.w);

    expect(left.clip.x).toBe(0);
    expect(left.clip.y).toBe(corner.clip.h);
    expect(left.clip.w).toBe(corner.clip.w);
    expect(left.clip.h).toBe(body.clip.h);

    expect(body.clip.x).toBe(corner.clip.w);
    expect(body.clip.y).toBe(corner.clip.h);

    // Freeze dividers straddle the split lines (offset by 0.5 for crisp strokes).
    expect(frame.divider.x).toBe(body.clip.x - 0.5);
    expect(frame.divider.y).toBe(body.clip.y - 0.5);

    // Pinned axes stay at scroll 0; the un-pinned axis tracks the body's scroll.
    expect(body.scrollTop).toBeGreaterThan(0);
    expect(body.scrollLeft).toBeGreaterThan(0);
    expect(corner.scrollTop).toBe(0);
    expect(corner.scrollLeft).toBe(0);
    expect(top.scrollTop).toBe(0); // rows pinned
    expect(top.scrollLeft).toBe(body.scrollLeft); // columns scroll with the body
    expect(left.scrollLeft).toBe(0); // columns pinned
    expect(left.scrollTop).toBe(body.scrollTop); // rows scroll with the body

    // Frozen-band panes read the pinned window [0, 2); the body starts past it.
    expect(corner.view.rows).toEqual({ start: 0, end: 2 });
    expect(top.view.rows).toEqual({ start: 0, end: 2 });
    expect(left.view.rows.start).toBeGreaterThanOrEqual(2);
    expect(body.view.rows.start).toBeGreaterThanOrEqual(2);
    expect(body.view.rows.start).toBe(left.view.rows.start);

    grid.destroy();
  });

  it("retains exact scalar values for equal-sized adjacent panes", () => {
    const { workbook, data } = makeGridSheet(50, 12, 100);
    const store = new SheetwriteStore(workbook, data);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, overscan: 0 }, store);
    const viewport = host.querySelector(".sheetwrite-viewport");
    if (!(viewport instanceof HTMLDivElement)) throw new Error("expected grid viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 700, configurable: true });
    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    const scroller = scrollerOf(host);
    Object.defineProperty(scroller, "scrollTop", {
      value: 120,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollLeft", {
      value: 200,
      writable: true,
      configurable: true,
    });

    grid.setFrozen(2, 1);
    const frame = recorder.paneFrames.at(-1);
    expect(frame).toBeDefined();
    if (!frame) throw new Error("expected a pane frame");
    const [, top, left] = frame.panes as [PanePaint, PanePaint, PanePaint, PanePaint];

    expect(top.view.values.length).toBe(left.view.values.length);
    expect(top.view.values).not.toBe(left.view.values);
    for (const pane of frame.panes) {
      const expected: string[] = [];
      for (let row = pane.view.rows.start; row < pane.view.rows.end; row++) {
        for (const col of pane.view.cols) expected.push(`r${row}c${col}`);
      }
      expect(pane.view.values).toEqual(expected);
    }

    grid.destroy();
  });

  it("reuses pane windows for sub-cell scroll and refreshes them at a row boundary", () => {
    const { workbook, data } = makeGridSheet(50, 12, 100);
    const store = new SheetwriteStore(workbook, data);
    const originalGetVisibleWindow = store.getVisibleWindow.bind(store);
    let windowReads = 0;
    Reflect.set(
      store,
      "getVisibleWindow",
      (...args: Parameters<SheetwriteStore["getVisibleWindow"]>) => {
        windowReads += 1;
        return originalGetVisibleWindow(...args);
      },
    );
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, overscan: 0 }, store);
    const viewport = host.querySelector(".sheetwrite-viewport");
    if (!(viewport instanceof HTMLDivElement)) throw new Error("expected grid viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 700, configurable: true });
    const recorder = makeRecorder();
    Reflect.set(grid, "renderer", recorder);

    const scroller = scrollerOf(host);
    Object.defineProperty(scroller, "scrollTop", {
      value: 120,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollLeft", {
      value: 200,
      writable: true,
      configurable: true,
    });
    const expectPaneValues = (frame: Recorder["paneFrames"][number]): void => {
      for (const pane of frame.panes) {
        const expected: string[] = [];
        for (let row = pane.view.rows.start; row < pane.view.rows.end; row++) {
          for (const col of pane.view.cols) expected.push(`r${row}c${col}`);
        }
        expect(pane.view.values).toEqual(expected);
      }
    };

    windowReads = 0;
    grid.setFrozen(2, 1);
    const baselineReads = windowReads;
    const baselineFrame = recorder.paneFrames.at(-1);
    if (!baselineFrame) throw new Error("expected a baseline frozen frame");
    expect(baselineReads).toBeGreaterThan(0);
    expectPaneValues(baselineFrame);

    scroller.scrollTop += 1;
    scroller.scrollLeft += 1;
    grid.refresh();
    const pixelFrame = recorder.paneFrames.at(-1);
    if (!pixelFrame) throw new Error("expected a sub-cell scroll frame");
    expect(windowReads - baselineReads).toBe(0);
    expect(pixelFrame.panes.at(-1)?.view.rows).toEqual(baselineFrame.panes.at(-1)?.view.rows);
    expect(pixelFrame.panes.at(-1)?.view.cols).toEqual(baselineFrame.panes.at(-1)?.view.cols);
    expectPaneValues(pixelFrame);

    const readsBeforeBoundary = windowReads;
    const bodyStartBeforeBoundary = pixelFrame.panes.at(-1)?.view.rows.start ?? -1;
    scroller.scrollTop += 24;
    grid.refresh();
    const boundaryFrame = recorder.paneFrames.at(-1);
    if (!boundaryFrame) throw new Error("expected a boundary-crossing frame");
    expect(windowReads).toBeGreaterThan(readsBeforeBoundary);
    expect(boundaryFrame.panes.at(-1)?.view.rows.start).toBeGreaterThan(bodyStartBeforeBoundary);
    expectPaneValues(boundaryFrame);

    grid.destroy();
  });

  // Contract: unfreezing (setFrozen(0,0)) drops the pane path — the next frame
  // is a plain paint() and no new pane frame is emitted.
  it("reverts to plain paint() when nothing is frozen", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setFrozen(2, 1);
    expect(recorder.paneFrames.length).toBe(1);
    expect(recorder.paints.length).toBe(0);

    grid.setFrozen(0, 0);
    // Pre-revert path would repaint via panes; the revert must use plain paint().
    expect(recorder.paints.length).toBeGreaterThan(0);
    expect(recorder.paneFrames.length).toBe(1); // no additional pane frame

    grid.destroy();
  });

  // Contract: a renderer without paintPanes must never be driven down the pane
  // path — the grid falls back to paint() and does not crash.
  it("falls back to a correctly scrolled paint when the renderer lacks paintPanes", () => {
    const { workbook, data } = makeGridSheet(50, 12, 100);
    const store = new SheetwriteStore(workbook, data);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, overscan: 0 }, store);
    const recorder = makeRecorder({ panes: false });
    Reflect.set(grid, "renderer", recorder);
    const scroller = scrollerOf(host);
    Object.defineProperty(scroller, "scrollTop", {
      value: 120,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollLeft", {
      value: 200,
      writable: true,
      configurable: true,
    });

    grid.setFrozen(2, 1);

    const frame = recorder.paints.at(-1);
    if (!frame) throw new Error("expected a plain fallback frame");
    expect(frame.view.rows.start).toBeGreaterThan(0);
    expect(frame.view.cols[0]).toBeGreaterThan(0);
    const expected: string[] = [];
    for (let row = frame.view.rows.start; row < frame.view.rows.end; row++) {
      for (const col of frame.view.cols) expected.push(`r${row}c${col}`);
    }
    expect(frame.view.values).toEqual(expected);

    grid.destroy();
  });
});

describe("zoom", () => {
  // Contract: setZoom clamps finite arguments into [0.5, 2], leaves in-range
  // factors untouched, and ignores values that cannot produce valid geometry.
  it("clamps finite zoom factors to [0.5, 2]", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const cases: Array<{ input: number; expected: number }> = [
      { input: 0.25, expected: 0.5 },
      { input: 0.5, expected: 0.5 },
      { input: 1.5, expected: 1.5 },
      { input: 2, expected: 2 },
      { input: 5, expected: 2 },
    ];
    for (const { input, expected } of cases) {
      grid.setZoom(input);
      expect(grid.getZoom()).toBe(expected);
    }

    grid.destroy();
  });

  it("ignores non-finite zoom factors without corrupting geometry", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.setZoom(1.5);

    for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      grid.setZoom(input);
      expect(grid.getZoom()).toBe(1.5);
      expect(grid.getEffectiveTheme().rowHeight).toBe(28 * 1.5);
    }

    grid.destroy();
  });

  // Contract: zoom scales painted geometry only. At zoom 2 the renderer's layout
  // column widths and the theme's row/header heights are doubled, while the
  // workbook's base Column.width values are never mutated.
  it("scales painted geometry by zoom while the workbook keeps base units", () => {
    const workbook = makeWorkbook(20);
    const baseWidths = workbook.sheets[0]!.columns.map((c) => c.width);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setZoom(2);
    const layoutAt2 = recorder.layouts.at(-1);
    const themeAt2 = recorder.themes.at(-1);
    grid.setZoom(1);
    const layoutAt1 = recorder.layouts.at(-1);
    const themeAt1 = recorder.themes.at(-1);
    if (!layoutAt2 || !layoutAt1 || !themeAt2 || !themeAt1)
      throw new Error("expected layout/theme frames at both zoom levels");

    // Painted layout widths are 2x the base at zoom 2, 1x at zoom 1.
    baseWidths.forEach((w, i) => {
      expect(layoutAt2.columns[i]!.width).toBe(w * 2);
      expect(layoutAt1.columns[i]!.width).toBe(w);
    });

    // Painted theme geometry doubles at zoom 2 relative to the zoom-1 base.
    expect(themeAt2.rowHeight).toBe(themeAt1.rowHeight * 2);
    expect(themeAt2.headerHeight).toBe(themeAt1.headerHeight * 2);

    // Zoom never rewrites the workbook's base column widths.
    expect(workbook.sheets[0]!.columns.map((c) => c.width)).toEqual(baseWidths);

    grid.destroy();
  });

  // Contract: a row-height override persists in BASE units on the sheet, but the
  // painted frame carries the zoomed height.
  it("keeps row-height overrides in base units and paints them zoomed", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setZoom(2);
    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(0, 40);

    // Stored base unit is unscaled...
    expect(workbook.sheets[0]!.rowHeights?.get(0)).toBe(40);
    // ...but the painted geometry is the zoomed height (40 * 2).
    const rowHeights = recorder.paints.at(-1)?.rowHeights;
    expect(rowHeights?.[0]).toBe(80);

    grid.destroy();
  });
});

describe("view composition", () => {
  // Contract: the grid's view wrappers delegate to the store AND rebuild the
  // grid's own row index (applyView), so a composed filter+hide+sort both
  // shrinks the reported view count and bounds the painted window to it.
  it("composes filter, hide, and sort into a shrunken painted view", () => {
    const workbook = makeWorkbook(50);
    const store = new SheetwriteStore(workbook, makeColumnarData(50));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    // City column cycles Phnom Penh/Tokyo/Berlin; Tokyo is data rows 1,4,...,49
    // (17 rows). Hiding two of them leaves 15; the sort only reorders.
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    grid.hideRows([1, 4]);
    grid.sortByMulti([{ col: 1, ascending: false }]);

    expect(grid.store.viewRowCount("s1")).toBe(15);

    // 15 view rows fit inside one render window (viewport ~14 rows + overscan),
    // so the painted window spans the whole view: a skipped applyView would
    // leave the 50-row index and paint a window running past row 15.
    const last = recorder.paints.at(-1)?.view;
    expect(last?.rows).toEqual({ start: 0, end: 15 });

    grid.destroy();
  });

  // Contract: distinctValues surfaces the active column's distinct scalars in
  // first-seen order.
  it("returns the column's distinct scalars", () => {
    const workbook = makeWorkbook(50);
    const store = new SheetwriteStore(workbook, makeColumnarData(50));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    expect(grid.distinctValues(2)).toEqual(["Phnom Penh", "Tokyo", "Berlin"]);
    expect(grid.distinctValues(1, 3)).toEqual([0.5, 10.5, 20.5]);

    grid.destroy();
  });

  // Contract: collapsing a row group hides its rows in both the reported count
  // and the painted window; expanding restores them.
  it("collapses and expands a row group in the painted view", () => {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook, makeColumnarData(6));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.groupRows(1, 3);
    expect(grid.store.viewRowCount("s1")).toBe(6); // a non-collapsed group hides nothing

    grid.setGroupCollapsed(1, true);
    expect(grid.store.viewRowCount("s1")).toBe(3); // rows 1..3 hidden
    expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: 3 });

    grid.setGroupCollapsed(1, false);
    expect(grid.store.viewRowCount("s1")).toBe(6);
    expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: 6 });

    grid.destroy();
  });
});

describe("row heights under views", () => {
  // Regression: setRowHeight takes a VIEW row but must persist the override keyed
  // by the underlying DATA row, so that after the view is cleared the height
  // reappears on that data row's natural position — not on the old view slot.
  it("keys overrides by data row and repaints them on the natural row after clearView", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    // Sort amount descending → view order [4,3,2,1,0]; view row 1 is data row 3.
    grid.sortBy(1, false);
    const dataRow = store.dataRowAt("s1", 1);
    expect(dataRow).toBe(3);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(1, 60);

    // Persisted keyed by DATA row 3, never by the view row 1 (the pre-fix bug).
    expect(workbook.sheets[0]!.rowHeights?.get(dataRow)).toBe(60);
    expect(workbook.sheets[0]!.rowHeights?.has(1)).toBe(false);

    grid.clearView();

    // Cleared view is identity, so data row 3 sits at view position 3. The
    // override must paint there; pre-fix it landed on row 1.
    const rowHeights = recorder.paints.at(-1)?.rowHeights;
    expect(rowHeights?.[dataRow]).toBe(60);
    expect(rowHeights?.[1]).not.toBe(60);

    grid.destroy();
  });
});
