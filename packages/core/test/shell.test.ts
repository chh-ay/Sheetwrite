import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  createSpreadsheetShell,
  createToolbar,
  describeSelection,
} from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

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

function makeGrid(rowCount = 20): { grid: Grid; store: SheetwriteStore; host: HTMLDivElement } {
  const workbook = makeWorkbook(rowCount);
  const store = new SheetwriteStore(workbook, makeColumnarData(rowCount));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  return { grid, store, host };
}

function multiSheetWorkbook(): Workbook {
  const base = makeWorkbook(10);
  base.sheets.push({
    id: "s2",
    name: "Summary",
    rowCount: 5,
    columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
  });
  return base;
}

// ── Grid API additions the shell depends on ──────────────────────────────────

describe("Grid.getCellInput / getActiveSheet / active-sheet event", () => {
  it("translates view rows to data addresses under an active sort", () => {
    const { grid, store } = makeGrid();

    // Descending sort on Amount: view row 0 shows the LAST data row (19).
    grid.sortBy(1, false);
    const snapshot = grid.getCellInput(0, 1);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.address).toEqual({ sheet: "s1", row: 19, col: 1 });
    expect(snapshot!.format).toBe("number");
    expect(snapshot!.text).toBe("190.5");

    expect(grid.getCellInput(-1, 0)).toBeNull();
    expect(grid.getCellInput(0, 99)).toBeNull();

    grid.destroy();
    store.dispose();
  });

  it("returns formula source, not the resolved value", () => {
    const { grid, store } = makeGrid();
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "formula", src: "=B2+1" },
        },
      ],
    });

    expect(grid.getCellInput(0, 1)!.text).toBe("=B2+1");

    grid.destroy();
    store.dispose();
  });

  it("emits active-sheet exactly once per switch and validates ids", () => {
    const workbook = multiSheetWorkbook();
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const seen: string[] = [];
    grid.on("active-sheet", (event) => seen.push(event.sheet));

    expect(grid.getActiveSheet()).toBe("s1");
    grid.setActiveSheet("s2");
    grid.setActiveSheet("s2"); // same sheet: no event
    grid.setActiveSheet("missing"); // unknown: rejected, no event
    expect(seen).toEqual(["s2"]);
    expect(grid.getActiveSheet()).toBe("s2");

    grid.destroy();
    store.dispose();
  });
});

// ── Leaf pieces ───────────────────────────────────────────────────────────────

describe("createToolbar", () => {
  it("dispatches built-in actions and hands custom items the grid", () => {
    const { grid, store, host } = makeGrid();
    const received: Grid[] = [];
    const piece = createToolbar(host, grid, {
      items: [{ action: "bold" }, { onClick: (g) => received.push(g), icon: "X", title: "Custom" }],
    });

    const addr = { sheet: "s1", row: 2, col: 0 };
    grid.setSelection({ kind: "cell", addr });

    const [boldButton, customButton] = [...piece.element.querySelectorAll("button")];
    boldButton!.click();
    expect(store.getCell(addr).style.bold).toBe(true);

    customButton!.click();
    expect(received).toEqual([grid]);

    // Mouse presses on buttons must not steal focus from the grid.
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    boldButton!.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);

    piece.destroy();
    piece.destroy(); // idempotent
    expect(host.querySelector(".sheetwrite-shell-toolbar")).toBeNull();
    grid.destroy();
    store.dispose();
  });

  it("treats string icons as text, never HTML", () => {
    const { grid, store, host } = makeGrid();
    const piece = createToolbar(host, grid, {
      items: [{ onClick: () => {}, icon: "<img src=x onerror=hack()>", title: "Evil" }],
    });

    const button = piece.element.querySelector("button")!;
    expect(button.querySelector("img")).toBeNull();
    expect(button.textContent).toBe("<img src=x onerror=hack()>");

    piece.destroy();
    grid.destroy();
    store.dispose();
  });
  it("moves keyboard focus within toolbar bounds and ignores unrelated keys", () => {
    const host = mountHost();
    const grid = {} as Grid;
    const piece = createToolbar(host, grid, {
      label: "Editing",
      items: [
        { onClick: () => {}, title: "One" },
        { onClick: () => {}, title: "Two" },
        { onClick: () => {}, title: "Three" },
      ],
    });
    try {
      const controls = [...piece.element.querySelectorAll<HTMLButtonElement>("button")];
      controls[1]!.focus();
      for (const [key, expected] of [
        ["ArrowLeft", 0],
        ["ArrowRight", 1],
        ["End", 2],
        ["ArrowRight", 2],
        ["Home", 0],
        ["ArrowLeft", 0],
      ] as const) {
        piece.element.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
        expect(document.activeElement, key).toBe(controls[expected]!);
      }
      piece.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(document.activeElement).toBe(controls[0]!);
      expect(piece.element.getAttribute("role")).toBe("toolbar");
      expect(piece.element.getAttribute("aria-label")).toBe("Editing");
    } finally {
      piece.destroy();
      host.remove();
    }
  });
});

describe("createNameBox", () => {
  it("follows the selection and jumps on Enter within bounds", () => {
    const { grid, store, host } = makeGrid();
    let focused = 0;
    const piece = createNameBox(host, grid, { focusGrid: () => focused++ });
    const input = piece.element;
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) throw new Error("name box must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 2 } });
    expect(input.value).toBe("C5");

    input.value = "b3";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    expect(focused).toBe(1);

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("marks invalid or out-of-bounds references without touching the grid", () => {
    const { grid, store, host } = makeGrid();
    const piece = createNameBox(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("name box must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const before = grid.getSelection();

    for (const bad of ["", "5B", "A0", "ZZ9", "A999"]) {
      input.value = bad;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(grid.getSelection()).toEqual(before);
    }

    piece.destroy();
    grid.destroy();
    store.dispose();
  });
});

describe("createFormulaBar", () => {
  it("commits through the undoable grid path at the captured data address", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    // Descending sort: view row 0 = data row 19.
    grid.sortBy(1, false);
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    expect(input.value).toBe("Customer 19");

    input.value = "edited-via-bar";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));

    const dataAddr = { sheet: "s1", row: 19, col: 0 };
    expect(store.getCell(dataAddr).resolved).toBe("edited-via-bar");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    grid.undo();
    expect(store.getCell(dataAddr).resolved).toBe("Customer 19");

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("never overwrites a focused dirty draft and restores on Escape", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    const stable = input.value;

    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    input.value = "draft-in-progress";

    // A concurrent change event must not clobber the draft.
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 9, col: 0 },
          value: { kind: "literal", value: "z" },
        },
      ],
    });
    expect(input.value).toBe("draft-in-progress");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(input.value).toBe(stable);

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("blocks commits in read-only mode", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    piece.setReadOnly(true);
    expect(input.readOnly).toBe(true);

    input.value = "should-not-land";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Customer 1");

    piece.destroy();
    grid.destroy();
    store.dispose();
  });
});

describe("createSelectionStatus", () => {
  it("reports geometry only and stays blank for single cells", () => {
    expect(describeSelection(null)).toBe("");
    expect(describeSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } })).toBe("");
    expect(
      describeSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 4, col: 2 }, end: { row: 0, col: 0 } },
      }),
    ).toBe("5 × 3 cells");
    expect(describeSelection({ kind: "row", sheet: "s1", row: 6 })).toBe("Row 7");
    expect(describeSelection({ kind: "column", sheet: "s1", col: 1 })).toBe("Column 2");

    const { grid, store, host } = makeGrid();
    const piece = createSelectionStatus(host, grid);
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    });
    expect(piece.element.textContent).toBe("2 × 2 cells");
    expect(piece.element.getAttribute("role")).toBe("status");

    piece.destroy();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    expect(document.body.contains(piece.element)).toBe(false);

    grid.destroy();
    store.dispose();
  });
});

// ── Full shell ────────────────────────────────────────────────────────────────

describe("createSpreadsheetShell", () => {
  it("composes one grid with shell chrome and no duplicate built-ins", () => {
    const host = mountHost();
    const workbook = multiSheetWorkbook();
    const ready: Grid[] = [];

    const shell = createSpreadsheetShell(host, {
      grid: { workbook, data: makeColumnarData(10), config: { toolbar: true, tabs: true } },
      onReady: (grid) => ready.push(grid),
    });

    expect(ready).toEqual([shell.grid]);
    // Shell chrome present; the grid's own toolbar/tab duplicates suppressed.
    expect(host.querySelectorAll(".sheetwrite-shell-toolbar")).toHaveLength(1);
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();
    expect(host.querySelector(".sheetwrite-tabbar")).toBeNull();
    expect(host.querySelector(".sheetwrite-shell-tabs [role='tab']")).not.toBeNull();

    // Tab activation switches by id and notifies the tabs via active-sheet.
    const tabButtons = [
      ...host.querySelectorAll<HTMLButtonElement>(".sheetwrite-shell-tabs [role='tab']"),
    ];
    tabButtons[1]!.click();
    expect(shell.grid.getActiveSheet()).toBe("s2");

    shell.destroy();
    shell.destroy(); // idempotent
    expect(host.querySelector(".sheetwrite-shell")).toBeNull();
  });

  it("keeps a configured one-sheet tab strip coherent through remote lifecycle changes", () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: { workbook: makeWorkbook(10), data: makeColumnarData(10) },
    });

    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(1);
    expect(host.querySelector(".sheetwrite-shell-tabs")?.textContent).toContain("Sheet 1");

    const second = {
      id: "s2",
      name: "Remote",
      order: 1,
      rowCount: 5,
      columns: [{ key: "note", header: "Note", width: 200, type: "text" as const }],
      cells: [],
    };
    expect(shell.grid.applyRemoteOperations([{ op: "addSheet", sheet: second }]).status).toBe(
      "applied",
    );
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(2);
    expect(host.querySelector(".sheetwrite-shell-tabs")?.textContent).toContain("Remote");

    expect(
      shell.grid.applyRemoteOperations([{ op: "renameSheet", sheet: "s2", name: "Renamed" }])
        .status,
    ).toBe("applied");
    expect(host.querySelector(".sheetwrite-shell-tabs")?.textContent).toContain("Renamed");

    shell.grid.setActiveSheet("s2");
    expect(shell.grid.applyRemoteOperations([{ op: "removeSheet", sheet: "s2" }]).status).toBe(
      "applied",
    );
    expect(shell.grid.getActiveSheet()).toBe("s1");
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(1);

    shell.destroy();
  });

  it("honors live tabs false configuration without creating a second primitive", () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: {
        workbook: makeWorkbook(10),
        data: makeColumnarData(10),
        config: { tabs: false },
      },
    });

    expect(host.querySelector(".sheetwrite-shell-tabs")).toBeNull();
    shell.setGridConfig({ tabs: true });
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(1);
    const add = host.querySelector<HTMLButtonElement>(
      ".sheetwrite-shell-tabs [aria-label='Add sheet']",
    );
    if (!add) throw new Error("expected one-sheet Add action");
    add.click();
    expect(shell.grid.store.getWorkbook().sheets).toHaveLength(2);
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(2);
    shell.setGridConfig({ tabs: false });
    expect(host.querySelector(".sheetwrite-shell-tabs")).toBeNull();

    shell.destroy();
  });

  it("keeps read-only and config wrappers coherent with the shell chrome", () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: { workbook: makeWorkbook(10), data: makeColumnarData(10) },
    });

    shell.setReadOnly(true);
    const formula = host.querySelector(".sheetwrite-shell-formula");
    if (!(formula instanceof HTMLInputElement)) throw new Error("expected formula input");
    expect(formula.readOnly).toBe(true);
    expect(host.querySelector(".sheetwrite")?.getAttribute("aria-readonly")).toBe("true");

    // Reconfiguring can never resurrect the duplicate built-in toolbar/tabs.
    shell.setGridConfig({ toolbar: true, tabs: true, find: false });
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();
    expect(host.querySelector(".sheetwrite-tabbar")).toBeNull();

    shell.setTheme({ bg: "#123456" });
    expect(
      host
        .querySelector<HTMLElement>(".sheetwrite-shell")
        ?.style.getPropertyValue("--sheetwrite-widget-bg"),
    ).toBe("#123456");
    shell.setActiveSheet("s1");
    expect(shell.grid.getActiveSheet()).toBe("s1");

    shell.destroy();
  });

  it("isolates two shells on one page", () => {
    const hostA = mountHost();
    const hostB = mountHost();
    const shellA = createSpreadsheetShell(hostA, {
      grid: { workbook: makeWorkbook(5), data: makeColumnarData(5) },
    });
    const shellB = createSpreadsheetShell(hostB, {
      grid: { workbook: makeWorkbook(5), data: makeColumnarData(5) },
    });

    shellA.grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 0 } });
    const nameA = hostA.querySelector(".sheetwrite-shell-namebox");
    const nameB = hostB.querySelector(".sheetwrite-shell-namebox");
    if (!(nameA instanceof HTMLInputElement) || !(nameB instanceof HTMLInputElement)) {
      throw new Error("expected name box inputs");
    }
    expect(nameA.value).toBe("A4");
    expect(nameB.value).toBe("");

    shellA.destroy();
    expect(hostB.querySelector(".sheetwrite-shell")).not.toBeNull();
    shellB.destroy();
  });
});
