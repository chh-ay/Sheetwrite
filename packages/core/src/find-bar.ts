import type { Grid, SearchResult, Theme } from "./types";

/** Counter label: empty when idle, "No results", or "<active+1> of <total>". */
function formatCount(result: SearchResult): string {
  if (result.matches.length === 0) {
    return result.query ? "No results" : "";
  }

  return `${result.active + 1} of ${result.matches.length}`;
}

/**
 * Google-Sheets-style floating find box pinned to the top-right of the grid host.
 * The DOM is built once in the constructor; `open`/`close` only toggle visibility
 * and focus. Typing searches; Enter/Shift+Enter cycle matches; Esc closes.
 */
export class FindBar {
  private readonly host: HTMLElement;
  private readonly grid: Grid;

  private readonly el: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly count: HTMLSpanElement;

  private _open = false;

  constructor(host: HTMLElement, theme: Theme, grid: Grid) {
    this.host = host;
    this.grid = grid;

    const el = document.createElement("div");
    el.className = "sheetwrite-find";
    el.style.cssText = [
      "position:absolute",
      "top:10px",
      "right:10px",
      "z-index:1000",
      "display:none",
      "align-items:center",
      "gap:6px",
      "padding:6px 8px",
      `border:1px solid ${theme.gridLine}`,
      "border-radius:8px",
      `background:${theme.bg}`,
      `color:${theme.fg}`,
      `font:${theme.font}`,
      "box-shadow:0 2px 6px rgba(60,64,67,0.3)",
      "box-sizing:border-box",
    ].join(";");

    const input = document.createElement("input");
    input.className = "sheetwrite-find-input";
    input.placeholder = "Find in sheet";
    input.style.cssText = [
      "width:220px",
      "height:28px",
      "padding:0 8px",
      "border:none",
      `border-bottom:1px solid ${theme.gridLine}`,
      "border-radius:0",
      `background:${theme.bg}`,
      `color:${theme.fg}`,
      "font:inherit",
      "outline:none",
      "box-sizing:border-box",
    ].join(";");

    const count = document.createElement("span");
    count.className = "sheetwrite-find-count";
    count.style.cssText = "min-width:72px;text-align:right;opacity:0.72;white-space:nowrap;";

    const prev = this.button("sheetwrite-find-prev", "↑", "Previous", theme, () => {
      this.update(this.grid.findPrev());
    });

    const next = this.button("sheetwrite-find-next", "↓", "Next", theme, () => {
      this.update(this.grid.findNext());
    });

    const close = this.button("sheetwrite-find-close", "✕", "Close", theme, () => {
      this.close();
    });

    input.addEventListener("input", () => {
      this.update(this.grid.search(input.value));
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        this.update(e.shiftKey ? this.grid.findPrev() : this.grid.findNext());
        return;
      }

      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });

    el.appendChild(input);
    el.appendChild(count);
    el.appendChild(prev);
    el.appendChild(next);
    el.appendChild(close);

    host.appendChild(el);

    this.el = el;
    this.input = input;
    this.count = count;
  }

  open(): void {
    this.el.style.display = "flex";
    this._open = true;

    this.input.focus();
    this.input.select();

    if (this.input.value) {
      this.update(this.grid.search(this.input.value));
    }
  }

  close(): void {
    this.el.style.display = "none";
    this._open = false;

    this.grid.clearSearch();
    this.host.focus();
  }

  get isOpen(): boolean {
    return this._open;
  }

  destroy(): void {
    this.el.remove();
  }

  private update(result: SearchResult): void {
    this.count.textContent = formatCount(result);
  }

  /** A flat icon button that keeps grid focus (mousedown is suppressed). */
  private button(
    className: string,
    label: string,
    title: string,
    theme: Theme,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.title = title;
    btn.style.cssText = [
      "width:28px",
      "height:28px",
      "padding:0",
      "border:none",
      "border-radius:50%",
      "background:transparent",
      `color:${theme.headerFg}`,
      "font:inherit",
      "line-height:1",
      "cursor:pointer",
    ].join(";");

    // Keep grid focus so buttons act without observing focus oddly.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("mouseenter", () => {
      btn.style.background = theme.selection;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
    });

    btn.addEventListener("click", onClick);

    return btn;
  }
}
