import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  CellPaintContext,
  CellRenderer,
  ColumnarData,
  PresenceOverlay,
  Workbook,
} from "../src/types.js";

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
    element.dataset.color = context.style.color ?? "";
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

  it("preserves native button activation without changing grid selection", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("interactive", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 4 } });
    const button = cell(host, 2, 1).querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("expected renderer button");
    let activations = 0;
    button.addEventListener("click", () => {
      activations += 1;
    });

    button.focus();
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    button.click();

    expect(activations).toBe(1);
    expect(document.activeElement).toBe(button);
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 4, col: 4 },
    });
    grid.destroy();
    expect(stats.live).toBe(0);
  });

  it("mounts and refreshes a tall merge anchor outside the visible row window", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.merges = [{ r0: 20, c0: 1, r1: 60, c1: 2 }];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("tall", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });

    expect(host.querySelector('.sheetwrite-dom-cell[data-row="20"][data-col="1"]')).toBeNull();
    scroller(host).scrollTop = 35 * 28;
    grid.refresh();

    const anchor = cell(host, 20, 1);
    const node = anchor.querySelector("button");
    expect(node?.textContent).toBe("tall:r20c1");
    expect(anchor.style.display).toBe("block");
    expect(host.querySelector('.sheetwrite-dom-cell[data-row="35"][data-col="1"]')).toBeNull();

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 20, col: 1 },
          value: { kind: "literal", value: "off-window-edit" },
          style: { color: "#123456" },
        },
      ],
    });
    expect(cell(host, 20, 1)).toBe(anchor);
    expect(anchor.querySelector("button")).toBe(node);
    expect(node?.textContent).toBe("tall:off-window-edit");
    expect(node?.dataset.color).toBe("#123456");
    expect(host.querySelectorAll('.sheetwrite-dom-cell[data-row="20"][data-col="1"]')).toHaveLength(
      1,
    );
    grid.destroy();
    expect(stats.live).toBe(0);
  });

  it("keeps effective-style caches local to each frozen-pane style table", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.columns[1]!.cellStyle = { backgroundColor: "#ffffff" };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("styled", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: "frozen" },
          style: { color: "#aa0000" },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "literal", value: "body" },
          style: { color: "#0000aa" },
        },
      ],
    });

    expect(cell(host, 0, 1).querySelector<HTMLElement>("button")?.dataset.color).toBe("#aa0000");
    expect(cell(host, 1, 1).querySelector<HTMLElement>("button")?.dataset.color).toBe("#0000aa");
    grid.destroy();
    expect(stats.live).toBe(0);
  });

  it("preserves an update failure while exactly-once cleaning hostile destroy hooks", () => {
    const { workbook, data } = fixture();
    workbook.sheets[0]!.frozenRows = 0;
    workbook.sheets[0]!.frozenCols = 0;
    workbook.sheets[0]!.merges = [];
    let failUpdate = false;
    let destroys = 0;
    const renderer: CellRenderer = {
      dom() {
        return document.createElement("button");
      },
      update() {
        if (failUpdate) throw new Error("renderer update failed");
      },
      destroy() {
        destroys += 1;
        throw new Error("renderer destroy failed");
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
    const mounted = host.querySelectorAll(".sheetwrite-dom-cell").length;
    failUpdate = true;

    expect(() =>
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "literal", value: "update-failure" },
          },
        ],
      }),
    ).toThrow("renderer update failed");
    expect(destroys).toBe(mounted);
    expect(host.querySelectorAll(".sheetwrite-dom-cell")).toHaveLength(0);

    grid.destroy();
    expect(host.querySelector(".sheetwrite-dom-overlay")).toBeNull();
  });

  it("preserves a mount failure while cleaning every prior-frame entry", () => {
    const { workbook, data } = fixture();
    workbook.sheets[0]!.frozenRows = 0;
    workbook.sheets[0]!.frozenCols = 0;
    workbook.sheets[0]!.merges = [];
    let failMount = false;
    let destroys = 0;
    const renderer: CellRenderer = {
      dom() {
        if (failMount) throw new Error("renderer dom failed");
        return document.createElement("button");
      },
      update() {},
      destroy() {
        destroys += 1;
        throw new Error("renderer destroy failed");
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
    const mounted = host.querySelectorAll(".sheetwrite-dom-cell").length;
    failMount = true;
    scroller(host).scrollTop = 40 * 28;

    expect(() => grid.refresh()).toThrow("renderer dom failed");
    expect(destroys).toBe(mounted);
    expect(host.querySelectorAll(".sheetwrite-dom-cell")).toHaveLength(0);

    grid.destroy();
    expect(host.querySelector(".sheetwrite-dom-overlay")).toBeNull();
  });

  it("completes structural grid teardown when every renderer destroy hook throws", () => {
    const { workbook, data } = fixture();
    let destroys = 0;
    const renderer: CellRenderer = {
      dom() {
        return document.createElement("button");
      },
      destroy() {
        destroys += 1;
        throw new Error("renderer destroy failed");
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
    const mounted = host.querySelectorAll(".sheetwrite-dom-cell").length;

    expect(() => grid.destroy()).toThrow("renderer destroy failed");
    expect(destroys).toBe(mounted);
    expect(host.querySelector(".sheetwrite-dom-overlay")).toBeNull();
    expect(host.querySelector(".sheetwrite-viewport")).toBeNull();
    expect(host.classList.contains("sheetwrite")).toBe(false);
    expect(() => grid.destroy()).not.toThrow();
    expect(destroys).toBe(mounted);
  });

  it("rejects one renderer node shared by two cells and releases its ownership", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.frozenRows = 0;
    workbook.sheets[0]!.frozenCols = 0;
    workbook.sheets[0]!.merges = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("initial", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const shared = document.createElement("button");
    let sharedDestroys = 0;
    const sharedRenderer: CellRenderer = {
      dom() {
        return shared;
      },
      destroy() {
        sharedDestroys += 1;
      },
    };

    expect(() => grid.defineCellRenderer("dom", sharedRenderer)).toThrow(
      "CellRenderer.dom() must return a unique HTMLElement for each cell",
    );
    expect(sharedDestroys).toBe(1);
    expect(shared.parentNode).toBeNull();
    expect(host.querySelectorAll(".sheetwrite-dom-cell")).toHaveLength(0);

    let returnedShared = false;
    grid.defineCellRenderer("dom", {
      dom() {
        if (!returnedShared) {
          returnedShared = true;
          return shared;
        }
        return document.createElement("button");
      },
    });
    expect(shared.isConnected).toBe(true);
    grid.destroy();
    expect(shared.parentNode).toBeNull();
  });

  it("rejects a connected host node without reparenting or destroying it", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    const externalHost = document.createElement("div");
    const external = document.createElement("button");
    externalHost.appendChild(external);
    document.body.append(host, externalHost);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("initial", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    let destroys = 0;

    expect(() =>
      grid.defineCellRenderer("dom", {
        dom() {
          return external;
        },
        destroy() {
          destroys += 1;
        },
      }),
    ).toThrow("CellRenderer.dom() must return a fresh detached HTMLElement");
    expect(external.parentNode).toBe(externalHost);
    expect(external.isConnected).toBe(true);
    expect(destroys).toBe(0);
    expect(host.querySelectorAll(".sheetwrite-dom-cell")).toHaveLength(0);
    grid.destroy();
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

  it("separates pooled presence ranges from contrast-safe identity chips", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("presence", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const longIdentity = `Remote ${"operator ".repeat(20)}`.trim();
    const overlays: PresenceOverlay[] = [
      {
        actorId: "long",
        displayName: longIdentity,
        color: "#58c4dc",
        activeSheet: "s1",
        ranges: [
          { sheet: "s1", start: { row: 3, col: 2 }, end: { row: 3, col: 2 } },
          { sheet: "s1", start: { row: 4, col: 3 }, end: { row: 4, col: 3 } },
        ],
      },
      {
        actorId: "top",
        displayName: "Top row",
        color: "hsl(12, 80%, 45%)",
        activeSheet: "s1",
        ranges: [{ sheet: "s1", start: { row: 0, col: 2 }, end: { row: 0, col: 2 } }],
      },
    ];

    grid.setPresenceOverlays(overlays);
    grid.refresh();
    const ranges = [...host.querySelectorAll<HTMLElement>("[data-sheetwrite-presence]")];
    const labels = [...host.querySelectorAll<HTMLElement>("[data-sheetwrite-presence-label]")];
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    expect(labels).toHaveLength(2);
    expect(host.querySelectorAll('[data-sheetwrite-presence-label="long"]')).toHaveLength(1);
    expect(ranges.every((range) => range.textContent === "")).toBe(true);
    expect(ranges.every((range) => range.getAttribute("aria-hidden") === "true")).toBe(true);

    const marker = host.querySelector<HTMLElement>('[data-sheetwrite-presence-label="long"]')!;
    const longRange = host.querySelector<HTMLElement>('[data-sheetwrite-presence="long"]')!;
    expect(marker.dataset.presenceKind).toBe("marker");
    expect(marker.getAttribute("role")).toBe("img");
    expect(marker.getAttribute("aria-label")).toBe(`Remote selection: ${longIdentity}`);
    expect(marker.title).toBe(longIdentity);
    expect(marker.textContent).toBe("");
    expect(marker.style.background).not.toBe("");
    expect(px(marker.style.top)).toBeGreaterThanOrEqual(px(longRange.style.top));
    expect(px(marker.style.top) + px(marker.style.height)).toBeLessThanOrEqual(
      px(longRange.style.top) + px(longRange.style.height),
    );

    const topChip = host.querySelector<HTMLElement>('[data-sheetwrite-presence-label="top"]')!;
    expect(topChip.dataset.presenceKind).toBe("chip");
    expect(topChip.textContent).toBe("Top row");
    expect(topChip.style.background).toContain("hsl");
    expect(["#000000", "#ffffff"]).toContain(topChip.style.color);
    expect(px(topChip.style.left)).toBeGreaterThanOrEqual(0);
    expect(px(topChip.style.top)).toBeGreaterThanOrEqual(0);
    expect(px(topChip.style.top) + px(topChip.style.height)).toBeLessThanOrEqual(
      px(longRange.style.top),
    );

    const pooledNodeCount = host.querySelector(".sheetwrite-overlay")!.childElementCount;
    grid.setPresenceOverlays(null);
    grid.highlightCells([{ sheet: "s1", start: { row: 2, col: 1 }, end: { row: 2, col: 1 } }]);
    grid.refresh();
    expect(host.querySelectorAll("[data-sheetwrite-presence]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-sheetwrite-presence-range]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-sheetwrite-presence-label]")).toHaveLength(0);
    expect(host.querySelector(".sheetwrite-overlay")!.childElementCount).toBe(pooledNodeCount);

    grid.setPresenceOverlays(overlays);
    grid.refresh();
    const warmedNodeCount = host.querySelector(".sheetwrite-overlay")!.childElementCount;
    expect(warmedNodeCount).toBeGreaterThanOrEqual(pooledNodeCount);
    expect(host.querySelectorAll('[data-sheetwrite-presence-label="long"]')).toHaveLength(1);
    grid.setPresenceOverlays(null);
    grid.refresh();
    grid.setPresenceOverlays(overlays);
    grid.refresh();
    expect(host.querySelector(".sheetwrite-overlay")!.childElementCount).toBe(warmedNodeCount);
    grid.destroy();
  });

  it("keeps the 32-actor by 8-range limit bounded to rail or range markers", () => {
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const overlays: PresenceOverlay[] = Array.from({ length: 32 }, (_, index) => ({
      actorId: `actor-${index}`,
      displayName: index === 0 ? "  " : `Remote operator with a long identity ${index}`,
      color: index % 2 === 0 ? "#58c4dc" : "#e76f51",
      activeSheet: "s1",
      ranges: Array.from({ length: 8 }, (_, rangeIndex) => ({
        sheet: "s1",
        start: { row: rangeIndex % 5, col: 0 },
        end: { row: rangeIndex % 5, col: 2 },
      })),
    }));

    grid.setPresenceOverlays(overlays);
    grid.refresh();
    const labels = [...host.querySelectorAll<HTMLElement>("[data-sheetwrite-presence-label]")];
    expect(labels).toHaveLength(overlays.length);
    expect(labels.some((label) => label.dataset.presenceKind === "marker")).toBe(true);
    expect(labels[0]!.title).toBe("actor-0");
    expect(labels[0]!.getAttribute("aria-label")).toBe("Remote selection: actor-0");
    for (const label of labels) {
      expect(px(label.style.left)).toBeGreaterThanOrEqual(0);
      expect(px(label.style.top)).toBeGreaterThanOrEqual(0);
      expect(px(label.style.left) + px(label.style.width)).toBeLessThanOrEqual(360);
      expect(px(label.style.top) + px(label.style.height)).toBeLessThanOrEqual(168);
    }
    grid.destroy();
  });

  it("does not compact a visible chip because offscreen peers exist", () => {
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const overlays: PresenceOverlay[] = Array.from({ length: 32 }, (_, index) => ({
      actorId: `peer-${index}`,
      displayName: `Peer ${index}`,
      color: "#58c4dc",
      activeSheet: "s1",
      ranges: [
        {
          sheet: "s1",
          start: { row: index === 0 ? 0 : 19, col: 2 },
          end: { row: index === 0 ? 0 : 19, col: 2 },
        },
      ],
    }));

    grid.setPresenceOverlays(overlays);
    grid.refresh();
    const visible = host.querySelector<HTMLElement>('[data-sheetwrite-presence-label="peer-0"]')!;
    expect(visible.dataset.presenceKind).toBe("chip");
    expect(visible.textContent).toBe("Peer 0");
    grid.destroy();
  });
});
