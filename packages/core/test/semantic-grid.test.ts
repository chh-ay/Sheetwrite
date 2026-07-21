import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { CellEditor, CellEditorContext, Column, Grid, Workbook } from "../src/types.js";
import { CustomEditorController } from "../src/custom-editor.js";
import { toCsv } from "../src/export.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvas: () => void;
let reportErrorDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  reportErrorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
  if (reportErrorDescriptor) {
    Object.defineProperty(globalThis, "reportError", reportErrorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "reportError");
  }
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(host);
  return host;
}

function headers(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[role="columnheader"]')].map(
    (header) => header.textContent ?? "",
  );
}

function withEditors(workbook: Workbook): Workbook {
  for (const column of workbook.sheets[0]!.columns) column.editor = "input";
  workbook.sheets[0]!.validationRules = [
    {
      id: "positive",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
      condition: { kind: "number", min: 0 },
      policy: "reject",
    },
  ];
  workbook.sheets[0]!.protectedRanges = [
    {
      id: "locked",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    },
  ];
  return workbook;
}

interface EditorStats {
  mounts: number;
  updates: number;
  repositions: number;
  commits: number;
  cancels: number;
  destroys: number;
  contexts: CellEditorContext[];
}

function inputEditor(stats: EditorStats): CellEditor {
  return {
    mount(host, context) {
      stats.mounts += 1;
      stats.contexts.push(context);
      const input = document.createElement("input");
      input.value = context.initialInput ?? context.text;
      host.appendChild(input);
      return {
        update(next) {
          stats.updates += 1;
          stats.contexts.push(next);
        },
        reposition() {
          stats.repositions += 1;
        },
        commit() {
          stats.commits += 1;
          return input.value;
        },
        cancel() {
          stats.cancels += 1;
        },
        destroy() {
          stats.destroys += 1;
          input.remove();
        },
      };
    },
  };
}

function editorStats(): EditorStats {
  return {
    mounts: 0,
    updates: 0,
    repositions: 0,
    commits: 0,
    cancels: 0,
    destroys: 0,
    contexts: [],
  };
}

function activeEditorInput(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector(".sheetwrite-custom-editor input");
  if (!(input instanceof HTMLInputElement)) throw new Error("custom editor input missing");
  return input;
}

const BORDER_SIDES = ["all", "top", "right", "bottom", "left"] as const;

function styledEditorColumn(): Column {
  const border = {
    all: { color: "#111111", width: 1, style: "solid" as const },
    top: { color: "#222222", width: 2, style: "dashed" as const },
    right: { color: "#333333", width: 3, style: "dotted" as const },
    bottom: { color: "#444444", width: 4, style: "solid" as const },
    left: { color: "#555555", width: 5, style: "dashed" as const },
  };
  return {
    key: "name",
    header: "",
    width: 160,
    type: "text",
    headerStyle: { backgroundColor: "#112233", border: structuredClone(border) },
    cellStyle: { bold: true, border: structuredClone(border) },
  };
}

function corruptEditorColumn(column: CellEditorContext["column"]): void {
  Reflect.set(column, "key", "hijacked-key");
  Reflect.set(column, "header", "Hijacked header");
  if (column.headerStyle) column.headerStyle.backgroundColor = "#ff0000";
  if (column.cellStyle) column.cellStyle.bold = false;
  for (const style of [column.headerStyle, column.cellStyle]) {
    for (const side of BORDER_SIDES) {
      const edge = style?.border?.[side];
      if (!edge) continue;
      edge.color = "#ff00ff";
      edge.width = 100;
      edge.style = "dotted";
    }
    if (style?.border) {
      Reflect.deleteProperty(style.border, "top");
      style.border.left = { color: "#00ffff", width: 101, style: "solid" };
    }
  }
}

describe("semantic presentation contract", () => {
  it("keeps spreadsheet headers positional and data-grid headers semantic without consuming row 0", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => written.push(value) },
    });

    for (const presentation of ["spreadsheet", "data-grid"] as const) {
      const workbook = makeWorkbook(2);
      const store = new SheetwriteStore(workbook, makeColumnarData(2));
      const host = mountHost();
      const grid = new GridImpl(host, { workbook, presentation }, store);

      expect(headers(host).slice(0, 3)).toEqual(
        presentation === "spreadsheet" ? ["A", "B", "C"] : ["Name", "Amount", "City"],
      );
      const firstCell = host.querySelector<HTMLElement>(
        '[role="row"][aria-rowindex="2"] [role="gridcell"]',
      );
      expect(firstCell?.textContent).toBe("Customer 0");
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
      expect(toCsv(store.getWorkbook().sheets[0]!, store)).toContain(
        "Name,Amount,City\r\nCustomer 0,0.5,Phnom Penh",
      );

      grid.setSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
      });
      await expect(grid.actions.copy()).resolves.toBe("done");
      expect(written.at(-1)).toBe("Customer 0\t0.5");

      grid.destroy();
      store.dispose();
      host.remove();
    }
    expect(written).toEqual(["Customer 0\t0.5", "Customer 0\t0.5"]);
  });

  it("keeps semantic headers stable across missing labels and minColumns changes", () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.header = "";
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, presentation: "data-grid", minColumns: 8 }, store);

    expect(headers(host)).toEqual(["name", "Amount", "City", "D", "E", "F", "G", "H"]);
    grid.setMinColumns(12);
    grid.refresh();
    expect(headers(host)).toEqual([
      "name",
      "Amount",
      "City",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
    ]);

    grid.destroy();
    store.dispose();
  });
});

describe("custom editor canonical lifecycle", () => {
  it("parses commits, enforces validation/protection, updates, histories, navigates, and restores focus", async () => {
    const workbook = withEditors(makeWorkbook(2));
    const store = new SheetwriteStore(workbook, makeColumnarData(2));
    const host = mountHost();
    const stats = editorStats();
    const grid = new GridImpl(
      host,
      { workbook, presentation: "data-grid", editors: { input: inputEditor(stats) } },
      store,
    );
    const rejected: string[][] = [];
    const commits: unknown[] = [];
    const changes: unknown[] = [];
    grid.on("mutation-rejected", ({ issues }) => rejected.push(issues.map((issue) => issue.kind)));
    grid.on("edit-commit", (event) => commits.push(event));
    grid.on("change", (event) => changes.push(event));

    grid.beginEdit(0, 1);
    let input = activeEditorInput(host);
    expect(input.getAttribute("aria-label")).toBe("Edit Amount, row 1");
    expect(stats.contexts[0]?.address).toEqual({ sheet: "s1", row: 0, col: 1 });
    expect(stats.contexts[0]?.value).toBe(0.5);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 7 },
        },
      ],
    });
    expect(stats.updates).toBe(1);
    expect(stats.contexts.at(-1)?.value).toBe(7);

    input.value = "42";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(42);
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 1, col: 1 },
    });
    expect(stats.commits).toBe(1);
    expect(stats.destroys).toBe(1);
    expect(commits).toHaveLength(1);
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(document.activeElement).toBe(host);

    grid.undo();
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);

    grid.beginEdit(0, 1);
    input = activeEditorInput(host);
    input.value = "-1";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);
    expect(rejected.at(-1)).toEqual(["validation"]);

    grid.beginEdit(0, 0);
    input = activeEditorInput(host);
    input.value = "blocked";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect(rejected.at(-1)).toEqual(["protection"]);

    grid.beginEdit(1, 2, "B", false);
    input = activeEditorInput(host);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(stats.cancels).toBe(1);
    expect(document.activeElement).toBe(host);

    grid.destroy();
    store.dispose();
    await Promise.resolve();
    expect(stats.mounts).toBe(4);
    expect(stats.destroys).toBe(4);
  });

  it("aborts async autocomplete work and ignores late completion after destroy", async () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "async";
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const host = mountHost();
    const { promise, resolve } = Promise.withResolvers<readonly string[]>();
    const commitResult = Promise.withResolvers<string>();
    const lateCommit = Promise.withResolvers<string>();
    let signal: AbortSignal | undefined;
    let lateWrites = 0;
    let destroys = 0;
    let commitCalls = 0;
    const editor: CellEditor = {
      mount(root, context) {
        signal = context.signal;
        const input = document.createElement("input");
        root.appendChild(input);
        void promise.then((choices) => {
          if (context.signal.aborted) return;
          lateWrites += choices.length;
        });
        return {
          update() {},
          reposition() {},
          commit: () => {
            commitCalls += 1;
            return commitCalls === 1 ? commitResult.promise : lateCommit.promise;
          },
          cancel() {},
          destroy() {
            destroys += 1;
          },
        };
      },
    };
    const grid = new GridImpl(host, { workbook, editors: { async: editor } }, store);
    grid.beginEdit(0, 0);
    expect(signal?.aborted).toBe(false);
    const input = activeEditorInput(host);
    input.value = "Async result";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(commitCalls).toBe(1);
    expect(host.querySelector(".sheetwrite-custom-editor")?.getAttribute("aria-busy")).toBe("true");
    commitResult.resolve(input.value);
    await commitResult.promise;
    await Promise.resolve();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Async result");
    expect(destroys).toBe(1);
    expect(document.activeElement).toBe(host);

    grid.beginEdit(0, 0);
    expect(signal?.aborted).toBe(false);
    const lateInput = activeEditorInput(host);
    lateInput.value = "Must not commit";
    lateInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(commitCalls).toBe(2);
    expect(host.querySelector(".sheetwrite-custom-editor")?.getAttribute("aria-busy")).toBe("true");

    grid.destroy();
    expect(signal?.aborted).toBe(true);
    expect(destroys).toBe(2);
    lateCommit.resolve(lateInput.value);
    await lateCommit.promise;
    await Promise.resolve();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Async result");
    resolve(["alpha", "beta"]);
    await promise;
    await Promise.resolve();
    expect(lateWrites).toBe(0);
    store.dispose();
  });
  it("cancels rejected and invalid custom-editor commit results without mutation", async () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "boundary";
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const host = mountHost();
    let attempt = 0;
    let cancels = 0;
    let destroys = 0;
    let latestContext: CellEditorContext | undefined;
    const editor: CellEditor = {
      mount(root, context) {
        latestContext = context;
        const input = document.createElement("input");
        root.appendChild(input);
        return {
          update() {},
          reposition() {},
          commit() {
            attempt += 1;
            if (attempt === 1) return Promise.reject(new Error("lookup failed"));
            return null as never;
          },
          cancel() {
            cancels += 1;
          },
          destroy() {
            destroys += 1;
          },
        };
      },
    };
    const grid = new GridImpl(host, { workbook, editors: { boundary: editor } }, store);

    for (let index = 0; index < 2; index += 1) {
      grid.beginEdit(0, 0);
      activeEditorInput(host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    }
    expect({ cancels, destroys }).toEqual({ cancels: 2, destroys: 2 });

    grid.beginEdit(0, 0);
    expect(latestContext).toBeDefined();
    expect(() => latestContext?.commit(42 as never)).not.toThrow();
    expect(latestContext?.signal.aborted).toBe(true);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect({ cancels, destroys }).toEqual({ cancels: 3, destroys: 3 });

    grid.destroy();
    store.dispose();
  });

  it("keeps async commits bound to their canonical row through sort and clearView", async () => {
    for (const resetView of [false, true]) {
      const workbook = makeWorkbook(3);
      workbook.sheets[0]!.columns[0]!.editor = "pending";
      const store = new SheetwriteStore(workbook, makeColumnarData(3));
      const host = mountHost();
      const result = Promise.withResolvers<string>();
      const contexts: CellEditorContext[] = [];
      const editor: CellEditor = {
        mount(root, context) {
          contexts.push(context);
          const input = document.createElement("input");
          root.appendChild(input);
          return {
            update(next) {
              contexts.push(next);
            },
            reposition() {},
            commit: () => result.promise,
            cancel() {},
            destroy() {},
          };
        },
      };
      const grid = new GridImpl(host, { workbook, editors: { pending: editor } }, store);
      if (resetView) grid.sortBy(1, false);
      grid.beginEdit(0, 0);
      const originalDataRow = resetView ? 2 : 0;
      const otherDataRow = resetView ? 0 : 2;
      const committed: CellEditorContext["address"][] = [];
      grid.on("edit-commit", ({ addr }) => {
        committed.push(addr);
      });
      activeEditorInput(host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

      if (resetView) grid.clearView();
      else grid.sortBy(1, false);
      const expectedViewRow = resetView ? 2 : 2;
      expect(contexts.at(-1)?.address).toEqual({
        sheet: "s1",
        row: originalDataRow,
        col: 0,
      });
      expect(contexts.at(-1)?.viewAddress.row).toBe(expectedViewRow);

      result.resolve(resetView ? "ClearView target" : "Sort target");
      await result.promise;
      await Promise.resolve();
      expect(store.getCell({ sheet: "s1", row: originalDataRow, col: 0 }).resolved).toBe(
        resetView ? "ClearView target" : "Sort target",
      );
      expect(store.getCell({ sheet: "s1", row: otherDataRow, col: 0 }).resolved).toBe(
        `Customer ${otherDataRow}`,
      );
      expect(committed).toEqual([{ sheet: "s1", row: expectedViewRow, col: 0 }]);

      grid.destroy();
      store.dispose();
      host.remove();
    }
  });

  it("cancels a pending commit when filtering hides its canonical row", async () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.columns[0]!.editor = "pending";
    const store = new SheetwriteStore(workbook, makeColumnarData(3));
    const host = mountHost();
    const result = Promise.withResolvers<string>();
    let context: CellEditorContext | undefined;
    let cancels = 0;
    let destroys = 0;
    const editor: CellEditor = {
      mount(root, next) {
        context = next;
        root.appendChild(document.createElement("input"));
        return {
          update(updated) {
            context = updated;
          },
          reposition() {},
          commit: () => result.promise,
          cancel() {
            cancels += 1;
          },
          destroy() {
            destroys += 1;
          },
        };
      },
    };
    const grid = new GridImpl(host, { workbook, editors: { pending: editor } }, store);
    grid.beginEdit(0, 0);
    activeEditorInput(host).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    grid.filterBy(2, "Tokyo");

    expect(context?.signal.aborted).toBe(true);
    expect({ cancels, destroys }).toEqual({ cancels: 1, destroys: 1 });
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    result.resolve("Must not move");
    await result.promise;
    await Promise.resolve();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    grid.destroy();
    store.dispose();
  });

  it("isolates mutable context addresses from the canonical commit target", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets[0]!.columns[0]!.editor = "mutator";
    const store = new SheetwriteStore(workbook, makeColumnarData(2));
    const host = mountHost();
    let context: CellEditorContext | undefined;
    const editor: CellEditor = {
      mount(root, mounted) {
        context = mounted;
        const input = document.createElement("input");
        input.value = "Canonical";
        root.appendChild(input);
        return {
          update(next) {
            context = next;
          },
          reposition() {},
          commit: () => input.value,
          cancel() {},
          destroy() {},
        };
      },
    };
    const grid = new GridImpl(host, { workbook, editors: { mutator: editor } }, store);
    grid.beginEdit(0, 0);
    if (!context) throw new Error("editor context missing");
    Reflect.set(context.address, "row", 1);
    activeEditorInput(host).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );

    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Canonical");
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Customer 1");
    grid.destroy();
    store.dispose();
  });

  it("snapshots columns independently at begin, update, and context exposure boundaries", () => {
    const workbook = makeWorkbook(1);
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const gridHost = mountHost();
    const grid = new GridImpl(gridHost, { workbook }, store);
    const editorHost = mountHost();
    const controller = new CustomEditorController(editorHost);
    const expectedColumn = styledEditorColumn();
    const beginColumn = structuredClone(expectedColumn);
    const contexts: CellEditorContext[] = [];
    const editor: CellEditor = {
      mount(root, context) {
        contexts.push(context);
        root.appendChild(document.createElement("input"));
        return {
          update(next) {
            contexts.push(next);
          },
          reposition() {},
          commit() {},
          cancel() {},
          destroy() {},
        };
      },
    };
    controller.begin({
      editor,
      grid,
      address: { sheet: "s1", row: 0, col: 0 },
      viewAddress: { sheet: "s1", row: 0, col: 0 },
      column: beginColumn,
      value: "Customer 0",
      text: "Customer 0",
      initialInput: undefined,
      selectAll: true,
      label: "Edit name, row 1",
      rect: { x: 0, y: 0, width: 160, height: 24 },
      onCommit() {},
      onCancel() {},
    });

    corruptEditorColumn(beginColumn);
    controller.update({ label: "After begin input mutation" });
    expect(contexts.at(-1)?.column).toEqual(expectedColumn);

    const exposedColumn = contexts.at(-1)?.column;
    if (!exposedColumn) throw new Error("exposed editor column missing");
    corruptEditorColumn(exposedColumn);
    controller.update({ label: "After context mutation" });
    expect(contexts.at(-1)?.column).toEqual(expectedColumn);

    const updateColumn = structuredClone(expectedColumn);
    controller.update({ column: updateColumn, label: "Updated column" });
    expect(contexts.at(-1)?.column).toEqual(expectedColumn);
    corruptEditorColumn(updateColumn);
    controller.update({ label: "After update input mutation" });
    expect(contexts.at(-1)?.column).toEqual(expectedColumn);
    expect(contexts).toHaveLength(5);

    controller.destroy();
    grid.destroy();
    store.dispose();
    editorHost.remove();
  });

  it("isolates mutable editor columns from workbook and render configuration", () => {
    const workbook = makeWorkbook(1);
    const sourceColumn = workbook.sheets[0]!.columns[0]!;
    Object.assign(sourceColumn, styledEditorColumn(), { editor: "hostile-column" });
    const expectedColumn = structuredClone(sourceColumn);
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const host = mountHost();
    const exposedColumns: CellEditorContext["column"][] = [];
    const corrupt = (column: CellEditorContext["column"]): void => {
      exposedColumns.push(column);
      corruptEditorColumn(column);
    };
    const editor: CellEditor = {
      mount(root, context) {
        corrupt(context.column);
        root.appendChild(document.createElement("input"));
        return {
          update(next) {
            corrupt(next.column);
          },
          reposition() {},
          commit() {},
          cancel() {},
          destroy() {},
        };
      },
    };
    const grid = new GridImpl(
      host,
      { workbook, presentation: "data-grid", editors: { "hostile-column": editor } },
      store,
    );

    grid.beginEdit(0, 0);
    expect(store.getWorkbook().sheets[0]!.columns[0]).toEqual(expectedColumn);
    expect(headers(host)[0]).toBe("name");
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 9 },
        },
      ],
    });
    grid.refresh();

    expect(exposedColumns).toHaveLength(2);
    expect(exposedColumns[0]).not.toBe(exposedColumns[1]);
    expect(store.getWorkbook().sheets[0]!.columns[0]).toEqual(expectedColumn);
    expect(headers(host)[0]).toBe("name");
    grid.destroy();
    store.dispose();
  });
  it("finishes cancel and Grid teardown when an editor destroy hook throws", () => {
    const reported: unknown[] = [];
    Object.defineProperty(globalThis, "reportError", {
      configurable: true,
      value: (error: unknown) => reported.push(error),
    });
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "hostile";
    const host = mountHost();
    const hookSignals: boolean[] = [];
    let destroys = 0;
    const editor: CellEditor = {
      mount(root, context) {
        root.appendChild(document.createElement("input"));
        return {
          update() {},
          reposition() {},
          commit() {},
          cancel() {
            hookSignals.push(context.signal.aborted);
          },
          destroy() {
            hookSignals.push(context.signal.aborted);
            destroys += 1;
            throw new Error("hostile destroy");
          },
        };
      },
    };
    const grid = new GridImpl(host, {
      workbook,
      data: makeColumnarData(1),
      editors: { hostile: editor },
    });
    const ownedStore = grid.store;
    if (!(ownedStore instanceof SheetwriteStore)) throw new Error("owned store missing");
    const originalDispose = ownedStore.dispose.bind(ownedStore);
    let disposals = 0;
    ownedStore.dispose = () => {
      disposals += 1;
      originalDispose();
    };

    grid.beginEdit(0, 0);
    activeEditorInput(host).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(hookSignals).toEqual([true, true]);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(document.activeElement).toBe(host);
    expect(reported).toHaveLength(1);

    grid.beginEdit(0, 0);
    expect(() => grid.destroy()).not.toThrow();
    expect(() => grid.destroy()).not.toThrow();
    expect(hookSignals).toEqual([true, true, true, true]);
    expect(destroys).toBe(2);
    expect(disposals).toBe(1);
    expect(reported).toHaveLength(2);
    expect(host.classList.contains("sheetwrite")).toBe(false);
    expect(host.getAttribute("role")).toBeNull();
    expect(host.childElementCount).toBe(0);
  });
});

describe("observable command state", () => {
  it("drives undo/redo disabled state and formatting active/mixed ARIA state", async () => {
    const workbook = makeWorkbook(2);
    const store = new SheetwriteStore(workbook, makeColumnarData(2));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { toolbar: true } }, store);
    const bold = host.querySelector<HTMLButtonElement>(".sheetwrite-tb-bold");
    const undo = host.querySelector<HTMLButtonElement>(".sheetwrite-tb-undo");
    if (!bold || !undo) throw new Error("toolbar controls missing");

    expect(grid.getCommandState("bold")).toEqual({ disabled: true, activity: "inactive" });
    expect(undo.disabled).toBe(true);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    grid.actions.toggleBold();
    await Promise.resolve();
    expect(grid.getCommandState("bold")).toEqual({ disabled: false, activity: "active" });
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(undo.disabled).toBe(false);

    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    await Promise.resolve();
    expect(grid.getCommandState("bold").activity).toBe("mixed");
    expect(bold.getAttribute("aria-pressed")).toBe("mixed");

    grid.setReadOnly(true);
    await Promise.resolve();
    expect(bold.disabled).toBe(true);
    expect(undo.disabled).toBe(true);

    grid.destroy();
    store.dispose();
  });

  it("bounds formatting aggregation for a large selection", () => {
    const workbook = makeWorkbook(5_000);
    const store = new SheetwriteStore(workbook, makeColumnarData(5_000));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    let reads = 0;
    const original = store.getCell.bind(store);
    store.getCell = (address) => {
      reads += 1;
      return original(address);
    };
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 4_999, col: 0 } },
    });

    expect(grid.getCommandState("bold").activity).toBe("mixed");
    expect(reads).toBe(4_096);

    grid.destroy();
    store.dispose();
  });
});
