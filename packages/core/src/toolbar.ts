import type { CellAlign, GridConfig, Theme } from "./types";

export interface ToolbarActions {
  toggleBold(): void;
  toggleItalic(): void;
  setAlign(align: CellAlign): void;
  setTextColor(color: string): void;
  setFillColor(color: string): void;
  setBorder(): void;
  clearFormat(): void;
  merge(): void;
  unmerge(): void;
  sort(ascending: boolean): void;
}

/** Built-in, config-gated toolbar. Each control acts on the current selection. */
export class Toolbar {
  static readonly height = 36;
  private readonly el: HTMLDivElement;

  constructor(host: HTMLElement, config: GridConfig, theme: Theme, actions: ToolbarActions) {
    const bar = document.createElement("div");
    bar.className = "sheetwrite-toolbar";
    bar.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "right:0",
      `height:${Toolbar.height}px`,
      "display:flex",
      "align-items:center",
      "gap:2px",
      "padding:0 6px",
      `border-bottom:1px solid ${theme.gridLine}`,
      `background:${theme.headerBg}`,
      `color:${theme.headerFg}`,
      `font:${theme.font}`,
      "box-sizing:border-box",
      "overflow-x:auto",
    ].join(";");

    const enabled = (flag: boolean | undefined): boolean => flag !== false;

    const button = (label: string, title: string, onClick: () => void): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        "min-width:28px;height:26px;padding:0 6px;border:1px solid transparent;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;";
      b.addEventListener("mousedown", (e) => e.preventDefault()); // keep grid focus
      b.addEventListener("click", onClick);
      bar.appendChild(b);
    };

    const colorControl = (title: string, onPick: (c: string) => void): void => {
      const input = document.createElement("input");
      input.type = "color";
      input.title = title;
      input.style.cssText =
        "width:26px;height:26px;padding:0;border:none;background:transparent;cursor:pointer;";
      input.addEventListener("input", () => onPick(input.value));
      bar.appendChild(input);
    };

    const sep = (): void => {
      const s = document.createElement("span");
      s.style.cssText = `width:1px;height:20px;margin:0 4px;background:${theme.gridLine};`;
      bar.appendChild(s);
    };

    if (enabled(config.bold)) button("B", "Bold", actions.toggleBold);
    if (enabled(config.italic)) button("I", "Italic", actions.toggleItalic);
    if (enabled(config.align)) {
      button("⟸", "Align left", () => actions.setAlign("left"));
      button("≡", "Align center", () => actions.setAlign("center"));
      button("⟹", "Align right", () => actions.setAlign("right"));
    }
    if (enabled(config.textColor) || enabled(config.fillColor)) sep();
    if (enabled(config.textColor)) colorControl("Text color", actions.setTextColor);
    if (enabled(config.fillColor)) colorControl("Fill color", actions.setFillColor);
    if (enabled(config.border)) button("▢", "Border", actions.setBorder);
    if (enabled(config.clearFormat)) button("⌫", "Clear formatting", actions.clearFormat);
    if (enabled(config.merge)) {
      sep();
      button("Merge", "Merge cells", actions.merge);
      button("Unmerge", "Unmerge cells", actions.unmerge);
    }
    if (enabled(config.sort)) {
      sep();
      button("▲", "Sort ascending", () => actions.sort(true));
      button("▼", "Sort descending", () => actions.sort(false));
    }

    host.appendChild(bar);
    this.el = bar;
  }

  destroy(): void {
    this.el.remove();
  }
}
