import type {
  Grid,
  GridActions,
  GridCommandName,
  GridCommandState,
  GridConfig,
  ToolbarActionName,
  ToolbarIcon,
  ToolbarItem,
} from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** Create a fresh, stroke-based SVG icon for each rendered toolbar button. */
function svgIcon(...paths: string[]): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  };
}

/** SVG icon for each built-in action. Color inputs carry no glyph. */
const DEFAULT_ICON: Partial<Record<ToolbarActionName, ToolbarIcon>> = {
  bold: svgIcon("M7 4h6a4 4 0 0 1 0 8H7Z", "M7 12h7a4 4 0 0 1 0 8H7Z"),
  undo: svgIcon("M9 7 4 12l5 5", "M4 12h9a7 7 0 0 1 7 7"),
  redo: svgIcon("m15 7 5 5-5 5", "M20 12h-9a7 7 0 0 0-7 7"),
  italic: svgIcon("M10 4h8M6 20h8M14 4l-4 16"),
  underline: svgIcon("M6 3v7a6 6 0 0 0 12 0V3", "M4 21h16"),
  strikethrough: svgIcon(
    "M4 12h16",
    "M17 6.5A5 5 0 0 0 13 5h-2a3 3 0 0 0-1 5.8",
    "M7 17.5A5 5 0 0 0 11 19h2a3 3 0 0 0 1-5.8",
  ),
  alignLeft: svgIcon("M4 6h16M4 10h10M4 14h16M4 18h10"),
  alignCenter: svgIcon("M4 6h16M7 10h10M4 14h16M7 18h10"),
  alignRight: svgIcon("M4 6h16M10 10h10M4 14h16M10 18h10"),
  border: svgIcon("M4 4h16v16H4Z", "M12 4v16M4 12h16"),
  clearFormat: svgIcon("m4 15 9-9 6 6-8 8H7Z", "M14 20h6"),
  merge: svgIcon("M4 5h16v14H4Z", "m9 4 3 3-3 3M15 4l-3 3 3 3"),
  unmerge: svgIcon("M4 5h16v14H4Z", "m10 4-3 3 3 3M14 4l3 3-3 3"),
  sortAsc: svgIcon("M8 18V6m0 0L4 10m4-4 4 4", "M15 7h5M15 12h4M15 17h3"),
  sortDesc: svgIcon("M8 6v12m0 0-4-4m4 4 4-4", "M15 7h3M15 12h4M15 17h5"),
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
): () => void {
  const controls = new Map<GridCommandName, HTMLButtonElement | HTMLInputElement>();
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
  ): HTMLButtonElement => {
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
    return button;
  };

  const colorPickDisposers: Array<() => void> = [];

  const addColorInput = (
    suffix: string,
    title: string,
    onPick: (color: string) => void,
  ): HTMLInputElement => {
    const input = document.createElement("input");
    input.type = "color";
    input.className = `sheetwrite-tb-color sheetwrite-tb-${suffix}`;
    input.title = title;
    if (title) input.setAttribute("aria-label", title);

    let timer: number | undefined;
    let lastCommitted: string | undefined;
    const commit = (): void => {
      timer = undefined;
      if (input.value === lastCommitted) return;
      lastCommitted = input.value;
      onPick(input.value);
    };
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 150);
    };
    const flush = (): void => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      commit();
    };
    input.addEventListener("input", schedule);
    input.addEventListener("change", schedule);
    input.addEventListener("blur", flush);
    colorPickDisposers.push(() => window.clearTimeout(timer));

    bar.appendChild(input);
    return input;
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
      const button = addButton(action ?? "custom", icon, title, () => onClick(grid));
      if (action) controls.set(action, button);
      continue;
    }

    if (action === "textColor") {
      controls.set(
        action,
        addColorInput("textColor", title, (color) => grid.actions.setTextColor(color)),
      );
      continue;
    }

    if (action === "fillColor") {
      controls.set(
        action,
        addColorInput("fillColor", title, (color) => grid.actions.setFillColor(color)),
      );
      continue;
    }

    if (action) {
      controls.set(
        action,
        addButton(action, icon, title, () => runAction(grid.actions, action)),
      );
    }
  }

  const update = (states?: Readonly<Record<GridCommandName, GridCommandState>>): void => {
    for (const [action, control] of controls) {
      const state = states?.[action] ?? grid.getCommandState(action);
      control.disabled = state.disabled;
      if (
        control instanceof HTMLButtonElement &&
        (action === "bold" ||
          action === "italic" ||
          action === "underline" ||
          action === "strikethrough" ||
          action === "alignLeft" ||
          action === "alignCenter" ||
          action === "alignRight" ||
          action === "border")
      ) {
        control.setAttribute(
          "aria-pressed",
          state.activity === "mixed" ? "mixed" : String(state.activity === "active"),
        );
        if (state.activity === "mixed") control.setAttribute("data-state", "mixed");
        else control.removeAttribute("data-state");
      }
    }
  };
  update();
  const disposeState =
    typeof grid.on === "function"
      ? grid.on("command-state-change", (event) => update(event.states))
      : () => {};
  return () => {
    disposeState();
    for (const dispose of colorPickDisposers) dispose();
  };
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
  private readonly disposeState: () => void;

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
    this.disposeState = renderToolbarItems(bar, items, grid, config.icons);

    host.appendChild(bar);
    this.el = bar;
  }

  destroy(): void {
    this.disposeState();
    this.el.remove();
  }
}
