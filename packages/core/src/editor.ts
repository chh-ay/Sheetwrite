import type { CellFormat, Theme } from "./types";

export type EditNavigate = "down" | "right" | "left" | "none";

export interface EditRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BeginEditOptions {
  row: number;
  col: number;
  type: CellFormat;
  initial: string;
  /** select all text (F2/double-click) vs place caret at end (typed char) */
  selectAll: boolean;
  rect: EditRect;
  theme: Theme;
  onCommit: (value: string, navigate: EditNavigate) => void;
  onCancel: () => void;
}

/**
 * Owns Layer 3: a single real `<textarea>` mounted over the active cell only
 * while editing, never recycled — so IME composition and focus survive scroll.
 */
export class EditController {
  private readonly host: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private cell: { row: number; col: number } | null = null;
  private opts: BeginEditOptions | null = null;
  private composing = false;
  private tearingDown = false;
  private refStart = -1;
  private refEnd = -1;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get isEditing(): boolean {
    return this.textarea !== null;
  }

  get editingCell(): { row: number; col: number } | null {
    return this.cell;
  }

  begin(opts: BeginEditOptions): void {
    this.teardown();

    const ta = document.createElement("textarea");
    ta.className = "sheetwrite-editor";
    ta.value = opts.initial;
    ta.inputMode = opts.type === "number" ? "decimal" : "text";
    ta.spellcheck = false;
    ta.wrap = "off";
    ta.style.cssText = [
      "position:absolute",
      "margin:0",
      `border:2px solid ${opts.theme.selectionBorder}`,
      "outline:none",
      "resize:none",
      `font:${opts.theme.font}`,
      `color:${opts.theme.fg}`,
      `background:${opts.theme.bg}`,
      "padding:0 4px",
      "box-sizing:border-box",
      "z-index:3",
      "overflow:hidden",
      "white-space:pre",
    ].join(";");

    this.host.appendChild(ta);
    this.textarea = ta;
    this.cell = { row: opts.row, col: opts.col };
    this.opts = opts;
    this.position(opts.rect);

    ta.addEventListener("compositionstart", this.onCompositionStart);
    ta.addEventListener("compositionend", this.onCompositionEnd);
    ta.addEventListener("keydown", this.onKeyDown);
    ta.addEventListener("blur", this.onBlur);
    ta.addEventListener("input", this.onInput);

    ta.focus();
    if (opts.selectAll) {
      ta.select();
    } else {
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    }
  }

  position(rect: EditRect): void {
    const ta = this.textarea;
    if (!ta) return;
    ta.style.left = `${rect.x}px`;
    ta.style.top = `${rect.y}px`;
    ta.style.width = `${rect.w}px`;
    ta.style.height = `${rect.h}px`;
    ta.style.lineHeight = `${Math.max(1, rect.h - 4)}px`;
  }

  get value(): string {
    return this.textarea?.value ?? "";
  }

  /**
   * Insert (or, while dragging, replace) an A1 reference at the caret — the
   * "point mode" a spreadsheet enters after you type `=`.
   */
  setReference(ref: string): void {
    const ta = this.textarea;
    if (!ta) return;
    const start = this.refStart >= 0 ? this.refStart : (ta.selectionStart ?? ta.value.length);
    const end = this.refStart >= 0 ? this.refEnd : (ta.selectionEnd ?? start);
    ta.value = ta.value.slice(0, start) + ref + ta.value.slice(end);
    this.refStart = start;
    this.refEnd = start + ref.length;
    ta.setSelectionRange(this.refEnd, this.refEnd);
    ta.focus();
  }

  /** Finish a reference pick; the next pick inserts fresh at the caret. */
  endReference(): void {
    this.refStart = -1;
    this.refEnd = -1;
  }

  private readonly onInput = (): void => {
    this.refStart = -1;
  };

  commit(navigate: EditNavigate): void {
    const opts = this.opts;
    const ta = this.textarea;
    if (!opts || !ta) return;
    const value = ta.value;
    this.teardown();
    opts.onCommit(value, navigate);
  }

  cancel(): void {
    const opts = this.opts;
    if (!opts) return;
    this.teardown();
    opts.onCancel();
  }

  destroy(): void {
    this.teardown();
  }

  private readonly onCompositionStart = (): void => {
    this.composing = true;
  };

  private readonly onCompositionEnd = (): void => {
    this.composing = false;
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // While the IME is composing, every keystroke belongs to the composition.
    if (this.composing) {
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.commit("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.commit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    }
    // Keep arrows/typing inside the textarea, never bubbling to grid nav.
    e.stopPropagation();
  };

  private readonly onBlur = (): void => {
    if (this.textarea && !this.tearingDown) this.commit("none");
  };

  private teardown(): void {
    const ta = this.textarea;
    if (!ta) return;
    this.tearingDown = true;
    ta.removeEventListener("compositionstart", this.onCompositionStart);
    ta.removeEventListener("compositionend", this.onCompositionEnd);
    ta.removeEventListener("keydown", this.onKeyDown);
    ta.removeEventListener("blur", this.onBlur);
    ta.removeEventListener("input", this.onInput);
    ta.remove();
    this.textarea = null;
    this.cell = null;
    this.opts = null;
    this.composing = false;
    this.refStart = -1;
    this.refEnd = -1;
    this.tearingDown = false;
  }
}
