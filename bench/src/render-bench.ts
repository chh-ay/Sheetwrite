/**
 * Browser render benchmark: Sheetwrite vs Handsontable, at scale.
 *
 * This is the at-scale, apples-to-apples comparison. It runs in a real browser
 * (where Handsontable virtualizes against real layout — impossible headless)
 * and mirrors the four scenarios from Handsontable's own performance suite,
 * `handsontable/performance-lab` (master @ test/spec), on BOTH grids:
 *
 *   • view-scrolling.spec.js        → scroll the viewport by SCROLL_STEP (50px)
 *                                     repeatedly, from top-left and middle.
 *   • editing.spec.js               → select + scroll a cell into view at
 *                                     top-left / middle / bottom-right, then open
 *                                     the editor (edit-open latency) and commit.
 *   • altering.spec.js              → insert / remove rows at the top.
 *   • arrow-keys-navigation.spec.js → move the selection one cell at a time.
 *
 * Methodology mirrors perf-lab's runner: warm up, then repeat each timed block
 * SAMPLE_SIZE times (perf-lab uses 100 — lib/config.js) and reduce to robust
 * order statistics (median + p95). For scrolling we also count frames that blow
 * the 60fps budget (>16.67ms). Both grids get the same seeded dataset, the same
 * columns, the same identically-sized stage, and virtualization on.
 *
 * Each page load benchmarks ONE (grid, rows) combination, prints the result,
 * and exposes a typed `window.__benchResults` (plus `window.__benchDone`) so an
 * operator — or an automated driver — can read it after load. Drive it with
 * `?grid=sheetwrite&rows=100000&samples=100&auto=1`.
 */

import {
  type Column,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import Handsontable from "handsontable";
// The built WASM binary, surfaced as an asset URL the browser fetches.
import wasmUrl from "../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm" with { type: "file" };
import "handsontable/styles/handsontable.css";
import "handsontable/styles/ht-theme-main.css";
import { COLUMNS, type ColumnarDataset, makeColumnar, toAoA } from "./dataset.js";
import { collect, type MeasureOptions, ms, summarize } from "./stats.js";

const SHEET = "bench";
const SCROLL_STEP = 50; // px, matching performance-lab/test/spec/view-scrolling.spec.js
const FRAME_BUDGET_MS = 1000 / 60; // 16.67ms — one frame at 60fps

type EngineId = "sheetwrite" | "handsontable";

/** One measured scenario result. */
interface ScenarioStat {
  readonly id: string;
  readonly group: "view-scrolling" | "editing" | "altering" | "arrow-keys-navigation";
  readonly median: number;
  readonly p95: number;
  readonly mean: number;
  readonly samples: number;
  /** Scrolling only: steps that exceeded the 60fps frame budget. */
  readonly droppedFrames?: number;
}

/** Full result object exposed on `window.__benchResults`. */
interface BenchResults {
  readonly grid: EngineId;
  readonly rows: number;
  readonly cols: number;
  readonly sampleSize: number;
  readonly userAgent: string;
  readonly timestamp: string;
  /** Construct + first synchronous paint (ms). */
  readonly initialRenderMs: number;
  /** Best-effort JS heap after mount, MiB (Chrome `performance.memory`), or null. */
  readonly heapAfterMountMiB: number | null;
  readonly scenarios: ScenarioStat[];
}

declare global {
  interface Window {
    __benchResults?: BenchResults;
    __benchDone?: boolean;
    __benchError?: string;
  }
}

// ── Small async / DOM helpers ────────────────────────────────────────────────

function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

function settle(): Promise<void> {
  // Two frames: let any scheduled render flush and paint before we measure.
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
}

function dispatchKey(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Chrome-only `performance.memory.usedJSHeapSize`, narrowed without casts. */
function usedJsHeapBytes(): number | null {
  const perf: unknown = performance;
  if (perf && typeof perf === "object" && "memory" in perf) {
    const mem = perf.memory;
    if (
      mem &&
      typeof mem === "object" &&
      "usedJSHeapSize" in mem &&
      typeof mem.usedJSHeapSize === "number"
    ) {
      return mem.usedJSHeapSize;
    }
  }
  return null;
}

// ── Adapter contract ─────────────────────────────────────────────────────────

/** A uniform surface over both grids so the scenarios stay engine-agnostic. */
interface BenchAdapter {
  readonly id: EngineId;
  readonly rowCount: number;
  readonly colCount: number;
  /** Construct + initial paint; returns elapsed ms. */
  mount(host: HTMLElement): number;
  /** The element whose scrollTop/scrollLeft drives the viewport. */
  scrollElement(): HTMLElement;
  resetScroll(): void;
  /** Force a synchronous repaint reflecting the current scroll offset. */
  repaintScroll(el: HTMLElement): void;
  /** Move + reveal a cell (no editor). */
  selectAndReveal(row: number, col: number): void;
  /** Open the in-cell editor at the current selection. */
  openEditor(): void;
  /** Cancel any open editor. */
  closeEditor(): void;
  /** Open editor, set a value, and commit it (end-to-end edit). */
  editCommit(value: string): void;
  /** Move the selection one cell in a direction and repaint. */
  moveSelection(dir: "down" | "right"): void;
  insertRows(at: number, count: number): void;
  removeRows(at: number, count: number): void;
  destroy(): void;
}

// ── Sheetwrite adapter ───────────────────────────────────────────────────────

function makeWorkbook(rowCount: number): Workbook {
  const columns: Column[] = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width,
    type: c.type,
  }));
  return { activeSheet: SHEET, sheets: [{ id: SHEET, name: "Bench", rowCount, columns }] };
}

class SheetwriteAdapter implements BenchAdapter {
  readonly id = "sheetwrite" as const;
  readonly rowCount: number;
  readonly colCount = COLUMNS.length;
  private grid!: Grid;
  private host!: HTMLElement;
  private readonly data: { rowCount: number; columns: Record<string, ArrayLike<string | number>> };

  constructor(ds: ColumnarDataset) {
    this.rowCount = ds.rowCount;
    this.data = {
      rowCount: ds.rowCount,
      columns: {
        id: ds.id,
        date: ds.date,
        customer: ds.customer,
        city: ds.city,
        amount: ds.amount,
      },
    };
  }

  mount(host: HTMLElement): number {
    this.host = host;
    const t0 = performance.now();
    this.grid = createGrid(host, { workbook: makeWorkbook(this.rowCount), data: this.data });
    return performance.now() - t0; // constructor renders synchronously
  }

  scrollElement(): HTMLElement {
    const el = this.host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!el) throw new Error("sheetwrite-scroller not found");
    return el;
  }

  resetScroll(): void {
    const el = this.scrollElement();
    el.scrollTop = 0;
    el.scrollLeft = 0;
    this.grid.refresh();
  }

  repaintScroll(_el: HTMLElement): void {
    this.grid.refresh(); // synchronous canvas repaint for the current scroll offset
  }

  selectAndReveal(row: number, col: number): void {
    this.grid.setSelection({ kind: "cell", addr: { sheet: SHEET, row, col } });
    this.grid.scrollToCell({ sheet: SHEET, row, col });
    this.grid.refresh();
  }

  openEditor(): void {
    this.host.focus();
    dispatchKey(this.host, "Enter"); // Enter → beginEdit (input-controller)
  }

  closeEditor(): void {
    const ta = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (ta) dispatchKey(ta, "Escape");
  }

  editCommit(value: string): void {
    this.openEditor();
    const ta = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (!ta) return;
    ta.value = value;
    dispatchKey(ta, "Enter"); // commit + navigate down
  }

  moveSelection(dir: "down" | "right"): void {
    this.host.focus();
    dispatchKey(this.host, dir === "down" ? "ArrowDown" : "ArrowRight");
    this.grid.refresh();
  }

  insertRows(at: number, count: number): void {
    this.grid.store.applyTransaction({ patches: [{ op: "addRows", sheet: SHEET, at, count }] });
    this.grid.refresh();
  }

  removeRows(at: number, count: number): void {
    this.grid.store.applyTransaction({ patches: [{ op: "removeRows", sheet: SHEET, at, count }] });
    this.grid.refresh();
  }

  destroy(): void {
    this.grid.destroy();
  }
}

// ── Handsontable adapter ─────────────────────────────────────────────────────

class HandsontableAdapter implements BenchAdapter {
  readonly id = "handsontable" as const;
  readonly rowCount: number;
  readonly colCount = COLUMNS.length;
  private hot!: Handsontable;
  private host!: HTMLElement;
  private readonly data: Handsontable.CellValue[][];

  constructor(ds: ColumnarDataset) {
    this.rowCount = ds.rowCount;
    this.data = toAoA(ds) as Handsontable.CellValue[][];
  }

  mount(host: HTMLElement): number {
    host.classList.add("ht-theme-main");
    this.host = host;
    const t0 = performance.now();
    this.hot = new Handsontable(host, {
      data: this.data,
      columns: COLUMNS.map((c, i) => ({ data: i, type: c.type === "number" ? "numeric" : "text" })),
      colHeaders: COLUMNS.map((c) => c.header),
      rowHeaders: true,
      columnSorting: true,
      filters: true,
      width: 1000,
      height: 600,
      renderAllRows: false,
      autoColumnSize: false,
      autoRowSize: false,
      licenseKey: "non-commercial-and-evaluation",
    });
    return performance.now() - t0;
  }

  scrollElement(): HTMLElement {
    const el = this.host.querySelector<HTMLElement>(".ht_master .wtHolder");
    if (!el) throw new Error(".ht_master .wtHolder not found");
    return el;
  }

  resetScroll(): void {
    const el = this.scrollElement();
    el.scrollTop = 0;
    el.scrollLeft = 0;
    el.dispatchEvent(new Event("scroll"));
  }

  repaintScroll(el: HTMLElement): void {
    el.dispatchEvent(new Event("scroll")); // Handsontable renders the new viewport in its scroll handler
  }

  selectAndReveal(row: number, col: number): void {
    this.hot.selectCell(row, col);
    this.hot.scrollViewportTo(row, col);
  }

  openEditor(): void {
    this.hot.getActiveEditor()?.beginEditing();
  }

  closeEditor(): void {
    this.hot.getActiveEditor()?.finishEditing(true); // restore original = cancel
  }

  editCommit(value: string): void {
    const ed = this.hot.getActiveEditor();
    if (!ed) return;
    ed.beginEditing();
    ed.setValue(value);
    ed.finishEditing();
  }

  moveSelection(dir: "down" | "right"): void {
    const sel = this.hot.getSelectedLast();
    if (!sel) return;
    const r0 = sel[0] ?? 0;
    const c0 = sel[1] ?? 0;
    const row = dir === "down" ? Math.min(this.hot.countRows() - 1, r0 + 1) : r0;
    const col = dir === "right" ? Math.min(this.hot.countCols() - 1, c0 + 1) : c0;
    this.hot.selectCell(row, col);
  }

  insertRows(at: number, count: number): void {
    this.hot.alter("insert_row_above", at, count);
  }

  removeRows(at: number, count: number): void {
    this.hot.alter("remove_row", at, count);
  }

  destroy(): void {
    this.hot.destroy();
  }
}

// ── Scenario battery ─────────────────────────────────────────────────────────

function statFrom(id: string, group: ScenarioStat["group"], samples: number[]): ScenarioStat {
  const s = summarize(samples);
  return { id, group, median: s.median, p95: s.p95, mean: s.mean, samples: s.iters };
}

function scrollScenario(
  adapter: BenchAdapter,
  id: string,
  axis: "top" | "left",
  startMiddle: boolean,
  sampleSize: number,
): ScenarioStat {
  const el = adapter.scrollElement();
  adapter.resetScroll();
  if (startMiddle) {
    if (axis === "top") el.scrollTop = Math.floor(el.scrollHeight / 2);
    else el.scrollLeft = Math.floor(el.scrollWidth / 2);
    adapter.repaintScroll(el);
  }
  const samples = collect(
    () => {
      if (axis === "top") el.scrollTop += SCROLL_STEP;
      else el.scrollLeft += SCROLL_STEP;
      adapter.repaintScroll(el);
    },
    { warmup: 10, iters: sampleSize },
  );
  const base = statFrom(id, "view-scrolling", samples);
  const droppedFrames = samples.filter((d) => d > FRAME_BUDGET_MS).length;
  return { ...base, droppedFrames };
}

function discreteScenario(
  id: string,
  group: ScenarioStat["group"],
  fn: () => void,
  sampleSize: number,
  hooks: Pick<MeasureOptions, "before" | "after"> = {},
): ScenarioStat {
  const samples = collect(fn, { warmup: 5, iters: sampleSize, ...hooks });
  return statFrom(id, group, samples);
}

async function runScenarios(adapter: BenchAdapter, sampleSize: number): Promise<ScenarioStat[]> {
  const out: ScenarioStat[] = [];
  const rows = adapter.rowCount;
  const midRow = Math.floor(rows / 2);
  const midCol = Math.floor(adapter.colCount / 2);
  const lastRow = rows - 1;
  const lastCol = adapter.colCount - 1;

  // ── view-scrolling ──
  out.push(scrollScenario(adapter, "scroll-down.top-left", "top", false, sampleSize));
  await settle();
  out.push(scrollScenario(adapter, "scroll-down.middle", "top", true, sampleSize));
  await settle();
  out.push(scrollScenario(adapter, "scroll-right.top-left", "left", false, sampleSize));
  await settle();

  // ── editing: edit-open latency at three positions ──
  for (const [id, r, c] of [
    ["edit-open.top-left", 2, 2],
    ["edit-open.middle", midRow, midCol],
    ["edit-open.bottom-right", lastRow, lastCol],
  ] as const) {
    adapter.selectAndReveal(r, c);
    await settle();
    out.push(
      discreteScenario(id, "editing", () => adapter.openEditor(), sampleSize, {
        before: () => adapter.selectAndReveal(r, c),
        after: () => adapter.closeEditor(),
      }),
    );
    adapter.closeEditor();
    await settle();
  }

  // ── editing: edit-commit (open → type → commit) at the middle ──
  adapter.selectAndReveal(midRow, midCol);
  await settle();
  out.push(
    discreteScenario(
      "edit-commit.middle",
      "editing",
      () => adapter.editCommit("12345"),
      sampleSize,
      {
        before: () => adapter.selectAndReveal(midRow, midCol),
      },
    ),
  );
  await settle();

  // ── altering: insert / remove 5 rows at the top ──
  out.push(
    discreteScenario(
      "altering.insert-5-rows-top",
      "altering",
      () => adapter.insertRows(1, 5),
      sampleSize,
      {
        after: () => adapter.removeRows(1, 5),
      },
    ),
  );
  await settle();
  out.push(
    discreteScenario(
      "altering.remove-5-rows-top",
      "altering",
      () => adapter.removeRows(1, 5),
      sampleSize,
      {
        before: () => adapter.insertRows(1, 5),
      },
    ),
  );
  await settle();

  // ── arrow-keys-navigation ──
  adapter.selectAndReveal(25, 0);
  await settle();
  out.push(
    discreteScenario(
      "arrow-down.top-left",
      "arrow-keys-navigation",
      () => adapter.moveSelection("down"),
      sampleSize,
    ),
  );
  adapter.selectAndReveal(midRow, midCol);
  await settle();
  out.push(
    discreteScenario(
      "arrow-right.middle",
      "arrow-keys-navigation",
      () => adapter.moveSelection("right"),
      sampleSize,
    ),
  );

  return out;
}

// ── Orchestration ────────────────────────────────────────────────────────────

const status = document.getElementById("status");
const resultsEl = document.getElementById("results");
const stage = document.getElementById("stage");

function setStatus(text: string): void {
  if (status) status.textContent = text;
}

function renderResults(results: BenchResults): void {
  const lines: string[] = [];
  lines.push(`grid:   ${results.grid}`);
  lines.push(
    `rows:   ${results.rows.toLocaleString("en-US")}  ·  cols: ${results.cols}  ·  samples: ${results.sampleSize}`,
  );
  lines.push(`mount:  ${ms(results.initialRenderMs)} ms (construct + first paint)`);
  lines.push(
    `heap:   ${results.heapAfterMountMiB === null ? "n/a" : `${results.heapAfterMountMiB.toFixed(1)} MiB`} (post-mount, Chrome only)`,
  );
  lines.push("");
  lines.push(
    "scenario".padEnd(28) + "median".padStart(10) + "p95".padStart(10) + "dropped".padStart(10),
  );
  lines.push("─".repeat(58));
  let group = "";
  for (const s of results.scenarios) {
    if (s.group !== group) {
      group = s.group;
      lines.push(`[${group}]`);
    }
    const dropped = s.droppedFrames === undefined ? "" : String(s.droppedFrames);
    lines.push(
      `  ${s.id}`.padEnd(28) +
        `${ms(s.median)}`.padStart(10) +
        `${ms(s.p95)}`.padStart(10) +
        dropped.padStart(10),
    );
  }
  if (resultsEl) resultsEl.textContent = lines.join("\n");
}

async function run(grid: EngineId, rows: number, sampleSize: number): Promise<void> {
  if (!stage) throw new Error("missing #stage");
  setStatus(`building ${rows.toLocaleString("en-US")}-row dataset …`);
  await nextFrame();

  const ds = makeColumnar(rows);

  // Fresh host inside the stage for this run.
  stage.replaceChildren();
  const host = document.createElement("div");
  host.style.width = "1000px";
  host.style.height = "600px";
  stage.appendChild(host);

  const adapter: BenchAdapter =
    grid === "sheetwrite" ? new SheetwriteAdapter(ds) : new HandsontableAdapter(ds);

  setStatus(`mounting ${grid} …`);
  await nextFrame();
  const initialRenderMs = adapter.mount(host);
  await settle();
  const heapBytes = usedJsHeapBytes();

  setStatus(`running scenarios (${grid}, ${rows.toLocaleString("en-US")} rows) …`);
  const scenarios = await runScenarios(adapter, sampleSize);

  const results: BenchResults = {
    grid,
    rows,
    cols: COLUMNS.length,
    sampleSize,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    initialRenderMs,
    heapAfterMountMiB: heapBytes === null ? null : heapBytes / (1024 * 1024),
    scenarios,
  };

  window.__benchResults = results;
  window.__benchDone = true;
  renderResults(results);
  setStatus(`done — ${grid} @ ${rows.toLocaleString("en-US")} rows`);
  // eslint-disable-next-line no-console
  console.log("[render-bench]", JSON.stringify(results));
}

async function boot(): Promise<void> {
  await initSheetwrite(wasmUrl);

  const params = new URLSearchParams(location.search);
  const gridSel = document.getElementById("grid");
  const rowsSel = document.getElementById("rows");
  const samplesSel = document.getElementById("samples");
  const runBtn = document.getElementById("run");

  const readControls = (): { grid: EngineId; rows: number; samples: number } => {
    const grid =
      gridSel instanceof HTMLSelectElement && gridSel.value === "handsontable"
        ? "handsontable"
        : "sheetwrite";
    const rows = rowsSel instanceof HTMLSelectElement ? Number(rowsSel.value) : 100_000;
    const samples = samplesSel instanceof HTMLSelectElement ? Number(samplesSel.value) : 100;
    return { grid, rows, samples };
  };

  // Reflect URL params into the controls.
  const pGrid = params.get("grid");
  const pRows = params.get("rows");
  const pSamples = params.get("samples");
  if (pGrid && gridSel instanceof HTMLSelectElement) gridSel.value = pGrid;
  if (pRows && rowsSel instanceof HTMLSelectElement) rowsSel.value = pRows;
  if (pSamples && samplesSel instanceof HTMLSelectElement) samplesSel.value = pSamples;

  const launch = async (): Promise<void> => {
    window.__benchDone = false;
    const { grid, rows, samples } = readControls();
    try {
      await run(grid, rows, samples);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.__benchError = message;
      window.__benchDone = true;
      setStatus(`error: ${message}`);
      if (resultsEl)
        resultsEl.textContent = `error: ${message}\n${err instanceof Error ? err.stack : ""}`;
    }
  };

  runBtn?.addEventListener("click", () => void launch());

  if (params.get("auto") === "1") await launch();
  else setStatus("ready");
}

void boot();
