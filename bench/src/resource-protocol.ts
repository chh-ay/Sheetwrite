import {
  assertRuntimeResourceSnapshot,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourcePhaseDelta,
  type RuntimeResourceSnapshot,
  type TransientResourcePeak,
} from "@sheetwrite/core";
import type { BenchmarkMode } from "./gate-protocol.js";

export const RESOURCE_BENCHMARK_SCHEMA_VERSION = 1 as const;
export const RESOURCE_FULL_SCENARIOS = [
  "dense-ingest",
  "paged-startup",
  "first-page",
  "deep-jump",
  "dirty-edit-clear",
  "formula-recompute",
  "exact-auto-fit",
  "export",
  "snapshot",
  "sort-filter-refusal",
  "teardown",
] as const;
export const RESOURCE_SMOKE_SCENARIOS = [
  "dense-ingest",
  "paged-startup",
  "first-page",
  "dirty-edit-clear",
  "teardown",
] as const satisfies readonly ResourceScenarioId[];

export type ResourceScenarioId = (typeof RESOURCE_FULL_SCENARIOS)[number];
export type ResourceAdmissionRule =
  | "settled-owner-share"
  | "capacity-slack"
  | "transient-peak"
  | "boundary-amplification"
  | "timing-profile";

export interface ResourceScenarioResult {
  readonly id: ResourceScenarioId;
  readonly operation: RuntimeResourceOperation;
  readonly durationMs: number;
  readonly phases: Readonly<Partial<Record<RuntimeResourcePhase, RuntimeResourceSnapshot>>>;
  readonly deltas: readonly RuntimeResourcePhaseDelta[];
  readonly transientPeaks: readonly TransientResourcePeak[];
  readonly sentinel: string;
}

export interface ResourceOptimizationEvidence {
  readonly owner: string;
  readonly scenario: ResourceScenarioId;
  readonly admissionRule: ResourceAdmissionRule;
  readonly observed: number;
  readonly threshold: number;
  readonly unit: "ratio" | "bytes" | "calls" | "milliseconds";
  readonly before: number;
  readonly after: number;
  readonly budgetBefore: number;
  readonly budgetAfter: number;
  readonly profileArtifact: string | null;
}

export interface ResourceBenchmarkArtifact {
  readonly schemaVersion: typeof RESOURCE_BENCHMARK_SCHEMA_VERSION;
  readonly resourceSchemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly mode: BenchmarkMode;
  readonly provenance: {
    readonly commit: string;
    readonly runtime: string;
    readonly forcedGcCheckpoints: readonly RuntimeResourcePhase[];
  };
  readonly scenarios: readonly ResourceScenarioResult[];
  readonly optimizations: readonly ResourceOptimizationEvidence[];
}

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

export function validateResourceBenchmark(
  artifact: ResourceBenchmarkArtifact,
  expectedMode: BenchmarkMode = artifact.mode,
): void {
  if (artifact.schemaVersion !== RESOURCE_BENCHMARK_SCHEMA_VERSION) {
    throw new Error(`unsupported resource benchmark schema ${artifact.schemaVersion}`);
  }
  if (artifact.resourceSchemaVersion !== RUNTIME_RESOURCE_SCHEMA_VERSION) {
    throw new Error(`resource schema drift ${artifact.resourceSchemaVersion}`);
  }
  if (artifact.mode !== expectedMode) {
    throw new Error(`resource benchmark mode ${artifact.mode}; expected ${expectedMode}`);
  }
  if (!artifact.provenance.commit || !artifact.provenance.runtime) {
    throw new Error("resource benchmark provenance is incomplete");
  }
  if (!artifact.provenance.forcedGcCheckpoints.includes("settled")) {
    throw new Error("resource benchmark must declare its settled forced-GC checkpoint");
  }

  const expected = expectedMode === "full" ? RESOURCE_FULL_SCENARIOS : RESOURCE_SMOKE_SCENARIOS;
  const scenarios = new Map<ResourceScenarioId, ResourceScenarioResult>();
  for (const scenario of artifact.scenarios) {
    if (scenarios.has(scenario.id)) throw new Error(`duplicate resource scenario ${scenario.id}`);
    scenarios.set(scenario.id, scenario);
    if (scenario.operation !== OPERATION_BY_SCENARIO[scenario.id]) {
      throw new Error(`${scenario.id} operation is ${scenario.operation}`);
    }
    if (!Number.isFinite(scenario.durationMs) || scenario.durationMs < 0) {
      throw new Error(`${scenario.id} duration must be finite and non-negative`);
    }
    if (!scenario.sentinel) throw new Error(`${scenario.id} sentinel is empty`);
    for (const phase of ["before", "peak", "settled"] as const) {
      const snapshot = scenario.phases[phase];
      if (!snapshot) throw new Error(`${scenario.id} is missing ${phase}`);
      assertRuntimeResourceSnapshot(snapshot);
      if (snapshot.operation !== scenario.operation || snapshot.phase !== phase) {
        throw new Error(`${scenario.id} ${phase} snapshot identity drift`);
      }
    }
    if (scenario.id === "teardown") {
      const destroyed = scenario.phases["after-destroy"];
      if (!destroyed) throw new Error("teardown is missing after-destroy");
      assertRuntimeResourceSnapshot(destroyed);
      if (destroyed.operation !== "teardown" || destroyed.phase !== "after-destroy") {
        throw new Error("teardown after-destroy snapshot identity drift");
      }
    }
    const transientOwners = new Set<string>();
    for (const transient of scenario.transientPeaks) {
      if (
        !transient.owner ||
        transientOwners.has(transient.owner) ||
        transient.measurement !== "instrumented-operation-peak" ||
        !Number.isSafeInteger(transient.peakBytes) ||
        transient.peakBytes < 0 ||
        !Number.isSafeInteger(transient.allocations) ||
        transient.allocations < 0
      ) {
        throw new Error(`${scenario.id} has invalid transient resource accounting`);
      }
      transientOwners.add(transient.owner);
    }
    if (scenario.id === "formula-recompute" && scenario.transientPeaks.length === 0) {
      throw new Error("formula-recompute is missing transient matrix accounting");
    }
    for (const delta of scenario.deltas) {
      if (
        delta.schemaVersion !== RUNTIME_RESOURCE_SCHEMA_VERSION ||
        delta.operation !== scenario.operation
      ) {
        throw new Error(`${scenario.id} phase delta identity drift`);
      }
    }
  }
  for (const id of expected) {
    if (!scenarios.has(id)) throw new Error(`missing resource scenario ${id}`);
  }
  if (scenarios.size !== expected.length) {
    throw new Error(`unexpected resource scenarios for ${expectedMode}`);
  }
  const optimizationOwners = new Set<string>();
  for (const optimization of artifact.optimizations) {
    if (optimizationOwners.has(optimization.owner)) {
      throw new Error(`duplicate optimization owner ${optimization.owner}`);
    }
    optimizationOwners.add(optimization.owner);
    if (!scenarios.has(optimization.scenario)) {
      throw new Error(`optimization scenario ${optimization.scenario} was not measured`);
    }
    if (
      !Number.isFinite(optimization.observed) ||
      !Number.isFinite(optimization.threshold) ||
      optimization.observed <= optimization.threshold
    ) {
      throw new Error(`${optimization.owner} did not cross its admission threshold`);
    }
    if (
      !Number.isSafeInteger(optimization.before) ||
      !Number.isSafeInteger(optimization.after) ||
      optimization.before < 0 ||
      optimization.after < 0 ||
      optimization.after >= optimization.before
    ) {
      throw new Error(`${optimization.owner} lacks a lower before/after measurement`);
    }
    if (
      !Number.isSafeInteger(optimization.budgetBefore) ||
      !Number.isSafeInteger(optimization.budgetAfter) ||
      optimization.budgetAfter < optimization.after ||
      optimization.budgetAfter >= optimization.budgetBefore
    ) {
      throw new Error(`${optimization.owner} budget was not lowered around the measured result`);
    }
    if (optimization.admissionRule === "timing-profile" && !optimization.profileArtifact) {
      throw new Error(`${optimization.owner} timing admission requires a CPU profile`);
    }
  }
}
