import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellPaintContext, CellRenderer, ColumnarData, Workbook } from "../src/types.js";

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs({ width: 360, height: 168 });
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof requestAnimationFrame;
});

afterEach(() => {
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
  document.body.replaceChildren();
});

interface RendererStats {
  mounts: number;
  updates: number;
  destroys: number;
  live: number;
}

function trackedRenderer(prefix: string, stats: RendererStats): CellRenderer {
  const sync = (element: HTMLElement, context: CellPaintContext): void => {
    element.textContent = `${prefix}:${String(context.value ?? "")}`;
    element.dataset.width = String(context.w);
    element.dataset.height = String(context.h);
  };
  return {
    dom(context) {
      stats.mounts += 1;
      stats.live += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.style.pointerEvents = "auto";
      button.setAttribute("aria-label", `Rendered ${String(context.value ?? "empty")}`);
      sync(button, context);
      return button;
    },
    update(element, context) {
      stats.updates += 1;
      sync(element, context);
    },
    destroy() {
      stats.destroys += 1;
      stats.live -= 1;
    },
  };
}

function fixture(): { workbook: Workbook; data: ColumnarData } {
  const columns = Array.from({ length: 10 }, (_, col) => ({
    key: `c${col}`,
    header: `C${col}`,
    width: 90,
    type: "text" as const,
    renderer: "dom",
  }));
  const sheet = {
    id: "s1",
    name: "Sheet 1",
    rowCount: 80,
    columns,
    frozenRows: 1,
    frozenCols: 1,
    merges: [{ r0: 2, c0: 1, r1: 3, c1: 2 }],
  };
  const second = {
    id: "s2",
    name: "Sheet 2",
    rowCount: 20,
    columns: columns.map((column) => ({ ...column })),
  };
  const values: Record<string, string[]> = {};
  for (let col = 0; col < columns.length; col++) {
    values[`c${col}`] = Array.from({ length: sheet.rowCount }, (_, row) => `r${row}c${col}`);
  }
  return {
    workbook: { activeSheet: "s1", sheets: [sheet, second] },
    data: { rowCount: sheet.rowCount, columns: values },
  };
}

function cell(host: HTMLElement, row: number, col: number): HTMLDivElement {
  const element = host.querySelector(`.sheetwrite-dom-cell[data-row="${row}"][data-col="${col}"]`);
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`expected retained DOM cell ${row}:${col}`);
  }
  return element;
}

function scroller(host: HTMLElement): HTMLDivElement {
  const element = host.querySelector(".sheetwrite-scroller");
  if (!(element instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return element;
}

function px(value: string): number {
  return Number.parseFloat(value);
}

describe("retained DOM cell renderer overlay", () => {
  it("reconciles merges, panes, edits, geometry, focus, replacement, reset, and destroy", () => {
    const firstStats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const secondStats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const first = trackedRenderer("first", firstStats);
    const second = trackedRenderer("second", secondStats);
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: first },
      overscan: 1,
      config: { toolbar: false, contextMenu: false, find: false },
    });

    const overlay = host.querySelector(".sheetwrite-dom-overlay");
    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(firstStats.live).toBe(host.querySelectorAll(".sheetwrite-dom-cell").length);
    expect(firstStats.live).toBeGreaterThan(0);

    const merged = cell(host, 2, 1);
    expect(host.querySelector('.sheetwrite-dom-cell[data-row="2"][data-col="2"]')).toBeNull();
    expect(merged.querySelector<HTMLElement>("button")?.dataset.width).toBe("180");

    const mergedButton = merged.querySelector("button");
    if (!(mergedButton instanceof HTMLButtonElement)) throw new Error("expected renderer button");
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "literal", value: "edited" },
        },
      ],
    });
    expect(cell(host, 2, 1).querySelector("button")).toBe(mergedButton);
    expect(mergedButton.textContent).toBe("first:edited");
    expect(firstStats.updates).toBeGreaterThan(0);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    mergedButton.focus();
    expect(document.activeElement).toBe(mergedButton);
    mergedButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 2, col: 1 },
    });

    const scroll = scroller(host);
    const frozenBounds = cell(host, 0, 0).querySelector<HTMLElement>(".sheetwrite-dom-cell-bounds");
    const bodyBounds = cell(host, 2, 1).querySelector<HTMLElement>(".sheetwrite-dom-cell-bounds");
    if (!frozenBounds || !bodyBounds) throw new Error("expected clipped renderer bounds");
    const frozenLeft = px(frozenBounds.style.left);
    const bodyLeft = px(bodyBounds.style.left);
    scroll.scrollLeft = 24;
    scroll.dispatchEvent(new Event("scroll"));
    expect(document.activeElement).toBe(mergedButton);
    expect(px(frozenBounds.style.left)).toBe(frozenLeft);
    expect(px(bodyBounds.style.left)).toBeLessThan(bodyLeft);

    grid.setZoom(2);
    expect(mergedButton.dataset.width).toBe("360");
    const viewport = host.querySelector(".sheetwrite-viewport");
    if (!(viewport instanceof HTMLDivElement)) throw new Error("expected grid viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 280, configurable: true });
    grid.refresh();
    const clippedWidth = px(cell(host, 2, 1).style.width);
    expect(clippedWidth).toBeGreaterThan(0);
    expect(clippedWidth).toBeLessThanOrEqual(280);

    let peakNodes = 0;
    for (const top of [0, 280, 560, 840]) {
      scroll.scrollTop = top;
      grid.refresh();
      peakNodes = Math.max(peakNodes, host.querySelectorAll(".sheetwrite-dom-cell").length);
      expect(firstStats.live).toBe(host.querySelectorAll(".sheetwrite-dom-cell").length);
    }
    expect(peakNodes).toBeLessThanOrEqual(40);

    const focusedCell = [...host.querySelectorAll<HTMLDivElement>(".sheetwrite-dom-cell")].find(
      (element) => element.dataset.row !== "0" && element.style.display !== "none",
    );
    const focused = focusedCell?.querySelector<HTMLButtonElement>("button");
    if (!focused) throw new Error("expected a visible scrolling renderer button");
    focused.focus();
    scroll.scrollTop = 2_000;
    grid.refresh();
    expect(document.activeElement === host).toBe(true);

    const oldDestroyCount = firstStats.destroys;
    grid.defineCellRenderer("dom", second);
    expect(firstStats.destroys).toBeGreaterThan(oldDestroyCount);
    expect(firstStats.live).toBe(0);
    expect(host.querySelector(".sheetwrite-dom-cell button")?.textContent).toStartWith("second:");
    expect(secondStats.live).toBe(host.querySelectorAll(".sheetwrite-dom-cell").length);

    grid.setActiveSheet("s2");
    expect(secondStats.live).toBe(host.querySelectorAll(".sheetwrite-dom-cell").length);
    expect(
      [...host.querySelectorAll<HTMLElement>(".sheetwrite-dom-cell")].every(
        (element) => element.dataset.sheet === "s2",
      ),
    ).toBe(true);

    grid.destroy();
    expect(firstStats.live).toBe(0);
    expect(secondStats.live).toBe(0);
    expect(host.querySelector(".sheetwrite-dom-overlay")).toBeNull();
    expect(host.querySelector(".sheetwrite-dom-cell")).toBeNull();
  });

  it("retains one tall merged-cell node while its anchor scrolls beyond the window", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.merges = [{ r0: 2, c0: 1, r1: 15, c1: 2 }];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("tall", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });

    const anchor = cell(host, 2, 1);
    const node = anchor.querySelector("button");
    scroller(host).scrollTop = 10 * 28;
    grid.refresh();

    expect(cell(host, 2, 1)).toBe(anchor);
    expect(anchor.querySelector("button")).toBe(node);
    expect(anchor.style.display).toBe("block");
    expect(host.querySelector('.sheetwrite-dom-cell[data-row="10"][data-col="1"]')).toBeNull();
    expect(host.querySelectorAll('.sheetwrite-dom-cell[data-row="2"][data-col="1"]')).toHaveLength(
      1,
    );
    grid.destroy();
    expect(stats.live).toBe(0);
  });

  it("refreshes legacy dom-only renderers on value changes without allocating on pure scroll", () => {
    const { workbook, data } = fixture();
    let calls = 0;
    const renderer: CellRenderer = {
      dom(context) {
        calls += 1;
        const element = document.createElement("span");
        element.textContent = String(context.value ?? "");
        return element;
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: renderer },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const initialCalls = calls;
    const scroll = scroller(host);
    scroll.scrollLeft = 1;
    grid.refresh();
    expect(calls).toBe(initialCalls);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "legacy-edit" },
        },
      ],
    });
    expect(calls).toBeGreaterThan(initialCalls);
    expect(cell(host, 0, 0).textContent).toBe("legacy-edit");
    grid.destroy();
  });
});
