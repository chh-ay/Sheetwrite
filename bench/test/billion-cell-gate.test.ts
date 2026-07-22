import { describe, expect, it } from "bun:test";
import {
  BILLION_CELL_SCALE_CONFIGS,
  BILLION_CELL_SCENARIOS,
  CLEAN_ALLOCATION_LIMIT_BYTES,
  CONTROLLER_TILE_METADATA_LIMIT_BYTES,
  deriveBillionCellGateChecks,
  DIRTY_EDIT_COUNT,
  FFI_CROSSINGS_PER_REQUEST_LIMIT,
  FIXED_WINDOW_SLOPE_LIMIT,
  HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
  LOADED_CLEAN_CELL_LIMIT,
  PAGED_CACHE_BYTES,
  SCENARIO_P95_LIMIT_MS,
  STARTUP_MEDIAN_LIMIT_MS,
  STARTUP_METADATA_LIMIT_BYTES,
  validateBillionCellBenchmark,
  type BillionCellBenchmarkArtifact,
} from "../src/billion-cell-bench.js";

const RESULT_URL = new URL("../results/billion-cell-results.json", import.meta.url);

async function checkedArtifact(): Promise<BillionCellBenchmarkArtifact> {
  const value: unknown = JSON.parse(await Bun.file(RESULT_URL).text());
  validateBillionCellBenchmark(value);
  return value;
}

type DeepMutable<T> = T extends boolean
  ? boolean
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

function clone(artifact: BillionCellBenchmarkArtifact): DeepMutable<BillionCellBenchmarkArtifact> {
  return structuredClone(artifact) as unknown as DeepMutable<BillionCellBenchmarkArtifact>;
}

describe("two-dimensional billion-cell resource gate", () => {
  it("keeps a passing checked artifact for the exact 10M, 100M, and 1B workloads", async () => {
    const artifact = await checkedArtifact();
    expect(artifact.status).toBe("passed");
    expect(artifact.gate.status).toBe("passed");
    expect(artifact.gate.failures).toEqual([]);
    expect(
      artifact.scales.map(({ id, rows, columns, logicalCells }) => ({
        id,
        rows,
        columns,
        logicalCells,
      })),
    ).toEqual(BILLION_CELL_SCALE_CONFIGS.map((scale) => ({ ...scale })));
    expect(artifact.configuration.cacheBytes).toBe(PAGED_CACHE_BYTES);
    expect(artifact.configuration.ceilings).toEqual({
      directCellAmplification: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
      startupMedianMs: STARTUP_MEDIAN_LIMIT_MS,
      scenarioP95Ms: SCENARIO_P95_LIMIT_MS,
      startupMetadataBytes: STARTUP_METADATA_LIMIT_BYTES,
      cleanAllocationBytes: CLEAN_ALLOCATION_LIMIT_BYTES,
      loadedCleanCellsAfterChurn: LOADED_CLEAN_CELL_LIMIT,
      dirtyCellsAfterEdits: DIRTY_EDIT_COUNT,
      controllerTileMetadataBytes: CONTROLLER_TILE_METADATA_LIMIT_BYTES,
      fixedWindowSlopeRatio: FIXED_WINDOW_SLOPE_LIMIT,
      ffiCrossingsPerRequest: FFI_CROSSINGS_PER_REQUEST_LIMIT,
    });
  });

  it("records exact protocol-2 requests and complete sparse pages", async () => {
    const artifact = await checkedArtifact();
    for (const scale of artifact.scales) {
      expect(scale.protocol.contract).toBe("protocol-2-windowed");
      expect(scale.protocol.capabilities).toEqual({ protocol: 2, columns: "windowed" });
      expect(scale.protocol.observedBandModes).toEqual(["empty", "contiguous", "disjoint-frozen"]);
      expect(scale.protocol.emptyDemandRequests).toBe(0);
      expect(scale.protocol.exchanges.length).toBeGreaterThan(0);
      expect(
        scale.protocol.exchanges.some(
          (exchange) =>
            exchange.request.columns.length > 1 && exchange.request.columns[0]!.start === 0,
        ),
      ).toBe(true);
      expect(
        scale.protocol.exchanges.reduce(
          (sum, exchange) => sum + exchange.page.explicitNullCells,
          0,
        ),
      ).toBeGreaterThan(0);
      for (const exchange of scale.protocol.exchanges) {
        expect(exchange.request.protocol).toBe(2);
        expect(exchange.page.protocol).toBe(2);
        expect(exchange.page.columns).toEqual(exchange.request.columns);
        expect(exchange.page.rows).toBe(exchange.request.end - exchange.request.start);
        expect(exchange.page.cells).toBe(exchange.request.cells);
        expect(exchange.page.everyRowHasEveryDeclaredKey).toBe(true);
      }
    }
  });

  it("distinguishes logical addressability from bounded residency through the full lifecycle", async () => {
    const artifact = await checkedArtifact();
    for (const scale of artifact.scales) {
      expect(scale.scenarios.map(({ id }) => id)).toEqual([...BILLION_CELL_SCENARIOS]);
      for (const scenario of scale.scenarios) {
        expect(scenario.status).toBe("completed");
        expect(scenario.resources.residentCells).toBeLessThan(scale.logicalCells);
        expect(scenario.resources.ownerSums.logicalBytes).toBe(
          scenario.resources.owners.reduce((sum, owner) => sum + owner.logicalBytes, 0),
        );
        expect(scenario.resources.ownerSums.allocatedBytes).toBe(
          scenario.resources.owners.reduce((sum, owner) => sum + owner.allocatedBytes, 0),
        );
      }
      const byId = Object.fromEntries(scale.scenarios.map((scenario) => [scenario.id, scenario]));
      expect(byId["deep-two-axis-jump"]!.parameters.rowStart).toBe(
        Math.floor(scale.rows * artifact.configuration.deepJumpRowFraction),
      );
      expect(byId["deep-two-axis-jump"]!.parameters.columnStart).toBe(
        scale.columns - artifact.configuration.visibleTileColumns,
      );
      expect(byId["diagonal-churn-100"]!.operationCountPerRun).toBe(100);
      expect(byId["diagonal-churn-100"]!.resources.loadedCleanCells).toBeLessThanOrEqual(
        LOADED_CLEAN_CELL_LIMIT,
      );
      expect(byId["distant-edits-100"]!.resources.dirtyCells).toBe(DIRTY_EDIT_COUNT);
      expect(byId["dirty-revisit-after-eviction"]!.resources.dirtyCells).toBe(DIRTY_EDIT_COUNT);
      expect(byId.clear!.resources.dirtyCells).toBe(0);
      expect(byId.destroy!.resources.ownerSums.logicalBytes).toBe(0);
      expect(byId.destroy!.resources.ownerSums.allocatedBytes).toBe(0);
    }
  });

  it("stores every derived ceiling result and rejects tampering with any gate", async () => {
    const artifact = await checkedArtifact();
    const derived = deriveBillionCellGateChecks(artifact.scales);
    expect(artifact.gate.checks).toEqual(derived);
    expect(new Set(derived.map(({ id }) => id)).size).toBe(derived.length);
    expect(derived.every(({ passed }) => passed)).toBe(true);
    for (let index = 0; index < derived.length; index += 1) {
      const tampered = clone(artifact);
      tampered.gate.checks[index]!.actual += 1;
      expect(() => validateBillionCellBenchmark(tampered), derived[index]!.id).toThrow();
    }
  });

  it("derives an exact failed artifact when a stated bound is exceeded", async () => {
    const artifact = clone(await checkedArtifact());
    artifact.scales[0]!.startupRuntimeMetadataBytes = STARTUP_METADATA_LIMIT_BYTES + 1;
    const measuredScales = artifact.scales as unknown as BillionCellBenchmarkArtifact["scales"];
    artifact.gate.checks = [...deriveBillionCellGateChecks(measuredScales)];
    artifact.gate.failures = artifact.gate.checks.filter(
      (candidate: { passed: boolean }) => !candidate.passed,
    );
    artifact.status = "failed";
    artifact.gate.status = "failed";
    expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
    expect(artifact.gate.failures).toHaveLength(1);
    expect(artifact.gate.failures[0]!).toMatchObject({
      id: "10m:startup-metadata",
      actual: STARTUP_METADATA_LIMIT_BYTES + 1,
      limit: STARTUP_METADATA_LIMIT_BYTES,
      comparator: "<=",
      passed: false,
    });
    expect(artifact.gate.failures[0]!.reason).toContain(
      `actual ${STARTUP_METADATA_LIMIT_BYTES + 1}`,
    );
  });

  it("rejects schema, geometry, traffic, residency, and owner-sum corruption", async () => {
    const artifact = await checkedArtifact();
    const cases: unknown[] = [];
    const missingScale = clone(artifact);
    missingScale.scales.pop();
    cases.push(missingScale);

    const nonfinite = clone(artifact);
    nonfinite.scales[0]!.scenarios[0]!.timing.samplesMs[0] = Number.NaN;
    cases.push(nonfinite);

    const fabricatedBand = clone(artifact);
    fabricatedBand.scales[0]!.protocol.exchanges[0]!.request.columns[0]!.keys[0] = "not-a-column";
    cases.push(fabricatedBand);

    const omittedCell = clone(artifact);
    omittedCell.scales[0]!.protocol.exchanges[0]!.page.everyRowHasEveryDeclaredKey = false;
    cases.push(omittedCell);

    const amplified = clone(artifact);
    amplified.scales[0]!.scenarios.find(
      (scenario) => scenario.id === "first-visible-tile",
    )!.trafficPerRun.returnedCells += 1;
    cases.push(amplified);

    const fullMatrix = clone(artifact);
    fullMatrix.scales[0]!.scenarios[0]!.resources.loadedCleanCells =
      fullMatrix.scales[0]!.logicalCells;
    fullMatrix.scales[0]!.scenarios[0]!.resources.residentCells =
      fullMatrix.scales[0]!.logicalCells;
    cases.push(fullMatrix);

    const doubleCounted = clone(artifact);
    doubleCounted.scales[0]!.scenarios[0]!.resources.owners.push(
      structuredClone(doubleCounted.scales[0]!.scenarios[0]!.resources.owners[0]!),
    );
    cases.push(doubleCounted);

    const wrongSum = clone(artifact);
    wrongSum.scales[0]!.scenarios[0]!.resources.ownerSums.allocatedBytes += 1;
    cases.push(wrongSum);

    for (const candidate of cases) expect(() => validateBillionCellBenchmark(candidate)).toThrow();
  });
});
