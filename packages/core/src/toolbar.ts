import type {
  Grid,
  GridActions,
  GridConfig,
  Theme,
  ToolbarActionName,
  ToolbarIcon,
  ToolbarItem,
} from "./types.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** Button glyph for each built-in action. Color inputs (textColor/fillColor) carry no glyph. */
const DEFAULT_ICON: Partial<Record<ToolbarActionName, string>> = {
  bold: "B",
  undo: "↶",
  redo: "↷",
  italic: "I",
  underline: "U",
  strikethrough: "S",
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
  underline: "Underline",
  strikethrough: "Strikethrough",
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

/** Shared mousedown guard so a control click never steals focus from the grid. */
const preventDefault = (event: Event): void => event.preventDefault();

/** Dispatch one built-in toolbar action to its `GridActions` method. */
function runAction(actions: GridActions, action: ToolbarActionName): void {
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
    case "underline":
      actions.toggleUnderline();
      break;
    case "strikethrough":
      actions.toggleStrikethrough();
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
}

/**
 * The default per-flag item list the built-in toolbar renders when no custom
 * `ToolbarItem[]` is supplied. Also the default for the shell's toolbar.
 */
export function defaultToolbarItems(config: GridConfig): ToolbarItem[] {
  const enabled = (flag: boolean | undefined): boolean => flag !== false;
  const items: ToolbarItem[] = [];

  if (enabled(config.undo)) {
    items.push({ action: "undo" }, { action: "redo" }, { action: "separator" });
  }

  if (enabled(config.bold)) items.push({ action: "bold" });
  if (enabled(config.italic)) items.push({ action: "italic" });
  if (enabled(config.bold) || enabled(config.italic)) {
    items.push({ action: "underline" }, { action: "strikethrough" });
  }

  if (enabled(config.align)) {
    items.push({ action: "alignLeft" }, { action: "alignCenter" }, { action: "alignRight" });
  }

  if (enabled(config.textColor) || enabled(config.fillColor)) items.push({ action: "separator" });
  if (enabled(config.textColor)) items.push({ action: "textColor" });
  if (enabled(config.fillColor)) items.push({ action: "fillColor" });

  if (enabled(config.border)) items.push({ action: "border" });
  if (enabled(config.clearFormat)) items.push({ action: "clearFormat" });

  if (enabled(config.merge)) {
    items.push({ action: "separator" }, { action: "merge" }, { action: "unmerge" });
  }

  if (enabled(config.sort)) {
    items.push({ action: "separator" }, { action: "sortAsc" }, { action: "sortDesc" });
  }

  if (config.export) {
    items.push({ action: "separator" }, { action: "exportCsv" }, { action: "exportXlsx" });
  }

  return items;
}

/**
 * Render toolbar items into `bar`, binding built-in actions to `grid.actions`
 * and custom `onClick` handlers to the grid handle. Shared by the grid's
 * legacy built-in toolbar and the shell's `createToolbar`, so the repo has one
 * toolbar implementation. Icon strings are always text (never HTML); DOM-node
 * icons are cloned so one config can serve several toolbars.
 */
export function renderToolbarItems(
  bar: HTMLElement,
  items: readonly ToolbarItem[],
  grid: Grid,
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>,
): void {
  const setIcon = (el: HTMLElement, content: ToolbarIcon): void => {
    if (typeof content === "string") {
      // Icon strings are text-only; never interpret them as HTML.
      el.textContent = content;
      return;
    }

    const node = typeof content === "function" ? content() : content.cloneNode(true);
    el.replaceChildren(node);
  };

  const addButton = (
    suffix: string,
    icon: ToolbarIcon,
    title: string,
    onClick: () => void,
  ): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sheetwrite-tb-button sheetwrite-tb-${suffix}`;
    button.title = title;
    if (title) button.setAttribute("aria-label", title);
    setIcon(button, icon);

    // Mouse activation must not steal focus/selection from the grid.
    button.addEventListener("mousedown", preventDefault);
    button.addEventListener("click", onClick);

    bar.appendChild(button);
  };

  const addColorInput = (suffix: string, title: string, onPick: (color: string) => void): void => {
    const input = document.createElement("input");
    input.type = "color";
    input.className = `sheetwrite-tb-color sheetwrite-tb-${suffix}`;
    input.title = title;
    if (title) input.setAttribute("aria-label", title);
    input.addEventListener("input", () => onPick(input.value));

    bar.appendChild(input);
  };

  for (const item of items) {
    const action = item.action;

    if (action === "separator") {
      const divider = document.createElement("span");
      divider.className = "sheetwrite-tb-separator";
      divider.setAttribute("role", "separator");
      bar.appendChild(divider);
      continue;
    }

    const title = item.title ?? (action ? DEFAULT_TITLE[action] : "");
    const icon = item.icon ?? (action ? (icons?.[action] ?? DEFAULT_ICON[action] ?? "") : "");

    if (item.onClick) {
      const onClick = item.onClick;
      addButton(action ?? "custom", icon, title, () => onClick(grid));
      continue;
    }

    if (action === "textColor") {
      addColorInput("textColor", title, (color) => grid.actions.setTextColor(color));
      continue;
    }

    if (action === "fillColor") {
      addColorInput("fillColor", title, (color) => grid.actions.setFillColor(color));
      continue;
    }

    if (action) {
      addButton(action, icon, title, () => runAction(grid.actions, action));
    }
  }
}

/**
 * Config-driven built-in toolbar. Renders either a custom `config.toolbar` item
 * list or the default per-flag set of built-ins through the shared
 * {@link renderToolbarItems}. Built once in the constructor; nothing rebuilds
 * per render.
 */
export class Toolbar {
  static readonly height = 36;

  private readonly el: HTMLDivElement;

  constructor(host: HTMLElement, config: GridConfig, theme: Theme, grid: Grid) {
    seedWidgetTheme(host, theme);

    const bar = document.createElement("div");
    bar.className = "sheetwrite-toolbar";
    // Anchoring + height back the grid's layout math; cosmetics live in styles.css.
    bar.style.position = "absolute";
    bar.style.top = "0";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.height = `${Toolbar.height}px`;
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Spreadsheet formatting");

    const items = Array.isArray(config.toolbar) ? config.toolbar : defaultToolbarItems(config);
    renderToolbarItems(bar, items, grid, config.icons);

    host.appendChild(bar);
    this.el = bar;
  }

  destroy(): void {
    this.el.remove();
  }
}
