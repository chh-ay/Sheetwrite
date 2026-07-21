import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { CellEditor, CellEditorContext, Grid, Workbook } from "../src/types.js";
import { toCsv } from "../src/export.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvas: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
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
    const editor: CellEditor = {
      mount(root) {
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

    grid.destroy();
    store.dispose();
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
