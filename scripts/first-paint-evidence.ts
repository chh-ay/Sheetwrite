import { readFile } from "node:fs/promises";
import { type BundlerProvenance, SIZE_PROTOCOL_VERSION } from "./size-report.js";

export const FIRST_PAINT_BROTLI_GATE_BYTES = 7_680;
export const FIRST_PAINT_PERCENT_GATE = 10;
export const FIRST_PAINT_MIN_ROUNDS = 10;
export const FIRST_PAINT_DEFERRED_MODULE = "@sheetwrite/core/dist/clipboard-controller.js";

export interface FirstPaintSizes {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
}
export interface FirstPaintDelta {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  brotliPercent: number;
}

export interface FirstPaintTiming {
  samplesMs: number[];
  medianMs: number;
  p95Ms: number;
}

export interface FirstPaintVariant {
  initialJavaScript: FirstPaintSizes;
  timing: FirstPaintTiming;
  checksum: string;
}

export interface FirstPaintFixtureEvidence {
  bundler: "next" | "vite";
  version: string;
  provenance: BundlerProvenance;
  eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"];
  baseline: FirstPaintVariant;
  candidate: FirstPaintVariant & {
    deferredChunk: string;
    interaction: {
      module: typeof FIRST_PAINT_DEFERRED_MODULE;
      loaded: true;
      successOutcome: "empty";
      errorOutcome: "unsupported";
      rejected: false;
    };
  };
  delta: FirstPaintDelta;
}

export interface FirstPaintEvidence {
  schemaVersion: typeof SIZE_PROTOCOL_VERSION;
  kind: "first-paint-counterfactual";
  candidate: {
    fixtureOnly: true;
    shipping: false;
    deferredModules: [typeof FIRST_PAINT_DEFERRED_MODULE];
  };
  thresholds: {
    brotliBytes: typeof FIRST_PAINT_BROTLI_GATE_BYTES;
    percent: typeof FIRST_PAINT_PERCENT_GATE;
    timing: "median-and-p95-no-slower";
  };
  fixtures: [FirstPaintFixtureEvidence, FirstPaintFixtureEvidence];
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sizes(value: unknown, label: string, allowZero = false): FirstPaintSizes {
  const input = record(value, `${label} sizes are missing`);
  for (const field of ["rawBytes", "gzipBytes", "brotliBytes"] as const) {
    if (
      !(allowZero
        ? Number.isSafeInteger(input[field]) && (input[field] as number) >= 0
        : positiveInteger(input[field]))
    ) {
      throw new Error(`${label} ${field} is missing or invalid`);
    }
  }
  return input as unknown as FirstPaintSizes;
}

function signedSizes(value: unknown, label: string): FirstPaintSizes {
  const input = record(value, `${label} sizes are missing`);
  for (const field of ["rawBytes", "gzipBytes", "brotliBytes"] as const) {
    if (!Number.isSafeInteger(input[field])) {
      throw new Error(`${label} ${field} is missing or invalid`);
    }
  }
  return input as unknown as FirstPaintSizes;
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}

function timing(value: unknown, label: string): FirstPaintTiming {
  const input = record(value, `${label} timing is missing`);
  if (
    !Array.isArray(input.samplesMs) ||
    input.samplesMs.length < FIRST_PAINT_MIN_ROUNDS ||
    !input.samplesMs.every(finiteNonNegative)
  ) {
    throw new Error(`${label} timing requires ${FIRST_PAINT_MIN_ROUNDS} finite samples`);
  }
  const samplesMs = [...input.samplesMs].sort((left, right) => left - right) as number[];
  const middle = Math.floor(samplesMs.length / 2);
  const expectedMedian =
    samplesMs.length % 2 === 0
      ? (samplesMs[middle - 1]! + samplesMs[middle]!) / 2
      : samplesMs[middle]!;
  const expectedP95 = percentile(samplesMs, 0.95);
  if (input.medianMs !== expectedMedian || input.p95Ms !== expectedP95) {
    throw new Error(`${label} timing summary does not match retained samples`);
  }
  return { samplesMs: input.samplesMs as number[], medianMs: expectedMedian, p95Ms: expectedP95 };
}

function variant(value: unknown, label: string): FirstPaintVariant {
  const input = record(value, `${label} variant is missing`);
  if (typeof input.checksum !== "string" || !/^[a-f0-9]{64}$/.test(input.checksum)) {
    throw new Error(`${label} checksum is missing or invalid`);
  }
  return {
    initialJavaScript: sizes(input.initialJavaScript, `${label} initial JavaScript`),
    timing: timing(input.timing, `${label} first paint`),
    checksum: input.checksum,
  };
}

function provenance(value: unknown, label: string): BundlerProvenance {
  const input = record(value, `${label} provenance is missing`);
  const minifier = record(input.minifier, `${label} minifier is missing`);
  if (
    input.buildMode !== "production" ||
    input.minified !== true ||
    typeof minifier.name !== "string" ||
    minifier.name.length === 0 ||
    typeof minifier.version !== "string" ||
    minifier.version.length === 0 ||
    !Array.isArray(input.externals) ||
    !input.externals.every((entry) => typeof entry === "string") ||
    input.target !== "browser" ||
    input.sourceMaps !== "hidden-external" ||
    input.attributionMethod !== "source-map-generated-spans-with-explicit-opaque-assets-v2"
  ) {
    throw new Error(`${label} provenance is incomplete or incomparable`);
  }
  return input as unknown as BundlerProvenance;
}

export function validateFirstPaintEvidence(value: unknown): FirstPaintEvidence {
  const input = record(value, "First-paint evidence is malformed");
  if (
    input.schemaVersion !== SIZE_PROTOCOL_VERSION ||
    input.kind !== "first-paint-counterfactual"
  ) {
    throw new Error("First-paint evidence protocol mismatch");
  }
  const candidate = record(input.candidate, "First-paint candidate metadata is missing");
  if (
    candidate.fixtureOnly !== true ||
    candidate.shipping !== false ||
    !Array.isArray(candidate.deferredModules) ||
    candidate.deferredModules.length !== 1 ||
    candidate.deferredModules[0] !== FIRST_PAINT_DEFERRED_MODULE
  ) {
    throw new Error("First-paint candidate must be fixture-only and name its deferred module");
  }
  const thresholds = record(input.thresholds, "First-paint thresholds are missing");
  if (
    thresholds.brotliBytes !== FIRST_PAINT_BROTLI_GATE_BYTES ||
    thresholds.percent !== FIRST_PAINT_PERCENT_GATE ||
    thresholds.timing !== "median-and-p95-no-slower"
  ) {
    throw new Error("First-paint thresholds do not match the admission contract");
  }
  if (!Array.isArray(input.fixtures) || input.fixtures.length !== 2) {
    throw new Error("First-paint evidence requires exactly Next.js and Vite fixtures");
  }
  const seen = new Set<string>();
  const fixtures = input.fixtures.map((value, index) => {
    const fixture = record(value, `First-paint fixture ${index} is malformed`);
    if ((fixture.bundler !== "next" && fixture.bundler !== "vite") || seen.has(fixture.bundler)) {
      throw new Error("First-paint evidence requires one Next.js and one Vite fixture");
    }
    seen.add(fixture.bundler);
    if (typeof fixture.version !== "string" || fixture.version.length === 0) {
      throw new Error(`${fixture.bundler} version is missing`);
    }
    const eagerImports = fixture.eagerImports;
    if (
      !Array.isArray(eagerImports) ||
      eagerImports.length !== 2 ||
      eagerImports[0] !== "@sheetwrite/core#createGrid" ||
      eagerImports[1] !== "@sheetwrite/core#initSheetwrite"
    ) {
      throw new Error(`${fixture.bundler} eager surface is not comparable`);
    }
    const baseline = variant(fixture.baseline, `${fixture.bundler} baseline`);
    const candidateInput = record(fixture.candidate, `${fixture.bundler} candidate is missing`);
    const candidateVariant = variant(candidateInput, `${fixture.bundler} candidate`);
    if (baseline.checksum !== candidateVariant.checksum) {
      throw new Error(`${fixture.bundler} candidate first-paint semantics differ from baseline`);
    }
    if (
      typeof candidateInput.deferredChunk !== "string" ||
      candidateInput.deferredChunk.length === 0
    ) {
      throw new Error(`${fixture.bundler} candidate deferred chunk is missing`);
    }
    const interaction = record(
      candidateInput.interaction,
      `${fixture.bundler} interaction evidence is missing`,
    );
    if (
      interaction.module !== FIRST_PAINT_DEFERRED_MODULE ||
      interaction.loaded !== true ||
      interaction.successOutcome !== "empty" ||
      interaction.errorOutcome !== "unsupported" ||
      interaction.rejected !== false
    ) {
      throw new Error(`${fixture.bundler} interaction loading/error behavior is incomplete`);
    }
    const deltaInput = record(fixture.delta, `${fixture.bundler} size delta is missing`);
    const deltaSizes = signedSizes(deltaInput, `${fixture.bundler} size delta`);
    const expectedDelta = {
      rawBytes: baseline.initialJavaScript.rawBytes - candidateVariant.initialJavaScript.rawBytes,
      gzipBytes:
        baseline.initialJavaScript.gzipBytes - candidateVariant.initialJavaScript.gzipBytes,
      brotliBytes:
        baseline.initialJavaScript.brotliBytes - candidateVariant.initialJavaScript.brotliBytes,
    };
    if (
      deltaSizes.rawBytes !== expectedDelta.rawBytes ||
      deltaSizes.gzipBytes !== expectedDelta.gzipBytes ||
      deltaSizes.brotliBytes !== expectedDelta.brotliBytes ||
      typeof deltaInput.brotliPercent !== "number" ||
      deltaInput.brotliPercent !==
        (expectedDelta.brotliBytes / baseline.initialJavaScript.brotliBytes) * 100
    ) {
      throw new Error(`${fixture.bundler} recorded size delta is inconsistent`);
    }
    return {
      bundler: fixture.bundler,
      version: fixture.version,
      provenance: provenance(fixture.provenance, fixture.bundler),
      eagerImports,
      baseline,
      candidate: {
        ...candidateVariant,
        deferredChunk: candidateInput.deferredChunk,
        interaction,
      },
      delta: { ...deltaSizes, brotliPercent: deltaInput.brotliPercent },
    } as FirstPaintFixtureEvidence;
  });
  if (!seen.has("next") || !seen.has("vite")) {
    throw new Error("First-paint evidence requires one Next.js and one Vite fixture");
  }
  const next = fixtures.find((fixture) => fixture.bundler === "next")!;
  const vite = fixtures.find((fixture) => fixture.bundler === "vite")!;
  for (const field of [
    "buildMode",
    "minified",
    "target",
    "sourceMaps",
    "attributionMethod",
  ] as const) {
    if (next.provenance[field] !== vite.provenance[field]) {
      throw new Error(`First-paint fixture provenance differs in ${field}`);
    }
  }
  if (JSON.stringify(next.provenance.externals) !== JSON.stringify(vite.provenance.externals)) {
    throw new Error("First-paint fixture provenance uses incomparable externals");
  }
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    kind: "first-paint-counterfactual",
    candidate: candidate as unknown as FirstPaintEvidence["candidate"],
    thresholds: thresholds as unknown as FirstPaintEvidence["thresholds"],
    fixtures: fixtures as FirstPaintEvidence["fixtures"],
  };
}

export function firstPaintGate(value: unknown): { admitted: boolean; reasons: string[] } {
  const evidence = validateFirstPaintEvidence(value);
  const reasons: string[] = [];
  for (const fixture of evidence.fixtures) {
    if (fixture.delta.brotliBytes < FIRST_PAINT_BROTLI_GATE_BYTES) {
      reasons.push(
        `${fixture.bundler} Brotli reduction is below ${FIRST_PAINT_BROTLI_GATE_BYTES} bytes`,
      );
    }
    if (fixture.delta.brotliPercent < FIRST_PAINT_PERCENT_GATE) {
      reasons.push(`${fixture.bundler} Brotli reduction is below ${FIRST_PAINT_PERCENT_GATE}%`);
    }
    if (fixture.candidate.timing.medianMs > fixture.baseline.timing.medianMs) {
      reasons.push(`${fixture.bundler} candidate median first paint is slower`);
    }
    if (fixture.candidate.timing.p95Ms > fixture.baseline.timing.p95Ms) {
      reasons.push(`${fixture.bundler} candidate p95 first paint is slower`);
    }
  }
  return { admitted: reasons.length === 0, reasons };
}

if (import.meta.main) {
  if (process.argv[2] !== "check" || process.argv[3] === undefined) {
    throw new Error("Usage: bun scripts/first-paint-evidence.ts check <evidence.json>");
  }
  const evidence = JSON.parse(await readFile(process.argv[3], "utf8")) as unknown;
  const decision = firstPaintGate(evidence);
  if (!decision.admitted) {
    throw new Error(`First-paint candidate rejected:\n${decision.reasons.join("\n")}`);
  }
  console.log("First-paint candidate passed size and timing gates");
}
