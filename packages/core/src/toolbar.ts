import type { Grid, GridActions, GridConfig, Theme, ToolbarActionName, ToolbarItem } from "./types";

/** Button glyph for each built-in action. Color inputs (textColor/fillColor) carry no glyph. */
const DEFAULT_ICON: Partial<Record<ToolbarActionName, string>> = {
  bold: "B",
  undo: "↶",
  redo: "↷",
  italic: "I",
  alignLeft: "⟸",
  alignCenter: "≡",
  alignRight: "⟹",
  border: "▢",
  clearFormat: "⌫",
  merge: "Merge",
  unmerge: "Unmerge",
  sortAsc: "▲",
  sortDesc: "▼",
  exportCsv: "CSV",
  exportXlsx: "XLSX",
};

/** Accessible tooltip for each built-in action. */
const DEFAULT_TITLE: Record<Exclude<ToolbarActionName, "separator">, string> = {
  bold: "Bold",
  undo: "Undo",
  redo: "Redo",
  italic: "Italic",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
  textColor: "Text color",
  fillColor: "Fill color",
  border: "Border",
  clearFormat: "Clear formatting",
  merge: "Merge cells",
  unmerge: "Unmerge cells",
  sortAsc: "Sort ascending",
  sortDesc: "Sort descending",
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
};

const BUTTON_CSS =
  "min-width:28px;height:26px;padding:0 6px;border:1px solid transparent;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;";

const COLOR_INPUT_CSS =
  "width:26px;height:26px;padding:0;border:none;background:transparent;cursor:pointer;";

/** Shared mousedown guard so a control click never steals focus from the grid. */
const preventDefault = (event: Event): void => event.preventDefault();

/**
 * Config-driven toolbar. Renders either a custom `config.toolbar` item list or the
 * default per-flag set of built-ins, binding each control to a `GridActions` method.
 * The whole bar is built once in the constructor; nothing rebuilds per render.
 */
export class Toolbar {
  static readonly height = 36;

  private readonly el: HTMLDivElement;

  constructor(
    host: HTMLElement,
    config: GridConfig,
    theme: Theme,
    actions: GridActions,
    grid: Grid,
  ) {
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

    // ── DOM builders (append directly to the bar) ──────────────────────────

    const setIcon = (el: HTMLElement, content: string): void => {
      // Consumer-authored markup is allowed: treat anything containing a tag as HTML.
      if (content.includes("<")) {
        el.innerHTML = content;
      } else {
        el.textContent = content;
      }
    };

    const addButton = (suffix: string, icon: string, title: string, onClick: () => void): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sheetwrite-tb-${suffix}`;
      button.title = title;
      button.style.cssText = BUTTON_CSS;
      setIcon(button, icon);

      button.addEventListener("mousedown", preventDefault);
      button.addEventListener("click", onClick);

      bar.appendChild(button);
    };

    const addColorInput = (
      suffix: string,
      title: string,
      onPick: (color: string) => void,
    ): void => {
      const input = document.createElement("input");
      input.type = "color";
      input.className = `sheetwrite-tb-${suffix}`;
      input.title = title;
      input.style.cssText = COLOR_INPUT_CSS;
      input.addEventListener("input", () => onPick(input.value));

      bar.appendChild(input);
    };

    const addSeparator = (): void => {
      const divider = document.createElement("span");
      divider.className = "sheetwrite-tb-separator";
      divider.style.cssText = `width:1px;height:20px;margin:0 4px;background:${theme.gridLine};`;

      bar.appendChild(divider);
    };

    // ── Action binding (the action → method table) ─────────────────────────

    const runAction = (action: ToolbarActionName): void => {
      switch (action) {
        case "undo":
          actions.undo();
          break;
        case "redo":
          actions.redo();
          break;
        case "bold":
          actions.toggleBold();
          break;
        case "italic":
          actions.toggleItalic();
          break;
        case "alignLeft":
          actions.setAlign("left");
          break;
        case "alignCenter":
          actions.setAlign("center");
          break;
        case "alignRight":
          actions.setAlign("right");
          break;
        case "border":
          actions.toggleBorder();
          break;
        case "clearFormat":
          actions.clearFormat();
          break;
        case "merge":
          actions.merge();
          break;
        case "unmerge":
          actions.unmerge();
          break;
        case "sortAsc":
          actions.sort(true);
          break;
        case "sortDesc":
          actions.sort(false);
          break;
        case "exportCsv":
          actions.exportCsv();
          break;
        case "exportXlsx":
          actions.exportXlsx();
          break;
      }
    };

    // ── Custom item list ───────────────────────────────────────────────────

    const renderItem = (item: ToolbarItem): void => {
      const action = item.action;

      if (action === "separator") {
        addSeparator();
        return;
      }

      const title = item.title ?? (action ? DEFAULT_TITLE[action] : "");
      const icon = item.icon ?? (action ? (DEFAULT_ICON[action] ?? "") : "");

      if (item.onClick) {
        const onClick = item.onClick;
        addButton(action ?? "custom", icon, title, () => onClick(grid));
        return;
      }

      if (action === "textColor") {
        addColorInput("textColor", title, (color) => actions.setTextColor(color));
        return;
      }

      if (action === "fillColor") {
        addColorInput("fillColor", title, (color) => actions.setFillColor(color));
        return;
      }

      if (action) {
        addButton(action, icon, title, () => runAction(action));
      }
    };

    // ── Default per-flag toolbar ───────────────────────────────────────────

    const iconFor = (action: ToolbarActionName): string =>
      config.icons?.[action] ?? DEFAULT_ICON[action] ?? "";

    const builtinButton = (
      action: Exclude<ToolbarActionName, "separator" | "textColor" | "fillColor">,
    ): void => {
      addButton(action, iconFor(action), DEFAULT_TITLE[action], () => runAction(action));
    };

    const enabled = (flag: boolean | undefined): boolean => flag !== false;

    const renderDefault = (): void => {
      if (enabled(config.undo)) {
        builtinButton("undo");
        builtinButton("redo");
        addSeparator();
      }

      if (enabled(config.bold)) builtinButton("bold");
      if (enabled(config.italic)) builtinButton("italic");

      if (enabled(config.align)) {
        builtinButton("alignLeft");
        builtinButton("alignCenter");
        builtinButton("alignRight");
      }

      if (enabled(config.textColor) || enabled(config.fillColor)) addSeparator();
      if (enabled(config.textColor)) {
        addColorInput("textColor", DEFAULT_TITLE.textColor, (color) => actions.setTextColor(color));
      }
      if (enabled(config.fillColor)) {
        addColorInput("fillColor", DEFAULT_TITLE.fillColor, (color) => actions.setFillColor(color));
      }

      if (enabled(config.border)) builtinButton("border");
      if (enabled(config.clearFormat)) builtinButton("clearFormat");

      if (enabled(config.merge)) {
        addSeparator();
        builtinButton("merge");
        builtinButton("unmerge");
      }

      if (enabled(config.sort)) {
        addSeparator();
        builtinButton("sortAsc");
        builtinButton("sortDesc");
      }

      if (config.export) {
        addSeparator();
        builtinButton("exportCsv");
        builtinButton("exportXlsx");
      }
    };

    // ── Build once ─────────────────────────────────────────────────────────

    if (Array.isArray(config.toolbar)) {
      for (const item of config.toolbar) {
        renderItem(item);
      }
    } else {
      renderDefault();
    }

    host.appendChild(bar);
    this.el = bar;
  }

  destroy(): void {
    this.el.remove();
  }
}
