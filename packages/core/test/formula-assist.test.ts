import { afterEach, describe, expect, it } from "bun:test";
import { EditController } from "../src/editor.js";
import {
  type AssistDeps,
  FORMULA_FUNCTIONS,
  FormulaAssist,
  functionTokenAt,
  parseFormulaRefs,
  REF_PALETTE,
} from "../src/formula-assist.js";
import type { HighlightRange, Theme } from "../src/types.js";

// A full Theme so `attach`/`begin` type-check; only the color fields matter here.
const THEME: Theme = {
  font: "13px sans-serif",
  bg: "#ffffff",
  fg: "#111111",
  gridLine: "#eeeeee",
  headerBg: "#f4ede1",
  headerFg: "#6b4a1f",
  selection: "#2563eb33",
  selectionBorder: "#2563eb",
  rowHeight: 28,
  headerHeight: 28,
  rowHeaderWidth: 48,
  searchMatch: "#fff47580",
  searchActiveMatch: "#fbbc04",
  highlight: "#e8f0fe99",
};

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

// A textarea mounted in a host, with the inline geometry the editor sets so the
// popup can anchor under it.
function mountTextarea(): { host: HTMLElement; ta: HTMLTextAreaElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ta = document.createElement("textarea");
  ta.style.left = "10px";
  ta.style.top = "20px";
  ta.style.width = "80px";
  ta.style.height = "24px";
  host.appendChild(ta);
  return { host, ta };
}

function itemsOf(host: HTMLElement): string[] {
  return [...host.querySelectorAll(".sheetwrite-assist-item")].map((el) => el.textContent ?? "");
}

function selectedItem(host: HTMLElement): string | null {
  return host.querySelector('.sheetwrite-assist-item[aria-selected="true"]')?.textContent ?? null;
}

const noopDeps = (): AssistDeps => ({ highlightCells: () => {}, sheet: () => "s1" });

afterEach(() => {
  document.body.innerHTML = "";
});

// ── pure helpers ─────────────────────────────────────────────────────────────

describe("FORMULA_FUNCTIONS catalog", () => {
  it("matches the function names accepted by the calc.rs parser", async () => {
    const source = await Bun.file(new URL("../../wasm/src/calc.rs", import.meta.url)).text();
    const parserTable = source.match(
      /let func = match name\.to_ascii_uppercase\(\)\.as_str\(\) \{([\s\S]*?)\n\s*_ => None,/,
    );
    if (!parserTable?.[1]) throw new Error("calc.rs parser function table not found");

    const engineFunctions = [...parserTable[1].matchAll(/"([A-Z][A-Z0-9]*)"/g)].map(
      (match) => match[1]!,
    );

    expect(new Set(FORMULA_FUNCTIONS).size).toBe(FORMULA_FUNCTIONS.length);
    expect([...FORMULA_FUNCTIONS]).toEqual([...FORMULA_FUNCTIONS].sort());
    expect(new Set(engineFunctions).size).toBe(engineFunctions.length);
    expect([...FORMULA_FUNCTIONS]).toEqual(engineFunctions.sort());
  });
});

describe("functionTokenAt", () => {
  it("returns the trailing letter run ending at the caret", () => {
    expect(functionTokenAt("=SU", 3)).toBe("SU");
    expect(functionTokenAt("=1+co", 5)).toBe("co");
    expect(functionTokenAt("=SUM(A", 6)).toBe("A");
  });

  it("returns null when the caret is not right after a letter", () => {
    expect(functionTokenAt("=SUM(A1:B2)+C3", 14)).toBeNull();
    expect(functionTokenAt("=SUM(", 5)).toBeNull();
    expect(functionTokenAt("=", 1)).toBeNull();
  });
});

describe("parseFormulaRefs", () => {
  it("parses cells and ranges with cycling palette colors", () => {
    expect(parseFormulaRefs("=SUM(A1:B2)+C3", "s1")).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 }, color: REF_PALETTE[0] },
      { sheet: "s1", start: { row: 2, col: 2 }, end: { row: 2, col: 2 }, color: REF_PALETTE[1] },
    ]);
  });

  it("skips function names and tokens glued to an alphanumeric", () => {
    // SUM has no digits so never matches; no A1-shaped refs here at all.
    expect(parseFormulaRefs("=SUM(1,2)", "s1")).toEqual([]);
  });

  it("honors absolute markers when resolving the cell", () => {
    expect(parseFormulaRefs("=$A$1", "s1")).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 }, color: REF_PALETTE[0] },
    ]);
  });
});

// ── autocomplete popup ───────────────────────────────────────────────────────

describe("FormulaAssist autocomplete", () => {
  it("filters the popup by the caret token", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);

    expect(assist.isOpen).toBe(true);
    expect(itemsOf(host)).toEqual(["SUM", "SUMIF", "SUMIFS"]);

    ta.value = "=CO";
    ta.setSelectionRange(3, 3);
    assist.update();
    expect(itemsOf(host)).toEqual([
      "CONCAT",
      "CONCATENATE",
      "COUNT",
      "COUNTA",
      "COUNTIF",
      "COUNTIFS",
    ]);
  });

  it("stays closed when the text is not a formula", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "SU";
    ta.setSelectionRange(2, 2);
    assist.attach(ta, THEME);

    expect(assist.isOpen).toBe(false);
    expect(host.querySelector(".sheetwrite-assist")).toBeNull();
  });

  it("accepts the active suggestion into the caret with an opening paren", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);

    expect(assist.handleKeyDown(keydown("Enter"))).toBe(true);
    expect(ta.value).toBe("=SUM(");
    expect(ta.selectionStart).toBe(5);
    expect(assist.isOpen).toBe(false);
  });

  it("replaces only the token at a mid-string caret", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU)";
    ta.setSelectionRange(3, 3); // caret right after "SU", before ")"
    assist.attach(ta, THEME);

    expect(assist.handleKeyDown(keydown("Tab"))).toBe(true);
    expect(ta.value).toBe("=SUM()");
    expect(ta.selectionStart).toBe(5);
  });

  it("navigates with Up/Down only while open and accepts the highlighted item", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=CO";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);
    expect(selectedItem(host)).toBe("CONCAT");

    expect(assist.handleKeyDown(keydown("ArrowDown"))).toBe(true);
    expect(selectedItem(host)).toBe("CONCATENATE");

    expect(assist.handleKeyDown(keydown("ArrowUp"))).toBe(true);
    expect(assist.handleKeyDown(keydown("ArrowUp"))).toBe(true); // wraps to last
    expect(selectedItem(host)).toBe("COUNTIFS");

    assist.handleKeyDown(keydown("Enter"));
    expect(ta.value).toBe("=COUNTIFS(");
  });

  it("ignores Arrow keys when the popup is closed (returns false)", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "abc";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);

    expect(assist.isOpen).toBe(false);
    expect(assist.handleKeyDown(keydown("ArrowDown"))).toBe(false);
    expect(assist.handleKeyDown(keydown("Enter"))).toBe(false);
  });

  it("Esc closes the popup first (handled), then falls through (unhandled)", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);
    expect(assist.isOpen).toBe(true);

    expect(assist.handleKeyDown(keydown("Escape"))).toBe(true); // first Esc closes popup
    expect(assist.isOpen).toBe(false);
    expect(assist.handleKeyDown(keydown("Escape"))).toBe(false); // second Esc not consumed
  });
});

// ── reference highlighting ───────────────────────────────────────────────────

describe("FormulaAssist ref highlighting", () => {
  it("calls the highlight dep with parsed, colored ranges and clears on detach", () => {
    const calls: (HighlightRange[] | null)[] = [];
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, {
      highlightCells: (ranges) => calls.push(ranges),
      sheet: () => "s1",
    });

    ta.value = "=SUM(A1:B2)+C3";
    ta.setSelectionRange(14, 14);
    assist.attach(ta, THEME);

    expect(calls.at(-1)).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 }, color: REF_PALETTE[0] },
      { sheet: "s1", start: { row: 2, col: 2 }, end: { row: 2, col: 2 }, color: REF_PALETTE[1] },
    ]);

    assist.detach();
    expect(calls.at(-1)).toBeNull();
  });

  it("clears highlights when the text is not a formula", () => {
    const calls: (HighlightRange[] | null)[] = [];
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, {
      highlightCells: (ranges) => calls.push(ranges),
      sheet: () => "s1",
    });

    ta.value = "plain text";
    ta.setSelectionRange(10, 10);
    assist.attach(ta, THEME);

    expect(calls.at(-1)).toBeNull();
  });
});

// ── EditController integration ───────────────────────────────────────────────

describe("EditController with assist deps", () => {
  function begin(): {
    editor: EditController;
    host: HTMLElement;
    ta: HTMLTextAreaElement;
    state: {
      cancelled: boolean;
      committed: string | null;
      highlights: (HighlightRange[] | null)[];
    };
  } {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const state = {
      cancelled: false,
      committed: null as string | null,
      highlights: [] as (HighlightRange[] | null)[],
    };

    const editor = new EditController(host, {
      highlightCells: (ranges) => state.highlights.push(ranges),
      sheet: () => "s1",
    });

    editor.begin({
      row: 0,
      col: 0,
      type: "text",
      initial: "",
      selectAll: false,
      rect: { x: 10, y: 20, w: 80, h: 24 },
      theme: THEME,
      onCommit: (value) => {
        state.committed = value;
      },
      onCancel: () => {
        state.cancelled = true;
      },
    });

    const ta = host.querySelector("textarea.sheetwrite-editor");
    if (!(ta instanceof HTMLTextAreaElement)) throw new Error("editor textarea missing");
    return { editor, host, ta, state };
  }

  it("opens the popup on formula input and highlights refs", () => {
    const { host, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(5, 5); // after "=SUM(", token empty → no popup, but refs highlight
    ta.dispatchEvent(new Event("input"));
    expect(state.highlights.at(-1)).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 }, color: REF_PALETTE[0] },
    ]);

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    ta.dispatchEvent(new Event("input"));
    expect(host.querySelector(".sheetwrite-assist")).not.toBeNull();
    expect(itemsOf(host)).toEqual(["SUM", "SUMIF", "SUMIFS"]);
  });

  it("first Escape closes the popup, second cancels the edit and clears highlights", () => {
    const { editor, host, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(6, 6); // caret after "A" → token "A" opens popup
    ta.dispatchEvent(new Event("input"));
    expect(host.querySelector(".sheetwrite-assist")).not.toBeNull();

    ta.dispatchEvent(keydown("Escape"));
    expect(host.querySelector(".sheetwrite-assist")).toBeNull();
    expect(editor.isEditing).toBe(true);
    expect(state.cancelled).toBe(false);

    ta.dispatchEvent(keydown("Escape"));
    expect(state.cancelled).toBe(true);
    expect(editor.isEditing).toBe(false);
    expect(state.highlights.at(-1)).toBeNull(); // cleared on teardown
  });

  it("clears highlights on commit", () => {
    const { editor, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(8, 8);
    ta.dispatchEvent(new Event("input"));
    expect(state.highlights.at(-1)).not.toBeNull();

    editor.commit("down");
    expect(state.committed).toBe("=SUM(A1)");
    expect(state.highlights.at(-1)).toBeNull();
  });
});
