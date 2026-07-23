import { open } from "node:fs/promises";
import {
  FEATURE_MINIMUM,
  generateConformanceEvidence,
  MAX_CORPUS_BYTES,
  MUTATION_FEATURES,
  REQUIRED_CATEGORIES,
  REQUIRED_COUNTS,
  supportedNamesChecksum,
  WORKBOOK_FEATURES,
} from "./generate.js";
import { canonicalJson, isNonemptyString, isObject, sha256 } from "./normalize.js";
import type {
  ConformanceProducer,
  FormulaInventory,
  ResultType,
  SemanticCategory,
} from "./types.js";

const SECRET_KEY = /(?:token|secret|password|authorization|cookie|client[_-]?secret)/i;
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9.-]+$/;
const INVENTORY_FUNCTION = /^[A-Z][A-Z0-9.]*$/;
const INVENTORY_OPERATOR = /^[a-z][a-z0-9-]*$/;
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
const AREAS = ["formula", "mutation", "workbook", "xlsx"] as const;
const DIALECTS = ["shared", "excel", "google-sheets", "openformula"] as const;
const AUTHORSHIP = ["original", "spec-derived", "producer-observation"] as const;
const EVIDENCE_KINDS = ["property", "metamorphic", "pinned-observation"] as const;
const EVIDENCE_BASES = [
  "documented-semantics",
  "property-invariant",
  "producer-observation",
] as const;
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
  "feature",
  "dialect",
  "category",
  "family",
  "kind",
  "subject",
  "source",
  "evidence",
  "tolerance",
  "inputs",
  "formula",
  "numberFormat",
  "target",
  "operations",
  "expected",
  "observations",
  "knownDivergence",
  "unsupported",
  "localCanary",
] as const;
const RESULT_TOLERANCE_KEYS = ["kind", "value"] as const;
const CASE_TOLERANCE_KEYS = ["kind", "value"] as const;
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
const EVIDENCE_KEYS = ["kind", "basis", "oracle"] as const;
const SUBJECT_KEYS = ["kind", "name"] as const;
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
const MANIFEST_KEYS = [
  "protocol",
  "generator",
  "generatorVersion",
  "corpusPath",
  "corpusSha256",
  "inventoryPath",
  "inventorySha256",
  "supportedNamesSha256",
  "categoriesSha256",
  "operationShapesSha256",
  "featureCounts",
  "caseSha256",
  "counts",
  "minimums",
] as const;
const MANIFEST_COUNT_KEYS = [
  "formula",
  "mutation",
  "workbook",
  "localCanary",
  "supportedFunctions",
  "supportedOperators",
] as const;
const MINIMUM_KEYS = ["formula", "mutation", "workbook"] as const;
const OPERATION_KEYS = ["op"] as const;
const EMPTY_ARTIFACTS = new Set<string>();

function functionInvocationContains(formula: string, name: string, marker: string): boolean {
  let start = formula.indexOf(`${name}(`);
  while (start >= 0) {
    let depth = 0;
    let quoted = false;
    for (let index = start + name.length; index < formula.length; index += 1) {
      const character = formula[index]!;
      if (character === '"') quoted = !quoted;
      else if (!quoted && character === "(") depth += 1;
      else if (!quoted && character === ")" && --depth === 0) {
        if (formula.slice(start, index + 1).includes(marker)) return true;
        start = formula.indexOf(`${name}(`, index + 1);
        break;
      }
    }
    if (depth > 0) return false;
  }
  return false;
}

function canonicalFormula(formula: string): string {
  let canonical = "";
  let quoted = false;
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index]!;
    if (character === '"' && quoted && formula[index + 1] === '"') {
      canonical += '""';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
      canonical += character;
    } else {
      canonical += quoted ? character : character.toUpperCase();
    }
  }
  return canonical;
}

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
    value.forEach((child, index) => {
      scanSecrets(child, `${path}[${index}]`, issues);
    });
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
      rejectUnknownKeys(tolerance, RESULT_TOLERANCE_KEYS, `${path}.tolerance`, issues);
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

interface InventoryDenominator {
  inventory: FormulaInventory | undefined;
  functions: Map<string, { family: string; signature: string }>;
  operators: Map<string, { family: string; token: string; fixity: string }>;
}

function validateInventory(value: unknown, issues: string[]): InventoryDenominator {
  const denominator: InventoryDenominator = {
    inventory: undefined,
    functions: new Map(),
    operators: new Map(),
  };
  if (!isObject(value)) {
    issues.push("inventory: required for supported-name denominator validation");
    return denominator;
  }
  if (value.contract !== "sheetwrite.formula-capabilities" || value.version !== 1) {
    issues.push("inventory: invalid formula capability contract/version");
  }
  if (!isObject(value.sources) || !isObject(value.families)) {
    issues.push("inventory: sources and families are required");
    return denominator;
  }
  if (!Array.isArray(value.functions) || !Array.isArray(value.operators)) {
    issues.push("inventory: typed functions and operators are required denominators");
    return denominator;
  }
  for (const [index, entry] of value.functions.entries()) {
    const path = `inventory.functions[${index}]`;
    if (
      !isObject(entry) ||
      !INVENTORY_FUNCTION.test(String(entry.canonical)) ||
      !isNonemptyString(entry.family)
    ) {
      issues.push(`${path}: invalid supported function identity/family`);
      continue;
    }
    if (entry.contractStatus !== "supported" && entry.contractStatus !== "required-supported") {
      issues.push(`${path}.contractStatus: unsupported entry in supported denominator`);
      continue;
    }
    if (denominator.functions.has(String(entry.canonical))) {
      issues.push(`${path}.canonical: duplicate ${String(entry.canonical)}`);
    } else {
      denominator.functions.set(String(entry.canonical), {
        family: String(entry.family),
        signature: String(entry.signature ?? ""),
      });
    }
  }
  for (const [index, entry] of value.operators.entries()) {
    const path = `inventory.operators[${index}]`;
    if (
      !isObject(entry) ||
      !INVENTORY_OPERATOR.test(String(entry.canonical)) ||
      !isNonemptyString(entry.token) ||
      !["prefix", "infix", "postfix"].includes(String(entry.fixity)) ||
      entry.family !== "operator"
    ) {
      issues.push(`${path}: invalid supported operator identity`);
      continue;
    }
    if (entry.contractStatus !== "supported" && entry.contractStatus !== "required-supported") {
      issues.push(`${path}.contractStatus: unsupported entry in supported denominator`);
      continue;
    }
    if (denominator.operators.has(String(entry.canonical))) {
      issues.push(`${path}.canonical: duplicate ${String(entry.canonical)}`);
    } else {
      denominator.operators.set(String(entry.canonical), {
        family: "operator",
        token: String(entry.token),
        fixity: String(entry.fixity),
      });
    }
  }
  denominator.inventory = value as FormulaInventory;
  return denominator;
}

function sourcePayload(source: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of ["title", "section", "url", "license", "authorship", "notice"] as const) {
    if (source[key] !== undefined) payload[key] = source[key];
  }
  return payload;
}

function validateSource(value: unknown, path: string, issues: string[]): string | undefined {
  if (!isObject(value)) {
    issues.push(`${path}: required`);
    return undefined;
  }
  rejectUnknownKeys(value, SOURCE_KEYS, path, issues);
  for (const key of ["title", "section", "url", "license", "authorship"] as const) {
    if (!isNonemptyString(value[key])) issues.push(`${path}.${key}: required`);
  }
  if (!AUTHORSHIP.includes(value.authorship as (typeof AUTHORSHIP)[number])) {
    issues.push(`${path}.authorship: invalid`);
  }
  if (!isNonemptyString(value.url) || !value.url.startsWith("https://")) {
    issues.push(`${path}.url: required HTTPS source URL`);
  }
  if (!SHA256_PATTERN.test(String(value.sha256 ?? ""))) {
    issues.push(`${path}.sha256: source descriptor checksum required`);
  } else if (sha256(sourcePayload(value)) !== value.sha256) {
    issues.push(`${path}.sha256: source descriptor checksum drift`);
  }
  return typeof value.authorship === "string" ? value.authorship : undefined;
}

function validateEvidence(
  value: unknown,
  authorship: string | undefined,
  observations: unknown,
  path: string,
  verifiedArtifacts: ReadonlySet<string>,
  issues: string[],
): void {
  if (!isObject(value)) {
    issues.push(`${path}: required`);
    return;
  }
  rejectUnknownKeys(value, EVIDENCE_KEYS, path, issues);
  if (!EVIDENCE_KINDS.includes(value.kind as (typeof EVIDENCE_KINDS)[number])) {
    issues.push(`${path}.kind: invalid`);
  }
  if (!EVIDENCE_BASES.includes(value.basis as (typeof EVIDENCE_BASES)[number])) {
    issues.push(`${path}.basis: invalid`);
  }
  if (!isNonemptyString(value.oracle)) issues.push(`${path}.oracle: required`);
  const producerBasis =
    value.kind === "pinned-observation" || value.basis === "producer-observation";
  if (producerBasis) {
    if (value.kind !== "pinned-observation" || value.basis !== "producer-observation") {
      issues.push(`${path}: pinned observation kind/basis must be declared together`);
    }
    if (authorship !== "producer-observation") {
      issues.push(`${path}: pinned observation requires producer-observation provenance`);
    }
    const reviewedExternal = Array.isArray(observations)
      ? observations.some(
          (observation) =>
            isObject(observation) &&
            observation.status === "reviewed" &&
            observation.producer !== "sheetwrite" &&
            SHA256_PATTERN.test(String(observation.artifactSha256 ?? "")) &&
            verifiedArtifacts.has(String(observation.artifactSha256)),
        )
      : false;
    if (!reviewedExternal) {
      issues.push(`${path}: pinned observation requires a verified reviewed external capture`);
    }
  } else {
    if (authorship === "producer-observation") {
      issues.push(
        `${path}: property/metamorphic expectation cannot use producer-observation provenance`,
      );
    }
    if (value.kind !== "property" && value.kind !== "metamorphic") {
      issues.push(`${path}.kind: property or metamorphic evidence required`);
    }
    if (value.basis !== "documented-semantics" && value.basis !== "property-invariant") {
      issues.push(`${path}.basis: independent semantic/property basis required`);
    }
  }
}

function validateCaseTolerance(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) {
    issues.push(`${path}: required`);
    return;
  }
  rejectUnknownKeys(value, CASE_TOLERANCE_KEYS, path, issues);
  if (value.kind === "exact") {
    if (value.value !== undefined)
      issues.push(`${path}.value: exact tolerance has no numeric value`);
    return;
  }
  if (
    !["absolute", "relative", "ulp"].includes(String(value.kind)) ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value < 0
  ) {
    issues.push(`${path}: invalid tolerance`);
  }
}

function validateManifest(
  value: unknown,
  corpus: Record<string, unknown>,
  denominator: InventoryDenominator,
  counts: Record<(typeof MANIFEST_COUNT_KEYS)[number], number>,
  categories: Set<string>,
  issues: string[],
): void {
  if (!isObject(value)) {
    issues.push("manifest: required immutable corpus binding");
    return;
  }
  rejectUnknownKeys(value, MANIFEST_KEYS, "manifest", issues);
  if (value.protocol !== 1) issues.push("manifest.protocol: expected 1");
  if (value.generator !== "sheetwrite.conformance.original-evidence") {
    issues.push("manifest.generator: invalid deterministic generator identity");
  }
  if (value.generatorVersion !== 1) issues.push("manifest.generatorVersion: expected 1");
  if (value.corpusPath !== "test/conformance/corpus.json") {
    issues.push("manifest.corpusPath: unstable corpus path");
  }
  if (value.inventoryPath !== "test/conformance/formula-contract.inventory.json") {
    issues.push("manifest.inventoryPath: unstable inventory path");
  }
  for (const key of [
    "corpusSha256",
    "inventorySha256",
    "supportedNamesSha256",
    "categoriesSha256",
    "operationShapesSha256",
  ] as const) {
    if (!SHA256_PATTERN.test(String(value[key] ?? ""))) {
      issues.push(`manifest.${key}: canonical checksum required`);
    }
  }
  if (!Array.isArray(value.caseSha256)) {
    issues.push("manifest.caseSha256: per-record canonical checksums required");
  } else {
    const caseChecksums = value.caseSha256;
    const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
    if (caseChecksums.length !== cases.length) {
      issues.push("manifest.caseSha256: checksum denominator drift");
    }
    cases.forEach((entry, index) => {
      try {
        if (
          !SHA256_PATTERN.test(String(caseChecksums[index] ?? "")) ||
          caseChecksums[index] !== sha256(entry)
        ) {
          issues.push(`manifest.caseSha256[${index}]: altered record or unstable checksum`);
        }
      } catch (error) {
        issues.push(`manifest.caseSha256[${index}]: canonical checksum failed: ${String(error)}`);
      }
    });
  }
  try {
    if (value.corpusSha256 !== sha256(corpus)) {
      issues.push("manifest.corpusSha256: altered corpus expectation/checksum binding");
    }
    if (denominator.inventory) {
      if (value.inventorySha256 !== sha256(denominator.inventory)) {
        issues.push("manifest.inventorySha256: typed inventory denominator drift");
      }
      if (value.supportedNamesSha256 !== supportedNamesChecksum(denominator.inventory)) {
        issues.push("manifest.supportedNamesSha256: supported-name denominator drift");
      }
    }
    if (value.categoriesSha256 !== sha256([...REQUIRED_CATEGORIES].sort())) {
      issues.push("manifest.categoriesSha256: semantic category denominator drift");
    }
    const operationShapes = (Array.isArray(corpus.cases) ? corpus.cases : [])
      .filter(
        (entry) => isObject(entry) && (entry.area === "mutation" || entry.area === "workbook"),
      )
      .map((entry) => ({
        id: String(entry.id),
        operations: Array.isArray(entry.operations)
          ? entry.operations.map((operation: unknown) =>
              isObject(operation) ? String(operation.op) : "",
            )
          : [],
      }));
    if (value.operationShapesSha256 !== sha256(operationShapes)) {
      issues.push("manifest.operationShapesSha256: operation-shape denominator drift");
    }
    const featureCounts: Record<string, number> = {};
    for (const shape of operationShapes) {
      for (const feature of shape.operations) {
        featureCounts[feature] = (featureCounts[feature] ?? 0) + 1;
      }
    }
    const sortedFeatureCounts = Object.fromEntries(
      Object.entries(featureCounts).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    if (canonicalJson(value.featureCounts) !== canonicalJson(sortedFeatureCounts)) {
      issues.push("manifest.featureCounts: operation feature denominator drift");
    }
    if (denominator.inventory) {
      const generated = generateConformanceEvidence(denominator.inventory);
      if (canonicalJson(corpus) !== canonicalJson(generated.corpus)) {
        issues.push("corpus: deterministic generator output drift");
      }
      if (canonicalJson(value) !== canonicalJson(generated.manifest)) {
        issues.push("manifest: deterministic generator binding drift");
      }
    }
  } catch (error) {
    issues.push(`manifest: canonical checksum failed: ${String(error)}`);
  }
  if (!isObject(value.minimums)) {
    issues.push("manifest.minimums: required denominators");
  } else {
    rejectUnknownKeys(value.minimums, MINIMUM_KEYS, "manifest.minimums", issues);
    for (const key of MINIMUM_KEYS) {
      if (value.minimums[key] !== REQUIRED_COUNTS[key]) {
        issues.push(`manifest.minimums.${key}: required denominator is ${REQUIRED_COUNTS[key]}`);
      }
    }
  }
  if (!isObject(value.counts)) {
    issues.push("manifest.counts: required generated counts");
  } else {
    rejectUnknownKeys(value.counts, MANIFEST_COUNT_KEYS, "manifest.counts", issues);
    for (const key of MANIFEST_COUNT_KEYS) {
      if (value.counts[key] !== counts[key]) {
        issues.push(
          `manifest.counts.${key}: denominator drift; expected generated count ${counts[key]}`,
        );
      }
    }
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) issues.push(`coverage.category: missing ${category}`);
  }
}

/** Validate corpus structure, independent evidence, immutable checksums, and inventory-derived coverage. */
export function validateCorpus(
  value: unknown,
  manifest: unknown,
  inventory: unknown,
  verifiedArtifacts: ReadonlySet<string> = EMPTY_ARTIFACTS,
): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return ["corpus: expected object"];
  rejectUnknownKeys(value, CORPUS_KEYS, "corpus", issues);
  if (value.protocol !== 1) issues.push("protocol: expected 1");
  if (!isNonemptyString(value.license)) issues.push("license: required");
  const denominator = validateInventory(inventory, issues);
  if (!Array.isArray(value.cases)) return [...issues, "cases: expected array"];
  const ids = new Set<string>();
  const coveredFunctions = new Set<string>();
  const coveredOperators = new Set<string>();
  const functionCategories = new Map<string, Set<string>>();
  const operatorCategories = new Map<string, Set<string>>();
  const subjectCategoryFormulas = new Map<string, Set<string>>();
  const categories = new Set<string>();
  const operationShapes = {
    mutation: new Set<string>(),
    workbook: new Set<string>(),
  };
  const featureCounts = new Map<string, number>();
  const counts = {
    formula: 0,
    mutation: 0,
    workbook: 0,
    localCanary: 0,
    supportedFunctions: denominator.functions.size,
    supportedOperators: denominator.operators.size,
  };
  value.cases.forEach((entry, index) => {
    const path = `cases[${index}]`;
    if (!isObject(entry)) {
      issues.push(`${path}: expected object`);
      return;
    }
    rejectUnknownKeys(entry, CASE_KEYS, path, issues);
    if (!AREAS.includes(entry.area as (typeof AREAS)[number])) issues.push(`${path}.area: invalid`);
    if (!DIALECTS.includes(entry.dialect as (typeof DIALECTS)[number])) {
      issues.push(`${path}.dialect: invalid`);
    }
    if (!isNonemptyString(entry.id) || !ID.test(entry.id)) {
      issues.push(`${path}.id: invalid stable ID`);
    } else if (ids.has(entry.id)) issues.push(`${path}.id: duplicate ${entry.id}`);
    else ids.add(entry.id);
    if (!REQUIRED_CATEGORIES.includes(entry.category as SemanticCategory)) {
      issues.push(`${path}.category: missing or invalid semantic category`);
    } else categories.add(String(entry.category));
    if (!isNonemptyString(entry.family)) issues.push(`${path}.family: required`);
    const authorship = validateSource(entry.source, `${path}.source`, issues);
    validateEvidence(
      entry.evidence,
      authorship,
      entry.observations,
      `${path}.evidence`,
      verifiedArtifacts,
      issues,
    );
    validateCaseTolerance(entry.tolerance, `${path}.tolerance`, issues);
    if (entry.localCanary === true) counts.localCanary += 1;
    else if (entry.localCanary !== undefined)
      issues.push(`${path}.localCanary: expected true or absent`);

    if (entry.kind === "formula") {
      counts.formula += 1;
      if (entry.area !== "formula") issues.push(`${path}.area: formula kind requires formula area`);
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
        const inputCells = new Set<string>();
        entry.inputs.forEach((input, inputIndex) => {
          if (!isObject(input)) {
            issues.push(`${path}.inputs[${inputIndex}]: expected object`);
            return;
          }
          rejectUnknownKeys(input, INPUT_KEYS, `${path}.inputs[${inputIndex}]`, issues);
          if (!isNonemptyString(input.cell) || !CELL.test(input.cell)) {
            issues.push(`${path}.inputs[${inputIndex}].cell: invalid A1 cell`);
          } else if (inputCells.has(input.cell)) {
            issues.push(`${path}.inputs[${inputIndex}].cell: duplicate input cell`);
          } else inputCells.add(input.cell);
          if (
            input.value !== null &&
            !["string", "number", "boolean"].includes(typeof input.value)
          ) {
            issues.push(`${path}.inputs[${inputIndex}].value: invalid scalar`);
          }
        });
      }
      if (!isObject(entry.subject)) {
        issues.push(`${path}.subject: formula coverage subject required`);
      } else {
        rejectUnknownKeys(entry.subject, SUBJECT_KEYS, `${path}.subject`, issues);
        const name = String(entry.subject.name ?? "");
        if (entry.subject.kind === "function") {
          const functionContract = denominator.functions.get(name);
          if (!functionContract) {
            issues.push(`${path}.subject: unsupported-as-supported function ${name}`);
          } else {
            const family = functionContract.family;
            if (entry.family !== family)
              issues.push(`${path}.family: inventory family is ${family}`);
            if (
              isNonemptyString(entry.formula) &&
              !entry.formula.toUpperCase().includes(`${name}(`)
            ) {
              issues.push(`${path}.formula: declared function subject ${name} is absent`);
            }
            if (
              !entry.unsupported &&
              isObject(entry.expected) &&
              entry.expected.type !== "unsupported"
            ) {
              coveredFunctions.add(name);
              const covered = functionCategories.get(name) ?? new Set<string>();
              covered.add(String(entry.category));
              functionCategories.set(name, covered);
            }
          }
        } else if (entry.subject.kind === "operator") {
          const operator = denominator.operators.get(name);
          if (!operator) issues.push(`${path}.subject: unsupported-as-supported operator ${name}`);
          else {
            if (entry.family !== operator.family) {
              issues.push(`${path}.family: inventory family is ${operator.family}`);
            }
            if (
              isNonemptyString(entry.formula) &&
              !entry.formula.slice(1).includes(operator.token)
            ) {
              issues.push(`${path}.formula: declared operator subject ${name} is absent`);
            }
            if (
              !entry.unsupported &&
              isObject(entry.expected) &&
              entry.expected.type !== "unsupported"
            ) {
              coveredOperators.add(name);
              const covered = operatorCategories.get(name) ?? new Set<string>();
              covered.add(String(entry.category));
              operatorCategories.set(name, covered);
            }
          }
        } else issues.push(`${path}.subject.kind: invalid`);
        if (isNonemptyString(entry.formula) && isNonemptyString(entry.category)) {
          const subjectKey = `${String(entry.subject.kind)}:${name}:${entry.category}`;
          const canonical = canonicalFormula(entry.formula);
          const formulas = subjectCategoryFormulas.get(subjectKey) ?? new Set<string>();
          if (formulas.has(canonical)) {
            issues.push(`${path}.formula: duplicate canonical subject/category formula`);
          }
          formulas.add(canonical);
          subjectCategoryFormulas.set(subjectKey, formulas);
          if (
            entry.category !== "normal" &&
            entry.unsupported !== true &&
            entry.localCanary !== true
          ) {
            const marker =
              entry.category === "error"
                ? "1/0"
                : entry.category === "range-array"
                  ? "C1:C2"
                  : "C1";
            const consumes =
              entry.subject.kind === "function"
                ? functionInvocationContains(entry.formula, name, marker)
                : entry.formula.includes(marker);
            if (!consumes) {
              issues.push(
                `${path}.formula: category input is not consumed by the declared subject invocation`,
              );
            }
          }
        }
      }
    } else if (entry.kind === "mutation" || entry.kind === "workbook") {
      const expectedArea = entry.kind;
      counts[expectedArea] += 1;
      if (entry.area !== expectedArea)
        issues.push(`${path}.area: ${entry.kind} kind requires matching area`);
      if (!Array.isArray(entry.operations) || entry.operations.length === 0) {
        issues.push(`${path}.operations: non-empty sequence required`);
      }
      const matrixFeature = entry.kind === "mutation" ? "mutation-matrix" : "workbook-matrix";
      if (entry.localCanary !== true && entry.feature !== matrixFeature) {
        issues.push(`${path}.feature: required ${matrixFeature}`);
      }
      if (entry.feature === matrixFeature && Array.isArray(entry.operations)) {
        const allowed =
          entry.kind === "mutation"
            ? (MUTATION_FEATURES as readonly string[])
            : (WORKBOOK_FEATURES as readonly string[]);
        const shape: string[] = [];
        const seenOperations = new Set<string>();
        entry.operations.forEach((operation, operationIndex) => {
          const operationPath = `${path}.operations[${operationIndex}]`;
          if (!isObject(operation)) {
            issues.push(`${operationPath}: expected object`);
            return;
          }
          rejectUnknownKeys(operation, OPERATION_KEYS, operationPath, issues);
          if (!isNonemptyString(operation.op) || !allowed.includes(operation.op)) {
            issues.push(`${operationPath}.op: unsupported concrete operation`);
            return;
          }
          if (seenOperations.has(operation.op)) {
            issues.push(`${operationPath}.op: duplicate operation in shape`);
          }
          seenOperations.add(operation.op);
          shape.push(operation.op);
          featureCounts.set(operation.op, (featureCounts.get(operation.op) ?? 0) + 1);
        });
        const shapeKey = shape.join(",");
        const areaShapes = operationShapes[entry.kind];
        if (areaShapes.has(shapeKey)) issues.push(`${path}.operations: duplicate operation shape`);
        else areaShapes.add(shapeKey);
      }
      if (entry.kind === "mutation") {
        if (entry.category !== "mutation")
          issues.push(`${path}.category: mutation kind requires mutation`);
        if (entry.family !== "document-mutation") {
          issues.push(`${path}.family: mutation family must be document-mutation`);
        }
        if (Array.isArray(entry.operations) && entry.operations.length < 2) {
          issues.push(`${path}.operations: mutation sequence requires at least two operations`);
        }
      } else if (entry.family !== "workbook-state") {
        issues.push(`${path}.family: workbook family must be workbook-state`);
      }
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

  if (counts.formula < REQUIRED_COUNTS.formula) {
    issues.push(
      `coverage.formula: required denominator ${REQUIRED_COUNTS.formula}, received ${counts.formula}`,
    );
  }
  if (counts.mutation < REQUIRED_COUNTS.mutation) {
    issues.push(
      `coverage.mutation: required denominator ${REQUIRED_COUNTS.mutation}, received ${counts.mutation}`,
    );
  }
  if (counts.workbook < REQUIRED_COUNTS.workbook) {
    issues.push(
      `coverage.workbook: required denominator ${REQUIRED_COUNTS.workbook}, received ${counts.workbook}`,
    );
  }
  if (counts.localCanary !== 7) {
    issues.push(
      `coverage.localCanary: expected seven local canaries, received ${counts.localCanary}`,
    );
  }
  for (const [name, functionContract] of denominator.functions) {
    if (!coveredFunctions.has(name)) issues.push(`coverage.function: missing supported ${name}`);
    const covered = functionCategories.get(name);
    for (const category of REQUIRED_CATEGORIES) {
      if (
        category !== "mutation" &&
        (functionContract.signature !== "zero" || category === "normal") &&
        !covered?.has(category)
      ) {
        issues.push(`coverage.function.${name}: missing category ${category}`);
      }
    }
  }
  for (const name of denominator.operators.keys()) {
    if (!coveredOperators.has(name)) issues.push(`coverage.operator: missing supported ${name}`);
    const covered = operatorCategories.get(name);
    for (const category of REQUIRED_CATEGORIES) {
      if (category !== "mutation" && !covered?.has(category)) {
        issues.push(`coverage.operator.${name}: missing category ${category}`);
      }
    }
  }
  for (const feature of [...MUTATION_FEATURES, ...WORKBOOK_FEATURES]) {
    const count = featureCounts.get(feature) ?? 0;
    if (count < FEATURE_MINIMUM) {
      issues.push(
        `coverage.feature.${feature}: required denominator ${FEATURE_MINIMUM}, received ${count}`,
      );
    }
  }
  validateManifest(
    value === undefined ? undefined : manifest,
    value,
    denominator,
    counts,
    categories,
    issues,
  );
  scanSecrets(value, "corpus", issues);
  scanSecrets(manifest, "manifest", issues);
  return issues;
}

export async function readCorpusJson(path: string): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile())
      throw new TypeError(`Compatibility test set is not a regular file: ${path}`);
    if (info.size > MAX_CORPUS_BYTES) {
      throw new RangeError(`Compatibility test set exceeds ${MAX_CORPUS_BYTES} bytes`);
    }
    const bytes = await handle.readFile();
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}
