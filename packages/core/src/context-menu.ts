import type {
  ContextMenuActionName,
  ContextMenuContext,
  ContextMenuItem,
  Grid,
  GridActions,
  GridConfig,
} from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

const DEFAULT_ITEMS: ContextMenuItem[] = [
  { action: "copy" },
  { action: "cut" },
  { action: "paste" },
  { action: "separator" },
  { action: "clearContents" },
  { action: "separator" },
  { action: "insertRowAbove" },
  { action: "insertRowBelow" },
  { action: "deleteRow" },
  { action: "hideRow" },
  { action: "showAllRows" },
  { action: "autoFitRow" },
  { action: "separator" },
  { action: "insertColumnLeft" },
  { action: "insertColumnRight" },
  { action: "deleteColumn" },
  { action: "hideColumn" },
  { action: "showAllColumns" },
  { action: "autoFitColumn" },
  { action: "clearFilter" },
  { action: "separator" },
  { action: "merge" },
  { action: "unmerge" },
];

const DEFAULT_LABEL: Record<Exclude<ContextMenuActionName, "separator">, string> = {
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  clearContents: "Clear contents",
  merge: "Merge cells",
  unmerge: "Unmerge",
  insertRowAbove: "Insert row above",
  insertRowBelow: "Insert row below",
  deleteRow: "Delete row",
  hideRow: "Hide row",
  showAllRows: "Show all rows",
  autoFitRow: "Auto-fit row",
  insertColumnLeft: "Insert column left",
  insertColumnRight: "Insert column right",
  deleteColumn: "Delete column",
  hideColumn: "Hide column",
  showAllColumns: "Show all columns",
  autoFitColumn: "Auto-fit column",
  clearFilter: "Clear column filter",
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
};

/** Map a built-in action to the matching `GridActions` call; unknown/separator → no-op. */
function actionHandler(
  action: ContextMenuActionName | undefined,
  actions: GridActions,
): () => void {
  switch (action) {
    case "cut":
      return () => actions.cut();
    case "copy":
      return () => actions.copy();
    case "paste":
      return () => actions.paste();
    case "clearContents":
      return () => actions.clearContents();
    case "merge":
      return () => actions.merge();
    case "unmerge":
      return () => actions.unmerge();
    case "insertRowAbove":
      return () => actions.insertRowAbove();
    case "insertRowBelow":
      return () => actions.insertRowBelow();
    case "deleteRow":
      return () => actions.deleteRow();
    case "hideRow":
      return () => actions.hideRows();
    case "showAllRows":
      return () => actions.showRows();
    case "autoFitRow":
      return () => actions.autoFitRows();
    case "insertColumnLeft":
      return () => actions.insertColumnLeft();
    case "insertColumnRight":
      return () => actions.insertColumnRight();
    case "deleteColumn":
      return () => actions.deleteColumn();
    case "hideColumn":
      return () => actions.hideColumns();
    case "showAllColumns":
      return () => actions.showColumns();
    case "autoFitColumn":
      return () => actions.autoFitColumns();
    case "clearFilter":
      return () => actions.clearFilter();
    case "exportCsv":
      return () => actions.exportCsv();
    case "exportXlsx":
      return () => actions.exportXlsx();
    default:
      return () => {};
  }
}

/**
 * Floating right-click menu. Dynamic rows are resolved for each opening;
 * global dismiss listeners live only while the menu is open.
 */
export class ContextMenu {
  private readonly el: HTMLDivElement;
  private readonly config: GridConfig;
  private readonly actions: GridActions;
  private readonly grid: Grid;

  constructor(
    host: HTMLElement,
    config: GridConfig,
    theme: Theme,
    actions: GridActions,
    grid: Grid,
  ) {
    this.config = config;
    this.actions = actions;
    this.grid = grid;

    seedWidgetTheme(host, theme);

    const menu = document.createElement("div");
    menu.className = "sheetwrite-context-menu";
    menu.setAttribute("role", "menu");
    // Fixed positioning + visibility toggle are behavior; cosmetics live in styles.css.
    menu.style.position = "fixed";
    menu.style.display = "none";

    // Keep grid focus so selection-based actions act on the right cells.
    menu.addEventListener("mousedown", (e) => e.preventDefault());

    host.appendChild(menu);
    this.el = menu;
  }

  open(context: ContextMenuContext): void {
    this.render(context);

    const menu = this.el;
    menu.style.display = "block";

    const clampedX = Math.max(0, Math.min(context.clientX, window.innerWidth - menu.offsetWidth));
    const clampedY = Math.max(0, Math.min(context.clientY, window.innerHeight - menu.offsetHeight));

    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;

    this.addDismissListeners();
  }

  close(): void {
    this.el.style.display = "none";
    this.removeDismissListeners();
  }

  destroy(): void {
    this.removeDismissListeners();
    this.el.remove();
  }

  private render(context: ContextMenuContext): void {
    const configured = this.config.contextMenu;
    const items =
      typeof configured === "function"
        ? configured(context)
        : Array.isArray(configured)
          ? configured
          : DEFAULT_ITEMS;
    const normalized: ContextMenuItem[] = [];
    for (const item of items) {
      const visible =
        typeof item.visible === "function" ? item.visible(context) : item.visible !== false;
      if (!visible) continue;
      if (item.action === "separator") {
        if (normalized.length === 0 || normalized.at(-1)?.action === "separator") continue;
      }
      normalized.push(item);
    }
    if (normalized.at(-1)?.action === "separator") normalized.pop();

    this.el.replaceChildren();
    for (const item of normalized) {
      if (item.action === "separator") {
        const separator = document.createElement("div");
        separator.className = "sheetwrite-context-menu-sep";
        separator.setAttribute("role", "separator");
        this.el.appendChild(separator);
        continue;
      }

      const row = document.createElement("div");
      row.className = "sheetwrite-context-menu-item";
      row.setAttribute("role", "menuitem");
      if (item.id) row.dataset.contextMenuItem = item.id;

      const disabled =
        typeof item.disabled === "function" ? item.disabled(context) : item.disabled === true;
      if (disabled) {
        row.classList.add("sheetwrite-context-menu-item-disabled");
        row.setAttribute("aria-disabled", "true");
      }

      const label = document.createElement("span");
      const action = item.action;
      label.textContent = item.label ?? (action ? (DEFAULT_LABEL[action] ?? action) : "");
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement("span");
        shortcut.className = "sheetwrite-context-menu-shortcut";
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      const run = item.onClick
        ? () => item.onClick?.(this.grid, context.cell)
        : actionHandler(action, this.actions);
      row.addEventListener("click", () => {
        if (disabled) return;
        run();
        this.close();
      });
      this.el.appendChild(row);
    }
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.el.contains(e.target as Node)) this.close();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.close();
  };

  private readonly onDismiss = (): void => {
    this.close();
  };

  private addDismissListeners(): void {
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("scroll", this.onDismiss, {
      capture: true,
      once: true,
    });
    window.addEventListener("resize", this.onDismiss, { once: true });
  }

  private removeDismissListeners(): void {
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("scroll", this.onDismiss, true);
    window.removeEventListener("resize", this.onDismiss);
  }
}
