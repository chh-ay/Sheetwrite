import { persistCapture, readBoundedResponse } from "../capture.js";
import { canonicalJson, isObject, sha256, sha256Bytes } from "../normalize.js";
import type {
  CaptureArtifact,
  ConformanceCase,
  ConformanceCorpus,
  ConformanceResult,
} from "../types.js";

export const MAX_GOOGLE_CASES_PER_WORKBOOK = 50;
export const MAX_GOOGLE_ARRAY_ENVELOPE_CELLS = 10_000;

export interface GoogleWorkbookManifest {
  batchIndex: number;
  observationStart: number;
  caseCount: number;
  firstCaseId: string;
  lastCaseId: string;
  caseIdsSha256: string;
  observationsSha256: string;
  workbookSha256: string;
  workbookBytes: number;
  bindingSha256: string;
  locale?: string;
  timeZone?: string;
}

export interface GoogleCaptureDependencies {
  producerVersion: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  persist: (artifact: CaptureArtifact) => Promise<string>;
  now: () => Date;
}

const GOOGLE_ERROR: Record<string, string> = {
  ERROR: "#ERROR!",
  NULL_VALUE: "#NULL!",
  DIVIDE_BY_ZERO: "#DIV/0!",
  VALUE: "#VALUE!",
  REF: "#REF!",
  NAME: "#NAME?",
  NUM: "#NUM!",
  N_A: "#N/A",
  LOADING: "#N/A",
};

function sheetTitle(index: number): string {
  return `Case${String(index + 1).padStart(4, "0")}`;
}

function rangeFor(entry: ConformanceCase, index: number): string {
  const target = /^([A-Z]+)([1-9][0-9]*)$/.exec(entry.target!);
  if (!target || entry.expected.type !== "array") return `'${sheetTitle(index)}'!${entry.target}`;
  const rows = entry.expected.rows!;
  const columns = entry.expected.columns!;
  if (
    !Number.isSafeInteger(rows) ||
    !Number.isSafeInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    (rows + 1) * (columns + 1) > MAX_GOOGLE_ARRAY_ENVELOPE_CELLS
  ) {
    throw new RangeError(`Google array envelope exceeds ${MAX_GOOGLE_ARRAY_ENVELOPE_CELLS} cells`);
  }
  let column = 0;
  for (const character of target[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  column += columns;
  let label = "";
  while (column > 0) {
    column -= 1;
    label = String.fromCharCode(65 + (column % 26)) + label;
    column = Math.floor(column / 26);
  }
  const endRow = Number(target[2]) + rows;
  return `'${sheetTitle(index)}'!${entry.target}:${label}${endRow}`;
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
  if (!response.ok) {
    response.body?.cancel().catch(() => undefined);
    throw new Error(
      `Google oracle ${init.method ?? "GET"} ${url} failed with HTTP ${response.status}`,
    );
  }
  return response;
}

function scalarResult(cell: unknown, expected: ConformanceResult): ConformanceResult {
  if (!isObject(cell)) return { type: "blank" };
  const effective = isObject(cell.effectiveValue) ? cell.effectiveValue : {};
  const formula = isObject(cell.userEnteredValue)
    ? (cell.userEnteredValue.formulaValue as string | undefined)
    : undefined;
  const displayedText = typeof cell.formattedValue === "string" ? cell.formattedValue : undefined;
  const display =
    expected.displayedText !== undefined && displayedText !== undefined ? { displayedText } : {};
  const source = formula !== undefined ? { formula } : {};
  if (typeof effective.numberValue === "number") {
    return { type: "number", value: effective.numberValue, ...display, ...source };
  }
  if (typeof effective.boolValue === "boolean") {
    return { type: "boolean", value: effective.boolValue, ...source };
  }
  if (typeof effective.stringValue === "string") {
    return { type: "string", value: effective.stringValue, ...display, ...source };
  }
  if (isObject(effective.errorValue)) {
    const code = GOOGLE_ERROR[String(effective.errorValue.type)] ?? "#ERROR!";
    return { type: "error", error: code, ...source };
  }
  return { type: "blank", ...source };
}

function observedResult(sheet: unknown, entry: ConformanceCase): ConformanceResult {
  if (!isObject(sheet) || !Array.isArray(sheet.data)) return { type: "blank" };
  const grid = sheet.data[0];
  if (!isObject(grid) || !Array.isArray(grid.rowData)) return { type: "blank" };
  const firstCell =
    isObject(grid.rowData[0]) && Array.isArray(grid.rowData[0].values)
      ? grid.rowData[0].values[0]
      : undefined;
  const anchor = scalarResult(firstCell, entry.expected);
  if (entry.expected.type !== "array" || anchor.type === "error") return anchor;
  const rows = entry.expected.rows!;
  const columns = entry.expected.columns!;
  const values: unknown[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowData =
      isObject(grid.rowData[row]) && Array.isArray(grid.rowData[row].values)
        ? grid.rowData[row].values
        : [];
    const line: unknown[] = [];
    for (let column = 0; column < columns; column++) {
      const result = scalarResult(rowData[column], { type: "blank" });
      line.push(
        result.type === "blank" ? null : result.type === "error" ? result.error : result.value,
      );
    }
    values.push(line);
  }
  return { type: "array", value: values, rows, columns, formula: entry.formula };
}

function assertArrayEnvelope(sheet: unknown, entry: ConformanceCase, batchIndex: number): void {
  if (entry.expected.type !== "array") return;
  const grid = isObject(sheet) && Array.isArray(sheet.data) ? sheet.data[0] : undefined;
  const rowData = isObject(grid) && Array.isArray(grid.rowData) ? grid.rowData : [];
  let lastRow = -1;
  let lastColumn = -1;
  rowData.forEach((row, rowIndex) => {
    const cells = isObject(row) && Array.isArray(row.values) ? row.values : [];
    cells.forEach((cell, columnIndex) => {
      if (
        isObject(cell) &&
        ((isObject(cell.effectiveValue) && Object.keys(cell.effectiveValue).length > 0) ||
          (typeof cell.formattedValue === "string" && cell.formattedValue.length > 0))
      ) {
        lastRow = Math.max(lastRow, rowIndex);
        lastColumn = Math.max(lastColumn, columnIndex);
      }
    });
  });
  const expectedValues = Array.isArray(entry.expected.value) ? entry.expected.value : [];
  let expectedLastRow = -1;
  let expectedLastColumn = -1;
  expectedValues.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((value, columnIndex) => {
      if (value !== null && value !== undefined) {
        expectedLastRow = Math.max(expectedLastRow, rowIndex);
        expectedLastColumn = Math.max(expectedLastColumn, columnIndex);
      }
    });
  });
  if (lastRow >= entry.expected.rows! || lastColumn >= entry.expected.columns!) {
    throw new Error(
      `Google Sheets batch ${batchIndex}: array result exceeds expected shape for ${entry.id}`,
    );
  }
  if (lastRow < expectedLastRow || lastColumn < expectedLastColumn) {
    throw new Error(
      `Google Sheets batch ${batchIndex}: array result is smaller than expected for ${entry.id}`,
    );
  }
}

export async function captureGoogleWithDependencies(
  corpus: ConformanceCorpus,
  dependencies: GoogleCaptureDependencies,
): Promise<string> {
  const formulaCases = corpus.cases.filter((entry) => entry.kind === "formula");
  const observations: CaptureArtifact["observations"] = [];
  const workbooks: GoogleWorkbookManifest[] = [];
  const capturedAt = dependencies.now().toISOString();
  for (
    let observationStart = 0, batchIndex = 0;
    observationStart < formulaCases.length;
    observationStart += MAX_GOOGLE_CASES_PER_WORKBOOK, batchIndex += 1
  ) {
    const batch = formulaCases.slice(
      observationStart,
      observationStart + MAX_GOOGLE_CASES_PER_WORKBOOK,
    );
    const created = await dependencies.request("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: canonicalJson({
        properties: {
          title: `sheetwrite-conformance-${capturedAt}-batch-${String(batchIndex + 1).padStart(3, "0")}`,
          locale: "en_US",
          timeZone: "UTC",
        },
        sheets: batch.map((_entry, index) => ({ properties: { title: sheetTitle(index) } })),
      }),
    });
    const createdBytes = await readBoundedResponse(created);
    const spreadsheet = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(createdBytes),
    ) as {
      spreadsheetId?: string;
      properties?: { locale?: string; timeZone?: string };
    };
    if (!spreadsheet.spreadsheetId) {
      throw new Error("Google Sheets create response omitted spreadsheetId");
    }
    const id = spreadsheet.spreadsheetId;
    try {
      const data = batch.flatMap((entry, index) => [
        ...(entry.inputs ?? []).map((input) => ({
          range: `'${sheetTitle(index)}'!${input.cell}`,
          values: [[input.value]],
        })),
        { range: `'${sheetTitle(index)}'!${entry.target}`, values: [[entry.formula]] },
      ]);
      await readBoundedResponse(
        await dependencies.request(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
          {
            method: "POST",
            body: canonicalJson({
              valueInputOption: "USER_ENTERED",
              includeValuesInResponse: false,
              data,
            }),
          },
        ),
      );
      const ranges = batch
        .map((entry, index) => `ranges=${encodeURIComponent(rangeFor(entry, index))}`)
        .join("&");
      const payloadBytes = await readBoundedResponse(
        await dependencies.request(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&${ranges}`,
        ),
      );
      const payload = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes),
      ) as { sheets?: unknown[] };
      if (!Array.isArray(payload.sheets) || payload.sheets.length !== batch.length) {
        throw new Error(`Google Sheets batch ${batchIndex}: missing or extra result sheets`);
      }
      payload.sheets.forEach((sheet, index) => {
        const title =
          isObject(sheet) && isObject(sheet.properties) ? sheet.properties.title : undefined;
        if (title !== sheetTitle(index)) {
          throw new Error(`Google Sheets batch ${batchIndex}: reordered result sheets`);
        }
        assertArrayEnvelope(sheet, batch[index]!, batchIndex);
      });
      const batchObservations = batch.map((entry, index) => ({
        caseId: entry.id,
        result: observedResult(payload.sheets![index], entry),
      }));
      const xlsx = await readBoundedResponse(
        await dependencies.request(
          `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
        ),
        128 * 1024 * 1024,
      );
      const caseIds = batch.map((entry) => entry.id);
      const observationsSha256 = sha256(batchObservations);
      const workbookSha256 = sha256Bytes(xlsx);
      const binding = {
        batchIndex,
        observationStart,
        caseIds,
        observationsSha256,
        workbookSha256,
        workbookBytes: xlsx.byteLength,
      };
      workbooks.push({
        batchIndex,
        observationStart,
        caseCount: batch.length,
        firstCaseId: caseIds[0]!,
        lastCaseId: caseIds.at(-1)!,
        caseIdsSha256: sha256(caseIds),
        observationsSha256,
        workbookSha256,
        workbookBytes: xlsx.byteLength,
        bindingSha256: sha256(binding),
        ...(spreadsheet.properties?.locale ? { locale: spreadsheet.properties.locale } : {}),
        ...(spreadsheet.properties?.timeZone ? { timeZone: spreadsheet.properties.timeZone } : {}),
      });
      observations.push(...batchObservations);
    } finally {
      await readBoundedResponse(
        await dependencies.request(`https://www.googleapis.com/drive/v3/files/${id}`, {
          method: "DELETE",
        }),
      );
    }
  }
  const artifact: CaptureArtifact = {
    protocol: 1,
    producer: "google-sheets",
    producerVersion: dependencies.producerVersion,
    capturedAt,
    observations,
    calculation: "automatic",
    batchSize: MAX_GOOGLE_CASES_PER_WORKBOOK,
    workbooks,
    bindingSha256: sha256({
      producer: "google-sheets",
      producerVersion: dependencies.producerVersion,
      capturedAt,
      observationsSha256: sha256(observations),
      workbooks,
    }),
  };
  return dependencies.persist(artifact);
}

export function validateGoogleCaptureArtifact(
  value: unknown,
  corpus: ConformanceCorpus,
  producerVersion: string,
): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return ["google capture: expected object"];
  if (value.producer !== "google-sheets") issues.push("google capture.producer: invalid");
  if (value.producerVersion !== producerVersion) {
    issues.push("google capture.producerVersion: exact producer version required");
  }
  if (value.batchSize !== MAX_GOOGLE_CASES_PER_WORKBOOK) {
    issues.push("google capture.batchSize: quota drift");
  }
  const formulaCases = corpus.cases.filter((entry) => entry.kind === "formula");
  const observations = Array.isArray(value.observations) ? value.observations : [];
  if (observations.length !== formulaCases.length) {
    issues.push("google capture.observations: missing, extra, or reordered");
  }
  formulaCases.forEach((entry, index) => {
    const observation = observations[index];
    if (!isObject(observation) || observation.caseId !== entry.id) {
      issues.push(`google capture.observations[${index}]: missing, extra, or reordered`);
    }
  });
  const workbooks = Array.isArray(value.workbooks) ? value.workbooks : [];
  const requiredWorkbooks = Math.ceil(formulaCases.length / MAX_GOOGLE_CASES_PER_WORKBOOK);
  if (workbooks.length !== requiredWorkbooks) {
    issues.push("google capture.workbooks: batch denominator drift");
  }
  workbooks.forEach((workbook, batchIndex) => {
    const path = `google capture.workbooks[${batchIndex}]`;
    if (!isObject(workbook)) {
      issues.push(`${path}: expected manifest`);
      return;
    }
    const observationStart = batchIndex * MAX_GOOGLE_CASES_PER_WORKBOOK;
    const batchCases = formulaCases.slice(
      observationStart,
      observationStart + MAX_GOOGLE_CASES_PER_WORKBOOK,
    );
    const batchObservations = observations.slice(
      observationStart,
      observationStart + batchCases.length,
    );
    const caseIds = batchCases.map((entry) => entry.id);
    if (
      workbook.batchIndex !== batchIndex ||
      workbook.observationStart !== observationStart ||
      workbook.caseCount !== batchCases.length ||
      workbook.caseCount > MAX_GOOGLE_CASES_PER_WORKBOOK
    ) {
      issues.push(`${path}: invalid bounded batch ordering`);
    }
    if (
      workbook.firstCaseId !== caseIds[0] ||
      workbook.lastCaseId !== caseIds.at(-1) ||
      workbook.caseIdsSha256 !== sha256(caseIds) ||
      workbook.observationsSha256 !== sha256(batchObservations)
    ) {
      issues.push(`${path}: case/observation binding drift`);
    }
    const binding = {
      batchIndex,
      observationStart,
      caseIds,
      observationsSha256: workbook.observationsSha256,
      workbookSha256: workbook.workbookSha256,
      workbookBytes: workbook.workbookBytes,
    };
    if (workbook.bindingSha256 !== sha256(binding)) {
      issues.push(`${path}.bindingSha256: tampered workbook binding`);
    }
  });
  if (typeof value.capturedAt !== "string") {
    issues.push("google capture.capturedAt: required");
  } else {
    const expectedBinding = sha256({
      producer: "google-sheets",
      producerVersion,
      capturedAt: value.capturedAt,
      observationsSha256: sha256(observations),
      workbooks,
    });
    if (value.bindingSha256 !== expectedBinding) {
      issues.push("google capture.bindingSha256: tampered aggregate binding");
    }
  }
  return issues;
}

export async function captureGoogle(corpus: ConformanceCorpus): Promise<string> {
  const token = process.env.SHEETWRITE_GOOGLE_ORACLE_TOKEN;
  const producerVersion = process.env.SHEETWRITE_GOOGLE_PRODUCER_VERSION;
  if (!token || !producerVersion) {
    throw new Error(
      "Conformance compatibility BLOCKED: Google Sheets oracle requires a protected OAuth token and exact producer version",
    );
  }
  return captureGoogleWithDependencies(corpus, {
    producerVersion,
    request: (url, init) => googleRequest(token, url, init),
    persist: persistCapture,
    now: () => new Date(),
  });
}
