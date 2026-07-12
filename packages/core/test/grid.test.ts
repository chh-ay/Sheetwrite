import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { DEFAULT_THEME, GridImpl, initSheetwrite, resolveThemeFromCss } from "../src/grid.js";
import { createGridController } from "../src/grid-controller.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs, type RecordingContext2D } from "../src/testing.js";
import type { CellScalar, RowData, Store, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

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
    getFormula: () => null,
    getRefTarget: () => null,
    getVisibleWindow: (sheet, rows, cols) => {
      hooks.onWindow?.();
      const n = Math.max(0, (rows.end - rows.start) * cols.length);
      const values: CellScalar[] = new Array(n);
      for (let i = 0; i < n; i++) values[i] = `v${i}`;
      return { sheet, rows, cols, values, styleIds: new Uint32Array(n), styles: [{}] };
    },
    ensureColumns: () => {},
    applyTransaction: () => ({ status: "noop", epoch: 0, reason: "empty" }),
    on: () => () => {},
    getDirty: () => [],
    markClean: () => {},
    viewRowCount: (sheet) => workbook.sheets.find((s) => s.id === sheet)?.rowCount ?? 0,
  };
}

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function expectEditor(host: HTMLElement): HTMLTextAreaElement {
  const node = host.querySelector("textarea.sheetwrite-editor");
  expect(node).toBeInstanceOf(HTMLTextAreaElement);
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error("expected grid editor textarea");
  }

  return node;
}

function typeIntoFocusedCell(host: HTMLElement, value: string, key = "Enter"): void {
  host.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  const editor = expectEditor(host);
  editor.value = value;
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  expect(node).toBeInstanceOf(HTMLDivElement);
  if (!(node instanceof HTMLDivElement)) {
    throw new Error("expected grid scroller");
  }

  return node;
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
    const ctx = host.querySelector("canvas")?.getContext("2d") as unknown as RecordingContext2D;
    expect(ctx.calls.fillText).toBeGreaterThan(0);

    grid.destroy();
  });

  it("reports a selection through getSelection after setSelection", () => {
    const workbook = makeWorkbook(50);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, makeFakeStore(workbook));

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 1 } });
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 4, col: 1 },
    });

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

  it("commits a typed formula, resolves it, and re-edits to its source", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "s1", row: 0, col: 1 }, value: { kind: "literal", value: 10 } },
        { op: "set", addr: { sheet: "s1", row: 1, col: 1 }, value: { kind: "literal", value: 5 } },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const node = host.querySelector("textarea.sheetwrite-editor");
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.value = "=B1+B2*2";
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(20);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    const node2 = host.querySelector("textarea.sheetwrite-editor");
    if (!(node2 instanceof HTMLTextAreaElement)) return;
    expect(node2.value).toBe("=B1+B2*2");

    grid.destroy();
  });

  it("edits the displayed data row under a sorted view", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 30 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "literal", value: 10 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "literal", value: 20 },
        },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.sortBy(1, true);
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    typeIntoFocusedCell(host, "Sorted edit");

    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Sorted edit");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    grid.destroy();
  });

  it("retries datasource bands after a rejected load", async () => {
    const workbook = makeWorkbook(50);
    let requests = 0;
    const host = mountHost();
    const grid = new GridImpl(host, {
      workbook,
      datasource: {
        getRows: () => {
          requests++;
          return Promise.reject(new Error("load failed"));
        },
      },
    });

    expect(requests).toBe(1);
    await Promise.resolve();
    await Promise.resolve();

    grid.refresh();
    expect(requests).toBe(2);

    grid.destroy();
  });

  it("starts a new search at the current viewport and wraps when needed", () => {
    const workbook = makeWorkbook(100);
    const store = new SheetwriteStore(workbook, makeColumnarData(100));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const scroller = scrollerOf(host);

    scroller.scrollTop = 50 * DEFAULT_THEME.rowHeight;
    const middle = grid.search("Tokyo");
    expect(middle.matches[middle.active]?.row).toBe(52);

    scroller.scrollTop = 99 * DEFAULT_THEME.rowHeight;
    const wrapped = grid.search("Tokyo");
    expect(wrapped.matches[wrapped.active]?.row).toBe(1);
    grid.destroy();
  });

  it("uses merged-cell anchors for pointer selection and editing", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 1, col: 1 },
      },
    });
    grid.actions.merge();

    const scroller = scrollerOf(host);
    const covered = cellPoint(1, 1, workbook);
    scroller.dispatchEvent(
      new PointerEvent("pointerdown", { ...covered, button: 0, bubbles: true }),
    );
    scroller.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 0, col: 0 },
    });

    scroller.dispatchEvent(new MouseEvent("dblclick", { ...covered, button: 0, bubbles: true }));
    const editor = expectEditor(host);
    editor.value = "Merged anchor";
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Merged anchor");
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(10.5);

    grid.destroy();
  });

  it("opens the built-in find bar with Ctrl+F unless find is disabled", () => {
    const workbook = makeWorkbook(10);
    const host = mountHost();
    const grid = new GridImpl(
      host,
      { workbook },
      new SheetwriteStore(workbook, makeColumnarData(10)),
    );

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(event);

    const find = host.querySelector(".sheetwrite-find");
    expect(event.defaultPrevented).toBe(true);
    expect(find).toBeInstanceOf(HTMLDivElement);
    expect((find as HTMLDivElement | null)?.style.display).toBe("flex");

    grid.destroy();

    const disabledHost = mountHost();
    const disabledWorkbook = makeWorkbook(10);
    const disabled = new GridImpl(
      disabledHost,
      { workbook: disabledWorkbook, config: { find: false, toolbar: false } },
      new SheetwriteStore(disabledWorkbook, makeColumnarData(10)),
    );

    expect(disabledHost.querySelector(".sheetwrite-find")).toBeNull();

    disabled.destroy();
  });

  it("undoes and redoes literal edits, and a fresh edit clears redo", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const addr = { sheet: "s1", row: 2, col: 0 };

    grid.setSelection({ kind: "cell", addr });
    typeIntoFocusedCell(host, "First edit");
    expect(store.getCell(addr).resolved).toBe("First edit");

    grid.undo();
    expect(store.getCell(addr).resolved).toBe("Customer 2");

    grid.redo();
    expect(store.getCell(addr).resolved).toBe("First edit");

    grid.undo();
    grid.setSelection({ kind: "cell", addr });
    typeIntoFocusedCell(host, "Second edit");
    grid.redo();

    expect(store.getCell(addr).resolved).toBe("Second edit");

    grid.destroy();
  });

  it("undo restores a formula source instead of only its resolved value", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 10 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "literal", value: 5 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "formula", src: "=B1+B2*2" },
        },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const addr = { sheet: "s1", row: 2, col: 1 };

    grid.setSelection({ kind: "cell", addr });
    typeIntoFocusedCell(host, "7");
    expect(store.getFormula(addr)).toBeNull();
    expect(store.getCell(addr).resolved).toBe(7);

    grid.undo();

    expect(store.getFormula(addr)).toBe("=B1+B2*2");
    expect(store.getCell(addr).resolved).toBe(20);

    grid.destroy();
  });
  it("applies arbitrary patches as one undoable Grid transaction", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const first = { sheet: "s1", row: 0, col: 0 };
    const second = { sheet: "s1", row: 1, col: 1 };
    const events: number[] = [];
    grid.on("change", (event) => events.push(event.transaction.patches.length));

    grid.applyTransaction({
      patches: [
        { op: "set", addr: first, value: { kind: "literal", value: "Batch" } },
        { op: "set", addr: second, value: { kind: "literal", value: 99 } },
      ],
    });

    expect(events).toEqual([2]);
    expect(store.getCell(first).resolved).toBe("Batch");
    expect(store.getCell(second).resolved).toBe(99);

    grid.undo();
    expect(store.getCell(first).resolved).toBe("Customer 0");
    expect(store.getCell(second).resolved).toBe(10.5);

    grid.redo();
    expect(store.getCell(first).resolved).toBe("Batch");
    expect(store.getCell(second).resolved).toBe(99);

    grid.destroy();
  });

  it("updates read-only and config without clearing selection or history", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const addr = { sheet: "s1", row: 2, col: 0 };
    const selection = { kind: "cell" as const, addr };

    grid.setSelection(selection);
    grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "Editable" } }],
    });
    grid.setConfig({ toolbar: false, contextMenu: false, find: false, keyboard: false });

    expect(grid.getSelection()).toEqual(selection);
    expect(host.querySelector(".sheetwrite-find")).toBeNull();

    grid.setReadOnly(true);
    expect(host.getAttribute("aria-readonly")).toBe("true");
    grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "Blocked" } }],
    });
    grid.undo();
    expect(store.getCell(addr).resolved).toBe("Editable");

    grid.setReadOnly(false);
    expect(host.hasAttribute("aria-readonly")).toBe(false);
    grid.undo();
    expect(store.getCell(addr).resolved).toBe("Customer 2");
    expect(grid.getSelection()).toEqual(selection);

    grid.destroy();
  });

  it("skips chrome rebuild for a shallowly-equal config object", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { toolbar: true } }, store);

    const before = host.querySelector(".sheetwrite-toolbar");
    expect(before).not.toBeNull();

    // A fresh-but-identical object (declarative host re-render) is a no-op.
    grid.setConfig({ toolbar: true });
    expect(host.querySelector(".sheetwrite-toolbar")).toBe(before);

    // A materially different config still rebuilds.
    grid.setConfig({ toolbar: false });
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();

    grid.destroy();
    store.dispose();
  });
  it("forwards every Grid event through the shared controller", () => {
    const workbook = makeWorkbook(10);
    const host = mountHost();
    const received: string[] = [];
    const controller = createGridController(
      host,
      { workbook, data: makeColumnarData(10) },
      {
        onGridChange: (event) => {
          expect(event.transaction.patches).toHaveLength(1);
          received.push("change");
        },
        onSelectionChange: (selection) => {
          expect(selection?.kind).toBe("cell");
          received.push("selection");
        },
        onViewportChange: (event) => {
          expect(event.lastRow).toBeGreaterThanOrEqual(event.firstRow);
          received.push("scroll");
        },
        onEditBegin: (event) => {
          expect(event.addr).toEqual({ sheet: "s1", row: 0, col: 0 });
          received.push("edit-begin");
        },
        onEditCommit: (event) => {
          expect(event.value).toEqual({ kind: "literal", value: "Committed" });
          received.push("edit-commit");
        },
        onSearch: (result) => {
          expect(result.query).toBe("Committed");
          received.push("search");
        },
      },
    );
    const addr = { sheet: "s1", row: 0, col: 0 };

    controller.grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "Changed" } }],
    });
    controller.grid.setSelection({ kind: "cell", addr });
    controller.grid.refresh();
    controller.grid.beginEdit(0, 0);
    const editor = expectEditor(host);
    editor.value = "Committed";
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    controller.grid.search("Committed");

    expect(received).toContain("change");
    expect(received).toContain("selection");
    expect(received).toContain("scroll");
    expect(received).toContain("edit-begin");
    expect(received).toContain("edit-commit");
    expect(received).toContain("search");

    controller.destroy();
  });
});

describe("Grid store lifecycle", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("disposes the store it constructed and leaves a fresh grid usable", () => {
    const host = mountHost();
    const disposeSpy = spyOn(SheetwriteStore.prototype, "dispose");

    // No store injected: the grid constructs and owns its SheetwriteStore, so
    // destroy() must free the underlying WASM CellStore.
    const grid = new GridImpl(host, { workbook: makeWorkbook(20) });
    grid.destroy();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    disposeSpy.mockRestore();

    // Each store owns an independent CellStore, so freeing one must not corrupt
    // a brand-new grid/store built afterwards.
    const host2 = mountHost();
    const grid2 = new GridImpl(host2, { workbook: makeWorkbook(20) });
    expect(() => grid2.store.getCell({ sheet: "s1", row: 0, col: 0 })).not.toThrow();
    grid2.destroy();
  });

  it("does not dispose a caller-provided store on destroy", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();

    // Store injected via the constructor: the caller owns it, so destroy() must
    // leave it alone and fully usable.
    const grid = new GridImpl(host, { workbook }, store);
    const disposeSpy = spyOn(store, "dispose");
    grid.destroy();

    expect(disposeSpy).not.toHaveBeenCalled();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    disposeSpy.mockRestore();
    store.dispose();
  });
  it("ignores a pending datasource result after destroying an owned store", async () => {
    const { promise: pending, resolve: resolveRows } = Promise.withResolvers<RowData[]>();
    const datasource = {
      getRows: () => pending,
    };
    const loadRowsSpy = spyOn(SheetwriteStore.prototype, "loadRows");
    const grid = new GridImpl(mountHost(), {
      workbook: makeWorkbook(20),
      datasource,
    });

    grid.destroy();
    resolveRows([{ name: "Too late" }]);
    await pending;
    await Promise.resolve();

    expect(loadRowsSpy).not.toHaveBeenCalled();
    loadRowsSpy.mockRestore();
  });
});

describe("Grid theme contract: setTheme merges, replaceTheme replaces", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("replaceTheme(undefined) restores CSS/default resolution after a patch", () => {
    const workbook = makeWorkbook(10);
    const grid = new GridImpl(mountHost(), { workbook }, makeFakeStore(workbook));

    grid.setTheme({ bg: "#ff0000" });
    expect(grid.getEffectiveTheme().bg).toBe("#ff0000");

    grid.replaceTheme(undefined);
    expect(grid.getEffectiveTheme().bg).toBe(DEFAULT_THEME.bg);

    grid.destroy();
  });

  it("replaceTheme(undefined) re-reads host CSS custom properties (Tailwind-style)", () => {
    const workbook = makeWorkbook(10);
    const host = mountHost();
    // A Tailwind arbitrary property (`[--sheetwrite-bg:...]`) lands as a
    // custom property on the host; construction and replaceTheme(undefined)
    // must both resolve it.
    host.style.setProperty("--sheetwrite-bg", "#0b0b0c");
    const grid = new GridImpl(host, { workbook }, makeFakeStore(workbook));
    expect(grid.getEffectiveTheme().bg).toBe("#0b0b0c");

    grid.setTheme({ bg: "#ff0000" });
    grid.replaceTheme(undefined);
    expect(grid.getEffectiveTheme().bg).toBe("#0b0b0c");

    grid.destroy();
  });

  it("replaceTheme replaces the whole option value instead of merging", () => {
    const workbook = makeWorkbook(10);
    const grid = new GridImpl(mountHost(), { workbook }, makeFakeStore(workbook));

    grid.replaceTheme({ bg: "#ff0000" });
    grid.replaceTheme({ fg: "#123456" });

    const theme = grid.getEffectiveTheme();
    expect(theme.fg).toBe("#123456");
    expect(theme.bg).toBe(DEFAULT_THEME.bg); // not kept from the previous value

    grid.destroy();
  });

  it("setTheme keeps merging for imperative users", () => {
    const workbook = makeWorkbook(10);
    const grid = new GridImpl(mountHost(), { workbook }, makeFakeStore(workbook));

    grid.setTheme({ bg: "#ff0000" });
    grid.setTheme({ fg: "#123456" });

    const theme = grid.getEffectiveTheme();
    expect(theme.bg).toBe("#ff0000");
    expect(theme.fg).toBe("#123456");

    grid.destroy();
  });

  it("maps --sheetwrite-font into Theme.font with the line-height stripped", () => {
    const host = mountHost();
    host.style.setProperty("--sheetwrite-font", "15px / 1.6 serif");

    const resolved = resolveThemeFromCss(host);

    expect(resolved.font).toContain("15px");
    expect(resolved.font).toContain("serif");
    expect(resolved.font).not.toContain("/");
  });

  it("editor cosmetics come from the stylesheet; the theme rides inline CSS variables", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, theme: { selectionBorder: "#123456" } }, store);

    grid.beginEdit(0, 0);
    const editor = expectEditor(host);

    // No raw inline cosmetic properties — host CSS can override the rule.
    expect(editor.style.font).toBe("");
    expect(editor.style.color).toBe("");

    // The effective theme is bridged as inline variables for the rule to use.
    expect(editor.style.getPropertyValue("--sheetwrite-selection-border")).toBe("#123456");
    expect(editor.style.getPropertyValue("--sheetwrite-font")).toBe(DEFAULT_THEME.font);

    grid.destroy();
    store.dispose();
  });
});

describe("ChangeEvent.commitReason", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  function reasonsOf(grid: GridImpl): string[] {
    const reasons: string[] = [];
    grid.on("change", (event) => reasons.push(event.commitReason));
    return reasons;
  }

  it("classifies editor commits by gesture: Enter vs blur", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const reasons = reasonsOf(grid);

    grid.beginEdit(0, 0);
    let editor = expectEditor(host);
    editor.value = "by enter";
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    grid.beginEdit(1, 0);
    editor = expectEditor(host);
    editor.value = "by blur";
    editor.dispatchEvent(new FocusEvent("blur"));

    expect(reasons).toEqual(["edit-enter", "edit-blur"]);

    grid.destroy();
    store.dispose();
  });

  it("classifies undo and public applyTransaction", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const reasons = reasonsOf(grid);
    const addr = { sheet: "s1", row: 0, col: 0 };

    // Grid-level transaction → "api"; store-level directly → "api" default.
    grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "x" } }],
    });
    grid.store.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "y" } }],
    });
    grid.undo();
    grid.redo();

    expect(reasons).toEqual(["api", "api", "undo", "redo"]);
    grid.destroy();
    store.dispose();
  });
});

describe("Grid.setOverscan", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("live-widens the render window on the next frame", () => {
    const workbook = makeWorkbook(200);
    const store = new SheetwriteStore(workbook, makeColumnarData(200));
    const grid = new GridImpl(mountHost(), { workbook, overscan: 0 }, store);
    const windows: Array<{ firstRow: number; lastRow: number }> = [];
    grid.on("scroll", (event) =>
      windows.push({ firstRow: event.firstRow, lastRow: event.lastRow }),
    );

    grid.refresh();
    const before = windows.at(-1)!;

    grid.setOverscan(40);
    grid.refresh();
    const after = windows.at(-1)!;

    // 40 extra rows painted beyond the viewport (bottom edge; top clamps at 0).
    expect(after.lastRow).toBe(before.lastRow + 40);

    // `undefined` restores the DEFAULT_OVERSCAN-based window.
    grid.setOverscan();
    grid.refresh();
    expect(windows.at(-1)!.lastRow).toBeLessThan(after.lastRow);

    grid.destroy();
    store.dispose();
  });
});

describe("Grid.setMinColumns", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("widens presentation geometry without emitting changes or dirty patches", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });

    grid.setMinColumns(12);
    grid.refresh();

    expect(store.getWorkbook().sheets[0]!.columns).toHaveLength(12);
    expect(host.getAttribute("aria-colcount")).toBe("12");
    expect(changes).toBe(0);
    expect(store.getDirty()).toEqual([]);

    grid.destroy();
    store.dispose();
  });
});

describe("Grid auto-fit", () => {
  it("measures wrapped rows and columns only when explicitly invoked", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const rowAddr = { sheet: "s1", row: 0, col: 0 };
    const longValue = "A deliberately long value that must widen the first spreadsheet column";
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: rowAddr,
          value: { kind: "literal", value: `${longValue}\nsecond line` },
          style: { wrap: true, fontSize: 18 },
        },
      ],
    });

    expect(workbook.sheets[0]!.rowHeights).toBeUndefined();
    const originalWidth = workbook.sheets[0]!.columns[0]!.width;

    grid.autoFitRows({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
    grid.autoFitColumns([0]);

    expect(workbook.sheets[0]!.rowHeights?.get(0)).toBeGreaterThan(28);
    expect(workbook.sheets[0]!.columns[0]!.width).toBeGreaterThan(originalWidth);
    grid.destroy();
    store.dispose();
  });
});
