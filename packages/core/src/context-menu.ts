import type {
  CellAddress,
  ContextMenuActionName,
  ContextMenuItem,
  Grid,
  GridActions,
  GridConfig,
  Theme,
} from "./types";

const DEFAULT_ITEMS: ContextMenuItem[] = [
  { action: "copy" },
  { action: "cut" },
  { action: "paste" },
  { action: "separator" },
  { action: "clearContents" },
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
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
};

const ROW_CSS = "padding:5px 14px;cursor:pointer;white-space:nowrap;background:transparent;";

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

    const menu = document.createElement("div");
    menu.className = "sheetwrite-context-menu";
    menu.style.cssText = [
      "position:fixed",
      "display:none",
      "min-width:160px",
      "padding:4px 0",
      `border:1px solid ${theme.gridLine}`,
      "border-radius:6px",
      `background:${theme.bg}`,
      `color:${theme.fg}`,
      `font:${theme.font}`,
      "box-shadow:0 6px 20px rgba(0,0,0,0.18)",
      "box-sizing:border-box",
      "user-select:none",
      "z-index:1000",
    ].join(";");

    // Keep grid focus so selection-based actions act on the right cells.
    menu.addEventListener("mousedown", (e) => e.preventDefault());

    const separator = (): HTMLDivElement => {
      const s = document.createElement("div");
      s.className = "sheetwrite-context-menu-sep";
      s.style.cssText = `height:1px;margin:4px 0;background:${theme.gridLine};`;
      return s;
    };

    const row = (item: ContextMenuItem): HTMLDivElement => {
      const el = document.createElement("div");
      el.className = "sheetwrite-context-menu-item";
      el.style.cssText = ROW_CSS;

      const action = item.action;
      el.textContent =
        item.label ?? (action && action !== "separator" ? (DEFAULT_LABEL[action] ?? action) : "");

      const onClick = item.onClick;
      const run = onClick ? () => onClick(this.grid, this.cell) : actionHandler(action, actions);

      el.addEventListener("click", () => {
        run();
        this.close();
      });

      el.addEventListener("pointerenter", () => {
        el.style.background = theme.gridLine;
      });

      el.addEventListener("pointerleave", () => {
        el.style.background = "transparent";
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
