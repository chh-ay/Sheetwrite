import type { ColumnarDataset } from "./dataset.js";
import { logicalValueChecksum } from "./dataset.js";
import {
  type FailedScenario,
  type MeasuredSample,
  type MemoryDelta,
  RENDER_SCENARIOS,
  type ScenarioId,
  type ScenarioIdentity,
  type ScenarioResult,
  type RenderResourceMetrics,
  scenarioGroup,
  type ValidationObservation,
} from "./render-protocol.js";
import { summarizeFinite } from "./stats.js";

const SCROLL_STEP = 50;
const EDIT_VALUE = "Benchmark edit";
const ALTER_COUNT = 5;

export interface CellSelection {
  readonly row: number;
  readonly col: number;
}

export interface ScrollObservation {
  readonly top: number;
  readonly left: number;
  readonly maximumTop: number;
  readonly maximumLeft: number;
  readonly firstVisibleRow: number;
}

/** Repository-owned structural surface shared by both browser engines. */
export interface RenderBenchAdapter {
  readonly id: "sheetwrite" | "handsontable";
  readonly initialRowCount: number;
  readonly colCount: number;
  mount(host: HTMLElement): void;
  isMountedAndAccessible(): boolean;
  rowCount(): number;
  cellValue(row: number, col: number): unknown;
  setCellValue(row: number, col: number, value: string | number | null): void;
  selection(): CellSelection | null;
  editorOpen(): boolean;
  prepareScroll(axis: "top" | "left", startMiddle: boolean): void;
  scrollBy(axis: "top" | "left", pixels: number): void;
  scrollObservation(): ScrollObservation;
  selectAndReveal(row: number, col: number): void;
  openEditor(): void;
  closeEditor(): void;
  editCommit(value: string): void;
  moveSelection(direction: "down" | "right"): void;
  insertRows(at: number, count: number): void;
  removeRows(at: number, count: number): void;
  resetFormatResources(): void;
  repaint(): void;
  formattedSentinels(): readonly [string, string];
  formatResources(): RenderResourceMetrics;
  destroy(): void;
}

export interface ScenarioRunOptions {
  readonly runId: string;
  readonly round: number;
  readonly warmupSamples: number;
  readonly measuredSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly onStage?: (stage: "warmup" | "measure" | "validate") => void;
}

export class ScenarioValidationError extends Error {
  override readonly name = "ScenarioValidationError";
}

interface ScenarioActions {
  readonly prepare: () => void;
  readonly action: () => void;
  readonly cleanup: () => void;
  readonly validateEffect: (observations: ValidationObservation[]) => void;
}

function usedJsHeapBytes(): number | null {
  const candidate: unknown = performance;
  if (candidate !== null && typeof candidate === "object" && "memory" in candidate) {
    const memory = candidate.memory;
    if (
      memory !== null &&
      typeof memory === "object" &&
      "usedJSHeapSize" in memory &&
      typeof memory.usedJSHeapSize === "number" &&
      Number.isFinite(memory.usedJSHeapSize)
    ) {
      return memory.usedJSHeapSize;
    }
  }
  return null;
}

function memoryDelta(beforeBytes: number | null, afterBytes: number | null): MemoryDelta {
  if (beforeBytes === null || afterBytes === null) {
    return { beforeBytes: null, afterBytes: null, deltaBytes: null };
  }
  return { beforeBytes, afterBytes, deltaBytes: afterBytes - beforeBytes };
}

function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return JSON.stringify(value) ?? String(value);
}

function checkpoint(
  observations: ValidationObservation[],
  name: string,
  expected: unknown,
  observed: unknown,
  passed: boolean = Object.is(expected, observed),
): void {
  observations.push({
    checkpoint: name,
    expected: display(expected),
    observed: display(observed),
    passed,
  });
  if (!passed) {
    throw new ScenarioValidationError(
      `${name}: expected ${display(expected)}, observed ${display(observed)}`,
    );
  }
}

function expectedSentinels(dataset: ColumnarDataset): readonly unknown[] {
  const middle = Math.floor(dataset.rowCount / 2);
  const last = dataset.rowCount - 1;
  return [dataset.id[0], dataset.customer[0], dataset.city[middle], dataset.amount[last]];
}

function observedSentinels(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): readonly unknown[] {
  const middle = Math.floor(dataset.rowCount / 2);
  const last = dataset.rowCount - 1;
  return [
    adapter.cellValue(0, 0),
    adapter.cellValue(0, 2),
    adapter.cellValue(middle, 3),
    adapter.cellValue(last, 4),
  ];
}

function validateCanonicalState(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
  observations: ValidationObservation[],
): void {
  checkpoint(
    observations,
    "grid remains mounted and accessibility-labelled",
    true,
    adapter.isMountedAndAccessible(),
  );
  checkpoint(observations, "canonical row count", dataset.rowCount, adapter.rowCount());
  checkpoint(
    observations,
    "canonical sentinel checksum",
    logicalValueChecksum(expectedSentinels(dataset)),
    logicalValueChecksum(observedSentinels(adapter, dataset)),
  );
}

function validateSelection(
  adapter: RenderBenchAdapter,
  observations: ValidationObservation[],
  row: number,
  col: number,
  checkpointName: string,
): void {
  const selection = adapter.selection();
  checkpoint(
    observations,
    checkpointName,
    `${row},${col}`,
    selection ? `${selection.row},${selection.col}` : "none",
  );
}

function withEffectCleanup(action: () => void, cleanup: () => void, validate: () => void): void {
  action();
  try {
    validate();
  } finally {
    cleanup();
  }
}

function scenarioActions(
  scenarioId: ScenarioId,
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): ScenarioActions {
  const middleRow = Math.floor(dataset.rowCount / 2);
  const middleCol = Math.floor(adapter.colCount / 2);
  const lastRow = dataset.rowCount - 1;
  const lastCol = adapter.colCount - 1;

  if (scenarioId === "formatted-paint.top-left") {
    const originalDate = dataset.date[0]!;
    const originalAmount = dataset.amount[0]!;
    adapter.resetFormatResources();
    const prepare = (): void => {
      adapter.setCellValue(0, 1, 45_351);
      adapter.setCellValue(0, 4, 1_234.5);
    };
    const action = (): void => adapter.repaint();
    const cleanup = (): void => {
      adapter.setCellValue(0, 1, originalDate);
      adapter.setCellValue(0, 4, originalAmount);
    };
    return {
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        try {
          action();
          checkpoint(
            observations,
            "formatted-paint retains numeric amount input",
            1_234.5,
            adapter.cellValue(0, 4),
          );
          checkpoint(
            observations,
            "formatted-paint retains numeric date serial",
            45_351,
            adapter.cellValue(0, 1),
          );
          checkpoint(
            observations,
            "formatted-paint exact fixed-decimal and named-date sentinels",
            '["1,234.50","Feb 29, 2024"]',
            JSON.stringify(adapter.formattedSentinels()),
          );
          if (adapter.id === "sheetwrite") {
            const resources = adapter.formatResources();
            checkpoint(
              observations,
              "formatted-paint compiles two format codes",
              2,
              resources.compiledFormats,
            );
            checkpoint(
              observations,
              "formatted-paint constructs formatters by unique descriptor",
              1,
              resources.numberFormatters,
            );
            checkpoint(
              observations,
              "formatted-paint constructs one named-date formatter",
              1,
              resources.dateTimeFormatters,
            );
          }
        } finally {
          cleanup();
        }
      },
    };
  }

  if (
    scenarioId === "scroll-down.top-left" ||
    scenarioId === "scroll-down.middle" ||
    scenarioId === "scroll-right.top-left"
  ) {
    const axis = scenarioId === "scroll-right.top-left" ? "left" : "top";
    const startMiddle = scenarioId === "scroll-down.middle";
    const prepare = (): void => adapter.prepareScroll(axis, startMiddle);
    const action = (): void => adapter.scrollBy(axis, SCROLL_STEP);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        const before = adapter.scrollObservation();
        action();
        const after = adapter.scrollObservation();
        const maximum = axis === "top" ? before.maximumTop : before.maximumLeft;
        const start = axis === "top" ? before.top : before.left;
        const end = axis === "top" ? after.top : after.left;
        checkpoint(observations, `${scenarioId} has scrollable range`, true, maximum > 0);
        checkpoint(
          observations,
          `${scenarioId} reaches expected scroll offset`,
          Math.min(maximum, start + SCROLL_STEP),
          end,
        );
        if (axis === "top") {
          checkpoint(
            observations,
            `${scenarioId} advances the logical top row`,
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
        }
      },
    };
  }

  if (scenarioId.startsWith("edit-open.")) {
    const [row, col] =
      scenarioId === "edit-open.top-left"
        ? [2, 2]
        : scenarioId === "edit-open.middle"
          ? [middleRow, middleCol]
          : [lastRow, lastCol];
    const prepare = (): void => {
      adapter.closeEditor();
      adapter.selectAndReveal(row, col);
    };
    const action = (): void => adapter.openEditor();
    const cleanup = (): void => adapter.closeEditor();
    return {
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        withEffectCleanup(action, cleanup, () => {
          validateSelection(adapter, observations, row, col, `${scenarioId} intended selection`);
          checkpoint(observations, `${scenarioId} editor opened`, true, adapter.editorOpen());
        });
      },
    };
  }

  if (scenarioId === "edit-commit.middle") {
    const row = middleRow;
    const col = middleCol;
    const original = dataset.customer[row]!;
    const prepare = (): void => {
      adapter.setCellValue(row, col, original);
      adapter.selectAndReveal(row, col);
    };
    const action = (): void => adapter.editCommit(EDIT_VALUE);
    const cleanup = (): void => adapter.setCellValue(row, col, original);
    return {
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        withEffectCleanup(action, cleanup, () => {
          checkpoint(
            observations,
            "edit-commit.middle changes the intended cell",
            EDIT_VALUE,
            adapter.cellValue(row, col),
          );
        });
      },
    };
  }

  if (scenarioId === "altering.insert-5-rows-top") {
    const action = (): void => adapter.insertRows(1, ALTER_COUNT);
    const cleanup = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      prepare: () => {},
      action,
      cleanup,
      validateEffect: (observations) => {
        withEffectCleanup(action, cleanup, () => {
          checkpoint(
            observations,
            "insert increases row count",
            dataset.rowCount + ALTER_COUNT,
            adapter.rowCount(),
          );
          checkpoint(
            observations,
            "insert preserves preceding sentinel",
            dataset.id[0],
            adapter.cellValue(0, 0),
          );
          checkpoint(
            observations,
            "insert shifts following sentinel",
            dataset.id[1],
            adapter.cellValue(6, 0),
          );
        });
      },
    };
  }

  if (scenarioId === "altering.remove-5-rows-top") {
    const prepare = (): void => adapter.insertRows(1, ALTER_COUNT);
    const action = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        action();
        checkpoint(observations, "remove restores row count", dataset.rowCount, adapter.rowCount());
        checkpoint(
          observations,
          "remove preserves preceding sentinel",
          dataset.id[0],
          adapter.cellValue(0, 0),
        );
        checkpoint(
          observations,
          "remove restores following sentinel",
          dataset.id[1],
          adapter.cellValue(1, 0),
        );
      },
    };
  }

  const isDown = scenarioId === "arrow-down.top-left";
  const row = isDown ? 25 : middleRow;
  const col = isDown ? 0 : middleCol;
  const expectedRow = isDown ? row + 1 : row;
  const expectedCol = isDown ? col : col + 1;
  const prepare = (): void => adapter.selectAndReveal(row, col);
  const action = (): void => adapter.moveSelection(isDown ? "down" : "right");
  return {
    prepare,
    action,
    cleanup: () => {},
    validateEffect: (observations) => {
      prepare();
      action();
      validateSelection(
        adapter,
        observations,
        expectedRow,
        expectedCol,
        `${scenarioId} moves one logical cell`,
      );
    },
  };
}

function aggregateSample(actions: ScenarioActions, minimumDurationMs: number): MeasuredSample {
  let durationMs = 0;
  let operationCount = 0;
  do {
    actions.prepare();
    const started = performance.now();
    let operationError: unknown;
    try {
      actions.action();
    } catch (error) {
      operationError = error;
    }
    const elapsed = performance.now() - started;
    try {
      actions.cleanup();
    } catch (cleanupError) {
      if (operationError === undefined) operationError = cleanupError;
    }
    if (operationError !== undefined) throw operationError;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new RangeError(`invalid operation duration: ${elapsed}`);
    }
    durationMs += elapsed;
    operationCount++;
    if (operationCount > 1_000_000) {
      throw new RangeError(
        `aggregate did not reach ${minimumDurationMs} ms within 1,000,000 operations`,
      );
    }
  } while (durationMs < minimumDurationMs);

  return {
    index: 0,
    durationMs,
    operationCount,
    perOperationMs: durationMs / operationCount,
  };
}

function failedScenario(
  identity: ScenarioIdentity,
  stage: FailedScenario["stage"],
  error: unknown,
  partialSamples: readonly MeasuredSample[],
  validation: readonly ValidationObservation[],
  memory: MemoryDelta,
): FailedScenario {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    ...identity,
    status: "failed",
    stage,
    errorClass: normalized.name || "Error",
    message: normalized.message || String(error),
    timeout: false,
    crash: false,
    consoleErrors: [],
    pageErrors: [],
    partialSamples,
    validation,
    memory,
  };
}

export function runRenderScenario(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
  scenarioId: ScenarioId,
  options: ScenarioRunOptions,
): ScenarioResult {
  if (!RENDER_SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
    throw new RangeError(`unknown render scenario: ${scenarioId}`);
  }
  const identity: ScenarioIdentity = {
    runId: options.runId,
    round: options.round,
    engine: adapter.id,
    rows: dataset.rowCount,
    scenarioId,
    group: scenarioGroup(scenarioId),
  };
  const actions = scenarioActions(scenarioId, adapter, dataset);
  const validation: ValidationObservation[] = [];
  const rawSamples: MeasuredSample[] = [];
  const beforeBytes = usedJsHeapBytes();
  let stage: FailedScenario["stage"] = "validate";

  try {
    options.onStage?.("validate");
    validateCanonicalState(adapter, dataset, validation);
    stage = "warmup";
    options.onStage?.("warmup");
    for (let index = 0; index < options.warmupSamples; index++) {
      aggregateSample(actions, options.minimumSampleDurationMs);
    }
    stage = "measure";
    options.onStage?.("measure");
    for (let index = 0; index < options.measuredSamples; index++) {
      rawSamples.push({ ...aggregateSample(actions, options.minimumSampleDurationMs), index });
    }
    stage = "validate";
    options.onStage?.("validate");
    actions.validateEffect(validation);
    validateCanonicalState(adapter, dataset, validation);
    const afterBytes = usedJsHeapBytes();
    const summary = summarizeFinite(rawSamples.map((sample) => sample.perOperationMs));
    return {
      ...identity,
      status: "success",
      operationCount: rawSamples.reduce((total, sample) => total + sample.operationCount, 0),
      rawSamples,
      medianMs: summary.median,
      p95Ms: summary.p95,
      madMs: summary.mad,
      validation,
      memory: memoryDelta(beforeBytes, afterBytes),
      resources: adapter.formatResources(),
    };
  } catch (error) {
    return failedScenario(
      identity,
      stage,
      error,
      rawSamples,
      validation,
      memoryDelta(beforeBytes, usedJsHeapBytes()),
    );
  }
}
