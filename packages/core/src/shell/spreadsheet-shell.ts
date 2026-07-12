// ── Full spreadsheet shell ───────────────────────────────────────────────────
//
// Composes the leaf pieces (toolbar, name box, formula bar, tabs, status)
// around exactly one grid, Google-Sheets style. The shell suppresses only the
// grid's duplicate built-in toolbar/tabs; find, context menu, and keyboard
// policy stay under the caller's `GridConfig` control, and the grid host
// remains the single spreadsheet keyboard/focus authority.

import { DEFAULT_THEME } from "../grid.js";
import { createGridController, type GridController } from "../grid-controller.js";
import { SheetTabs } from "../sheet-tabs.js";
import type {
  ChangeEvent,
  Grid,
  GridConfig,
  GridEvents,
  GridOptions,
  Selection,
  SheetId,
  Theme,
  ToolbarItem,
} from "../types.js";
import { seedWidgetTheme } from "../widget-theme.js";
import { createFormulaBar, createNameBox, type ShellPiece } from "./formula-controls.js";
import { createSelectionStatus } from "./selection-status.js";
import { createToolbar } from "./toolbar-factory.js";

export interface SpreadsheetShellOptions {
  /** Options for the single grid the shell owns. `initSheetwrite` must already be awaited. */
  grid: GridOptions;
  /** Toolbar items (default: the full built-in action set). */
  toolbar?: readonly ToolbarItem[];
  /** Event callbacks forwarded from the owned grid. */
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onReady?: (grid: Grid) => void;
}

export interface SpreadsheetShell {
  /** The single grid the shell owns; use it for data, search, and actions. */
  readonly grid: Grid;
  /** The shell's root element (already appended to the mount host). */
  readonly element: HTMLElement;
  setTheme(theme: Partial<Theme>): void;
  setReadOnly(readOnly: boolean): void;
  /** Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed. */
  setGridConfig(config: GridConfig | undefined): void;
  setActiveSheet(id: SheetId): void;
  destroy(): void;
}

/** Force the duplicate built-in chrome off while preserving everything else. */
function shellGridConfig(config: GridConfig | undefined): GridConfig {
  return { ...(config ?? {}), toolbar: false, tabs: false };
}

/**
 * Mount a complete spreadsheet shell into `host`: toolbar row, formula row
 * (name box + formula bar), the grid, and a bottom row with sheet tabs (multi-
 * sheet workbooks only) and a selection status. The host must have a real
 * size; the shell fills it. Returns the shell handle; `destroy` tears down
 * every piece, the grid, and the shell DOM, and is safe to call twice.
 */
export function createSpreadsheetShell(
  host: HTMLElement,
  options: SpreadsheetShellOptions,
): SpreadsheetShell {
  const root = document.createElement("div");
  root.className = "sheetwrite-shell";

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "sheetwrite-shell-row sheetwrite-shell-toolbar-row";

  const formulaRow = document.createElement("div");
  formulaRow.className = "sheetwrite-shell-row sheetwrite-shell-formula-row";

  const fx = document.createElement("span");
  fx.className = "sheetwrite-shell-fx";
  fx.textContent = "fx";
  fx.setAttribute("aria-hidden", "true");

  const gridHost = document.createElement("div");
  gridHost.className = "sheetwrite-shell-grid";
  gridHost.setAttribute("aria-label", "Spreadsheet grid");

  const bottomRow = document.createElement("div");
  bottomRow.className = "sheetwrite-shell-row sheetwrite-shell-bottom-row";

  root.append(toolbarRow, formulaRow, gridHost, bottomRow);
  host.appendChild(root);

  // Seed the widget CSS custom properties on the shell root so chrome outside
  // the grid host (toolbar/formula/bottom rows) themes identically.
  let baseTheme: Theme = { ...DEFAULT_THEME, ...options.grid.theme };
  seedWidgetTheme(root, baseTheme);

  let controller: GridController;
  try {
    controller = createGridController(
      gridHost,
      { ...options.grid, config: shellGridConfig(options.grid.config) },
      {
        onChange: (event) => options.onChange?.(event),
        onSelectionChange: (selection) => options.onSelectionChange?.(selection),
        onReady: (grid) => options.onReady?.(grid),
      },
    );
  } catch (error) {
    root.remove();
    throw error;
  }
  const grid = controller.grid;

  const focusGrid = (): void => gridHost.focus();

  const pieces: ShellPiece[] = [];
  pieces.push(createToolbar(toolbarRow, grid, { items: options.toolbar }));
  pieces.push(createNameBox(formulaRow, grid, { focusGrid }));
  formulaRow.appendChild(fx);
  const formulaBar = createFormulaBar(formulaRow, grid, { focusGrid });
  pieces.push(formulaBar);
  formulaBar.setReadOnly(options.grid.readOnly ?? false);

  // Sheet tabs only for multi-sheet workbooks; activation is by sheet id.
  const sheets = grid.store.getWorkbook().sheets;
  let tabs: SheetTabs | null = null;
  const unsubscribes: Array<() => void> = [];
  if (sheets.length > 1) {
    const tabHost = document.createElement("div");
    tabHost.className = "sheetwrite-shell-tabs";
    bottomRow.appendChild(tabHost);
    tabs = new SheetTabs(tabHost, { onActivate: (id) => grid.setActiveSheet(id) });
    tabs.update(sheets, grid.getActiveSheet());
    unsubscribes.push(
      grid.on("active-sheet", (event: GridEvents["active-sheet"]) => {
        tabs?.update(grid.store.getWorkbook().sheets, event.sheet);
      }),
    );
  }
  pieces.push(createSelectionStatus(bottomRow, grid));

  let destroyed = false;
  return {
    grid,
    element: root,

    setTheme(theme: Partial<Theme>) {
      baseTheme = { ...baseTheme, ...theme };
      seedWidgetTheme(root, baseTheme);
      controller.setTheme(theme);
    },

    setReadOnly(readOnly: boolean) {
      controller.setReadOnly(readOnly);
      formulaBar.setReadOnly(readOnly);
    },

    setGridConfig(config: GridConfig | undefined) {
      controller.setConfig(shellGridConfig(config));
    },

    setActiveSheet(id: SheetId) {
      grid.setActiveSheet(id);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const piece of pieces) piece.destroy();
      tabs?.destroy();
      controller.destroy();
      root.remove();
    },
  };
}
