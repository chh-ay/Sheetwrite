import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const MATCHED_FORMULA_EVIDENCE_VERSION = 1 as const;
export const MATCHED_FORMULA_PROTOCOL = "formula-corrected-baseline-matched-v1" as const;
export const MATCHED_BOOTSTRAP_RESAMPLES = 100_000 as const;
export const MATCHED_BOOTSTRAP_SEED = 0x5eed as const;
export const MATCHED_CONFIDENCE = 0.95 as const;

const WORKLOADS = [
  "independent-parse-load/1000",
  "error-propagation/1000",
  "scalar-edit-affects-1000/1000",
  "shared-range-edit/1000",
  "removed-sheet-ref/1000",
  "wide-fan-out-edit/1000",
  "wide-fan-out-edit/100000",
] as const;
const ALLOCATION_FIELDS = [
  "allocationAvailable",
  "retainedBytes",
  "retainedDeltaBytes",
  "peakTransientBytes",
  "transientAllocations",
] as const;
type Workload = (typeof WORKLOADS)[number];
type Side = "baseline" | "post94";
type RawSample = {
  ms: number;
  allocationAvailable: boolean;
  retainedBytes: number | null;
  retainedDeltaBytes: number | null;
  peakTransientBytes: number | null;
  transientAllocations: number | null;
};
type RawRound = {
  round: number;
  order: Side[];
  samples: Record<Workload, Record<Side, RawSample>>;
};
export type MatchedRawArtifact = {
  protocol: typeof MATCHED_FORMULA_PROTOCOL;
  harnessSha256: string;
  sides: Record<Side, { commit: string; pkg: string }>;
  releaseBuild: Record<string, unknown>;
  controls: Record<string, unknown>;
  workloadBoundaries: Record<string, string>;
  rounds: RawRound[];
};
type Percentile = { value: number; ciPct: [number, number] };
type WorkloadEvidence = {
  raw: { baselineMs: number[]; candidateMs: number[] };
  median: Percentile;
  p95: Percentile;
  allocation: { exact: true };
};
export type MatchedFormulaEvidence = {
  evidenceVersion: typeof MATCHED_FORMULA_EVIDENCE_VERSION;
  protocol: typeof MATCHED_FORMULA_PROTOCOL;
  candidateCommit: string;
  baselineCommit: string;
  harnessSha256: string;
  rawArtifactSha256: string;
  wasmSha256: { baseline: string; candidate: string };
  releaseBuild: Record<string, unknown>;
  controls: Record<string, unknown>;
  workloadBoundaries: Record<string, string>;
  bootstrap: {
    resamples: number;
    seed: number;
    confidence: number;
    statistic: string;
    pairing: string;
  };
  rounds: RawRound[];
  workloads: Record<Workload, WorkloadEvidence>;
  gates: { passed: boolean; failures: string[]; allocationEquality: true };
};
type BuildOptions = {
  baselineWasmSha256: string;
  candidateWasmSha256: string;
  harnessSha256: string;
  rawArtifactSha256: string;
};

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be finite`);
}
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, sorted.length - 1);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}
function delta(before: readonly number[], after: readonly number[], p: number): number {
  return (percentile(after, p) / percentile(before, p) - 1) * 100;
}
function nextRandom(state: { value: number }): number {
  state.value ^= state.value << 13;
  state.value ^= state.value >>> 17;
  state.value ^= state.value << 5;
  return state.value >>> 0;
}
function bootstrap(
  before: number[],
  after: number[],
  resamples: number,
  seed: number,
  p: number,
): Percentile {
  const estimates = new Array<number>(resamples);
  const sampledBefore = new Array<number>(before.length);
  const sampledAfter = new Array<number>(after.length);
  const state = { value: seed >>> 0 || 1 };
  for (let sample = 0; sample < resamples; sample++) {
    for (let index = 0; index < before.length; index++) {
      const picked = nextRandom(state) % before.length;
      sampledBefore[index] = before[picked]!;
      sampledAfter[index] = after[picked]!;
    }
    estimates[sample] = delta(sampledBefore, sampledAfter, p);
  }
  return {
    value: delta(before, after, p),
    ciPct: [percentile(estimates, 0.025), percentile(estimates, 0.975)],
  };
}
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function exactAllocation(before: RawSample, after: RawSample): boolean {
  return ALLOCATION_FIELDS.every((field) => before[field] === after[field]);
}
function assertRaw(raw: MatchedRawArtifact): void {
  if (raw.protocol !== MATCHED_FORMULA_PROTOCOL)
    throw new Error("unexpected matched formula protocol");
  if (!/^[0-9a-f]{64}$/u.test(raw.harnessSha256)) throw new Error("malformed harness hash");
  if (
    !/^[0-9a-f]{40}$/u.test(raw.sides.baseline.commit) ||
    !/^[0-9a-f]{40}$/u.test(raw.sides.post94.commit) ||
    raw.sides.baseline.commit === raw.sides.post94.commit
  )
    throw new Error("malformed raw commit provenance");
  if (
    JSON.stringify(raw.controls.cpuAffinity) !== JSON.stringify([12]) ||
    raw.controls.concurrency !== 1 ||
    raw.controls.warmupsPerSidePerWorkload !== 1 ||
    raw.controls.alternatingPairs !== 20 ||
    raw.controls.platformProfile !== "performance" ||
    raw.controls.governor !== "powersave" ||
    raw.controls.energyPerformancePreference !== "performance"
  )
    throw new Error("matched formula controls drift");
  if (
    raw.releaseBuild.rust !== "opt-level=3,lto=fat,codegen-units=1" ||
    raw.releaseBuild.wasmOpt !== "-O3" ||
    typeof raw.releaseBuild.bun !== "string"
  )
    throw new Error("matched formula release build drift");
  if (Object.keys(raw.workloadBoundaries).sort().join("|") !== [...WORKLOADS].sort().join("|"))
    throw new Error("workload boundary matrix drift");
  if (!Array.isArray(raw.rounds) || raw.rounds.length !== 20)
    throw new Error("expected exactly 20 rounds");
  for (const [roundIndex, round] of raw.rounds.entries()) {
    if (round.round !== roundIndex + 1) throw new Error("round numbering is not contiguous");
    const expectedOrder: Side[] =
      roundIndex % 2 === 0 ? ["baseline", "post94"] : ["post94", "baseline"];
    if (JSON.stringify(round.order) !== JSON.stringify(expectedOrder))
      throw new Error("round order is not alternating");
    if (Object.keys(round.samples).sort().join("|") !== [...WORKLOADS].sort().join("|"))
      throw new Error("workload matrix drift");
    for (const workload of WORKLOADS) {
      for (const side of ["baseline", "post94"] as const) {
        const sample = round.samples[workload]?.[side];
        if (!sample) throw new Error(`${workload} missing ${side} sample`);
        finite(sample.ms, `${workload}/${side}.ms`);
        if (sample.allocationAvailable !== true)
          throw new Error(`${workload} lacks allocation evidence`);
        for (const field of ALLOCATION_FIELDS.slice(1))
          if (sample[field] !== null) finite(sample[field], `${workload}/${side}.${field}`);
      }
      if (!exactAllocation(round.samples[workload].baseline, round.samples[workload].post94))
        throw new Error(`${workload} allocation mismatch`);
    }
  }
}
function validateHashes(evidence: MatchedFormulaEvidence): void {
  for (const [label, hash] of Object.entries(evidence.wasmSha256))
    if (!/^[0-9a-f]{64}$/u.test(hash)) throw new Error(`malformed ${label} WASM hash`);
  if (!/^[0-9a-f]{64}$/u.test(evidence.harnessSha256))
    throw new Error("malformed evidence harness hash");
  if (!/^[0-9a-f]{64}$/u.test(evidence.rawArtifactSha256))
    throw new Error("malformed raw artifact hash");
  if (
    !/^[0-9a-f]{40}$/u.test(evidence.candidateCommit) ||
    !/^[0-9a-f]{40}$/u.test(evidence.baselineCommit)
  )
    throw new Error("malformed commit provenance");
}
export function buildMatchedEvidence(
  raw: MatchedRawArtifact,
  options: BuildOptions,
): MatchedFormulaEvidence {
  assertRaw(raw);
  const resamples = MATCHED_BOOTSTRAP_RESAMPLES;
  const seed = MATCHED_BOOTSTRAP_SEED;
  if (
    raw.harnessSha256 !== options.harnessSha256 ||
    !/^[0-9a-f]{64}$/u.test(options.rawArtifactSha256)
  )
    throw new Error("raw artifact hash provenance mismatch");
  const workloads = {} as Record<Workload, WorkloadEvidence>;
  const failures: string[] = [];
  for (const workload of WORKLOADS) {
    const baselineMs = raw.rounds.map((round) => round.samples[workload].baseline.ms);
    const candidateMs = raw.rounds.map((round) => round.samples[workload].post94.ms);
    const median = bootstrap(baselineMs, candidateMs, resamples, seed ^ workload.length, 0.5);
    const p95 = bootstrap(baselineMs, candidateMs, resamples, seed ^ workload.length, 0.95);
    const allocation = raw.rounds.every((round) =>
      exactAllocation(round.samples[workload].baseline, round.samples[workload].post94),
    );
    workloads[workload] = {
      raw: { baselineMs, candidateMs },
      median,
      p95,
      allocation: { exact: true },
    };
    if (!allocation) failures.push(`${workload}: allocation mismatch`);
    if (median.ciPct[0] > 0) failures.push(`${workload}: median CI indicates regression`);
    if (p95.ciPct[0] > 0) failures.push(`${workload}: p95 CI indicates regression`);
  }
  const evidence: MatchedFormulaEvidence = {
    evidenceVersion: MATCHED_FORMULA_EVIDENCE_VERSION,
    protocol: MATCHED_FORMULA_PROTOCOL,
    candidateCommit: raw.sides.post94.commit,
    baselineCommit: raw.sides.baseline.commit,
    harnessSha256: options.harnessSha256,
    rawArtifactSha256: options.rawArtifactSha256,
    wasmSha256: { baseline: options.baselineWasmSha256, candidate: options.candidateWasmSha256 },
    releaseBuild: raw.releaseBuild,
    controls: raw.controls,
    workloadBoundaries: raw.workloadBoundaries,
    bootstrap: {
      resamples,
      seed,
      confidence: MATCHED_CONFIDENCE,
      statistic: "candidate percentile / baseline percentile - 1, expressed as percent",
      pairing: "paired alternating rounds; bootstrap resamples whole rounds with replacement",
    },
    rounds: raw.rounds,
    workloads,
    gates: { passed: failures.length === 0, failures, allocationEquality: true },
  };
  validateMatchedEvidence(evidence);
  return evidence;
}
export function validateMatchedEvidence(
  evidence: MatchedFormulaEvidence,
  expectedProvenance?: { rawArtifactSha256?: string; harnessSha256?: string },
): void {
  if (
    evidence.evidenceVersion !== MATCHED_FORMULA_EVIDENCE_VERSION ||
    evidence.protocol !== MATCHED_FORMULA_PROTOCOL
  )
    throw new Error("matched formula evidence version/protocol mismatch");
  validateHashes(evidence);
  if (
    (expectedProvenance?.rawArtifactSha256 !== undefined &&
      evidence.rawArtifactSha256 !== expectedProvenance.rawArtifactSha256) ||
    (expectedProvenance?.harnessSha256 !== undefined &&
      evidence.harnessSha256 !== expectedProvenance.harnessSha256)
  )
    throw new Error("evidence provenance hash mismatch");
  assertRaw({
    protocol: evidence.protocol,
    harnessSha256: evidence.harnessSha256,
    sides: {
      baseline: { commit: evidence.baselineCommit, pkg: "evidence" },
      post94: { commit: evidence.candidateCommit, pkg: "evidence" },
    },
    releaseBuild: evidence.releaseBuild,
    controls: evidence.controls,
    workloadBoundaries: evidence.workloadBoundaries,
    rounds: evidence.rounds,
  });
  if (
    evidence.bootstrap.resamples !== MATCHED_BOOTSTRAP_RESAMPLES ||
    evidence.bootstrap.seed !== MATCHED_BOOTSTRAP_SEED ||
    evidence.bootstrap.confidence !== MATCHED_CONFIDENCE ||
    evidence.bootstrap.statistic !==
      "candidate percentile / baseline percentile - 1, expressed as percent" ||
    evidence.bootstrap.pairing !==
      "paired alternating rounds; bootstrap resamples whole rounds with replacement"
  )
    throw new Error("invalid bootstrap contract");
  if (evidence.gates.allocationEquality !== true)
    throw new Error("allocation equality is not established");
  for (const workload of WORKLOADS) {
    const observed = evidence.workloads[workload];
    if (observed?.raw.baselineMs.length !== 20 || observed.raw.candidateMs.length !== 20)
      throw new Error(`${workload} raw matrix drift`);
    const expectedBaseline = evidence.rounds.map((round) => round.samples[workload].baseline.ms);
    const expectedCandidate = evidence.rounds.map((round) => round.samples[workload].post94.ms);
    if (
      JSON.stringify(observed.raw.baselineMs) !== JSON.stringify(expectedBaseline) ||
      JSON.stringify(observed.raw.candidateMs) !== JSON.stringify(expectedCandidate)
    )
      throw new Error(`${workload} derived raw samples drift`);
    const expectedMedian = bootstrap(
      expectedBaseline,
      expectedCandidate,
      evidence.bootstrap.resamples,
      evidence.bootstrap.seed ^ workload.length,
      0.5,
    );
    const expectedP95 = bootstrap(
      expectedBaseline,
      expectedCandidate,
      evidence.bootstrap.resamples,
      evidence.bootstrap.seed ^ workload.length,
      0.95,
    );
    if (
      JSON.stringify(observed.median) !== JSON.stringify(expectedMedian) ||
      JSON.stringify(observed.p95) !== JSON.stringify(expectedP95)
    )
      throw new Error(`${workload} derived bootstrap statistics drift`);
    if (observed.allocation.exact !== true)
      throw new Error(`${workload} allocation equality missing`);
    if (observed.median.ciPct[0] > 0 || observed.p95.ciPct[0] > 0)
      throw new Error(`${workload} contains an unsupported positive regression CI`);
  }
  if (evidence.gates.passed !== true || evidence.gates.failures.length !== 0)
    throw new Error("matched formula regression gate did not pass");
}
async function main(): Promise<void> {
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2)
    args.set(process.argv[index]!, process.argv[index + 1]!);
  const input = resolve(
    args.get("--input") ??
      new URL("../results/formula-regression-raw.json", import.meta.url).pathname,
  );
  const output = resolve(
    args.get("--output") ??
      new URL("../results/formula-regression-results.json", import.meta.url).pathname,
  );
  const harness = resolve(
    args.get("--harness") ?? new URL("./matched-formula-harness.ts", import.meta.url).pathname,
  );
  const raw = JSON.parse(readFileSync(input, "utf8")) as MatchedRawArtifact;
  if (raw.harnessSha256 !== sha256(harness))
    throw new Error("raw harness hash does not match harness source");
  const evidence = buildMatchedEvidence(raw, {
    baselineWasmSha256: sha256(`${raw.sides.baseline.pkg}/sheetwrite_wasm_bg.wasm`),
    candidateWasmSha256: sha256(`${raw.sides.post94.pkg}/sheetwrite_wasm_bg.wasm`),
    harnessSha256: sha256(harness),
    rawArtifactSha256: sha256(input),
  });
  await Bun.write(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify({ output, candidate: evidence.candidateCommit, passed: evidence.gates.passed }),
  );
}
if (import.meta.main) await main();
