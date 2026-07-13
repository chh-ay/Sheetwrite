import {
  type Column,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import type { CellValue, GridSettings, HotInstance } from "handsontable";
import "handsontable/styles/handsontable.css";
import "handsontable/styles/ht-theme-main.css";
import { COLUMNS, type ColumnarDataset, datasetChecksum, makeColumnar, toAoA } from "./dataset.js";
import { createHandsontable } from "./handsontable-runtime.js";
import {
  type BrowserCombinationResult,
  type EngineId,
  type FailedScenario,
  type FailureStage,
  RENDER_MINIMUM_SAMPLE_MS,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  RENDER_VIEWPORT,
  type ScenarioResult,
} from "./render-protocol.js";
import {
  type CellSelection,
  type RenderBenchAdapter,
  runRenderScenario,
  type ScrollObservation,
} from "./render-scenarios.js";

const SHEET = "bench";
const SHEETWRITE_ROW_HEIGHT = 28;
const HANDSONTABLE_ROW_HEIGHT = 23;

interface PageConfiguration {
  readonly engine: EngineId;
  readonly rows: number;
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly runId: string;
  readonly round: number;
}

declare global {
  interface Window {
    __benchResults?: BrowserCombinationResult;
    __benchDone?: boolean;
    __benchError?: string;
    __benchStage?: FailureStage | "complete";
  }
}

function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

function settle(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
}

function dispatchKey(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function makeWorkbook(rowCount: number): Workbook {
  const columns: Column[] = COLUMNS.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
    type: column.type,
  }));
  return { activeSheet: SHEET, sheets: [{ id: SHEET, name: "Bench", rowCount, columns }] };
}

class SheetwriteAdapter implements RenderBenchAdapter {
  readonly id = "sheetwrite" as const;
  readonly initialRowCount: number;
  readonly colCount = COLUMNS.length;
  private grid!: Grid;
  private host!: HTMLElement;
  private readonly data: { rowCount: number; columns: Record<string, ArrayLike<string | number>> };

  constructor(dataset: ColumnarDataset) {
    this.initialRowCount = dataset.rowCount;
    this.data = {
      rowCount: dataset.rowCount,
      columns: {
        id: dataset.id,
        date: dataset.date,
        customer: dataset.customer,
        city: dataset.city,
        amount: dataset.amount,
      },
    };
  }

  mount(host: HTMLElement): void {
    this.host = host;
    this.grid = createGrid(host, {
      workbook: makeWorkbook(this.initialRowCount),
      data: this.data,
    });
  }

  isMountedAndAccessible(): boolean {
    return (
      this.host.isConnected &&
      this.host.getAttribute("aria-label") !== null &&
      this.host.querySelector("canvas") !== null &&
      this.host.querySelector(".sheetwrite-scroller") !== null
    );
  }

  rowCount(): number {
    return this.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === SHEET)?.rowCount ?? -1;
  }

  cellValue(row: number, col: number): unknown {
    return this.grid.store.getCell({ sheet: SHEET, row, col }).resolved;
  }

  setCellValue(row: number, col: number, value: string | number | null): void {
    this.grid.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value },
        },
      ],
    });
    this.grid.refresh();
  }

  selection(): CellSelection | null {
    const selection = this.grid.getSelection();
    return selection?.kind === "cell" ? { row: selection.addr.row, col: selection.addr.col } : null;
  }

  editorOpen(): boolean {
    return this.host.querySelector(".sheetwrite-editor") !== null;
  }

  private scrollElement(): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!element) throw new Error("sheetwrite scroller is not mounted");
    return element;
  }

  prepareScroll(axis: "top" | "left", startMiddle: boolean): void {
    const element = this.scrollElement();
    element.scrollTop = axis === "top" && startMiddle ? Math.floor(element.scrollHeight / 2) : 0;
    element.scrollLeft = axis === "left" && startMiddle ? Math.floor(element.scrollWidth / 2) : 0;
    this.grid.refresh();
  }

  scrollBy(axis: "top" | "left", pixels: number): void {
    const element = this.scrollElement();
    if (axis === "top") element.scrollTop += pixels;
    else element.scrollLeft += pixels;
    this.grid.refresh();
  }

  scrollObservation(): ScrollObservation {
    const element = this.scrollElement();
    return {
      top: element.scrollTop,
      left: element.scrollLeft,
      maximumTop: Math.max(0, element.scrollHeight - element.clientHeight),
      maximumLeft: Math.max(0, element.scrollWidth - element.clientWidth),
      firstVisibleRow: Math.floor(element.scrollTop / SHEETWRITE_ROW_HEIGHT),
    };
  }

  selectAndReveal(row: number, col: number): void {
    this.grid.setSelection({ kind: "cell", addr: { sheet: SHEET, row, col } });
    this.grid.scrollToCell({ sheet: SHEET, row, col });
    this.grid.refresh();
  }

  openEditor(): void {
    this.host.focus();
    dispatchKey(this.host, "Enter");
    if (!this.editorOpen()) throw new Error("Sheetwrite editor did not open");
  }

  closeEditor(): void {
    const editor = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (editor) dispatchKey(editor, "Escape");
  }

  editCommit(value: string): void {
    this.openEditor();
    const editor = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (!editor) throw new Error("Sheetwrite editor disappeared before commit");
    editor.value = value;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    dispatchKey(editor, "Enter");
  }

  moveSelection(direction: "down" | "right"): void {
    this.host.focus();
    dispatchKey(this.host, direction === "down" ? "ArrowDown" : "ArrowRight");
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

class HandsontableAdapter implements RenderBenchAdapter {
  readonly id = "handsontable" as const;
  readonly initialRowCount: number;
  readonly colCount = COLUMNS.length;
  private hot!: HotInstance;
  private host!: HTMLElement;
  private readonly data: CellValue[][];

  constructor(dataset: ColumnarDataset) {
    this.initialRowCount = dataset.rowCount;
    this.data = toAoA(dataset);
  }

  mount(host: HTMLElement): void {
    host.classList.add("ht-theme-main");
    this.host = host;
    const settings: GridSettings = {
      data: this.data,
      columns: COLUMNS.map((column, index) => ({
        data: index,
        type: column.type === "number" ? "numeric" : "text",
      })),
      colHeaders: COLUMNS.map((column) => column.header),
      colWidths: COLUMNS.map((column) => column.width),
      rowHeaders: true,
      columnSorting: true,
      filters: true,
      width: RENDER_VIEWPORT.width,
      height: RENDER_VIEWPORT.height,
      renderAllRows: false,
      autoColumnSize: false,
      autoRowSize: false,
      licenseKey: "non-commercial-and-evaluation",
    };
    this.hot = createHandsontable(host, settings, [
      "alter",
      "countRows",
      "destroy",
      "getActiveEditor",
      "getDataAtCell",
      "getSelectedLast",
      "scrollViewportTo",
      "selectCell",
      "setDataAtCell",
    ]);
  }

  isMountedAndAccessible(): boolean {
    return (
      this.host.isConnected &&
      this.host.getAttribute("aria-label") !== null &&
      this.host.querySelector(".ht_master") !== null &&
      this.host.querySelector("table") !== null
    );
  }

  rowCount(): number {
    return this.hot.countRows();
  }

  cellValue(row: number, col: number): unknown {
    return this.hot.getDataAtCell(row, col);
  }

  setCellValue(row: number, col: number, value: string | number | null): void {
    this.hot.setDataAtCell(row, col, value, "benchmark-reset");
  }

  selection(): CellSelection | null {
    const selection = this.hot.getSelectedLast();
    const row = selection?.[0];
    const col = selection?.[1];
    return row === undefined || col === undefined ? null : { row, col };
  }

  editorOpen(): boolean {
    return this.hot.getActiveEditor()?.isOpened() ?? false;
  }

  private scrollElement(): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(".ht_master .wtHolder");
    if (!element) throw new Error("Handsontable scroller is not mounted");
    return element;
  }

  prepareScroll(axis: "top" | "left", startMiddle: boolean): void {
    const element = this.scrollElement();
    element.scrollTop = axis === "top" && startMiddle ? Math.floor(element.scrollHeight / 2) : 0;
    element.scrollLeft = axis === "left" && startMiddle ? Math.floor(element.scrollWidth / 2) : 0;
    element.dispatchEvent(new Event("scroll"));
  }

  scrollBy(axis: "top" | "left", pixels: number): void {
    const element = this.scrollElement();
    if (axis === "top") element.scrollTop += pixels;
    else element.scrollLeft += pixels;
    element.dispatchEvent(new Event("scroll"));
  }

  scrollObservation(): ScrollObservation {
    const element = this.scrollElement();
    return {
      top: element.scrollTop,
      left: element.scrollLeft,
      maximumTop: Math.max(0, element.scrollHeight - element.clientHeight),
      maximumLeft: Math.max(0, element.scrollWidth - element.clientWidth),
      firstVisibleRow: Math.floor(element.scrollTop / HANDSONTABLE_ROW_HEIGHT),
    };
  }

  selectAndReveal(row: number, col: number): void {
    this.hot.selectCell(row, col);
    this.hot.scrollViewportTo(row, col);
  }

  openEditor(): void {
    const editor = this.hot.getActiveEditor();
    if (!editor) throw new Error("Handsontable has no active editor");
    editor.beginEditing();
    if (!editor.isOpened()) throw new Error("Handsontable editor did not open");
  }

  closeEditor(): void {
    const editor = this.hot.getActiveEditor();
    if (editor?.isOpened()) editor.finishEditing(true);
  }

  editCommit(value: string): void {
    const editor = this.hot.getActiveEditor();
    if (!editor) throw new Error("Handsontable has no active editor");
    editor.beginEditing();
    editor.setValue(value);
    editor.finishEditing();
  }

  moveSelection(direction: "down" | "right"): void {
    const selection = this.hot.getSelectedLast();
    const selectedRow = selection?.[0];
    const selectedCol = selection?.[1];
    if (selectedRow === undefined || selectedCol === undefined) {
      throw new Error("Handsontable has no active selection");
    }
    const row =
      direction === "down" ? Math.min(this.hot.countRows() - 1, selectedRow + 1) : selectedRow;
    const col =
      direction === "right" ? Math.min(this.hot.countCols() - 1, selectedCol + 1) : selectedCol;
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

const statusElement = document.getElementById("status");
const resultsElement = document.getElementById("results");
const stageElement = document.getElementById("stage");

function setStatus(text: string): void {
  if (statusElement) statusElement.textContent = text;
}

function renderResults(result: BrowserCombinationResult): void {
  if (!resultsElement) return;
  const lines = [
    `run: ${result.runId}`,
    `engine: ${result.engine} · rows: ${result.rows.toLocaleString("en-US")} · round: ${result.round}`,
    `dataset: ${result.datasetHash}`,
    "",
  ];
  for (const scenario of result.results) {
    if (scenario.status === "failed") {
      lines.push(`${scenario.scenarioId.padEnd(32)} FAILED ${scenario.stage}: ${scenario.message}`);
    } else {
      lines.push(
        `${scenario.scenarioId.padEnd(32)} median ${scenario.medianMs.toFixed(5)} ms · p95 ${scenario.p95Ms.toFixed(5)} · MAD ${scenario.madMs.toFixed(5)} · ${scenario.operationCount} ops`,
      );
    }
  }
  resultsElement.textContent = lines.join("\n");
}

function teardownFailures(results: readonly ScenarioResult[], error: unknown): ScenarioResult[] {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return results.map(
    (result): FailedScenario => ({
      runId: result.runId,
      round: result.round,
      engine: result.engine,
      rows: result.rows,
      scenarioId: result.scenarioId,
      group: result.group,
      status: "failed",
      stage: "teardown",
      errorClass: normalized.name || "Error",
      message: normalized.message,
      timeout: false,
      crash: false,
      consoleErrors: result.status === "failed" ? result.consoleErrors : [],
      pageErrors: result.status === "failed" ? result.pageErrors : [],
      partialSamples: result.status === "success" ? result.rawSamples : result.partialSamples,
      validation: result.validation,
      memory: result.memory,
    }),
  );
}

async function run(configuration: PageConfiguration): Promise<void> {
  if (!stageElement) throw new Error("benchmark page is missing #stage");
  window.__benchStage = "build";
  setStatus(`building ${configuration.rows.toLocaleString("en-US")}-row dataset`);
  await nextFrame();
  if (configuration.engine === "sheetwrite") await initSheetwrite();
  const dataset = makeColumnar(configuration.rows);
  const hash = datasetChecksum(dataset);

  stageElement.replaceChildren();
  const host = document.createElement("div");
  host.style.width = `${RENDER_VIEWPORT.width}px`;
  host.style.height = `${RENDER_VIEWPORT.height}px`;
  host.tabIndex = 0;
  host.setAttribute("role", "application");
  host.setAttribute("aria-label", `${configuration.engine} benchmark grid`);
  stageElement.appendChild(host);

  const adapter: RenderBenchAdapter =
    configuration.engine === "sheetwrite"
      ? new SheetwriteAdapter(dataset)
      : new HandsontableAdapter(dataset);
  window.__benchStage = "mount";
  setStatus(`mounting ${configuration.engine}`);
  adapter.mount(host);
  await settle();

  let output: BrowserCombinationResult = {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: configuration.runId,
    round: configuration.round,
    engine: configuration.engine,
    rows: configuration.rows,
    datasetHash: hash,
    results: [],
  };
  window.__benchResults = output;

  const results: ScenarioResult[] = [];
  for (const scenario of RENDER_SCENARIOS) {
    setStatus(`running ${scenario.id}`);
    const result = runRenderScenario(adapter, dataset, scenario.id, {
      runId: configuration.runId,
      round: configuration.round,
      warmupSamples: configuration.warmupSamples,
      measuredSamples: configuration.measuredSamples,
      minimumSampleDurationMs: configuration.minimumSampleDurationMs,
      onStage: (stage) => {
        window.__benchStage = stage;
      },
    });
    results.push(result);
    output = { ...output, results: [...results] };
    window.__benchResults = output;
    renderResults(output);
    await settle();
  }

  window.__benchStage = "teardown";
  try {
    adapter.destroy();
  } catch (error) {
    output = { ...output, results: teardownFailures(results, error) };
    window.__benchResults = output;
  }
  window.__benchStage = "complete";
  window.__benchDone = true;
  renderResults(output);
  setStatus(`done — ${configuration.engine} @ ${configuration.rows.toLocaleString("en-US")} rows`);
  console.log("[render-bench]", JSON.stringify(output));
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readConfiguration(params: URLSearchParams): PageConfiguration {
  const engine = params.get("engine") === "handsontable" ? "handsontable" : "sheetwrite";
  const runId = params.get("runId");
  if (!runId) throw new Error("render benchmark requires a runId");
  return {
    engine,
    rows: positiveInteger(params.get("rows"), 100_000),
    measuredSamples: positiveInteger(params.get("samples"), 3),
    warmupSamples: nonNegativeInteger(params.get("warmups"), 1),
    minimumSampleDurationMs: Math.max(
      RENDER_MINIMUM_SAMPLE_MS,
      positiveInteger(params.get("minimumSampleMs"), RENDER_MINIMUM_SAMPLE_MS),
    ),
    runId,
    round: positiveInteger(params.get("round"), 1),
  };
}

async function boot(): Promise<void> {
  delete window.__benchResults;
  delete window.__benchError;
  delete window.__benchStage;
  window.__benchDone = false;
  const params = new URLSearchParams(location.search);
  const runButton = document.getElementById("run");
  const launch = async (): Promise<void> => {
    delete window.__benchResults;
    delete window.__benchError;
    window.__benchDone = false;
    try {
      await run(readConfiguration(params));
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      window.__benchError = normalized.message;
      window.__benchDone = true;
      setStatus(`error: ${normalized.message}`);
      if (resultsElement)
        resultsElement.textContent = `${normalized.name}: ${normalized.message}\n${normalized.stack ?? ""}`;
    }
  };
  runButton?.addEventListener("click", () => void launch());
  if (params.get("auto") === "1") await launch();
  else setStatus("ready — automated runs must provide runId and auto=1");
}

void boot();
