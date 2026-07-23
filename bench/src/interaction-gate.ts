export interface InteractionPerformanceArtifact {
  protocolVersion: number;
  matrixId: string;
  capturedAt: string;
  source: {
    commit: string;
    workingTree: boolean;
    runtime: string;
    browser: string;
    cpu: string;
    samples: number;
    warmup: string;
    correctness: string;
  };
  directionalPrefetch: {
    sourceLatencyMs: number;
    frameBudgetMs: number;
    residencyRatioSamples: number[];
    p95VisibleWaitMsSamples: number[];
    requestedRowMultiplierSamples: number[];
    medianResidencyRatio: number;
    medianP95VisibleWaitMs: number;
  };
  viewIndex: {
    rows: number;
    lookupsPerRun: number;
    baseline: {
      lookupMedianNsSamples: number[];
      lookupP95NsSamples: number[];
      retainedBytes: number;
    };
    packed: {
      lookupMedianNsSamples: number[];
      lookupP95NsSamples: number[];
      retainedBytes: number;
      backingBytes: number;
    };
    medianLookupImprovementRatio: number;
    p95LookupRegressionRatio: number;
    retainedHeapReductionRatio: number;
  };
  sparseDirty: {
    baseline100Bytes: number;
    dirty100Bytes: number;
    dirty10000Bytes: number;
    dirty100ReductionRatio: number;
    dirty100CleanChunks: number;
    dirty10000CleanChunks: number;
  };
  coldRoute: {
    before: { usableMsSamples: number[]; sheetwriteLongTaskMsSamples: number[] };
    after: {
      usableMsSamples: number[];
      sheetwriteLongTaskMsSamples: number[];
      routeCpuMsSamples: number[];
      gridBuildCpuMsSamples: number[];
      reportedUnattributedLongTaskMsSamples: number[];
    };
    medianUsableImprovementRatio: number;
    sheetwriteLongTaskCeilingMs: number;
    sheetwriteLongTaskGatePassed: boolean;
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteSamples(value: unknown, count: number, path: string): asserts value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    value.some((item) => !Number.isFinite(item))
  ) {
    throw new Error(`${path} requires ${count} finite raw samples`);
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function sameRatio(recorded: number, computed: number): boolean {
  return Number.isFinite(recorded) && Math.abs(recorded - computed) <= 1e-12;
}

export function validateInteractionArtifact(value: unknown): InteractionPerformanceArtifact {
  if (!object(value)) throw new Error("interaction artifact must be an object");
  const artifact = value as unknown as InteractionPerformanceArtifact;
  if (artifact.protocolVersion !== 1 || artifact.matrixId !== "interaction-full-v1") {
    throw new Error("interaction artifact protocol identity changed");
  }
  const samples = artifact.source?.samples;
  if (
    samples !== 5 ||
    !artifact.source.commit ||
    !artifact.source.runtime ||
    !artifact.source.browser ||
    !artifact.source.cpu ||
    !artifact.source.warmup ||
    !artifact.capturedAt ||
    Number.isNaN(Date.parse(artifact.capturedAt))
  ) {
    throw new Error("interaction artifact provenance is incomplete");
  }
  if (!artifact.source.correctness)
    throw new Error("interaction artifact lacks a correctness oracle");
  for (const [path, sample] of [
    [
      "directionalPrefetch.residencyRatioSamples",
      artifact.directionalPrefetch?.residencyRatioSamples,
    ],
    [
      "directionalPrefetch.p95VisibleWaitMsSamples",
      artifact.directionalPrefetch?.p95VisibleWaitMsSamples,
    ],
    [
      "directionalPrefetch.requestedRowMultiplierSamples",
      artifact.directionalPrefetch?.requestedRowMultiplierSamples,
    ],
    [
      "viewIndex.baseline.lookupMedianNsSamples",
      artifact.viewIndex?.baseline?.lookupMedianNsSamples,
    ],
    ["viewIndex.baseline.lookupP95NsSamples", artifact.viewIndex?.baseline?.lookupP95NsSamples],
    ["viewIndex.packed.lookupMedianNsSamples", artifact.viewIndex?.packed?.lookupMedianNsSamples],
    ["viewIndex.packed.lookupP95NsSamples", artifact.viewIndex?.packed?.lookupP95NsSamples],
    ["coldRoute.before.usableMsSamples", artifact.coldRoute?.before?.usableMsSamples],
    [
      "coldRoute.before.sheetwriteLongTaskMsSamples",
      artifact.coldRoute?.before?.sheetwriteLongTaskMsSamples,
    ],
    ["coldRoute.after.usableMsSamples", artifact.coldRoute?.after?.usableMsSamples],
    [
      "coldRoute.after.sheetwriteLongTaskMsSamples",
      artifact.coldRoute?.after?.sheetwriteLongTaskMsSamples,
    ],
    ["coldRoute.after.routeCpuMsSamples", artifact.coldRoute?.after?.routeCpuMsSamples],
    ["coldRoute.after.gridBuildCpuMsSamples", artifact.coldRoute?.after?.gridBuildCpuMsSamples],
    [
      "coldRoute.after.reportedUnattributedLongTaskMsSamples",
      artifact.coldRoute?.after?.reportedUnattributedLongTaskMsSamples,
    ],
  ] as const) {
    finiteSamples(sample, samples, path);
  }
  const residencyMedian = median(artifact.directionalPrefetch.residencyRatioSamples);
  const waitMedian = median(artifact.directionalPrefetch.p95VisibleWaitMsSamples);
  if (
    artifact.directionalPrefetch.sourceLatencyMs !== 90 ||
    !sameRatio(artifact.directionalPrefetch.medianResidencyRatio, residencyMedian) ||
    !sameRatio(artifact.directionalPrefetch.medianP95VisibleWaitMs, waitMedian) ||
    residencyMedian < 0.95 ||
    waitMedian >= 16.7
  ) {
    throw new Error("directional prefetch gate failed");
  }
  const baselineMedian = median(artifact.viewIndex.baseline.lookupMedianNsSamples);
  const packedMedian = median(artifact.viewIndex.packed.lookupMedianNsSamples);
  const baselineP95 = median(artifact.viewIndex.baseline.lookupP95NsSamples);
  const packedP95 = median(artifact.viewIndex.packed.lookupP95NsSamples);
  const medianImprovement = 1 - packedMedian / baselineMedian;
  const p95Regression = packedP95 / baselineP95 - 1;
  const heapReduction =
    1 - artifact.viewIndex.packed.retainedBytes / artifact.viewIndex.baseline.retainedBytes;
  if (
    artifact.viewIndex.rows !== 1_000_000 ||
    artifact.viewIndex.packed.backingBytes > artifact.viewIndex.rows * 4 ||
    !sameRatio(artifact.viewIndex.retainedHeapReductionRatio, heapReduction) ||
    !sameRatio(artifact.viewIndex.medianLookupImprovementRatio, medianImprovement) ||
    !sameRatio(artifact.viewIndex.p95LookupRegressionRatio, p95Regression) ||
    heapReduction < 0.5 ||
    medianImprovement < 0.2 ||
    p95Regression > 0.1
  ) {
    throw new Error("packed view-index gate failed");
  }
  const dirtyReduction =
    1 - artifact.sparseDirty.dirty100Bytes / artifact.sparseDirty.baseline100Bytes;
  if (
    artifact.sparseDirty.dirty100Bytes > 1024 * 1024 ||
    !sameRatio(artifact.sparseDirty.dirty100ReductionRatio, dirtyReduction) ||
    dirtyReduction < 0.8 ||
    artifact.sparseDirty.dirty100CleanChunks !== 0 ||
    artifact.sparseDirty.dirty10000CleanChunks !== 0
  ) {
    throw new Error("sparse dirty-state gate failed");
  }
  const usableImprovement =
    1 -
    median(artifact.coldRoute.after.usableMsSamples) /
      median(artifact.coldRoute.before.usableMsSamples);
  const coldPassed = artifact.coldRoute.after.sheetwriteLongTaskMsSamples.every(
    (duration) => duration <= artifact.coldRoute.sheetwriteLongTaskCeilingMs,
  );
  if (
    artifact.coldRoute.sheetwriteLongTaskCeilingMs !== 50 ||
    artifact.coldRoute.sheetwriteLongTaskGatePassed !== coldPassed ||
    !sameRatio(artifact.coldRoute.medianUsableImprovementRatio, usableImprovement) ||
    !coldPassed
  ) {
    throw new Error("cold-route Sheetwrite long-task gate failed");
  }
  return artifact;
}
