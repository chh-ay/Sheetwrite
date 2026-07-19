// Framework-free host integration for the /vanilla showcase.
//
// Everything that talks to @sheetwrite/core lives in this module as plain
// TypeScript + DOM: no React, no adapter, no wrapper component. It is written
// as the reference for hosts that own the whole lifecycle themselves —
// construction-bound options, chrome composition, teardown, and the neutral
// XLSX interchange all happen through the public core API.

import type {
  DataSource,
  Grid,
  GridConfig,
  GridOptions,
  PagedStoreStats,
  RowData,
  Selection,
  SheetId,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import {
  createGrid,
  createGridFromSnapshot,
  downloadBytes,
  fromXlsxWorkbook,
  IncompleteDataError,
  toXlsxWorkbook,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  createToolbar,
  type ShellPiece,
} from "@sheetwrite/core/shell";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import {
  buildEngineData,
  createEngineWorkbook,
  ENGINE_AMOUNT_COLUMN,
  ENGINE_ROWS,
  ENGINE_SHEET_ID,
  ENGINE_SHEET_REF,
  ENGINE_THEME,
} from "./scenarios/engine.js";

/** The fixture sheet every non-imported mount hydrates. */
export const WORKBENCH_SHEET: SheetId = ENGINE_SHEET_ID;
export const SUMMARY_SHEET: SheetId = "summary";
/** Fixture size, re-exported so hosts read one module for the whole scenario. */
export const WORKBENCH_ROWS = ENGINE_ROWS;

const ENGINE_DATA = buildEngineData();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PAGE_LATENCY_MS = 120;
const PAGED_STORAGE = { mode: "paged", chunkRows: 4096, cacheBytes: 16 * 1024 * 1024 } as const;
const PAGED_STATS_INTERVAL_MS = 500;

/** Construction-bound data path: eager columnar values or a lazy page source. */
export type WorkbenchDataMode = "columnar" | "paged";

/** Everything that requires a new Grid generation when it changes. */
export interface WorkbenchSpec {
  renderer: "canvas" | "worker";
  data: WorkbenchDataMode;
  /** Hydrate an imported document instead of the revenue fixture. */
  snapshot?: WorkbookSnapshot;
}

/** Requested vs. actually active paint backend, plus any fallback reason. */
export interface WorkbenchRendererState {
  requested: "canvas" | "worker";
  active: "canvas" | "worker";
  fallback: string | null;
}

/** Host callbacks fed exclusively from public grid events. */
export interface WorkbenchEvents {
  onActivity(message: string): void;
  onSelectionChange(selection: Selection | null): void;
  onRendererChange(state: WorkbenchRendererState): void;
  onPagedStats(stats: PagedStoreStats | null): void;
}

/** Disposable handle for one mounted grid generation. */
export interface Workbench {
  readonly grid: Grid;
  setReadOnly(readOnly: boolean): void;
  destroy(): void;
}

// Request-aware context menu: rows are rebuilt per opening from the live
// context, and the callback receives the owning grid instance.
const WORKBENCH_GRID_CONFIG: GridConfig = {
  // The standalone shell toolbar below replaces the grid's built-in one.
  toolbar: false,
  contextMenu: (context) => [
    { id: "copy", action: "copy", label: "Copy value", shortcut: "Ctrl+C" },
    { action: "separator" },
    {
      id: "highlight-cell",
      label:
        context.cell === null
          ? "Highlight cell"
          : `Highlight cell R${context.cell.row + 1} C${context.cell.col + 1}`,
      visible: context.cell !== null,
      onClick(instance, cell) {
        if (cell === null) return;
        instance.highlightCells([
          {
            sheet: cell.sheet,
            start: { row: cell.row, col: cell.col },
            end: { row: cell.row, col: cell.col },
          },
        ]);
      },
    },
  ],
};

/**
 * Serve the shared revenue fixture as cancellable async pages. The first
 * request resolves immediately so boot never paints an empty canvas; later
 * pages keep visible latency so lazy loading is observable. Every served
 * window is reported to the host: the page protocol belongs to it, not to
 * the grid.
 */
function createRevenuePageSource(onServed: (start: number, end: number) => void): DataSource {
  let firstRequest = true;
  return {
    getRows({ start, end, signal, revision }) {
      const { promise, resolve, reject } = Promise.withResolvers<{
        start: number;
        rows: RowData[];
        revision: number;
      }>();
      const latency = firstRequest ? 0 : PAGE_LATENCY_MS;
      firstRequest = false;
      const timer = setTimeout(() => {
        const rows: RowData[] = [];
        for (let row = start; row < end; row++) {
          rows.push({
            id: ENGINE_DATA.columns.id?.[row] ?? null,
            date: ENGINE_DATA.columns.date?.[row] ?? null,
            account: ENGINE_DATA.columns.account?.[row] ?? null,
            city: ENGINE_DATA.columns.city?.[row] ?? null,
            owner: ENGINE_DATA.columns.owner?.[row] ?? null,
            arr: ENGINE_DATA.columns.arr?.[row] ?? null,
          });
        }
        resolve({ start, rows, revision });
        onServed(start, end);
      }, latency);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Datasource request aborted", "AbortError"));
        },
        { once: true },
      );
      return promise;
    },
  };
}

/** Paged allocation stats through the store handle; null for dense stores. */
export function pagedStatsOf(grid: Grid, sheet: SheetId): PagedStoreStats | null {
  const store = grid.store as { getPagedStats?: (sheet: SheetId) => PagedStoreStats };
  return typeof store.getPagedStats === "function" ? store.getPagedStats(sheet) : null;
}

/**
 * Mount one grid generation plus its chrome into `host` and wire every
 * subscription. `initSheetwrite()` must already be awaited.
 *
 * The chrome is composed from the independently mountable shell pieces —
 * toolbar, name box, formula bar, selection status — attached around whichever
 * grid the spec asks for: eager columnar data, a paged datasource, or a
 * hydrated snapshot (the XLSX import path).
 */
export function createWorkbench(
  host: HTMLElement,
  spec: WorkbenchSpec,
  events: WorkbenchEvents,
): Workbench {
  // 1. Static chrome skeleton, styled by @sheetwrite/core/shell.css.
  const root = document.createElement("div");
  root.className = "sheetwrite-shell";

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "sheetwrite-shell-row sheetwrite-shell-toolbar-row";

  const formulaRow = document.createElement("div");
  formulaRow.className = "sheetwrite-shell-row sheetwrite-shell-formula-row";

  const gridHost = document.createElement("div");
  gridHost.className = "sheetwrite-shell-grid";
  gridHost.setAttribute("aria-label", "Spreadsheet grid");

  const bottomRow = document.createElement("div");
  bottomRow.className = "sheetwrite-shell-row sheetwrite-shell-bottom-row";

  root.append(toolbarRow, formulaRow, gridHost, bottomRow);
  host.appendChild(root);

  // 2. Construction-bound options are decided here and only here. Changing
  //    any of them means destroying this generation and creating a new one.
  const base: Omit<GridOptions, "workbook" | "data" | "datasource" | "datasourceStorage"> = {
    theme: ENGINE_THEME,
    config: WORKBENCH_GRID_CONFIG,
    renderer: spec.renderer,
    ...(spec.renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
  };

  let grid: Grid;
  try {
    if (spec.snapshot !== undefined) {
      grid = createGridFromSnapshot(gridHost, spec.snapshot, base);
    } else if (spec.data === "paged") {
      grid = createGrid(gridHost, {
        workbook: createEngineWorkbook(),
        datasource: createRevenuePageSource((start, end) =>
          events.onActivity(
            `Rows ${(start + 1).toLocaleString()}–${end.toLocaleString()} served by the host page source`,
          ),
        ),
        datasourceStorage: PAGED_STORAGE,
        ...base,
      });
      grid.setFrozen(0, 1);
    } else {
      grid = createGrid(gridHost, {
        workbook: createEngineWorkbook(),
        data: ENGINE_DATA,
        ...base,
      });
      grid.setFrozen(0, 1);
    }
  } catch (error) {
    root.remove();
    throw error;
  }

  // 3. Renderer truth. `rendererKind()` reports what actually constructed;
  //    a worker that fails to boot emits `renderer-fallback` asynchronously,
  //    so subscribe before yielding to the event loop.
  const unsubscribes: Array<() => void> = [];
  events.onRendererChange({
    requested: spec.renderer,
    active: grid.rendererKind(),
    fallback: null,
  });
  unsubscribes.push(
    grid.on("renderer-fallback", ({ error }) => {
      events.onRendererChange({
        requested: "worker",
        active: grid.rendererKind(),
        fallback: error instanceof Error ? error.message : String(error),
      });
      events.onActivity("Worker renderer unavailable — fell back to the main-thread canvas");
    }),
  );

  // 4. Every activity line below is fed by a public grid event.
  unsubscribes.push(grid.on("selection", ({ selection }) => events.onSelectionChange(selection)));
  unsubscribes.push(
    grid.on("change", ({ transaction, source }) => {
      events.onActivity(
        `${transaction.patches.length} ${source} operation${transaction.patches.length === 1 ? "" : "s"} committed`,
      );
    }),
  );
  unsubscribes.push(
    grid.on("mutation-rejected", ({ issues }) => {
      events.onActivity(
        `${issues.length} operation${issues.length === 1 ? "" : "s"} rejected by policy`,
      );
    }),
  );
  unsubscribes.push(
    grid.on("export-error", ({ error }) => {
      events.onActivity(
        `XLSX export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }),
  );
  unsubscribes.push(
    grid.on("datasource-error", ({ request, error }) => {
      events.onActivity(
        `Page ${request.start}–${request.end} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }),
  );

  // 5. Paged allocation is observable: pages land asynchronously after
  //    scrolls, so poll the cheap WASM stats read while this generation lives.
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  if (spec.snapshot === undefined && spec.data === "paged") {
    const report = (): void => events.onPagedStats(pagedStatsOf(grid, WORKBENCH_SHEET));
    report();
    statsTimer = setInterval(report, PAGED_STATS_INTERVAL_MS);
    unsubscribes.push(grid.on("scroll", report));
  } else {
    events.onPagedStats(null);
  }

  // 6. Compose the chrome pieces around the live grid handle.
  const focusGrid = (): void => gridHost.focus();
  const pieces: ShellPiece[] = [];
  pieces.push(createToolbar(toolbarRow, grid));
  const nameBox = createNameBox(formulaRow, grid, { focusGrid });
  nameBox.element.id = "namebox";
  pieces.push(nameBox);

  const fx = document.createElement("span");
  fx.className = "sheetwrite-shell-fx";
  fx.textContent = "fx";
  fx.setAttribute("aria-hidden", "true");
  formulaRow.appendChild(fx);

  const formulaBar = createFormulaBar(formulaRow, grid, { focusGrid });
  formulaBar.element.id = "formula";
  pieces.push(formulaBar);
  pieces.push(createSelectionStatus(bottomRow, grid));

  // 7. Teardown mirrors construction in reverse; nothing survives it.
  let destroyed = false;
  return {
    grid,
    setReadOnly(readOnly: boolean) {
      grid.setReadOnly(readOnly);
      formulaBar.setReadOnly(readOnly);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (statsTimer !== null) clearInterval(statsTimer);
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const piece of pieces) piece.destroy();
      grid.destroy();
      root.remove();
    },
  };
}

/**
 * Workbook operation: add (or re-activate) a summary sheet whose cells are
 * live cross-sheet formulas over the fixture data, then rebuild the built-in
 * chrome so the sheet-tab bar reflects the now-multi-sheet workbook.
 */
export function addSummarySheet(grid: Grid): SheetId {
  const existing = grid.store.getWorkbook().sheets.find((sheet) => sheet.id === SUMMARY_SHEET);
  if (existing !== undefined) {
    grid.setActiveSheet(SUMMARY_SHEET);
    return SUMMARY_SHEET;
  }

  const id = grid.addSheet({
    id: SUMMARY_SHEET,
    name: "Summary",
    rowCount: 4,
    columns: [
      { key: "metric", header: "Metric", width: 220, type: "text" },
      { key: "value", header: "Value", width: 170, type: "currency", numberFormat: "$#,##0.00" },
    ],
  });

  // One undoable commit: labels plus cross-sheet aggregate formulas.
  const range = `${ENGINE_SHEET_REF}!F1:F${ENGINE_ROWS}`;
  const rows: Array<[label: string, src: string]> = [
    ["Accounts", `=COUNT(${ENGINE_SHEET_REF}!A1:A${ENGINE_ROWS})`],
    ["Total ARR", `=SUM(${range})`],
    ["Average ARR", `=AVERAGE(${range})`],
    ["Top deal", `=MAX(${range})`],
  ];
  grid.applyTransaction({
    patches: rows.flatMap(([label, src], row) => [
      {
        op: "set",
        addr: { sheet: id, row, col: 0 },
        value: { kind: "literal", value: label },
      },
      { op: "set", addr: { sheet: id, row, col: 1 }, value: { kind: "formula", src } },
    ]),
  });

  // The tab bar is sized at construction (one sheet → no bar). setConfig
  // rebuilds built-in chrome, but early-returns on a shallow-equal config —
  // so make the multi-sheet intent explicit, which also changes the config.
  grid.setConfig({ ...WORKBENCH_GRID_CONFIG, tabs: true });
  grid.setActiveSheet(id);
  return id;
}

/**
 * Aggregate over the full ARR column (Rust scan). `aggregate` is a view
 * operation over the active sheet, so this activates the pipeline sheet
 * first when it exists. On a paged store with unvisited pages the engine
 * throws {@link IncompleteDataError} — hosts surface it through
 * {@link describeActionError} instead of guessing.
 */
export function totalRevenue(grid: Grid): number {
  const sheets = grid.store.getWorkbook().sheets;
  if (sheets.some((sheet) => sheet.id === WORKBENCH_SHEET)) {
    grid.setActiveSheet(WORKBENCH_SHEET);
  }
  return grid.aggregate(ENGINE_AMOUNT_COLUMN, "sum");
}

/** Neutral workbook export: snapshot → XLSX bytes → browser download. */
export async function exportWorkbookXlsx(grid: Grid, filename: string): Promise<number> {
  await import("@sheetwrite/xlsx/register");
  const bytes = await toXlsxWorkbook(grid);
  downloadBytes(bytes, filename, XLSX_MIME);
  return bytes.byteLength;
}

/** Neutral workbook import: XLSX bytes → validated snapshot + fidelity warnings. */
export async function importWorkbookXlsx(
  data: ArrayBuffer | Uint8Array,
): Promise<{ snapshot: WorkbookSnapshot; warnings: string[] }> {
  await import("@sheetwrite/xlsx/register");
  const warnings: string[] = [];
  const snapshot = await fromXlsxWorkbook(data, {
    onWarning: (warning) => warnings.push(warning.message),
  });
  return { snapshot, warnings };
}

/** Honest failure copy for view operations that need the full dataset. */
export function describeActionError(error: unknown): string {
  if (error instanceof IncompleteDataError) {
    return "Needs the full dataset — the paged store has only the visited pages loaded";
  }
  return error instanceof Error ? error.message : String(error);
}
