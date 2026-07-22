import { persistCapture, readBoundedResponse } from "../capture.js";
import { canonicalJson, isObject, sha256Bytes } from "../normalize.js";
import type {
  CaptureArtifact,
  ConformanceCase,
  ConformanceCorpus,
  ConformanceResult,
} from "../types.js";

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
  let column = 0;
  for (const character of target[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  column += entry.expected.columns! - 1;
  let label = "";
  while (column > 0) {
    column -= 1;
    label = String.fromCharCode(65 + (column % 26)) + label;
    column = Math.floor(column / 26);
  }
  const endRow = Number(target[2]) + entry.expected.rows! - 1;
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

export async function captureGoogle(corpus: ConformanceCorpus): Promise<string> {
  const token = process.env.SHEETWRITE_GOOGLE_ORACLE_TOKEN;
  const producerVersion = process.env.SHEETWRITE_GOOGLE_PRODUCER_VERSION;
  if (!token || !producerVersion) {
    throw new Error(
      "Conformance compatibility BLOCKED: Google Sheets oracle requires a protected OAuth token and exact producer version",
    );
  }
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
  const createdBytes = await readBoundedResponse(created);
  const spreadsheet = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(createdBytes),
  ) as {
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
    const updated = await googleRequest(
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
    await readBoundedResponse(updated);
    const ranges = formulaCases
      .map((entry, index) => `ranges=${encodeURIComponent(rangeFor(entry, index))}`)
      .join("&");
    const observed = await googleRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&${ranges}`,
    );
    const payloadBytes = await readBoundedResponse(observed);
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes)) as {
      sheets?: unknown[];
    };
    const exported = await googleRequest(
      token,
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
    );
    const xlsx = await readBoundedResponse(exported, 128 * 1024 * 1024);
    const capturedAt = new Date().toISOString();
    const artifact: CaptureArtifact = {
      protocol: 1,
      producer: "google-sheets",
      producerVersion,
      capturedAt,
      observations: formulaCases.map((entry, index) => ({
        caseId: entry.id,
        result: observedResult(payload.sheets?.[index], entry),
      })),
      calculation: "automatic",
      workbookSha256: sha256Bytes(xlsx),
      workbookBytes: xlsx.byteLength,
      ...(spreadsheet.properties?.locale ? { locale: spreadsheet.properties.locale } : {}),
      ...(spreadsheet.properties?.timeZone ? { timeZone: spreadsheet.properties.timeZone } : {}),
    };
    return persistCapture(artifact);
  } finally {
    const deleted = await googleRequest(token, `https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
    });
    await readBoundedResponse(deleted);
  }
}
