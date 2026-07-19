/**
 * React adapter for the analytics scenario: one hook that binds the shared
 * dataset/workbook/KPI contract from `scenarios/analytics.ts` to controlled
 * React state. Every workbench interaction — filters, search/replace, formula
 * entry, undo/redo, import/export, dataset reloads, renderer choice — flows
 * through this state, and grid resets reconcile back into it via `onReady`.
 */

import type {
  CellAddress,
  CellFormat,
  ChangeEvent,
  ColumnarData,
  DocumentOp,
  Grid,
  SearchResult,
  Selection,
} from "@sheetwrite/core";
import { downloadBytes, fromCsv, parseCellInput, toCsv } from "@sheetwrite/core";
import type { GridReadyEvent, GridReadyReason } from "@sheetwrite/core/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ANALYTICS_COLUMNS,
  ANALYTICS_MARKETS,
  ANALYTICS_ROWS,
  ANALYTICS_SHEET_ID,
  ANALYTICS_SUMMARY_SHEET_ID,
  ANALYTICS_THEME,
  analyticsSummarySeedOps,
  buildAnalyticsData,
  createAnalyticsWorkbook,
} from "./scenarios/analytics.js";

/** Summary-sheet row indexes of the global KPI formulas. */
const KPI_ROW = { total: 0, average: 1, largest: 2 } as const;
/** Per-market SUMIF rows start after the five global KPI rows. */
const MARKET_KPI_START = 5;
/** Import overlays are a workflow entry point, not a bulk-ingest path. */
const MAX_IMPORT_ROWS = 2_000;

export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function describeSelection(selection: Selection | null): string {
  if (!selection) return "No selection";
  if (selection.kind === "cell") {
    return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  }
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

export interface KpiValues {
  total: number | null;
  average: number | null;
  largest: number | null;
  /** Focused market's SUMIF value, or the grand total when no market filter is active. */
  market: number | null;
}

interface ActivityEntry {
  id: number;
  message: string;
}

const EMPTY_KPIS: KpiValues = { total: null, average: null, largest: null, market: null };

function readSummaryNumber(grid: Grid, row: number): number | null {
  const cell = grid.store.getCell({ sheet: ANALYTICS_SUMMARY_SHEET_ID, row, col: 1 });
  return typeof cell.resolved === "number" ? cell.resolved : null;
}

function columnFormat(col: number): CellFormat {
  const workbookColumn = createAnalyticsWorkbook().sheets.find(
    (sheet) => sheet.id === ANALYTICS_SHEET_ID,
  )?.columns?.[col];
  return workbookColumn?.type ?? "text";
}

/** Controlled-analytics workbench state machine over the shared scenario. */
export function useAnalyticsWorkbench() {
  const gridRef = useRef<Grid>(null);
  const activityId = useRef(0);
  const rendererCleanup = useRef<() => void>(() => {});
  const formulaDirty = useRef(false);

  const workbook = useMemo(() => createAnalyticsWorkbook(), []);
  const [dataset, setDataset] = useState<ColumnarData>(() => buildAnalyticsData());

  // Controlled query/view state — the single source of truth the grid is
  // reconciled against after every reset.
  const [market, setMarket] = useState("all");
  const [segment, setSegment] = useState("all");
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [ranked, setRanked] = useState(false);
  const [matches, setMatches] = useState<SearchResult | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // Grid-derived state.
  const [visibleRows, setVisibleRows] = useState(ANALYTICS_ROWS);
  const [kpis, setKpis] = useState<KpiValues>(EMPTY_KPIS);
  const [selection, setSelection] = useState("No selection");
  const [formulaAddress, setFormulaAddress] = useState<CellAddress | null>(null);
  const [formulaDraft, setFormulaDraft] = useState("");
  const [generation, setGeneration] = useState(0);
  const [readyReason, setReadyReason] = useState<GridReadyReason>("initial");
  const [renderer, setRenderer] = useState<"canvas" | "worker">("canvas");
  const [activeRenderer, setActiveRenderer] = useState<"canvas" | "worker">("canvas");
  const [rendererFallback, setRendererFallback] = useState<{
    count: number;
    reason: string;
  } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 0, message: "Workbench initialized" },
  ]);

  useEffect(() => () => rendererCleanup.current(), []);

  const record = useCallback((message: string): void => {
    const id = ++activityId.current;
    setActivity((items) => [{ id, message }, ...items].slice(0, 3));
  }, []);

  const refreshKpis = useCallback((grid: Grid, focusedMarket: string): void => {
    const total = readSummaryNumber(grid, KPI_ROW.total);
    const marketIndex = ANALYTICS_MARKETS.indexOf(
      focusedMarket as (typeof ANALYTICS_MARKETS)[number],
    );
    setKpis({
      total,
      average: readSummaryNumber(grid, KPI_ROW.average),
      largest: readSummaryNumber(grid, KPI_ROW.largest),
      market: marketIndex >= 0 ? readSummaryNumber(grid, MARKET_KPI_START + marketIndex) : total,
    });
    setVisibleRows(grid.store.viewRowCount(ANALYTICS_SHEET_ID));
  }, []);

  const marketFilter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.market,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  const segmentFilter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.segment,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  /** Push every piece of controlled view state onto a (possibly fresh) grid. */
  const reconcileView = useCallback(
    (grid: Grid): void => {
      marketFilter(grid, market);
      segmentFilter(grid, segment);
      if (ranked) grid.sortBy(ANALYTICS_COLUMNS.arr, false);
      if (query.trim().length > 0) {
        const result = grid.search(query.trim());
        setMatches(result);
        if (result.matches.length > 0) grid.findNext();
      } else {
        setMatches(null);
      }
    },
    [market, marketFilter, query, ranked, segment, segmentFilter],
  );

  const onReady = useCallback(
    ({ grid, generation: nextGeneration, reason }: GridReadyEvent): void => {
      grid.setFrozen(0, 1);
      grid.store.applyTransaction({ patches: analyticsSummarySeedOps() });

      rendererCleanup.current();
      setActiveRenderer(grid.rendererKind());
      rendererCleanup.current = grid.on("renderer-fallback", ({ error }) => {
        setActiveRenderer("canvas");
        setRendererFallback((current) => ({
          count: (current?.count ?? 0) + 1,
          reason: error instanceof Error ? error.message : String(error),
        }));
      });

      setGeneration(nextGeneration);
      setReadyReason(reason);
      setFormulaAddress(null);
      setFormulaDraft("");
      formulaDirty.current = false;

      if (nextGeneration > 1) {
        // Controlled reconciliation: the new grid instance adopts the React
        // state that outlived its predecessor.
        reconcileView(grid);
        record(`Grid rebuilt (${reason}) · view reconciled from React state`);
      } else {
        record(`Grid ready · ${ANALYTICS_ROWS.toLocaleString()} rows ingested`);
      }
      refreshKpis(grid, market);
    },
    [market, reconcileView, record, refreshKpis],
  );

  const onGridChange = useCallback(
    ({ transaction, commitReason }: ChangeEvent): void => {
      const grid = gridRef.current;
      const ops = transaction.patches.length;
      record(
        `${ops} op${ops === 1 ? "" : "s"} committed (${commitReason}) · formulas recalculated`,
      );
      if (grid) refreshKpis(grid, market);
    },
    [market, record, refreshKpis],
  );

  const onSelectionChange = useCallback((value: Selection | null): void => {
    setSelection(describeSelection(value));
    const grid = gridRef.current;
    if (!grid) return;
    if (value?.kind !== "cell" || value.addr.sheet !== ANALYTICS_SHEET_ID) {
      if (!formulaDirty.current) {
        setFormulaAddress(null);
        setFormulaDraft("");
      }
      return;
    }
    // Controlled-input reconciliation: grid selection refreshes the draft
    // unless the user is mid-edit in the formula input.
    setFormulaAddress(value.addr);
    if (!formulaDirty.current) {
      const formula = grid.store.getFormula(value.addr);
      if (formula !== null) {
        setFormulaDraft(formula);
      } else {
        const { resolved } = grid.store.getCell(value.addr);
        setFormulaDraft(resolved === null ? "" : String(resolved));
      }
    }
  }, []);

  const editFormulaDraft = useCallback((text: string): void => {
    formulaDirty.current = true;
    setFormulaDraft(text);
  }, []);

  const commitFormulaDraft = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || !formulaAddress || readOnly) return;
    const value = parseCellInput(formulaDraft, columnFormat(formulaAddress.col));
    grid.applyTransaction({ patches: [{ op: "set", addr: formulaAddress, value }] });
    formulaDirty.current = false;
    record(
      value.kind === "formula"
        ? `Formula ${formulaDraft} committed at R${formulaAddress.row + 1}`
        : `Cell R${formulaAddress.row + 1} C${formulaAddress.col + 1} set`,
    );
  }, [formulaAddress, formulaDraft, readOnly, record]);

  const chooseMarket = useCallback(
    (next: string): void => {
      setMarket(next);
      const grid = gridRef.current;
      if (!grid) return;
      marketFilter(grid, next);
      refreshKpis(grid, next);
      record(next === "all" ? "Showing all markets" : `Filtered to ${next}`);
    },
    [marketFilter, record, refreshKpis],
  );

  const chooseSegment = useCallback(
    (next: string): void => {
      setSegment(next);
      const grid = gridRef.current;
      if (!grid) return;
      segmentFilter(grid, next);
      refreshKpis(grid, market);
      record(next === "all" ? "Showing all segments" : `Filtered to ${next} segment`);
    },
    [market, record, refreshKpis, segmentFilter],
  );

  const runSearch = useCallback(
    (nextQuery: string): void => {
      const grid = gridRef.current;
      if (!grid) return;
      setQuery(nextQuery);
      if (nextQuery.trim().length === 0) {
        grid.clearSearch();
        setMatches(null);
        record("Search cleared");
        return;
      }
      const result = grid.search(nextQuery.trim());
      setMatches(result);
      if (result.matches.length > 0) grid.findNext();
      record(`${result.matches.length.toLocaleString()} search matches`);
    },
    [record],
  );

  const findNext = useCallback((): void => {
    const grid = gridRef.current;
    if (grid) setMatches(grid.findNext());
  }, []);

  const findPrev = useCallback((): void => {
    const grid = gridRef.current;
    if (grid) setMatches(grid.findPrev());
  }, []);

  const replaceCurrent = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || readOnly) return;
    setMatches(grid.replaceCurrent(replacement));
    record("Replaced active match");
  }, [readOnly, record, replacement]);

  const replaceAll = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || readOnly) return;
    const { replaced, result } = grid.replaceAll(replacement);
    setMatches(result);
    record(`Replaced ${replaced.toLocaleString()} cell${replaced === 1 ? "" : "s"}`);
  }, [readOnly, record, replacement]);

  const rankByArr = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.sortBy(ANALYTICS_COLUMNS.arr, false);
    setRanked(true);
    refreshKpis(grid, market);
    record("Ranked by ARR, high to low");
  }, [market, record, refreshKpis]);

  const undo = useCallback((): void => {
    gridRef.current?.undo();
    record("Undo");
  }, [record]);

  const redo = useCallback((): void => {
    gridRef.current?.redo();
    record("Redo");
  }, [record]);

  /** Clear the controlled view (filters/sort/search) without touching data. */
  const resetView = useCallback((): void => {
    setMarket("all");
    setSegment("all");
    setQuery("");
    setRanked(false);
    setMatches(null);
    const grid = gridRef.current;
    if (!grid) return;
    grid.clearView();
    grid.clearSearch();
    refreshKpis(grid, "all");
    record("View reset · filters, sort, and search cleared");
  }, [record, refreshKpis]);

  /**
   * Input-reset lifecycle: a fresh dataset object replaces the `data` prop, the
   * adapter rebuilds the grid, and `onReady` reconciles the surviving React
   * view state onto the new instance.
   */
  const reloadDataset = useCallback((): void => {
    setDataset(buildAnalyticsData());
    record("Reloading pristine dataset · local edits discarded");
  }, [record]);

  const toggleReadOnly = useCallback((): void => {
    setReadOnly((current) => {
      record(current ? "Editing enabled" : "Workbench is read-only");
      return !current;
    });
  }, [record]);

  const exportCsv = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    const sheet = grid.store.getWorkbook().sheets.find((entry) => entry.id === ANALYTICS_SHEET_ID);
    if (!sheet) return;
    try {
      // `grid.exportCsv` counts the viewport's presentation-padding columns
      // against the default 1M-cell ceiling (100k rows × ~14 padded columns),
      // so the workbench drives the same public codec with an explicit ceiling
      // sized to the padded sheet width.
      const csv = toCsv(sheet, grid.store, {
        resourceLimits: { maxCells: (sheet.rowCount + 1) * sheet.columns.length },
      });
      downloadBytes(csv, "analytics-pipeline.csv", "text/csv;charset=utf-8");
      record("CSV export prepared · current view order");
    } catch (error) {
      record(`CSV export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [record]);

  const exportXlsx = useCallback(async (): Promise<void> => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      // Dynamic on purpose: the XLSX backend is an optional package boundary
      // this workbench demonstrates — a static import would bundle it into the
      // route chunk and defeat the isolation story.
      await import("@sheetwrite/xlsx/register");
      await grid.exportXlsx("analytics-pipeline.xlsx");
      record("XLSX export prepared");
    } catch (error) {
      record(`XLSX export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [record]);

  /**
   * CSV workflow entry point: parse with the shared core codec and overlay the
   * parsed rows onto the top of the pipeline as ONE undoable commit.
   */
  const importCsv = useCallback(
    async (file: File): Promise<void> => {
      const grid = gridRef.current;
      if (!grid || readOnly) return;
      try {
        const columns = workbook.sheets[0]?.columns ?? [];
        const parsed = fromCsv(await file.text(), columns);
        const rows = Math.min(parsed.rowCount, MAX_IMPORT_ROWS);
        if (rows === 0) {
          record(`${file.name}: no data rows found`);
          return;
        }
        const patches: DocumentOp[] = [];
        columns.forEach((column, col) => {
          const values = parsed.columns[column.key];
          if (!values) return;
          for (let row = 0; row < rows; row++) {
            const value = values[row];
            if (value === null || value === undefined) continue;
            patches.push({
              op: "set",
              addr: { sheet: ANALYTICS_SHEET_ID, row, col },
              value: { kind: "literal", value: typeof value === "number" ? value : String(value) },
            });
          }
        });
        grid.applyTransaction({ patches });
        record(
          `Imported ${rows.toLocaleString()} row${rows === 1 ? "" : "s"} from ${file.name} · one undoable commit`,
        );
      } catch (error) {
        record(`CSV import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [readOnly, record, workbook],
  );

  const chooseRenderer = useCallback((mode: "canvas" | "worker"): void => {
    setRenderer(mode);
    setRendererFallback(null);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(ANALYTICS_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return {
    // Grid inputs.
    gridRef,
    workbook,
    dataset,
    readOnly,
    renderer,
    // Adapter events.
    onReady,
    onGridChange,
    onSelectionChange,
    // Controlled state and derived summaries.
    market,
    segment,
    query,
    setQuery,
    replacement,
    setReplacement,
    matches,
    visibleRows,
    kpis,
    selection,
    formulaAddress,
    formulaDraft,
    generation,
    readyReason,
    activeRenderer,
    rendererFallback,
    activity,
    // Actions.
    editFormulaDraft,
    commitFormulaDraft,
    chooseMarket,
    chooseSegment,
    runSearch,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAll,
    rankByArr,
    undo,
    redo,
    resetView,
    reloadDataset,
    toggleReadOnly,
    exportCsv,
    exportXlsx,
    importCsv,
    chooseRenderer,
  };
}
