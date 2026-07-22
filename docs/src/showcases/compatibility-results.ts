import type {
  ConformanceCase,
  ConformanceCorpus,
  ConformanceManifest,
  ConformanceObservation,
  KnownDivergence,
  OfflineConformanceResult,
} from "../../../scripts/conformance/types.js";

export type CompatibilityResultStatus =
  | "local-pass"
  | "result-unavailable"
  | "reviewed-pass"
  | "known-difference"
  | "unsupported"
  | "warning"
  | "regression";

export interface CompatibilityResultSource {
  readonly authorship: ConformanceCase["source"]["authorship"];
  readonly license: string;
  readonly section: string;
  readonly sha256: string;
  readonly title: string;
  readonly url: string;
}

export interface CompatibilityResultEvidence {
  readonly basis: ConformanceCase["evidence"]["basis"];
  readonly kind: ConformanceCase["evidence"]["kind"];
  readonly description: string;
}

export interface CompatibilityResultObservation {
  readonly testedApp: ConformanceObservation["producer"];
  readonly version: string;
  readonly capturedAt: string;
  readonly reviewStatus: ConformanceObservation["status"];
  readonly result?: ConformanceObservation["result"];
  readonly evidenceFileChecksum?: string;
  readonly notes?: string;
  readonly differences: readonly string[];
}

export interface CompatibilityResultCase {
  readonly position: number;
  readonly id: string;
  readonly label: string;
  readonly kind: ConformanceCase["kind"];
  readonly area: ConformanceCase["area"];
  readonly category: ConformanceCase["category"];
  readonly family: string;
  readonly behavior: ConformanceCase["dialect"];
  readonly featureValue: string;
  readonly featureLabel: string;
  readonly statusTags: readonly CompatibilityResultStatus[];
  readonly formula?: string;
  readonly target?: string;
  readonly inputs?: ConformanceCase["inputs"];
  readonly operations?: ConformanceCase["operations"];
  readonly expected: ConformanceCase["expected"];
  readonly tolerance: ConformanceCase["tolerance"];
  readonly knownDifference?: KnownDivergence;
  readonly unsupported: boolean;
  readonly sourceIndex: number;
  readonly evidenceIndex: number;
  readonly testChecksum: string;
  readonly observations: readonly CompatibilityResultObservation[];
}

export interface CompatibilityResults {
  readonly schemaVersion: 1;
  readonly testSet: {
    readonly version: number;
    readonly libraryVersion: string;
    readonly checksum: string;
    readonly totalTests: number;
    readonly publishedExamples: number;
    readonly formulaTests: number;
    readonly editSequenceTests: number;
    readonly workbookTests: number;
    readonly localPassed: number;
    readonly reviewedResults: number;
    readonly missingReviewedResults: number;
    readonly unsupported: number;
    readonly warningChecks: number;
    readonly knownDifferences: number;
    readonly regressions: number;
  };
  readonly filterOptions: {
    readonly features: ReadonlyArray<{ readonly value: string; readonly label: string }>;
    readonly behaviors: readonly ConformanceCase["dialect"][];
    readonly statuses: readonly CompatibilityResultStatus[];
  };
  readonly sources: readonly CompatibilityResultSource[];
  readonly evidence: readonly CompatibilityResultEvidence[];
  readonly cases: readonly CompatibilityResultCase[];
}

interface BuildCompatibilityResultsOptions {
  readonly corpus: ConformanceCorpus;
  readonly manifest: ConformanceManifest;
  readonly offline: OfflineConformanceResult;
  readonly libraryVersion: string;
  readonly compareObservation: (
    expected: ConformanceCase["expected"],
    observation: ConformanceObservation,
    knownDifference?: KnownDivergence,
  ) => readonly string[];
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function operationLabel(entry: ConformanceCase): string {
  const operations = (entry.operations ?? [])
    .map((operation) => operation.op)
    .filter((operation): operation is string => typeof operation === "string");
  if (operations.length === 0) return titleCase(entry.feature ?? entry.family);
  const visible = operations.slice(0, 2).map(titleCase).join(" + ");
  return operations.length > 2 ? `${visible} + ${operations.length - 2} more` : visible;
}

function feature(entry: ConformanceCase): { value: string; label: string } {
  if (entry.subject) {
    return {
      value: `${entry.subject.kind}:${entry.subject.name}`,
      label: `${titleCase(entry.subject.kind)} · ${entry.subject.name}`,
    };
  }
  if (entry.kind === "mutation") {
    return { value: "feature:edit-sequences", label: "Feature · Edit sequences" };
  }
  const value = entry.feature === "workbook-canary" ? "workbook-round-trip" : "workbook-changes";
  const label = entry.feature === "workbook-canary" ? "Workbook round-trip" : "Workbook changes";
  return { value: `feature:${value}`, label: `Feature · ${label}` };
}

function caseLabel(entry: ConformanceCase): string {
  if (entry.subject) return `${entry.subject.name} · ${titleCase(entry.category)}`;
  return `${operationLabel(entry)} · ${titleCase(entry.category)}`;
}

function uniqueIndex<Value>(values: Value[], value: Value): number {
  const serialized = JSON.stringify(value);
  const existing = values.findIndex((candidate) => JSON.stringify(candidate) === serialized);
  if (existing >= 0) return existing;
  values.push(value);
  return values.length - 1;
}

export function buildCompatibilityResults({
  corpus,
  manifest,
  offline,
  libraryVersion,
  compareObservation,
}: BuildCompatibilityResultsOptions): CompatibilityResults {
  const expectedTotal =
    manifest.counts.formula + manifest.counts.mutation + manifest.counts.workbook;
  if (corpus.protocol !== manifest.protocol) {
    throw new Error("compatibility test set version does not match its checked summary");
  }
  if (corpus.cases.length !== expectedTotal || manifest.caseSha256.length !== expectedTotal) {
    throw new Error("compatibility test count does not match its checked summary");
  }
  if (offline.checked !== expectedTotal) {
    throw new Error("local compatibility check count does not match the checked test set");
  }

  const sources: CompatibilityResultSource[] = [];
  const evidence: CompatibilityResultEvidence[] = [];
  const unsupportedIds = new Set(offline.unsupported);
  const allCases = corpus.cases.map((entry, index): CompatibilityResultCase => {
    const entryFeature = feature(entry);
    const observations = entry.observations.map(
      (observation): CompatibilityResultObservation => ({
        testedApp: observation.producer,
        version: observation.producerVersion,
        capturedAt: observation.capturedAt,
        reviewStatus: observation.status,
        ...(observation.result ? { result: observation.result } : {}),
        ...(observation.artifactSha256 ? { evidenceFileChecksum: observation.artifactSha256 } : {}),
        ...(observation.notes ? { notes: observation.notes } : {}),
        differences:
          observation.status === "reviewed"
            ? [...compareObservation(entry.expected, observation, entry.knownDivergence)]
            : [],
      }),
    );
    const reviewed = observations.filter((observation) => observation.reviewStatus === "reviewed");
    const statuses: CompatibilityResultStatus[] = [];
    const unsupported = entry.unsupported === true;
    if (unsupported) {
      statuses.push("unsupported");
    } else {
      statuses.push("local-pass");
      if (reviewed.length === 0) statuses.push("result-unavailable");
      if (reviewed.some((observation) => observation.differences.length === 0)) {
        statuses.push("reviewed-pass");
      }
    }
    if (entry.knownDivergence) statuses.push("known-difference");
    if ((entry.operations ?? []).some((operation) => operation.op === "warnings")) {
      statuses.push("warning");
    }
    if (reviewed.some((observation) => observation.differences.length > 0)) {
      statuses.push("regression");
    }

    return {
      position: index + 1,
      id: entry.id,
      label: caseLabel(entry),
      kind: entry.kind,
      area: entry.area,
      category: entry.category,
      family: entry.family,
      behavior: entry.dialect,
      featureValue: entryFeature.value,
      featureLabel: entryFeature.label,
      statusTags: statuses,
      ...(entry.formula ? { formula: entry.formula } : {}),
      ...(entry.target ? { target: entry.target } : {}),
      ...(entry.inputs ? { inputs: entry.inputs } : {}),
      ...(entry.operations ? { operations: entry.operations } : {}),
      expected: entry.expected,
      tolerance: entry.tolerance,
      ...(entry.knownDivergence ? { knownDifference: entry.knownDivergence } : {}),
      unsupported,
      sourceIndex: uniqueIndex(sources, entry.source),
      evidenceIndex: uniqueIndex(evidence, {
        basis: entry.evidence.basis,
        kind: entry.evidence.kind,
        description: entry.evidence.oracle,
      }),
      testChecksum: manifest.caseSha256[index]!,
      observations,
    };
  });

  const actualUnsupported = allCases.filter((entry) => entry.unsupported).length;
  if (actualUnsupported !== unsupportedIds.size) {
    throw new Error("unsupported compatibility count does not match the local check result");
  }
  for (const entry of allCases) {
    if (entry.unsupported !== unsupportedIds.has(entry.id)) {
      throw new Error(`unsupported compatibility result drifted for ${entry.id}`);
    }
  }
  const missingReviewed = allCases.filter(
    (entry) => !entry.unsupported && entry.statusTags.includes("result-unavailable"),
  ).length;
  if (missingReviewed !== offline.deferred) {
    throw new Error("missing reviewed result count does not match the local check result");
  }

  const featureOptions = new Map<string, string>();
  for (const entry of allCases) featureOptions.set(entry.featureValue, entry.featureLabel);
  const statuses = [
    "local-pass",
    "result-unavailable",
    "reviewed-pass",
    "known-difference",
    "unsupported",
    "warning",
    "regression",
  ] as const satisfies readonly CompatibilityResultStatus[];

  const selectedIds = new Set<string>();
  const selectedFeatures = new Set<string>();
  for (const entry of allCases) {
    if (selectedFeatures.has(entry.featureValue)) continue;
    selectedFeatures.add(entry.featureValue);
    selectedIds.add(entry.id);
  }
  for (const status of statuses) {
    const representative = allCases.find((entry) => entry.statusTags.includes(status));
    if (representative) selectedIds.add(representative.id);
  }
  for (const kind of ["formula", "mutation", "workbook"] as const) {
    const representative = allCases.find((entry) => entry.kind === kind);
    if (representative) selectedIds.add(representative.id);
  }
  for (const category of [
    "normal",
    "empty",
    "mixed",
    "error",
    "boundary",
    "range-array",
    "mutation",
  ] as const) {
    const representative = allCases.find((entry) => entry.category === category);
    if (representative) selectedIds.add(representative.id);
  }
  const cases = allCases.filter((entry) => selectedIds.has(entry.id));

  return {
    schemaVersion: 1,
    testSet: {
      version: corpus.protocol,
      libraryVersion,
      checksum: manifest.corpusSha256,
      totalTests: expectedTotal,
      publishedExamples: cases.length,
      formulaTests: manifest.counts.formula,
      editSequenceTests: manifest.counts.mutation,
      workbookTests: manifest.counts.workbook,
      localPassed: offline.checked - offline.unsupported.length,
      reviewedResults: offline.reviewed,
      missingReviewedResults: offline.deferred,
      unsupported: offline.unsupported.length,
      warningChecks: allCases.filter((entry) => entry.statusTags.includes("warning")).length,
      knownDifferences: allCases.filter((entry) => entry.statusTags.includes("known-difference"))
        .length,
      regressions: allCases.filter((entry) => entry.statusTags.includes("regression")).length,
    },
    filterOptions: {
      features: [...featureOptions].map(([value, label]) => ({ value, label })),
      behaviors: [...new Set(allCases.map((entry) => entry.behavior))],
      statuses,
    },
    sources,
    evidence,
    cases,
  };
}
