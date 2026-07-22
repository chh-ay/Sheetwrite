import { open } from "node:fs/promises";
import type { ConformanceProducer, ResultType } from "./types.js";
import { isNonemptyString, isObject } from "./normalize.js";

const SECRET_KEY = /(?:token|secret|password|authorization|cookie|client[_-]?secret)/i;
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9.-]+$/;
const CELL = /^[A-Z]+[1-9][0-9]*$/;
const RESULT_TYPES: readonly ResultType[] = [
  "blank",
  "boolean",
  "number",
  "string",
  "error",
  "array",
  "workbook",
  "unsupported",
];
const AREAS: readonly string[] = ["formula", "mutation", "workbook", "xlsx"];
const DIALECTS: readonly string[] = ["shared", "excel", "google-sheets", "openformula"];
const AUTHORSHIP: readonly string[] = ["original", "spec-derived", "producer-observation"];
export const CONFORMANCE_PRODUCERS: readonly ConformanceProducer[] = [
  "excel-desktop",
  "excel-web",
  "google-sheets",
  "libreoffice",
  "sheetwrite",
];
const RESULT_KEYS = [
  "type",
  "value",
  "error",
  "rows",
  "columns",
  "displayedText",
  "formula",
  "tolerance",
] as const;
const CASE_KEYS = [
  "id",
  "area",
  "dialect",
  "kind",
  "source",
  "inputs",
  "formula",
  "numberFormat",
  "target",
  "operations",
  "expected",
  "observations",
  "knownDivergence",
  "unsupported",
] as const;
const TOLERANCE_KEYS = ["kind", "value"] as const;
const DIVERGENCE_KEYS = ["reason", "producers", "alternate"] as const;
const CORPUS_KEYS = ["protocol", "license", "cases"] as const;
const SOURCE_KEYS = [
  "title",
  "section",
  "url",
  "sha256",
  "license",
  "authorship",
  "notice",
] as const;
const INPUT_KEYS = ["cell", "value"] as const;
const OBSERVATION_KEYS = [
  "producer",
  "producerVersion",
  "capturedAt",
  "status",
  "result",
  "artifactSha256",
  "notes",
] as const;
const EMPTY_ARTIFACTS = new Set<string>();

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${path}.${key}: unknown field`);
  }
}

export function scanSecrets(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanSecrets(child, `${path}[${index}]`, issues));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && SECRET_VALUE.test(value)) {
      issues.push(`${path}: secret-like value`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) issues.push(`${path}.${key}: secret-like field name`);
    scanSecrets(child, `${path}.${key}`, issues);
  }
}

export function validateResult(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value) || !RESULT_TYPES.includes(value.type as ResultType)) {
    issues.push(`${path}.type: ambiguous or missing result type`);
    return;
  }
  rejectUnknownKeys(value, RESULT_KEYS, path, issues);
  const type = value.type as ResultType;
  if (type === "number" && (typeof value.value !== "number" || !Number.isFinite(value.value))) {
    issues.push(`${path}.value: expected finite number`);
  }
  if (type === "boolean" && typeof value.value !== "boolean") {
    issues.push(`${path}.value: expected boolean`);
  }
  if (type === "string" && typeof value.value !== "string") {
    issues.push(`${path}.value: expected string`);
  }
  if (type === "error" && !isNonemptyString(value.error)) {
    issues.push(`${path}.error: expected error sentinel`);
  }
  if (type === "array") {
    if (!Array.isArray(value.value)) issues.push(`${path}.value: expected array`);
    if (!Number.isSafeInteger(value.rows) || (value.rows as number) < 1) {
      issues.push(`${path}.rows: expected positive integer`);
    }
    if (!Number.isSafeInteger(value.columns) || (value.columns as number) < 1) {
      issues.push(`${path}.columns: expected positive integer`);
    }
  }
  if (type === "workbook" && !isObject(value.value)) {
    issues.push(`${path}.value: expected workbook object`);
  }
  if ((type === "blank" || type === "unsupported") && ("value" in value || "error" in value)) {
    issues.push(`${path}: ${type} cannot carry value/error`);
  }
  if (value.tolerance !== undefined) {
    const tolerance = value.tolerance;
    if (
      type !== "number" ||
      !isObject(tolerance) ||
      !["absolute", "relative", "ulp"].includes(String(tolerance.kind)) ||
      typeof tolerance.value !== "number" ||
      !Number.isFinite(tolerance.value) ||
      tolerance.value < 0
    ) {
      issues.push(`${path}.tolerance: invalid numeric tolerance`);
    }
    if (isObject(tolerance)) {
      rejectUnknownKeys(tolerance, TOLERANCE_KEYS, `${path}.tolerance`, issues);
    }
  }
}

function validateDivergence(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) {
    issues.push(`${path}: expected exact divergence object`);
    return;
  }
  rejectUnknownKeys(value, DIVERGENCE_KEYS, path, issues);
  if (!isNonemptyString(value.reason)) issues.push(`${path}.reason: required`);
  if (!Array.isArray(value.producers) || value.producers.length === 0) {
    issues.push(`${path}.producers: expected non-empty producer list`);
  } else {
    const seen = new Set<string>();
    value.producers.forEach((producer, index) => {
      if (
        !CONFORMANCE_PRODUCERS.includes(producer as ConformanceProducer) ||
        producer === "sheetwrite"
      ) {
        issues.push(`${path}.producers[${index}]: invalid external producer`);
      } else if (seen.has(String(producer))) {
        issues.push(`${path}.producers[${index}]: duplicate producer`);
      }
      seen.add(String(producer));
    });
  }
  validateResult(value.alternate, `${path}.alternate`, issues);
}

/** Validate the legal, typed corpus and fail reviewed claims without verified artifact hashes. */
export function validateCorpus(
  value: unknown,
  verifiedArtifacts: ReadonlySet<string> = EMPTY_ARTIFACTS,
): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return ["corpus: expected object"];
  rejectUnknownKeys(value, CORPUS_KEYS, "corpus", issues);
  if (value.protocol !== 1) issues.push("protocol: expected 1");
  if (!isNonemptyString(value.license)) issues.push("license: required");
  if (!Array.isArray(value.cases)) return [...issues, "cases: expected array"];
  const ids = new Set<string>();
  value.cases.forEach((entry, index) => {
    const path = `cases[${index}]`;
    if (!isObject(entry)) {
      issues.push(`${path}: expected object`);
      return;
    }
    rejectUnknownKeys(entry, CASE_KEYS, path, issues);
    if (!AREAS.includes(String(entry.area))) issues.push(`${path}.area: invalid`);
    if (!DIALECTS.includes(String(entry.dialect))) issues.push(`${path}.dialect: invalid`);
    if (!isNonemptyString(entry.id) || !ID.test(entry.id))
      issues.push(`${path}.id: invalid stable ID`);
    else if (ids.has(entry.id)) issues.push(`${path}.id: duplicate ${entry.id}`);
    else ids.add(entry.id);
    if (!isObject(entry.source)) issues.push(`${path}.source: required`);
    else {
      rejectUnknownKeys(entry.source, SOURCE_KEYS, `${path}.source`, issues);
      if (!AUTHORSHIP.includes(String(entry.source.authorship))) {
        issues.push(`${path}.source.authorship: invalid`);
      }
      for (const key of ["title", "section", "license", "authorship"] as const) {
        if (!isNonemptyString(entry.source[key])) issues.push(`${path}.source.${key}: required`);
      }
      if (
        entry.source.url !== undefined &&
        !SHA256_PATTERN.test(String(entry.source.sha256 ?? ""))
      ) {
        issues.push(`${path}.source.sha256: URL sources require a pinned checksum`);
      }
    }
    if (entry.kind === "formula") {
      if (!isNonemptyString(entry.formula) || !entry.formula.startsWith("=")) {
        issues.push(`${path}.formula: required`);
      }
      if (entry.numberFormat !== undefined && !isNonemptyString(entry.numberFormat)) {
        issues.push(`${path}.numberFormat: expected non-empty string`);
      }
      if (!isNonemptyString(entry.target) || !CELL.test(entry.target)) {
        issues.push(`${path}.target: invalid A1 cell`);
      }
      if (!Array.isArray(entry.inputs)) issues.push(`${path}.inputs: required`);
      if (Array.isArray(entry.inputs)) {
        entry.inputs.forEach((input, inputIndex) => {
          if (!isObject(input)) {
            issues.push(`${path}.inputs[${inputIndex}]: expected object`);
            return;
          }
          rejectUnknownKeys(input, INPUT_KEYS, `${path}.inputs[${inputIndex}]`, issues);
          if (!isNonemptyString(input.cell) || !CELL.test(input.cell)) {
            issues.push(`${path}.inputs[${inputIndex}].cell: invalid A1 cell`);
          }
          if (
            input.value !== null &&
            !["string", "number", "boolean"].includes(typeof input.value)
          ) {
            issues.push(`${path}.inputs[${inputIndex}].value: invalid scalar`);
          }
        });
      }
    } else if (entry.kind === "workbook") {
      if (!Array.isArray(entry.operations)) issues.push(`${path}.operations: required`);
    } else issues.push(`${path}.kind: invalid`);
    validateResult(entry.expected, `${path}.expected`, issues);
    if (entry.knownDivergence !== undefined) {
      validateDivergence(entry.knownDivergence, `${path}.knownDivergence`, issues);
    }
    if (
      entry.unsupported === true &&
      isObject(entry.expected) &&
      entry.expected.type !== "unsupported"
    ) {
      issues.push(`${path}: unsupported case cannot render as pass`);
    }
    if (
      isObject(entry.expected) &&
      entry.expected.type === "unsupported" &&
      entry.unsupported !== true
    ) {
      issues.push(`${path}.unsupported: must be true for unsupported expectation`);
    }
    if (!Array.isArray(entry.observations)) issues.push(`${path}.observations: required`);
    else {
      entry.observations.forEach((observation, observationIndex) => {
        const observationPath = `${path}.observations[${observationIndex}]`;
        if (!isObject(observation)) {
          issues.push(`${observationPath}: expected object`);
          return;
        }
        rejectUnknownKeys(observation, OBSERVATION_KEYS, observationPath, issues);
        if (!CONFORMANCE_PRODUCERS.includes(observation.producer as ConformanceProducer)) {
          issues.push(`${observationPath}.producer: invalid`);
        }
        if (!isNonemptyString(observation.producerVersion)) {
          issues.push(`${observationPath}.producerVersion: required`);
        }
        if (
          !isNonemptyString(observation.capturedAt) ||
          Number.isNaN(Date.parse(observation.capturedAt))
        ) {
          issues.push(`${observationPath}.capturedAt: invalid timestamp`);
        }
        if (observation.status === "reviewed" || observation.status === "provisional") {
          validateResult(observation.result, `${observationPath}.result`, issues);
          const artifactHash = String(observation.artifactSha256 ?? "");
          if (!SHA256_PATTERN.test(artifactHash)) {
            issues.push(`${observationPath}.artifactSha256: required`);
          } else if (observation.status === "reviewed" && !verifiedArtifacts.has(artifactHash)) {
            issues.push(`${observationPath}.artifactSha256: no verified immutable capture binding`);
          }
        } else if (observation.status === "unavailable") {
          if (!isNonemptyString(observation.notes) || observation.result !== undefined) {
            issues.push(`${observationPath}: unavailable observations require notes and no result`);
          }
        } else issues.push(`${observationPath}.status: invalid`);
      });
    }
  });
  scanSecrets(value, "corpus", issues);
  return issues;
}

const MAX_CORPUS_BYTES = 2 * 1024 * 1024;

export async function readCorpusJson(path: string): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new TypeError(`Conformance corpus is not a regular file: ${path}`);
    if (info.size > MAX_CORPUS_BYTES) {
      throw new RangeError(`Conformance corpus exceeds ${MAX_CORPUS_BYTES} bytes`);
    }
    const bytes = await handle.readFile();
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}
