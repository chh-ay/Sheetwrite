import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { initSheetwrite } from "../packages/core/src/grid.js";
import { formatNumber } from "../packages/core/src/number-format.js";
import { SheetwriteStore } from "../packages/core/src/store.js";
import type { CellScalar, CellValue, Column } from "../packages/core/src/types/cell.js";
import type { DocumentOp, Workbook } from "../packages/core/src/types/document.js";

export type ResultType =
  | "blank"
  | "boolean"
  | "number"
  | "string"
  | "error"
  | "array"
  | "workbook"
  | "unsupported";
export interface ConformanceResult {
  type: ResultType;
  value?: unknown;
  error?: string;
  rows?: number;
  columns?: number;
  displayedText?: string;
  formula?: string;
  tolerance?: { kind: "absolute" | "relative" | "ulp"; value: number };
}
export interface ConformanceObservation {
  producer: "excel-desktop" | "excel-web" | "google-sheets" | "libreoffice" | "sheetwrite";
  producerVersion: string;
  capturedAt: string;
  status: "reviewed" | "provisional" | "unavailable";
  result?: ConformanceResult;
  artifactSha256?: string;
  notes?: string;
}
export interface ConformanceCase {
  id: string;
  area: "formula" | "mutation" | "workbook" | "xlsx";
  dialect: "shared" | "excel" | "google-sheets" | "openformula";
  kind: "formula" | "workbook";
  source: {
    title: string;
    section: string;
    url?: string;
    sha256?: string;
    license: string;
    authorship: "original" | "spec-derived" | "producer-observation";
    notice?: string;
  };
  inputs?: Array<{ cell: string; value: CellScalar }>;
  numberFormat?: string;
  formula?: string;
  target?: string;
  operations?: Array<Record<string, unknown>>;
  expected: ConformanceResult;
  observations: ConformanceObservation[];
  knownDivergence?: string;
  unsupported?: boolean;
}
export interface ConformanceCorpus {
  protocol: 1;
  license: string;
  cases: ConformanceCase[];
}

const SECRET_KEY = /(?:token|secret|password|authorization|cookie|client[_-]?secret)/i;
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9.-]+$/;
const CELL = /^[A-Z]+[1-9][0-9]*$/;
const RESULT_TYPES = new Set<ResultType>([
  "blank",
  "boolean",
  "number",
  "string",
  "error",
  "array",
  "workbook",
  "unsupported",
]);
const AREAS = new Set(["formula", "mutation", "workbook", "xlsx"]);
const DIALECTS = new Set(["shared", "excel", "google-sheets", "openformula"]);
const AUTHORSHIP = new Set(["original", "spec-derived", "producer-observation"]);
const PRODUCERS = new Set([
  "excel-desktop",
  "excel-web",
  "google-sheets",
  "libreoffice",
  "sheetwrite",
]);
const RESULT_KEYS = new Set([
  "type",
  "value",
  "error",
  "rows",
  "columns",
  "displayedText",
  "formula",
  "tolerance",
]);
const CASE_KEYS = new Set([
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
]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}.${key}: unknown field`);
  }
}

function scanSecrets(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      scanSecrets(child, `${path}[${index}]`, issues);
    });
    return;
  }
  if (!object(value)) {
    if (typeof value === "string" && SECRET_VALUE.test(value))
      issues.push(`${path}: secret-like value`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) issues.push(`${path}.${key}: secret-like field name`);
    scanSecrets(child, `${path}.${key}`, issues);
  }
}

function validateResult(value: unknown, path: string, issues: string[]): void {
  if (!object(value) || !RESULT_TYPES.has(value.type as ResultType)) {
    issues.push(`${path}.type: ambiguous or missing result type`);
    return;
  }
  rejectUnknownKeys(value, RESULT_KEYS, path, issues);
  const type = value.type as ResultType;
  if (type === "number" && typeof value.value !== "number")
    issues.push(`${path}.value: expected number`);
  if (type === "boolean" && typeof value.value !== "boolean")
    issues.push(`${path}.value: expected boolean`);
  if (type === "string" && typeof value.value !== "string")
    issues.push(`${path}.value: expected string`);
  if (type === "error" && !nonempty(value.error))
    issues.push(`${path}.error: expected error sentinel`);
  if (type === "array") {
    if (!Array.isArray(value.value)) issues.push(`${path}.value: expected array`);
    if (!Number.isSafeInteger(value.rows) || (value.rows as number) < 1)
      issues.push(`${path}.rows: expected positive integer`);
    if (!Number.isSafeInteger(value.columns) || (value.columns as number) < 1)
      issues.push(`${path}.columns: expected positive integer`);
  }
  if (type === "workbook" && !object(value.value))
    issues.push(`${path}.value: expected workbook object`);
  if ((type === "blank" || type === "unsupported") && ("value" in value || "error" in value)) {
    issues.push(`${path}: ${type} cannot carry value/error`);
  }
  if (value.tolerance !== undefined) {
    const tolerance = value.tolerance;
    if (
      type !== "number" ||
      !object(tolerance) ||
      !["absolute", "relative", "ulp"].includes(String(tolerance.kind)) ||
      typeof tolerance.value !== "number" ||
      tolerance.value < 0
    ) {
      issues.push(`${path}.tolerance: invalid numeric tolerance`);
    }
    if (object(tolerance)) {
      rejectUnknownKeys(tolerance, new Set(["kind", "value"]), `${path}.tolerance`, issues);
    }
  }
}

export function validateCorpus(value: unknown): string[] {
  const issues: string[] = [];
  if (!object(value)) return ["corpus: expected object"];
  rejectUnknownKeys(value, new Set(["protocol", "license", "cases"]), "corpus", issues);
  if (value.protocol !== 1) issues.push("protocol: expected 1");
  if (!nonempty(value.license)) issues.push("license: required");
  if (!Array.isArray(value.cases)) return [...issues, "cases: expected array"];
  const ids = new Set<string>();
  value.cases.forEach((entry, index) => {
    const path = `cases[${index}]`;
    if (!object(entry)) {
      issues.push(`${path}: expected object`);
      return;
    }
    rejectUnknownKeys(entry, CASE_KEYS, path, issues);
    if (!AREAS.has(String(entry.area))) issues.push(`${path}.area: invalid`);
    if (!DIALECTS.has(String(entry.dialect))) issues.push(`${path}.dialect: invalid`);
    if (!nonempty(entry.id) || !ID.test(entry.id)) issues.push(`${path}.id: invalid stable ID`);
    else if (ids.has(entry.id)) issues.push(`${path}.id: duplicate ${entry.id}`);
    else ids.add(entry.id);
    if (!object(entry.source)) issues.push(`${path}.source: required`);
    else {
      rejectUnknownKeys(
        entry.source,
        new Set(["title", "section", "url", "sha256", "license", "authorship", "notice"]),
        `${path}.source`,
        issues,
      );
      if (!AUTHORSHIP.has(String(entry.source.authorship))) {
        issues.push(`${path}.source.authorship: invalid`);
      }
      for (const key of ["title", "section", "license", "authorship"] as const) {
        if (!nonempty(entry.source[key])) issues.push(`${path}.source.${key}: required`);
      }
      if (entry.source.url !== undefined && !SHA256.test(String(entry.source.sha256 ?? ""))) {
        issues.push(`${path}.source.sha256: URL sources require a pinned checksum`);
      }
    }
    if (entry.kind === "formula") {
      if (!nonempty(entry.formula) || !entry.formula.startsWith("="))
        issues.push(`${path}.formula: required`);
      if (entry.numberFormat !== undefined && !nonempty(entry.numberFormat)) {
        issues.push(`${path}.numberFormat: expected non-empty string`);
      }
      if (!nonempty(entry.target) || !CELL.test(entry.target))
        issues.push(`${path}.target: invalid A1 cell`);
      if (!Array.isArray(entry.inputs)) issues.push(`${path}.inputs: required`);
      if (Array.isArray(entry.inputs)) {
        entry.inputs.forEach((input, inputIndex) => {
          if (!object(input)) {
            issues.push(`${path}.inputs[${inputIndex}]: expected object`);
            return;
          }
          rejectUnknownKeys(
            input,
            new Set(["cell", "value"]),
            `${path}.inputs[${inputIndex}]`,
            issues,
          );
          if (!nonempty(input.cell) || !CELL.test(input.cell)) {
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
    if (
      entry.unsupported === true &&
      object(entry.expected) &&
      entry.expected.type !== "unsupported"
    ) {
      issues.push(`${path}: unsupported case cannot render as pass`);
    }
    if (
      object(entry.expected) &&
      entry.expected.type === "unsupported" &&
      entry.unsupported !== true
    ) {
      issues.push(`${path}.unsupported: must be true for unsupported expectation`);
    }
    if (!Array.isArray(entry.observations)) issues.push(`${path}.observations: required`);
    else {
      entry.observations.forEach((observation, observationIndex) => {
        const observationPath = `${path}.observations[${observationIndex}]`;
        if (!object(observation)) {
          issues.push(`${observationPath}: expected object`);
          return;
        }
        rejectUnknownKeys(
          observation,
          new Set([
            "producer",
            "producerVersion",
            "capturedAt",
            "status",
            "result",
            "artifactSha256",
            "notes",
          ]),
          observationPath,
          issues,
        );
        if (!PRODUCERS.has(String(observation.producer))) {
          issues.push(`${observationPath}.producer: invalid`);
        }
        if (!nonempty(observation.producerVersion))
          issues.push(`${observationPath}.producerVersion: required`);
        if (!nonempty(observation.capturedAt) || Number.isNaN(Date.parse(observation.capturedAt))) {
          issues.push(`${observationPath}.capturedAt: invalid timestamp`);
        }
        if (observation.status === "reviewed" || observation.status === "provisional") {
          validateResult(observation.result, `${observationPath}.result`, issues);
          if (!SHA256.test(String(observation.artifactSha256 ?? ""))) {
            issues.push(`${observationPath}.artifactSha256: required`);
          }
        } else if (observation.status === "unavailable") {
          if (!nonempty(observation.notes) || observation.result !== undefined) {
            issues.push(`${observationPath}: unavailable observations require notes and no result`);
          }
        } else issues.push(`${observationPath}.status: invalid`);
      });
    }
  });
  scanSecrets(value, "corpus", issues);
  return issues;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Canonical JSON cannot encode undefined");
  return encoded;
}

export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalJson(value))
    .digest("hex");
}

function orderedFloat(value: number): bigint {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  return bits >> 63n ? ~bits : bits | (1n << 63n);
}

export function compareResults(expected: ConformanceResult, actual: ConformanceResult): string[] {
  const differences: string[] = [];
  if (actual.type !== expected.type) {
    return [`type: expected ${expected.type}, received ${actual.type}`];
  }
  if (expected.type === "number") {
    const left = expected.value as number;
    const right = actual.value as number;
    const tolerance = expected.tolerance;
    let pass = Object.is(left, right);
    if (tolerance?.kind === "absolute") pass = Math.abs(left - right) <= tolerance.value;
    if (tolerance?.kind === "relative") {
      pass = Math.abs(left - right) <= tolerance.value * Math.max(1, Math.abs(left));
    }
    if (tolerance?.kind === "ulp") {
      const leftBits = orderedFloat(left);
      const rightBits = orderedFloat(right);
      pass =
        Number(leftBits < rightBits ? rightBits - leftBits : leftBits - rightBits) <=
        tolerance.value;
    }
    if (!pass) differences.push(`value: expected ${left}, received ${right}`);
  } else if (expected.type === "error") {
    if (actual.error !== expected.error) {
      differences.push(`error: expected ${expected.error}, received ${actual.error}`);
    }
  } else if (canonicalJson(actual.value) !== canonicalJson(expected.value)) {
    differences.push(
      `value: expected ${canonicalJson(expected.value)}, received ${canonicalJson(actual.value)}`,
    );
  }
  for (const field of ["rows", "columns", "displayedText", "formula"] as const) {
    if (expected[field] !== undefined && actual[field] !== expected[field]) {
      differences.push(
        `${field}: expected ${String(expected[field])}, received ${String(actual[field])}`,
      );
    }
  }
  return differences;
}

function a1(cell: string): { row: number; col: number } {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell);
  if (!match) throw new Error(`Invalid A1 cell ${cell}`);
  let col = 0;
  for (const character of match[1]!) col = col * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, col: col - 1 };
}

function cellValue(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

function classify(value: CellScalar, numberFormat?: string): ConformanceResult {
  const displayedText =
    numberFormat !== undefined && (typeof value === "number" || typeof value === "string")
      ? formatNumber(value, numberFormat, "en-US")
      : undefined;
  if (value === null) return { type: "blank" };
  if (typeof value === "number") return { type: "number", value, displayedText };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NUM!|SPILL!)$/.test(value)) {
    return { type: "error", error: value };
  }
  return { type: "string", value };
}

function fixtureWorkbook(): Workbook {
  const columns: Column[] = Array.from({ length: 32 }, (_, index) => ({
    key: `c${index}`,
    header: `Column ${index + 1}`,
    width: 100,
    type: "text",
  }));
  return {
    activeSheet: "oracle",
    sheets: [{ id: "oracle", name: "Oracle", rowCount: 256, columns }],
  };
}

export async function runSheetwriteCase(entry: ConformanceCase): Promise<ConformanceResult> {
  await initSheetwrite();
  const store = new SheetwriteStore(fixtureWorkbook());
  try {
    if (entry.kind === "workbook") {
      const patches: DocumentOp[] = [];
      const observedCells: Array<{ sheet: string; cell: string }> = [];
      let activeSheet = "oracle";
      let createdSheets = 0;
      for (const operation of entry.operations ?? []) {
        if (operation.op === "create-sheet" && nonempty(operation.name)) {
          if (createdSheets === 0) {
            patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
          } else {
            const id = `oracle-${createdSheets + 1}`;
            patches.push({
              op: "addSheet",
              sheet: {
                id,
                name: operation.name,
                order: createdSheets,
                rowCount: 256,
                columns: fixtureWorkbook().sheets[0]!.columns,
                cells: [],
              },
            });
            activeSheet = id;
          }
          createdSheets += 1;
        } else if (operation.op === "set" && nonempty(operation.cell)) {
          patches.push({
            op: "set",
            addr: { sheet: activeSheet, ...a1(operation.cell) },
            value: cellValue(operation.value as CellScalar),
          });
          observedCells.push({ sheet: activeSheet, cell: operation.cell });
        } else if (operation.op === "rename-sheet" && nonempty(operation.name)) {
          patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
        } else if (
          operation.op === "set-visibility" &&
          (operation.visibility === "visible" ||
            operation.visibility === "hidden" ||
            operation.visibility === "veryHidden")
        ) {
          patches.push({
            op: "setSheetVisibility",
            sheet: activeSheet,
            visibility: operation.visibility,
          });
        } else {
          throw new Error(`${entry.id}: unsupported workbook operation ${String(operation.op)}`);
        }
      }
      const outcome = store.applyTransaction({ patches });
      if (outcome.status !== "applied") {
        throw new Error(`${entry.id}: workbook operations rejected: ${canonicalJson(outcome)}`);
      }
      const workbook = store.getWorkbook();
      const active = workbook.sheets.find((sheet) => sheet.id === activeSheet);
      return {
        type: "workbook",
        value: {
          activeSheet: active?.name,
          sheetCount: workbook.sheets.length,
          sheets: workbook.sheets.map((sheet) => ({
            name: sheet.name,
            visibility: sheet.visibility ?? "visible",
            cells: Object.fromEntries(
              observedCells
                .filter((cell) => cell.sheet === sheet.id)
                .map((cell) => [
                  cell.cell,
                  store.getCell({ sheet: sheet.id, ...a1(cell.cell) }).resolved,
                ]),
            ),
          })),
        },
      };
    }

    const patches: DocumentOp[] = (entry.inputs ?? []).map((input) => ({
      op: "set",
      addr: { sheet: "oracle", ...a1(input.cell) },
      value: cellValue(input.value),
    }));
    patches.push({
      op: "set",
      addr: { sheet: "oracle", ...a1(entry.target!) },
      value: { kind: "formula", src: entry.formula! },
    });
    const outcome = store.applyTransaction({ patches });
    if (outcome.status !== "applied") {
      throw new Error(`${entry.id}: formula setup rejected: ${canonicalJson(outcome)}`);
    }
    const target = a1(entry.target!);
    const anchor = classify(
      store.getCell({ sheet: "oracle", ...target }).resolved,
      entry.numberFormat,
    );
    if (entry.expected.type !== "array") return { ...anchor, formula: entry.formula };
    const rows = entry.expected.rows!;
    const columns = entry.expected.columns!;
    const values: unknown[][] = [];
    for (let row = 0; row < rows; row++) {
      const line: unknown[] = [];
      for (let col = 0; col < columns; col++) {
        line.push(
          store.getCell({ sheet: "oracle", row: target.row + row, col: target.col + col }).resolved,
        );
      }
      values.push(line);
    }
    return { type: "array", value: values, rows, columns, formula: entry.formula };
  } finally {
    store.dispose();
  }
}

export async function runOffline(
  corpus: ConformanceCorpus,
): Promise<{ checked: number; deferred: number }> {
  const failures: string[] = [];
  let checked = 0;
  let deferred = 0;
  for (const entry of corpus.cases) {
    const actual = await runSheetwriteCase(entry);
    const localDifferences = compareResults(entry.expected, actual);
    if (localDifferences.length > 0 && !entry.knownDivergence)
      failures.push(`${entry.id} sheetwrite: ${localDifferences.join("; ")}`);
    checked += 1;
    const reviewed = entry.observations.filter((observation) => observation.status === "reviewed");
    if (reviewed.length === 0) deferred += 1;
    for (const observation of reviewed) {
      const differences = compareResults(entry.expected, observation.result!);
      if (differences.length > 0 && !entry.knownDivergence)
        failures.push(`${entry.id} ${observation.producer}: ${differences.join("; ")}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return { checked, deferred };
}

function artifactPath(producer: string): string {
  return resolve(
    "test-results/conformance",
    `${producer}-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
}

async function persistCapture(producer: string, payload: unknown): Promise<string> {
  const path = artifactPath(producer);
  await mkdir(dirname(path), { recursive: true });
  const artifact = { protocol: 1, producer, capturedAt: new Date().toISOString(), payload };
  await writeFile(path, `${canonicalJson(artifact)}\n`);
  return `${path} sha256=${sha256(artifact)}`;
}

export function validateExcelCapture(
  value: unknown,
  corpus: ConformanceCorpus,
  producerVersion: string,
  scriptSha256: string,
): string[] {
  const issues: string[] = [];
  if (!object(value)) return ["capture: expected object"];
  rejectUnknownKeys(
    value,
    new Set([
      "protocol",
      "producer",
      "producerVersion",
      "capturedAt",
      "scriptSha256",
      "calculation",
      "observations",
    ]),
    "capture",
    issues,
  );
  if (value.protocol !== 1) issues.push("capture.protocol: expected 1");
  if (value.producer !== "excel-web") issues.push("capture.producer: expected excel-web");
  if (value.producerVersion !== producerVersion) {
    issues.push("capture.producerVersion: response does not match requested version");
  }
  if (value.scriptSha256 !== scriptSha256) issues.push("capture.scriptSha256: runner drift");
  if (value.calculation !== "fullRebuild") issues.push("capture.calculation: fullRebuild required");
  if (!nonempty(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt))) {
    issues.push("capture.capturedAt: invalid timestamp");
  }
  const expectedIds = corpus.cases
    .filter((entry) => entry.kind === "formula")
    .map((entry) => entry.id);
  if (!Array.isArray(value.observations))
    return [...issues, "capture.observations: expected array"];
  const receivedIds: string[] = [];
  value.observations.forEach((observation, index) => {
    if (!object(observation)) {
      issues.push(`capture.observations[${index}]: expected object`);
      return;
    }
    rejectUnknownKeys(
      observation,
      new Set(["caseId", "result"]),
      `capture.observations[${index}]`,
      issues,
    );
    if (!nonempty(observation.caseId))
      issues.push(`capture.observations[${index}].caseId: required`);
    else receivedIds.push(observation.caseId);
    validateResult(observation.result, `capture.observations[${index}].result`, issues);
  });
  if (canonicalJson(receivedIds) !== canonicalJson(expectedIds)) {
    issues.push("capture.observations: missing, extra, or reordered case IDs");
  }
  scanSecrets(value, "capture", issues);
  return issues;
}

async function captureExcel(corpus: ConformanceCorpus): Promise<string> {
  const endpoint = process.env.SHEETWRITE_EXCEL_ORACLE_URL;
  const token = process.env.SHEETWRITE_EXCEL_ORACLE_TOKEN;
  const producerVersion = process.env.SHEETWRITE_EXCEL_PRODUCER_VERSION;
  if (!endpoint || !token || !producerVersion) {
    throw new Error(
      "Excel oracle unavailable: configure protected endpoint/token and exact producer version",
    );
  }
  const script = await readFile("scripts/conformance-excel-office-script.ts", "utf8");
  const scriptSha256 = sha256(script);
  const payloadJson = canonicalJson({
    protocol: corpus.protocol,
    producerVersion,
    cases: corpus.cases,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: canonicalJson({
      protocol: 1,
      script,
      scriptSha256,
      arguments: { payloadJson, scriptSha256 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Excel oracle failed with HTTP ${response.status}`);
  const envelope: unknown = await response.json();
  if (!object(envelope) || typeof envelope.result !== "string") {
    throw new Error("Excel oracle response omitted the Office Script result");
  }
  const payload: unknown = JSON.parse(envelope.result);
  const issues = validateExcelCapture(payload, corpus, producerVersion, scriptSha256);
  if (issues.length > 0) throw new Error(issues.join("\n"));
  const serialized = canonicalJson(payload);
  if (serialized.includes(token)) throw new Error("Excel oracle response contained a credential");
  return persistCapture("excel", payload);
}

function sheetTitle(index: number): string {
  return `Case${String(index + 1).padStart(4, "0")}`;
}

async function googleRequest(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(
      `Google oracle ${init.method ?? "GET"} ${url} failed with HTTP ${response.status}`,
    );
  return response;
}

async function captureGoogle(corpus: ConformanceCorpus): Promise<string> {
  const token = process.env.SHEETWRITE_GOOGLE_ORACLE_TOKEN;
  if (!token) throw new Error("Google Sheets oracle unavailable: configure protected OAuth token");
  const formulaCases = corpus.cases.filter((entry) => entry.kind === "formula");
  const created = await googleRequest(token, "https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: canonicalJson({
      properties: {
        title: `sheetwrite-conformance-${Date.now()}`,
        locale: "en_US",
        timeZone: "UTC",
      },
      sheets: formulaCases.map((_entry, index) => ({ properties: { title: sheetTitle(index) } })),
    }),
  });
  const spreadsheet = (await created.json()) as {
    spreadsheetId?: string;
    properties?: { locale?: string; timeZone?: string };
  };
  if (!spreadsheet.spreadsheetId)
    throw new Error("Google Sheets create response omitted spreadsheetId");
  const id = spreadsheet.spreadsheetId;
  try {
    const data = formulaCases.flatMap((entry, index) => [
      ...(entry.inputs ?? []).map((input) => ({
        range: `'${sheetTitle(index)}'!${input.cell}`,
        values: [[input.value]],
      })),
      { range: `'${sheetTitle(index)}'!${entry.target}`, values: [[entry.formula]] },
    ]);
    await googleRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
      {
        method: "POST",
        body: canonicalJson({
          valueInputOption: "USER_ENTERED",
          includeValuesInResponse: false,
          data,
        }),
      },
    );
    const ranges = formulaCases
      .map(
        (entry, index) => `ranges=${encodeURIComponent(`'${sheetTitle(index)}'!${entry.target}`)}`,
      )
      .join("&");
    const observed = await googleRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&${ranges}`,
    );
    const payload = await observed.json();
    const exported = await googleRequest(
      token,
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
    );
    const xlsx = new Uint8Array(await exported.arrayBuffer());
    return persistCapture("google-sheets", {
      spreadsheet: payload,
      workbookSha256: sha256(Buffer.from(xlsx).toString("base64")),
      workbookBytes: xlsx.byteLength,
      locale: spreadsheet.properties?.locale,
      timeZone: spreadsheet.properties?.timeZone,
    });
  } finally {
    await googleRequest(token, `https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
    });
  }
}

export async function loadCorpus(
  path = "test/conformance/corpus.json",
): Promise<ConformanceCorpus> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  const issues = validateCorpus(value);
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return value as ConformanceCorpus;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
  const corpus = await loadCorpus(process.argv[3]);
  if (command === "validate") {
    console.log(
      `Conformance corpus valid: protocol=${corpus.protocol} cases=${corpus.cases.length} sha256=${sha256(corpus)}`,
    );
    return;
  }
  if (command === "offline") {
    const result = await runOffline(corpus);
    console.log(
      `Offline conformance passed: checked=${result.checked} deferred-oracle=${result.deferred}`,
    );
    return;
  }
  if (command === "capture-excel") {
    console.log(await captureExcel(corpus));
    return;
  }
  if (command === "capture-google") {
    console.log(await captureGoogle(corpus));
    return;
  }
  throw new Error(`Unknown conformance command: ${command}`);
}

if (import.meta.main) await main();
