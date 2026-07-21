import { describe, expect, it } from "bun:test";
import {
  createRuntimeResourceSnapshot,
  decodeStoreMemoryStats,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  WASM_MEMORY_OWNERS,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
} from "@sheetwrite/core";
import {
  RESOURCE_BENCHMARK_SCHEMA_VERSION,
  RESOURCE_FULL_SCENARIOS,
  RESOURCE_SMOKE_SCENARIOS,
  type ResourceBenchmarkArtifact,
  type ResourceScenarioId,
  validateResourceBenchmark,
} from "../src/resource-protocol.js";

const OPERATION_BY_SCENARIO: Record<ResourceScenarioId, RuntimeResourceOperation> = {
  "dense-ingest": "ingest",
  "paged-startup": "startup",
  "first-page": "ingest",
  "deep-jump": "scroll",
  "dirty-edit-clear": "dirty-clear",
  "formula-recompute": "formula-recompute",
  "exact-auto-fit": "auto-fit",
  export: "export",
  snapshot: "snapshot",
  "sort-filter-refusal": "scroll",
  teardown: "teardown",
};

function snapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase) {
  const encoded = [1, WASM_MEMORY_OWNERS.length, 1];
  for (let index = 0; index < WASM_MEMORY_OWNERS.length; index++) encoded.push(0, 0, 0);
  encoded.push(0, 0);
  return createRuntimeResourceSnapshot({
    operation,
    phase,
    wasm: decodeStoreMemoryStats(encoded, 64 * 1024),
    runtime: {
      usedJSHeapSize: 1,
      arrayBufferBytes: 2,
      externalBytes: 3,
      browserBackingStoreBytes: null,
    },
  });
}

function scenario(id: ResourceScenarioId) {
  const operation = OPERATION_BY_SCENARIO[id];
  return {
    id,
    operation,
    durationMs: 1,
    phases: {
      before: snapshot(operation, "before"),
      peak: snapshot(operation, "peak"),
      settled: snapshot(operation, "settled"),
      ...(id === "teardown" ? { "after-destroy": snapshot(operation, "after-destroy") } : {}),
    },
    deltas: [],
    sentinel: `${id}:ok`,
  } as const;
}

function artifact(mode: "smoke" | "full" = "smoke"): ResourceBenchmarkArtifact {
  const ids = mode === "smoke" ? RESOURCE_SMOKE_SCENARIOS : RESOURCE_FULL_SCENARIOS;
  return {
    schemaVersion: RESOURCE_BENCHMARK_SCHEMA_VERSION,
    resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    mode,
    provenance: {
      commit: "fixture",
      runtime: "bun-test",
      forcedGcCheckpoints: ["before", "settled", "after-destroy"],
    },
    scenarios: ids.map(scenario),
    optimizations:
      mode === "full"
        ? [
            {
              owner: "wasm.string-index",
              scenario: "dense-ingest",
              admissionRule: "capacity-slack",
              observed: 0.3,
              threshold: 0.25,
              unit: "ratio",
              before: 100,
              after: 70,
              budgetBefore: 120,
              budgetAfter: 80,
              profileArtifact: null,
            },
          ]
        : [],
  };
}

describe("resource benchmark protocol", () => {
  it("accepts complete smoke and full matrices", () => {
    expect(() => validateResourceBenchmark(artifact("smoke"), "smoke")).not.toThrow();
    expect(() => validateResourceBenchmark(artifact("full"), "full")).not.toThrow();
  });

  it("fails closed on missing phases, duplicate scenarios, and owner overlap", () => {
    const smoke = artifact();
    expect(() =>
      validateResourceBenchmark({ ...smoke, scenarios: smoke.scenarios.slice(1) }, "smoke"),
    ).toThrow("missing resource scenario");
    expect(() =>
      validateResourceBenchmark(
        { ...smoke, scenarios: [...smoke.scenarios, smoke.scenarios[0]!] },
        "smoke",
      ),
    ).toThrow("duplicate resource scenario");

    const [first, ...rest] = smoke.scenarios;
    const before = first!.phases.before!;
    const duplicatedOwner = {
      ...before,
      jsOwners: [
        {
          owner: "wasm.dense.kinds",
          logicalBytes: 1,
          allocatedBytes: 1,
          entries: 1,
          measurement: "typed-array-byte-length" as const,
        },
      ],
      totals: { logicalLiveBytes: 1, allocatedCapacityBytes: 1 },
    };
    expect(() =>
      validateResourceBenchmark(
        {
          ...smoke,
          scenarios: [
            { ...first!, phases: { ...first!.phases, before: duplicatedOwner } },
            ...rest,
          ],
        },
        "smoke",
      ),
    ).toThrow("counted twice");
  });

  it("rejects unadmitted, non-improving, and unbudgeted optimizations", () => {
    const full = artifact("full");
    const evidence = full.optimizations[0]!;
    for (const [patch, message] of [
      [{ observed: evidence.threshold }, "did not cross"],
      [{ after: evidence.before }, "lacks a lower"],
      [{ budgetAfter: evidence.budgetBefore }, "budget was not lowered"],
    ] as const) {
      expect(() =>
        validateResourceBenchmark({ ...full, optimizations: [{ ...evidence, ...patch }] }, "full"),
      ).toThrow(message);
    }
  });
});
