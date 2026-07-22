/**
 * Spreadsheet interoperability scenario — capability owner for
 * `/showcases/interoperability/`.
 *
 * Framework-neutral: owns the canonical interchange workbook, the committed
 * independent fixture registry (bytes + provenance from
 * `packages/xlsx/test/fixtures/`), the producer verification matrix, and the
 * import/export/limit protocols the route and its browser spec both consume.
 * Everything here calls the real public `@sheetwrite/core` interchange API;
 * the optional `@sheetwrite/xlsx` codec is loaded only through
 * {@link ensureXlsxRegistered} so the package boundary stays observable.
 */

import type {
  Column,
  ColumnarData,
  Grid,
  Range,
  Sheet,
  WorkbookSnapshot,
  XlsxWorkbookOptions,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import {
  fromCsv,
  fromXlsxWorkbook,
  parseCsv,
  toCsv,
  toTsv,
  toXlsxWorkbook,
} from "@sheetwrite/core";
import compressionRatioUrl from "../../../../packages/xlsx/test/fixtures/compression-ratio.xlsx?url";
import corruptDeflateUrl from "../../../../packages/xlsx/test/fixtures/corrupt-deflate.xlsx?url";
import deepXmlUrl from "../../../../packages/xlsx/test/fixtures/deep-xml.xlsx?url";
import doctypeUrl from "../../../../packages/xlsx/test/fixtures/doctype.xlsx?url";
import externalCorpus from "../../../../packages/xlsx/test/fixtures/external-corpus.json";
import libreofficeMetadataUrl from "../../../../packages/xlsx/test/fixtures/libreoffice-metadata.xlsx?url";
import libreofficeRichUrl from "../../../../packages/xlsx/test/fixtures/libreoffice-rich.xlsx?url";
import fixtureManifest from "../../../../packages/xlsx/test/fixtures/manifest.json";
import positiveUrl from "../../../../packages/xlsx/test/fixtures/sheetwrite-libreoffice-positive.xlsx?url";
import traversalUrl from "../../../../packages/xlsx/test/fixtures/traversal.xlsx?url";

// ── Canonical interchange workbook ───────────────────────────────────────────

export const INTEROP_ORDERS_SHEET = "orders";
export const INTEROP_INVOICE_SHEET = "invoice";
export const INTEROP_ASSUMPTIONS_SHEET = "assumptions";
export const INTEROP_ANALYSIS_SHEET = "analysis";

/** Literal text that MUST leave the CSV path neutralized, never executable. */
export const INTEROP_INJECTION_TEXT = '=HYPERLINK("https://evil.example","Q3 total")';

const ORDER_ROWS: ReadonlyArray<readonly [sku: string, item: string, qty: number, price: number]> =
  [
    ["OP-1041", "Standing desk", 4, 749.5],
    ["OP-1042", "Task chair", 12, 289.99],
    ["OP-1043", "Monitor arm", 18, 74.25],
    ["OP-1044", "Meeting camera", 3, 1189.0],
    ["OP-1045", INTEROP_INJECTION_TEXT, 1, 0],
    ["OP-1046", "Cable spine", 30, 12.8],
  ];

function literal(rowOffset: number, colOffset: number, value: string | number) {
  return { rowOffset, colOffset, value: { kind: "literal", value } as const };
}

function formula(rowOffset: number, colOffset: number, src: string) {
  return { rowOffset, colOffset, value: { kind: "formula", src } as const };
}

/**
 * The canonical multi-sheet snapshot the workbench boots from: the original
 * order/invoice interchange fixture plus a compact, bounded analytical model.
 * Its formula sources exercise portable lookup, date, statistics, array, LET,
 * and financial families while retaining every XLSX/CSV fidelity feature.
 */
export function createInteropSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: INTEROP_ORDERS_SHEET },
    sheets: [
      {
        id: INTEROP_ORDERS_SHEET,
        name: "Orders",
        order: 0,
        rowCount: ORDER_ROWS.length,
        frozenRows: 1,
        columns: [
          { key: "sku", header: "SKU", width: 96, type: "text" },
          { key: "item", header: "Item", width: 230, type: "text" },
          { key: "qty", header: "Qty", width: 64, type: "number" },
          {
            key: "price",
            header: "Unit price",
            width: 110,
            type: "currency",
            numberFormat: "$#,##0.00",
          },
          {
            key: "total",
            header: "Line total",
            width: 120,
            type: "currency",
            numberFormat: "$#,##0.00",
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: ORDER_ROWS.length,
            colCount: 5,
            cells: ORDER_ROWS.flatMap(([sku, item, qty, price], row) => [
              literal(row, 0, sku),
              literal(row, 1, item),
              literal(row, 2, qty),
              literal(row, 3, price),
              formula(row, 4, `=C${row + 1}*D${row + 1}`),
            ]),
          },
        ],
      },
      {
        id: INTEROP_INVOICE_SHEET,
        name: "Invoice",
        order: 1,
        rowCount: 5,
        columns: [
          { key: "label", header: "Invoice line", width: 240, type: "text" },
          {
            key: "amount",
            header: "Amount",
            width: 130,
            type: "currency",
            numberFormat: "$#,##0.00",
          },
        ],
        merges: [{ r0: 4, c0: 0, r1: 4, c1: 1 }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 5,
            colCount: 2,
            cells: [
              literal(0, 0, "Subtotal"),
              formula(0, 1, `=SUM(Orders!E1:E${ORDER_ROWS.length})`),
              literal(1, 0, "Volume discount (10%)"),
              formula(1, 1, "=B1*0.1"),
              literal(2, 0, "Net due"),
              formula(2, 1, "=B1-B2"),
              { ...literal(3, 0, "Terms"), style: { bold: true } },
              literal(3, 1, "Net 30"),
              literal(4, 0, "Generated with Sheetwrite — merged footer cell"),
            ],
          },
        ],
      },
      {
        id: INTEROP_ASSUMPTIONS_SHEET,
        name: "Assumptions",
        order: 2,
        rowCount: 5,
        frozenRows: 1,
        columns: [
          { key: "assumption", header: "Assumption", width: 180, type: "text" },
          { key: "input", header: "Selected input", width: 120, type: "number" },
          { key: "scenario", header: "Scenario", width: 120, type: "text" },
          {
            key: "annualRate",
            header: "Annual rate",
            width: 110,
            type: "number",
            numberFormat: "0.0%",
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 5,
            colCount: 4,
            cells: [
              literal(0, 0, "Selected scenario"),
              literal(0, 1, "Base"),
              literal(0, 2, "Conservative"),
              literal(0, 3, 0.04),
              literal(1, 0, "Selected annual rate"),
              formula(1, 1, "=XLOOKUP(B1,C1:C3,D1:D3)"),
              literal(1, 2, "Base"),
              literal(1, 3, 0.06),
              literal(2, 0, "Loan term (months)"),
              literal(2, 1, 12),
              literal(2, 2, "Growth"),
              literal(2, 3, 0.08),
              literal(3, 0, "Principal"),
              literal(3, 1, 12_000),
              literal(4, 0, "Projection periods"),
              literal(4, 1, 4),
            ],
          },
        ],
      },
      {
        id: INTEROP_ANALYSIS_SHEET,
        name: "Analysis",
        order: 3,
        rowCount: 6,
        frozenRows: 1,
        columns: [
          {
            key: "date",
            header: "Cash-flow date",
            width: 125,
            type: "date",
            numberFormat: "yyyy-mm-dd",
          },
          {
            key: "cashFlow",
            header: "Cash flow",
            width: 110,
            type: "currency",
            numberFormat: "$#,##0.00",
          },
          { key: "metric", header: "Analytical result", width: 230, type: "text" },
          { key: "result", header: "Value", width: 135, type: "number" },
          { key: "projection", header: "Bounded spill", width: 110, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 6,
            colCount: 5,
            cells: [
              formula(0, 0, "=DATE(2026,1,31)"),
              literal(0, 1, -12_000),
              literal(0, 2, "Monthly payment (PMT)"),
              formula(0, 3, "=-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4)"),
              formula(0, 4, "=SEQUENCE(Assumptions!B5,1,1,1)"),
              formula(1, 0, "=EDATE(A1,12)"),
              literal(1, 1, 3_500),
              literal(1, 2, "Order total standard deviation"),
              formula(1, 3, "=ROUND(STDEV.S(Orders!E1:E6),2)"),
              formula(2, 0, "=EDATE(A2,12)"),
              literal(2, 1, 3_500),
              literal(2, 2, "Remaining scheduled payments (LET)"),
              formula(
                2,
                3,
                "=LET(payment,-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4),ROUND(payment*Assumptions!B3-payment,2))",
              ),
              formula(3, 0, "=EDATE(A3,12)"),
              literal(3, 1, 3_500),
              literal(3, 2, "Project NPV"),
              formula(3, 3, "=NPV(Assumptions!B2,B2:B5)+B1"),
              formula(4, 0, "=EDATE(A4,12)"),
              literal(4, 1, 3_500),
              literal(4, 2, "Project IRR"),
              formula(4, 3, "=IRR(B1:B5)"),
            ],
          },
        ],
      },
    ],
  };
}

/** Observable states the browser contract asserts against. */
export const INTEROP_EXPECTED = {
  orderRows: ORDER_ROWS.length,
  sheets: [
    INTEROP_ORDERS_SHEET,
    INTEROP_INVOICE_SHEET,
    INTEROP_ASSUMPTIONS_SHEET,
    INTEROP_ANALYSIS_SHEET,
  ],
  /** Formula source of the first computed line total. */
  firstTotalFormula: "=C1*D1",
  /** Cross-sheet subtotal on the invoice sheet. */
  subtotalFormula: `=SUM(Orders!E1:E${ORDER_ROWS.length})`,
  lookupFormula: "=XLOOKUP(B1,C1:C3,D1:D3)",
  paymentFormula: "=-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4)",
  spillFormula: "=SEQUENCE(Assumptions!B5,1,1,1)",
  dateFormula: "=EDATE(A4,12)",
  statisticalFormula: "=ROUND(STDEV.S(Orders!E1:E6),2)",
  letFormula:
    "=LET(payment,-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4),ROUND(payment*Assumptions!B3-payment,2))",
  npvFormula: "=NPV(Assumptions!B2,B2:B5)+B1",
  irrFormula: "=IRR(B1:B5)",
  /** Every formula the canonical snapshot ships, for round-trip comparison. */
  formulaCount: ORDER_ROWS.length + 3 + 1 + 11,
  selectedRate: 0.06,
  monthlyPayment: 1032.7971564849884,
  statisticalResult: 1592.74,
  letResult: 11360.77,
  npv: 127.86964444879777,
  irr: 0.06464423448532142,
  scheduleEndSerial: 47514,
  spill: [1, 2, 3, 4],
  injectionCell: { sheet: INTEROP_ORDERS_SHEET, row: 4, col: 1 },
} as const;

// ── Optional package boundary ────────────────────────────────────────────────

/**
 * Probe the workbook-backend registration state. The core boundary rejects an
 * unregistered backend asynchronously, so this must await the tiny discarded
 * export instead of treating the returned Promise as proof of registration.
 */
export async function probeXlsxRegistration(): Promise<{
  registered: boolean;
  error: string | null;
}> {
  try {
    const probe = toXlsxWorkbook({
      schemaVersion: 1,
      workbook: { activeSheet: "p" },
      sheets: [
        {
          id: "p",
          name: "Probe",
          order: 0,
          rowCount: 1,
          columns: [{ key: "a", header: "A", width: 40, type: "text" }],
          cells: [],
        },
      ],
    });
    await probe;
    return { registered: true, error: null };
  } catch (error) {
    return { registered: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Load and register the optional XLSX codec. Dynamic on purpose: the chunk
 * boundary IS the package boundary this capability demonstrates.
 */
export async function ensureXlsxRegistered(): Promise<void> {
  await import("@sheetwrite/xlsx/register");
}

// ── Committed independent fixtures ───────────────────────────────────────────

export interface InteropFixture {
  id: string;
  file: string;
  url: string;
  sha256: string;
  producer: string;
  kind: "positive" | "adversarial";
  /** Supported features (positive) or the attack the codec must reject. */
  details: readonly string[];
  expectedWarnings: readonly string[];
}

const FIXTURE_URLS: Record<string, string> = {
  "sheetwrite-libreoffice-positive.xlsx": positiveUrl,
  "libreoffice-rich.xlsx": libreofficeRichUrl,
  "libreoffice-metadata.xlsx": libreofficeMetadataUrl,
  "traversal.xlsx": traversalUrl,
  "doctype.xlsx": doctypeUrl,
  "deep-xml.xlsx": deepXmlUrl,
  "compression-ratio.xlsx": compressionRatioUrl,
  "corrupt-deflate.xlsx": corruptDeflateUrl,
};

function fixtureUrl(file: string): string {
  const url = FIXTURE_URLS[file];
  if (url === undefined) {
    throw new Error(`Interoperability scenario is missing bytes for manifest fixture ${file}`);
  }
  return url;
}

/** LibreOffice-produced workbooks whose bytes are committed and run live here. */
export const POSITIVE_FIXTURES: readonly InteropFixture[] = fixtureManifest.positive.map(
  (entry) => ({
    id: entry.file.replace(/\.xlsx$/, ""),
    file: entry.file,
    url: fixtureUrl(entry.file),
    sha256: entry.sha256,
    producer: `${entry.producer.name} ${entry.producer.version}`,
    kind: "positive",
    details: entry.expectedSubset,
    expectedWarnings: entry.expectedWarnings,
  }),
);

/** Hand-authored hostile OPC/SpreadsheetML packages the codec must reject. */
export const ADVERSARIAL_FIXTURES: readonly InteropFixture[] = fixtureManifest.adversarial.map(
  (entry) => ({
    id: entry.file.replace(/\.xlsx$/, ""),
    file: entry.file,
    url: fixtureUrl(entry.file),
    sha256: entry.sha256,
    producer: fixtureManifest.adversarialProvenance.producer,
    kind: "adversarial",
    details: [entry.purpose],
    expectedWarnings: [],
  }),
);

export async function fetchFixtureBytes(fixture: InteropFixture): Promise<Uint8Array> {
  const response = await fetch(fixture.url);
  if (!response.ok) throw new Error(`Failed to fetch ${fixture.file}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Browser-native digest so provenance is proven against the manifest, not asserted. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view: BufferSource excludes
  // SharedArrayBuffer-backed views, and fixtures may arrive as either.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ── Producer verification matrix ─────────────────────────────────────────────

export interface ProducerVerification {
  producer: string;
  status: "verified-live" | "verified-suite" | "unverified";
  detail: string;
  evidence: string;
}

const EXCEL_CORPUS_FILES = externalCorpus.fixtures.length;
const EXCEL_UNVERIFIED = externalCorpus.unverified["Microsoft Excel"];
const SHEETS_UNVERIFIED = externalCorpus.unverified["Google Sheets"];
const GOOGLE_FIXTURES = externalCorpus.googleFixtures;

/**
 * Honest producer compatibility: only claims backed by real bytes. Every row
 * derives from the checked-in corpus records, so a producer's status changes
 * here exactly when its evidence changes there.
 */
export const PRODUCER_MATRIX: readonly ProducerVerification[] = [
  {
    producer: `LibreOffice ${fixtureManifest.positive[0]?.producer.version ?? ""}`.trim(),
    status: "verified-live",
    detail:
      "Committed LibreOffice-produced workbooks import on this page, in your browser, with checksums verified against the fixture manifest.",
    evidence: "packages/xlsx/test/fixtures/manifest.json",
  },
  {
    producer: "Sheetwrite round-trip",
    status: "verified-live",
    detail:
      "The workbench below exports this document to .xlsx bytes and re-imports them live; formulas, formats, the merge, and frozen rows survive.",
    evidence: "toXlsxWorkbook / fromXlsxWorkbook on this page",
  },
  {
    producer: "Microsoft Excel",
    status: "verified-suite",
    detail: `${EXCEL_CORPUS_FILES} Excel-produced workbooks from the Apache POI test corpus (commit ${externalCorpus.commit.slice(0, 10)}) are checksum-pinned and verified in the conformance suite. Those bytes are not redistributed here, so this page does not run them. Not yet verified from Excel bytes: ${EXCEL_UNVERIFIED.join(", ")}.`,
    evidence: "packages/xlsx/test/fixtures/external-corpus.json",
  },
  GOOGLE_FIXTURES.length > 0
    ? {
        producer: "Google Sheets",
        status: "verified-suite",
        detail: `${GOOGLE_FIXTURES.length} genuine Google Sheets-exported workbook${GOOGLE_FIXTURES.length === 1 ? "" : "s"} (${GOOGLE_FIXTURES.map((fixture) => fixture.file).join(", ")}) ${GOOGLE_FIXTURES.length === 1 ? "is" : "are"} checksum-pinned and verified in the conformance suite: ${GOOGLE_FIXTURES[0]?.expected.join(", ") ?? ""}. Licensing does not permit redistributing the bytes here, so this page does not run them. Not yet verified from Google Sheets bytes: ${SHEETS_UNVERIFIED.join(", ")}.`,
        evidence: "packages/xlsx/test/fixtures/external-corpus.json",
      }
    : {
        producer: "Google Sheets",
        status: "unverified",
        detail: `Unverified. No genuine Google Sheets-produced bytes exist in the corpus yet, so no compatibility claim is made for: ${SHEETS_UNVERIFIED.join(", ")}.`,
        evidence: "packages/xlsx/test/fixtures/external-corpus.json",
      },
];

// ── Import / export protocol ─────────────────────────────────────────────────

export interface WorkbookImportOutcome {
  snapshot: WorkbookSnapshot;
  warnings: XlsxWorkbookWarning[];
  inputBytes: number;
}

export async function importWorkbook(
  bytes: ArrayBuffer | Uint8Array,
  options: Omit<XlsxWorkbookOptions, "onWarning"> = {},
): Promise<WorkbookImportOutcome> {
  await ensureXlsxRegistered();
  const warnings: XlsxWorkbookWarning[] = [];
  const snapshot = await fromXlsxWorkbook(bytes, {
    ...options,
    onWarning: (warning) => warnings.push(warning),
  });
  const inputBytes = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;
  return { snapshot, warnings, inputBytes };
}

export interface WorkbookExportOutcome {
  bytes: Uint8Array;
  warnings: XlsxWorkbookWarning[];
}

export async function exportWorkbook(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
): Promise<WorkbookExportOutcome> {
  await ensureXlsxRegistered();
  const warnings: XlsxWorkbookWarning[] = [];
  const bytes = await toXlsxWorkbook(input, { onWarning: (warning) => warnings.push(warning) });
  return { bytes, warnings };
}

function formulaSources(snapshot: WorkbookSnapshot): string[] {
  const sources: string[] = [];
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind === "formula") sources.push(cell.value.src);
      }
    }
  }
  return sources.sort();
}

export interface RoundTripReport {
  exportedBytes: number;
  exportWarnings: XlsxWorkbookWarning[];
  importWarnings: XlsxWorkbookWarning[];
  sheetsPreserved: boolean;
  formulasBefore: number;
  formulasPreserved: number;
  mergePreserved: boolean;
  frozenRowsPreserved: boolean;
}

/** Live export → re-import proof over the current grid document. */
export async function roundTripWorkbook(
  grid: Pick<Grid, "exportSnapshot">,
): Promise<RoundTripReport> {
  const before = grid.exportSnapshot();
  const exported = await exportWorkbook(before);
  const imported = await importWorkbook(exported.bytes);

  const beforeFormulas = formulaSources(before);
  const afterFormulas = new Set(formulaSources(imported.snapshot));
  const invoiceAfter = imported.snapshot.sheets.find((sheet) => sheet.name === "Invoice");
  const ordersAfter = imported.snapshot.sheets.find((sheet) => sheet.name === "Orders");

  return {
    exportedBytes: exported.bytes.byteLength,
    exportWarnings: exported.warnings,
    importWarnings: imported.warnings,
    sheetsPreserved: imported.snapshot.sheets.length === before.sheets.length,
    formulasBefore: beforeFormulas.length,
    formulasPreserved: beforeFormulas.filter((src) => afterFormulas.has(src)).length,
    mergePreserved: (invoiceAfter?.merges?.length ?? 0) > 0,
    frozenRowsPreserved: (ordersAfter?.frozenRows ?? 0) > 0,
  };
}

// ── CSV / TSV protocol ───────────────────────────────────────────────────────

function activeSheetOf(grid: Grid): Sheet {
  const active = grid.getActiveSheet();
  const sheet = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === active);
  if (!sheet) throw new Error("Sheetwrite grid lost its active sheet");
  return sheet;
}

/** CSV of the active sheet through the hardened public export path. */
export function csvOfActiveSheet(grid: Grid): string {
  return toCsv(activeSheetOf(grid), grid.store);
}

/** TSV of the current selection (normalized to one rectangle), or null. */
export function tsvOfSelection(grid: Grid): string | null {
  const selection = grid.getSelection();
  const sheet = activeSheetOf(grid);
  const lastRow = sheet.rowCount - 1;
  const lastCol = sheet.columns.length - 1;
  let range: Range | null = null;
  switch (selection?.kind) {
    case "cell":
      range = { sheet: selection.addr.sheet, start: selection.addr, end: selection.addr };
      break;
    case "range":
      range = selection.range;
      break;
    case "row":
      range = {
        sheet: selection.sheet,
        start: { row: selection.row, col: 0 },
        end: { row: selection.row, col: lastCol },
      };
      break;
    case "column":
      range = {
        sheet: selection.sheet,
        start: { row: 0, col: selection.col },
        end: { row: lastRow, col: selection.col },
      };
      break;
    case "multi":
      range = selection.ranges[0] ?? null;
      break;
    default:
      range = null;
  }
  return range === null ? null : toTsv(range, grid.store);
}

export interface DelimitedImport {
  columns: Column[];
  data: ColumnarData;
  delimiter: "," | "\t";
  rows: number;
}

/**
 * Parse pasted delimited text into a typed columnar dataset through the real
 * `parseCsv`/`fromCsv` ingestion path. The supported paste dialect is CSV; a
 * tab-separated paste is accepted only when it contains no quoting or commas
 * (the shape `toTsv` produces for plain values), because core's public import
 * dialect is the fixed comma dialect.
 */
export function importDelimitedText(text: string): DelimitedImport {
  const newline = text.indexOf("\n");
  const firstLine = text.slice(0, newline === -1 ? text.length : newline);
  let delimiter: "," | "\t" = ",";
  let csvText = text;
  if (firstLine.includes("\t")) {
    if (text.includes(",") || text.includes('"')) {
      throw new Error("Tab-separated paste with quoting is not supported here — paste CSV instead");
    }
    delimiter = "\t";
    csvText = text.replaceAll("\t", ",");
  }
  const rows = parseCsv(csvText);
  const header = rows[0];
  if (!header || header.length === 0 || rows.length < 2) {
    throw new Error("Provide a header row plus at least one data row");
  }
  const body = rows.slice(1);
  const columns: Column[] = header.map((label, index) => {
    const numeric = body.every((row) => {
      const cell = (row[index] ?? "").trim();
      return cell !== "" && Number.isFinite(Number(cell));
    });
    return {
      key: `c${index}`,
      header: label || `Column ${index + 1}`,
      width: 140,
      type: numeric ? "number" : "text",
    };
  });
  // fromCsv consumes the original text: first record is the positional header.
  const data = fromCsv(csvText, columns);
  return { columns, data, delimiter, rows: body.length };
}

// ── Limits, aborts, and hostile input ────────────────────────────────────────

export interface RejectionReport {
  rejected: boolean;
  errorName: string | null;
  message: string | null;
}

/** Run hostile or over-limit bytes through the real import path; report the typed rejection. */
export async function expectRejection(
  bytes: Uint8Array,
  options: XlsxWorkbookOptions = {},
): Promise<RejectionReport> {
  await ensureXlsxRegistered();
  try {
    await fromXlsxWorkbook(bytes, options);
    return { rejected: false, errorName: null, message: null };
  } catch (error) {
    return {
      rejected: true,
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** An aborted signal must fail the codec before it allocates. */
export async function abortedImport(bytes: Uint8Array): Promise<RejectionReport> {
  const controller = new AbortController();
  controller.abort();
  return expectRejection(bytes, { signal: controller.signal });
}

/** Deterministic oversized CSV used to trip the delimited-text cell ceiling. */
export function delimitedCeilingDemo(): RejectionReport {
  const wide = Array.from({ length: 40 }, (_, index) => `c${index}`).join(",");
  const big = [wide, ...Array.from({ length: 100 }, () => wide)].join("\n");
  try {
    parseCsv(big, { resourceLimits: { maxCells: 1_000 } });
    return { rejected: false, errorName: null, message: null };
  } catch (error) {
    return {
      rejected: true,
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
