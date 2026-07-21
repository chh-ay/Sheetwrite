import { labelToCol } from "./a1.js";
import type { HighlightRange, SheetId } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";

// ── Function catalog ─────────────────────────────────────────────────────────

/**
 * Every function name the calc engine accepts, mirrored from the parser's match
 * table in `packages/wasm/src/calc.rs` (~L365-398). Rust is the source of truth
 * for what evaluates; keep this list in sync when the engine gains, renames, or
 * drops a function. Every alias is listed (AVG/AVERAGE, CONCAT/CONCATENATE) so
 * autocomplete only ever offers spellings the parser will actually accept.
 */
export const FORMULA_FUNCTIONS: readonly string[] = [
  "ABS",
  "AND",
  "AVERAGE",
  "AVERAGEIF",
  "AVERAGEIFS",
  "AVG",
  "CEILING",
  "CONCAT",
  "CONCATENATE",
  "COUNT",
  "COUNTA",
  "COUNTIF",
  "COUNTIFS",
  "DATE",
  "DATEVALUE",
  "DAY",
  "EXACT",
  "FILTER",
  "FLOOR",
  "HLOOKUP",
  "IF",
  "IFERROR",
  "INDEX",
  "INT",
  "LEFT",
  "LEN",
  "LOWER",
  "MATCH",
  "MAX",
  "MID",
  "MIN",
  "MOD",
  "MONTH",
  "NA",
  "NOT",
  "NOW",
  "OR",
  "PI",
  "POW",
  "RIGHT",
  "ROUND",
  "SIGN",
  "SORT",
  "SQRT",
  "SUM",
  "SUMIF",
  "SUMIFS",
  "TEXT",
  "TODAY",
  "TRIM",
  "TRUNC",
  "UNIQUE",
  "UPPER",
  "VLOOKUP",
  "XLOOKUP",
  "YEAR",
];

/**
 * Distinct fills cycled across the A1 references in the active formula so each
 * ref/range draws in its own color, Sheets-style. Semi-transparent so the
 * underlying cell content stays legible; passed through as per-range
 * {@link HighlightRange.color}.
 */
export const REF_PALETTE: readonly string[] = [
  "#4285f455",
  "#ea433555",
  "#f9ab0055",
  "#34a85355",
  "#a142f455",
  "#00acc155",
];

// ── Formula parsing helpers ──────────────────────────────────────────────────

/**
 * The trailing run of letters ending at `caret` — the function name being typed.
 * Returns `null` when the caret does not sit right after a letter (e.g. after a
 * digit, operator, or paren), which is exactly when no function suggestion is
 * wanted.
 */
export function functionTokenAt(text: string, caret: number): string | null {
  const match = /([A-Za-z]+)$/.exec(text.slice(0, caret));
  return match?.[1] ?? null;
}

/** Parse one A1 cell reference ("A1", "$B$2") into 0-based row/col, or null. */
function parseCell(ref: string): { row: number; col: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  const letters = match?.[1];
  const digits = match?.[2];
  if (!letters || !digits) return null;

  const col = labelToCol(letters.toUpperCase());
  const row = Number(digits) - 1;
  if (row < 0 || col < 0) return null;

  return { row, col };
}

/**
 * Parse every A1 cell/range reference out of a formula, cycling {@link REF_PALETTE}
 * so each reference gets its own color. Mirrors the ref regex used by
 * `shiftA1Refs` in a1.ts, including the "skip tokens glued to an alphanumeric"
 * rule that stops function names (and identifiers) from matching.
 */
export function parseFormulaRefs(text: string, sheet: SheetId): HighlightRange[] {
  const re = /(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/g;
  const out: HighlightRange[] = [];

  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const prev = m.index > 0 ? text.charAt(m.index - 1) : "";
    const head = m[1];
    if (head && prev !== "_" && !/[A-Za-z0-9]/.test(prev)) {
      const start = parseCell(head);
      const end = m[2] ? parseCell(m[2]) : start;
      if (start && end) {
        const color = REF_PALETTE[out.length % REF_PALETTE.length] as string;
        out.push({ sheet, start, end, color });
      }
    }
    m = re.exec(text);
  }

  return out;
}

/** Parse a CSS px length ("12px") into a number, defaulting to 0. */
function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// ── Assist dependencies ──────────────────────────────────────────────────────

/**
 * Host-provided hooks the formula assist needs from the grid. Deliberately tiny
 * so the built-in editor stays a thin, replaceable default over public grid
 * methods rather than the only way to drive these features.
 */
export interface AssistDeps {
  /**
   * Paint (or, with `null`, clear) the ranges referenced by the formula being
   * edited. Backed by `Grid.highlightCells`; per-range color is honored.
   */
  highlightCells: (ranges: HighlightRange[] | null) => void;
  /** Sheet id the formula's A1 references resolve against (the active sheet). */
  sheet: () => SheetId;
}

// ── Formula assist ───────────────────────────────────────────────────────────

/**
 * A styleable layer over the active formula editor: an autocomplete popup for
 * engine functions plus live A1 reference highlighting. Owns only its own popup
 * DOM; everything data-plane goes through {@link AssistDeps}. Attached to a
 * textarea while a formula is edited and detached on teardown.
 */
export class FormulaAssist {
  private readonly host: HTMLElement;
  private readonly deps: AssistDeps;

  private textarea: HTMLTextAreaElement | null = null;
  private theme: Theme | null = null;
  private popup: HTMLElement | null = null;
  private items: string[] = [];
  private activeIndex = 0;

  constructor(host: HTMLElement, deps: AssistDeps) {
    this.host = host;
    this.deps = deps;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /** Bind to a freshly opened editor textarea and paint any initial state. */
  attach(textarea: HTMLTextAreaElement, theme: Theme): void {
    this.textarea = textarea;
    this.theme = theme;
    this.update();
  }

  /** Release the textarea, close the popup, and clear ref highlights. */
  detach(): void {
    this.close();
    this.deps.highlightCells(null);
    this.textarea = null;
    this.theme = null;
  }

  get isOpen(): boolean {
    return this.popup !== null;
  }

  // ── model updates ────────────────────────────────────────────────────────--

  /**
   * Recompute ref highlights and the autocomplete popup from the live text and
   * caret. Highlights and suggestions apply only to formulas (text starting
   * with `=`); anything else clears both.
   */
  update(): void {
    const ta = this.textarea;
    if (!ta) return;

    const text = ta.value;
    if (!text.startsWith("=")) {
      this.deps.highlightCells(null);
      this.close();
      return;
    }

    const refs = parseFormulaRefs(text, this.deps.sheet());
    this.deps.highlightCells(refs.length > 0 ? refs : null);

    const caret = ta.selectionStart ?? text.length;
    const token = functionTokenAt(text, caret);
    if (token === null) {
      this.close();
      return;
    }

    const upper = token.toUpperCase();
    const matches = FORMULA_FUNCTIONS.filter((fn) => fn.startsWith(upper));
    if (matches.length === 0) {
      this.close();
      return;
    }

    this.show(matches);
  }

  /**
   * Consume popup navigation/acceptance keys. Returns `true` only when the popup
   * is open and the key drove it, so the editor's own Enter/Tab/Esc handling
   * falls through untouched when the popup is closed.
   */
  handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.move(1);
        return true;
      case "ArrowUp":
        e.preventDefault();
        this.move(-1);
        return true;
      case "Enter":
      case "Tab":
        e.preventDefault();
        this.accept();
        return true;
      case "Escape":
        e.preventDefault();
        this.close();
        return true;
      default:
        return false;
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────--

  /** Re-anchor the popup under the editor; called by the editor on scroll. */
  reposition(): void {
    const popup = this.popup;
    const ta = this.textarea;
    if (!popup || !ta) return;

    const left = parsePx(ta.style.left);
    const top = parsePx(ta.style.top);
    const height = parsePx(ta.style.height);
    popup.style.left = `${left}px`;
    popup.style.top = `${top + height}px`;
    if (ta.style.width) popup.style.minWidth = ta.style.width;
  }

  private move(delta: number): void {
    const n = this.items.length;
    if (n === 0) return;
    this.activeIndex = (this.activeIndex + delta + n) % n;
    this.renderActive();
  }

  private accept(): void {
    const ta = this.textarea;
    const name = this.items[this.activeIndex];
    if (!ta || name === undefined) return;

    const caret = ta.selectionStart ?? ta.value.length;
    const token = functionTokenAt(ta.value, caret) ?? "";
    const start = caret - token.length;
    const insert = `${name}(`;

    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(caret);
    const next = start + insert.length;
    ta.setSelectionRange(next, next);
    ta.focus();

    // Re-derive highlights/popup from the inserted "(": the token is now empty,
    // so this also closes the popup.
    this.update();
  }

  private show(matches: string[]): void {
    this.items = matches;
    this.activeIndex = 0;
    this.ensurePopup();
    this.renderItems();
    this.reposition();
  }

  private ensurePopup(): HTMLElement {
    if (this.popup) return this.popup;

    const popup = document.createElement("div");
    popup.className = "sheetwrite-assist";
    popup.setAttribute("role", "listbox");

    // Seed the popup's CSS custom properties from the active theme so the default
    // styling tracks the theme; a host can still override the class or the vars.
    const theme = this.theme;
    if (theme) {
      popup.style.setProperty("--sheetwrite-assist-bg", theme.bg);
      popup.style.setProperty("--sheetwrite-assist-fg", theme.fg);
      popup.style.setProperty("--sheetwrite-assist-border", theme.selectionBorder);
      popup.style.setProperty("--sheetwrite-assist-selected", theme.selection);
    }

    this.host.appendChild(popup);
    this.popup = popup;
    return popup;
  }

  private renderItems(): void {
    const popup = this.popup;
    if (!popup) return;

    popup.textContent = "";
    this.items.forEach((name, i) => {
      const el = document.createElement("div");
      el.className = "sheetwrite-assist-item";
      el.setAttribute("role", "option");
      el.textContent = name;
      if (i === this.activeIndex) el.setAttribute("aria-selected", "true");

      // mousedown (not click) so the pick lands before the textarea blurs;
      // preventDefault keeps focus in the editor.
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.activeIndex = i;
        this.accept();
      });

      popup.appendChild(el);
    });
  }

  private renderActive(): void {
    const popup = this.popup;
    if (!popup) return;

    const children = popup.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (!(el instanceof HTMLElement)) continue;
      if (i === this.activeIndex) el.setAttribute("aria-selected", "true");
      else el.removeAttribute("aria-selected");
    }

    const active = children[this.activeIndex];
    if (active instanceof HTMLElement && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private close(): void {
    if (!this.popup) return;
    this.popup.remove();
    this.popup = null;
    this.items = [];
    this.activeIndex = 0;
  }
}
