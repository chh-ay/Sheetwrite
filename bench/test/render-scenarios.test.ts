import { describe, expect, test } from "bun:test";
import { makeColumnar, toAoA } from "../src/dataset.js";
import { DIAGNOSTIC_RENDER_SCENARIOS } from "../src/render-protocol.js";
import {
  type CellSelection,
  measureUnresizedMillionRowGeometry,
  type RenderBenchAdapter,
  runRenderScenario,
  type ScrollObservation,
} from "../src/render-scenarios.js";

interface FakeEvidence {
  readonly formattedSentinels?: readonly [string, string];
  readonly indexConstructions?: number;
  readonly candidatesExamined?: number;
}

class FakeAdapter implements RenderBenchAdapter {
  readonly id = "sheetwrite" as const;
  readonly initialRowCount: number;
  readonly colCount = 5;
  readonly values: unknown[][];
  private readonly originalValues: unknown[][];
  corruptNavigation = false;
  private mounted = true;
  private selected: CellSelection | null = null;
  private editing = false;
  private top = 0;
  private left = 0;
  private readonly evidence: FakeEvidence;

  constructor(rows = 200, evidence: FakeEvidence = {}) {
    const dataset = makeColumnar(rows);
    this.initialRowCount = rows;
    this.originalValues = toAoA(dataset);
    this.values = this.originalValues.map((row) => [...row]);
    this.evidence = evidence;
  }

  mount(_host: HTMLElement): void {
    this.mounted = true;
  }

  isMountedAndAccessible(): boolean {
    return this.mounted;
  }

  rowCount(): number {
    return this.values.length;
  }

  cellValue(row: number, col: number): unknown {
    return this.values[row]?.[col];
  }

  setCellValue(row: number, col: number, value: string | number | null): void {
    const target = this.values[row];
    if (!target) throw new RangeError(`missing row ${row}`);
    target[col] = value;
  }

  selection(): CellSelection | null {
    return this.selected;
  }

  editorOpen(): boolean {
    return this.editing;
  }

  prepareScroll(axis: "top" | "left", startMiddle: boolean): void {
    this.top = axis === "top" && startMiddle ? 500 : 0;
    this.left = axis === "left" && startMiddle ? 250 : 0;
  }

  scrollBy(axis: "top" | "left", pixels: number): void {
    if (axis === "top") this.top = Math.min(1_000, this.top + pixels);
    else this.left = Math.min(500, this.left + pixels);
  }

  scrollObservation(): ScrollObservation {
    return {
      top: this.top,
      left: this.left,
      maximumTop: 1_000,
      maximumLeft: 500,
      firstVisibleRow: Math.floor(this.top / 25),
      devicePixelRatio: 1.25,
    };
  }

  selectAndReveal(row: number, col: number): void {
    this.selected = { row, col };
  }

  openEditor(): void {
    this.editing = true;
  }

  closeEditor(): void {
    this.editing = false;
  }

  editCommit(value: string): void {
    if (!this.selected) throw new Error("no selection");
    this.setCellValue(this.selected.row, this.selected.col, value);
    this.editing = false;
  }

  moveSelection(direction: "down" | "right"): void {
    if (!this.selected) throw new Error("no selection");
    if (this.corruptNavigation) return;
    this.selected = {
      row: this.selected.row + (direction === "down" ? 1 : 0),
      col: this.selected.col + (direction === "right" ? 1 : 0),
    };
  }

  insertRows(at: number, count: number): void {
    const rows = Array.from({ length: count }, () => [null, null, null, null, null]);
    this.values.splice(at, 0, ...rows);
  }

  removeRows(at: number, count: number): void {
    this.values.splice(at, count);
  }

  resetFormatResources(): void {}

  repaint(): void {}

  formattedSentinels(): readonly [string, string] {
    return this.evidence.formattedSentinels ?? ["1,234.50", "Feb 29, 2024"];
  }

  formatResources() {
    return {
      compiledFormats: 2,
      numberFormatters: 1,
      dateTimeFormatters: 1,
      formatCacheEntries: 2,
      numberFormatterCacheEntries: 1,
      dateTimeFormatterCacheEntries: 1,
    };
  }

  installFormulaDense(): void {
    for (let row = 1; row <= Math.min(64, this.initialRowCount - 1); row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.values[row]![col] = Number(this.values[row]![0]) + col;
      }
    }
  }

  clearFormulaDense(): void {
    for (let row = 1; row <= Math.min(64, this.initialRowCount - 1); row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.values[row]![col] = this.originalValues[row]![col];
      }
    }
  }

  installTextHeavy(rowCount: number): void {
    for (let row = 1; row <= Math.min(rowCount, this.initialRowCount - 1); row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.values[row]![col] = `diagnostic-long-${row}-${col}`;
      }
    }
  }

  clearTextHeavy(): void {
    for (let row = 1; row < this.initialRowCount; row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.values[row]![col] = this.originalValues[row]![col];
      }
    }
  }

  measureUnresizedMillionRowGeometry() {
    return {
      count: 1_000_000,
      backingStoreBytes: 0,
      totalHeight: 28_000_000,
      middleRow: 500_000,
      middleTop: 14_000_000,
      lastRow: 999_999,
      lastTop: 27_999_972,
    };
  }

  installMergeHeavy(): void {}

  clearMergeHeavy(): void {}

  resetMergeResources(): void {}

  mergeResources() {
    return {
      indexConstructions: this.evidence.indexConstructions ?? 1,
      candidatesExamined: this.evidence.candidatesExamined ?? 4,
    };
  }

  destroy(): void {
    this.mounted = false;
  }
}

const dataset = makeColumnar(200);
const options = {
  runId: "scenario-fixture",
  round: 1,
  warmupSamples: 0,
  measuredSamples: 1,
  minimumSampleDurationMs: 0.01,
} as const;

describe("scenario correctness checkpoints", () => {
  test("rejects a wrong canonical row count before timing", () => {
    const adapter = new FakeAdapter();
    adapter.values.pop();
    const result = runRenderScenario(adapter, dataset, "arrow-down.top-left", options);
    expect(result).toMatchObject({ status: "failed", stage: "validate" });
    if (result.status !== "failed") throw new Error("expected failed result");
    expect(result.message).toContain("canonical row count");
    expect(result.partialSamples).toHaveLength(0);
  });

  test("rejects a wrong canonical cell checksum before timing", () => {
    const adapter = new FakeAdapter();
    adapter.values[0]![0] = 999;
    const result = runRenderScenario(adapter, dataset, "edit-open.top-left", options);
    expect(result).toMatchObject({ status: "failed", stage: "validate" });
    if (result.status !== "failed") throw new Error("expected failed result");
    expect(result.message).toContain("sentinel checksum");
  });

  test("a corrupt adapter action becomes validation failure, never a fast success", () => {
    const adapter = new FakeAdapter();
    adapter.corruptNavigation = true;
    const result = runRenderScenario(adapter, dataset, "arrow-down.top-left", options);
    expect(result).toMatchObject({ status: "failed", stage: "validate" });
    if (result.status !== "failed") throw new Error("expected failed result");
    expect(result.message).toContain("moves one logical cell");
    expect(result.partialSamples).toHaveLength(1);
  });

  test("a valid action emits finite aggregate timing and checkpoints", () => {
    const result = runRenderScenario(new FakeAdapter(), dataset, "scroll-down.top-left", options);
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error(result.message);
    expect(result.rawSamples).toHaveLength(1);
    expect(result.rawSamples[0]!.durationMs).toBeGreaterThanOrEqual(0.01);
    expect(Number.isFinite(result.medianMs)).toBe(true);
    expect(result.validation.every((observation) => observation.passed)).toBe(true);
  });
  test("keeps one-pixel smooth scrolling inside the same logical window", () => {
    const result = runRenderScenario(
      new FakeAdapter(),
      dataset,
      "scroll-smooth.same-window",
      options,
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error(result.message);
    expect(result.validation).toContainEqual(
      expect.objectContaining({
        checkpoint: "scroll-smooth.same-window keeps the logical row window",
        passed: true,
      }),
    );
  });

  test("measures real million-row uniform OffsetIndex geometry", () => {
    expect(measureUnresizedMillionRowGeometry()).toEqual({
      count: 1_000_000,
      backingStoreBytes: 0,
      totalHeight: 28_000_000,
      middleRow: 500_000,
      middleTop: 14_000_000,
      lastRow: 999_999,
      lastTop: 27_999_972,
    });
  });

  test("records each measured-only diagnostic scenario without promoting it to the gate", () => {
    for (const scenario of DIAGNOSTIC_RENDER_SCENARIOS) {
      const result = runRenderScenario(new FakeAdapter(), dataset, scenario.id, options);
      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error(result.message);
      expect(result.validation.every((observation) => observation.passed)).toBe(true);
    }
  });

  test("rejects corrupt formatter and merge-index evidence", () => {
    for (const [adapter, scenario, checkpoint] of [
      [
        new FakeAdapter(200, { formattedSentinels: ["wrong", "Feb 29, 2024"] }),
        "formatted-paint.top-left",
        "fixed-decimal and named-date sentinels",
      ],
      [
        new FakeAdapter(200, { indexConstructions: 0 }),
        "merge-heavy.paint",
        "prepares one revision index",
      ],
      [
        new FakeAdapter(200, { indexConstructions: 2 }),
        "merge-heavy.paint",
        "prepares one revision index",
      ],
      [new FakeAdapter(200, { candidatesExamined: 0 }), "merge-heavy.paint", "candidate"],
    ] as const) {
      const result = runRenderScenario(adapter, dataset, scenario, options);
      expect(result).toMatchObject({ status: "failed", stage: "validate" });
      if (result.status !== "failed") throw new Error("expected failed result");
      expect(result.message).toContain(checkpoint);
    }
  });

  test("records valid formatter and merge checkpoints", () => {
    for (const scenario of ["formatted-paint.top-left", "merge-heavy.paint"] as const) {
      const result = runRenderScenario(new FakeAdapter(), dataset, scenario, options);
      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error(result.message);
      expect(
        result.validation.some(
          (entry) => entry.passed && entry.checkpoint.includes(scenario.split(".")[0]!),
        ),
      ).toBe(true);
    }
  });
});
