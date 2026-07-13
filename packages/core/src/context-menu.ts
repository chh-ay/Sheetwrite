import type {
  CellAddress,
  ContextMenuActionName,
  ContextMenuItem,
  Grid,
  GridActions,
  GridConfig,
  Theme,
} from "./types.js";
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
 * Floating right-click menu. Rows are built once in the constructor; `open` only
 * repositions and shows. Global dismiss listeners live only while the menu is open.
 */
export class ContextMenu {
  private readonly el: HTMLDivElement;
  private readonly grid: Grid;
  private cell: CellAddress | null = null;

  constructor(
    host: HTMLElement,
    config: GridConfig,
    theme: Theme,
    actions: GridActions,
    grid: Grid,
  ) {
    this.grid = grid;

    seedWidgetTheme(host, theme);

    const menu = document.createElement("div");
    menu.className = "sheetwrite-context-menu";
    // Fixed positioning + visibility toggle are behavior; cosmetics live in styles.css.
    menu.style.position = "fixed";
    menu.style.display = "none";

    // Keep grid focus so selection-based actions act on the right cells.
    menu.addEventListener("mousedown", (e) => e.preventDefault());

    const separator = (): HTMLDivElement => {
      const s = document.createElement("div");
      s.className = "sheetwrite-context-menu-sep";
      return s;
    };

    const row = (item: ContextMenuItem): HTMLDivElement => {
      const el = document.createElement("div");
      el.className = "sheetwrite-context-menu-item";

      const action = item.action;
      el.textContent =
        item.label ?? (action && action !== "separator" ? (DEFAULT_LABEL[action] ?? action) : "");

      const onClick = item.onClick;
      const run = onClick ? () => onClick(this.grid, this.cell) : actionHandler(action, actions);

      el.addEventListener("click", () => {
        run();
        this.close();
      });

      return el;
    };

    const items = Array.isArray(config.contextMenu) ? config.contextMenu : DEFAULT_ITEMS;

    for (const item of items) {
      menu.appendChild(item.action === "separator" ? separator() : row(item));
    }

    host.appendChild(menu);
    this.el = menu;
  }

  open(x: number, y: number, cell: CellAddress | null): void {
    this.cell = cell;

    const menu = this.el;
    menu.style.display = "block";

    const clampedX = Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth));
    const clampedY = Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight));

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
    window.addEventListener("scroll", this.onDismiss, { capture: true, once: true });
    window.addEventListener("resize", this.onDismiss, { once: true });
  }

  private removeDismissListeners(): void {
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("scroll", this.onDismiss, true);
    window.removeEventListener("resize", this.onDismiss);
  }
}
