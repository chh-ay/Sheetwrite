import { describe, expect, it } from "bun:test";
import {
  BILLION_CELL_COLUMNS,
  BILLION_CELL_LOGICAL_CELLS,
  BILLION_CELL_ROWS,
  BILLION_CELL_SCENARIOS,
  HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
  runBillionCellBenchmark,
  validateBillionCellBenchmark,
  VISIBLE_TILE_COLUMNS,
  VISIBLE_TILE_ROWS,
} from "../src/billion-cell-bench.js";

const RESULT_URL = new URL("../results/billion-cell-results.json", import.meta.url);

async function checkedArtifact(): Promise<Record<string, any>> {
  return JSON.parse(await Bun.file(RESULT_URL).text()) as Record<string, any>;
}

describe("billion-cell architecture gate", () => {
  it("runs the actual paged store admission probe and stops before unsafe work", async () => {
    const artifact = await runBillionCellBenchmark();
    expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
    expect(artifact.dimensions).toEqual({
      rows: BILLION_CELL_ROWS,
      columns: BILLION_CELL_COLUMNS,
      logicalCells: BILLION_CELL_LOGICAL_CELLS,
      visibleTileRows: VISIBLE_TILE_ROWS,
      visibleTileColumns: VISIBLE_TILE_COLUMNS,
      visibleTileCells: VISIBLE_TILE_ROWS * VISIBLE_TILE_COLUMNS,
    });
    expect(artifact.status).toBe("blocked");
    expect(artifact.protocol.visibleRequest).toMatchObject({
      start: 0,
      end: 120,
      requestedRows: 120,
      selectedColumns: null,
      fullWidthAddressableColumns: 1_000,
      fullWidthAddressableCells: 120_000,
    });
    expect(artifact.protocol.fullWidthAddressableCellsPerVisibleCell).toBe(50);
    expect(artifact.protocol.amplificationLimit).toBe(HORIZONTAL_TILE_AMPLIFICATION_LIMIT);
    expect(artifact.gate.blockedBeforePageAllocation).toBe(true);
    expect(artifact.scenarios.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "startup", status: "completed" },
      { id: "visible-tile", status: "blocked" },
      { id: "deep-two-axis-jump", status: "not-run" },
      { id: "distant-edits-100", status: "not-run" },
      { id: "tile-churn-100", status: "not-run" },
    ]);
    for (const scenario of artifact.scenarios) {
      expect(scenario.resources.logicalMatrixAllocatedCells).toBe(0);
      expect(scenario.resources.retainedChunks).toBe(0);
    }
  });

  it("keeps a validated checked blocked result", async () => {
    const artifact = await checkedArtifact();
    expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
    expect(artifact.status).toBe("blocked");
    expect(artifact.gate.blocker).toMatchObject({
      code: "row-only-horizontal-amplification",
      metric: "fullWidthAddressableCellsPerVisibleCell",
      actual: 50,
      limit: 1,
      visibleCells: 2_400,
      fullWidthAddressableCells: 120_000,
    });
  });

  it("rejects missing scenarios even after an architecture STOP", async () => {
    const artifact = await checkedArtifact();
    artifact.scenarios = artifact.scenarios.filter(
      (scenario: { id: string }) => scenario.id !== BILLION_CELL_SCENARIOS.at(-1),
    );
    expect(() => validateBillionCellBenchmark(artifact)).toThrow("scenarios must contain exactly");
  });

  it("rejects nonfinite measurements", async () => {
    const artifact = await checkedArtifact();
    artifact.scenarios[0].wallTimeMs = Number.NaN;
    expect(() => validateBillionCellBenchmark(artifact)).toThrow("must be finite");
  });

  it("rejects logical matrix allocation before admission", async () => {
    const artifact = await checkedArtifact();
    artifact.scenarios[1].resources.loadedCells = 1;
    artifact.scenarios[1].resources.logicalMatrixAllocatedCells = 1;
    artifact.scenarios[1].resources.retainedCells = 1;
    expect(() => validateBillionCellBenchmark(artifact)).toThrow(
      "allocated logical matrix cells before architecture admission",
    );
  });

  it("rejects a false pass over row-only horizontal amplification", async () => {
    const artifact = await checkedArtifact();
    artifact.status = "passed";
    artifact.gate.status = "passed";
    expect(() => validateBillionCellBenchmark(artifact)).toThrow(
      "row-only amplification must fail closed as blocked",
    );
  });

  it("rejects fabricated column request geometry", async () => {
    const artifact = await checkedArtifact();
    artifact.protocol.requests[0].selectedColumns = { start: 0, end: 20 };
    expect(() => validateBillionCellBenchmark(artifact)).toThrow("fabricated a column selector");
  });
});
