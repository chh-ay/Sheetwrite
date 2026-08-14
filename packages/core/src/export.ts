import { cellScalarToText, parseCellLiteralInput } from "./cell-input.js";
import { neutralizeInjection } from "./clipboard.js";
import {
  assertDelimitedTextDimensions,
  type DelimitedTextOptions,
  encodeDelimitedText,
  parseDelimitedText,
  resolveDelimitedTextResourceLimits,
} from "./delimited-text.js";
import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { IncompleteDataError } from "./store.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { Range } from "./types/coordinates.js";
import type { ColumnarData } from "./types/data.js";
import type { Sheet, Workbook, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { Store } from "./types/store.js";

/**
 * Neutralize a TEXT field before it is quoted: a string beginning with one of
 * `= + - @ \t \r` is prefixed with `'` so it cannot execute as a formula when the
 * file is reopened in Excel/Sheets. Numeric values are legitimate data and pass
 * through untouched — a negative number is a number, not an attack vector.
 */
function safeText(value: CellScalar): string {
  return typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value);
}

/** Harden a column header (always text) exactly as a text cell value. */
function safeHeader(header: string): string {
  return neutralizeInjection(header);
}

function visibleColumns(sheet: Sheet): number[] {
  const out: number[] = [];
  for (let c = 0; c < sheet.columns.length; c++) {
    if (sheet.columns[c]!.visible !== false) out.push(c);
  }
  return out;
}

function assertCompleteData(store: Store, sheet: string): void {
  const capability = store.queryCapability?.(sheet);
  if (capability?.status === "incomplete") throw new IncompleteDataError(sheet, capability);
}

/**
 * Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and
 * view-ordered rows surviving sort, filter, hidden-row, and group state. String
 * values beginning with `= + - @ \t \r` are prefixed with `'`. The synchronous
 * API returns one in-memory string, but fetches at most
 * `maxWriterWindowRows` view rows from the store per read.
 *
 * @throws {@link IncompleteDataError} before serialization when a paged sheet is incomplete.
 * @throws {@link DelimitedTextResourceError} when a configured resource ceiling is exceeded.
 */
export function toCsv(sheet: Sheet, store: Store, options: DelimitedTextOptions = {}): string {
  assertCompleteData(store, sheet.id);
  const limits = resolveDelimitedTextResourceLimits(options);
  const cols = visibleColumns(sheet);
  const viewRows = store.viewRowCount(sheet.id);
  assertDelimitedTextDimensions(viewRows + 1, cols.length, limits, "export");

  function* rows(): Generator<readonly string[]> {
    yield cols.map((column) => safeHeader(sheet.columns[column]!.header));
    for (let start = 0; start < viewRows; start += limits.maxWriterWindowRows) {
      const end = Math.min(viewRows, start + limits.maxWriterWindowRows);
      const view = store.getVisibleWindow(sheet.id, { start, end }, cols);
      for (let row = 0; row < end - start; row++) {
        const fields: string[] = new Array(cols.length);
        for (let column = 0; column < cols.length; column++) {
          fields[column] = safeText(view.values[row * cols.length + column] ?? null);
        }
        yield fields;
      }
    }
  }

  return encodeDelimitedText(rows(), ",", options, { bom: true, operation: "export" });
}

/**
 * Export a canonical data-space range as clipboard-compatible TSV (CRLF, no
 * BOM). Reversed corners are normalized; active sort and filter views do not
 * remap the supplied row coordinates. Values are injection-hardened. The
 * synchronous API returns one in-memory string and fetches at most
 * `maxWriterWindowRows` canonical rows per packed store read.
 *
 * @throws {@link IncompleteDataError} before serialization when a paged sheet is incomplete.
 * @throws {@link DelimitedTextResourceError} when a configured resource ceiling is exceeded.
 */
export function toTsv(range: Range, store: Store, options: DelimitedTextOptions = {}): string {
  assertCompleteData(store, range.sheet);
  const limits = resolveDelimitedTextResourceLimits(options);
  const startRow = Math.min(range.start.row, range.end.row);
  const endRow = Math.max(range.start.row, range.end.row);
  const startColumn = Math.min(range.start.col, range.end.col);
  const endColumn = Math.max(range.start.col, range.end.col);
  const rowCount = endRow - startRow + 1;
  const columnCount = endColumn - startColumn + 1;
  assertDelimitedTextDimensions(rowCount, columnCount, limits, "export");

  function* rows(): Generator<readonly string[]> {
    const columns = Array.from({ length: columnCount }, (_, index) => startColumn + index);
    for (
      let chunkStart = startRow;
      chunkStart <= endRow;
      chunkStart += limits.maxWriterWindowRows
    ) {
      const chunkEnd = Math.min(endRow + 1, chunkStart + limits.maxWriterWindowRows);
      const window = store.getDataWindow?.(
        range.sheet,
        { start: chunkStart, end: chunkEnd },
        columns,
      );
      for (let row = chunkStart; row < chunkEnd; row++) {
        const fields: string[] = new Array(columnCount);
        for (let column = 0; column < columnCount; column++) {
          const value = window
            ? (window.values[(row - chunkStart) * columnCount + column] ?? null)
            : store.getCell({ sheet: range.sheet, row, col: startColumn + column }).resolved;
          fields[column] = safeText(value);
        }
        yield fields;
      }
    }
  }

  return encodeDelimitedText(rows(), "\t", options, { operation: "export" });
}

/**
 * Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes,
 * bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional
 * leading UTF-8 BOM. The synchronous API consumes an existing in-memory string
 * and returns an in-memory grid; it does not claim streaming. Scanning enforces
 * resource ceilings before materializing the next oversized field or record.
 */
export function parseCsv(text: string, options: DelimitedTextOptions = {}): string[][] {
  return parseDelimitedText(text, ",", options);
}

/**
 * Parse CSV into `ColumnarData`. The first record is consumed as a positional
 * header. Input fields project onto declared visible columns; hidden declared
 * columns are initialized to `null`, matching the visible-column CSV export.
 * Extra fields are ignored and missing fields become `null`. The returned
 * columnar table is fully materialized in memory.
 */
export function fromCsv(
  text: string,
  columns: readonly Column[],
  options: DelimitedTextOptions = {},
): ColumnarData {
  const limits = resolveDelimitedTextResourceLimits(options);
  const grid = parseDelimitedText(text, ",", options);
  const rowCount = Math.max(0, grid.length - 1);
  assertDelimitedTextDimensions(rowCount, columns.length, limits, "import");

  const result: Record<string, CellScalar[]> = Object.create(null);
  for (const column of columns) result[column.key] = new Array<CellScalar>(rowCount).fill(null);

  const projected = columns.filter((column) => column.visible !== false);
  for (let row = 0; row < rowCount; row++) {
    const fields = grid[row + 1]!;
    for (let column = 0; column < projected.length; column++) {
      const target = projected[column]!;
      result[target.key]![row] =
        fields[column] === undefined ? null : parseCellLiteralInput(fields[column]!, target.type);
    }
  }

  return { rowCount, columns: result };
}

/**
 * Trigger a browser download from in-memory bytes. The temporary anchor is
 * removed and its object URL is scheduled for revocation even when DOM append or
 * click throws.
 */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void {
  if (typeof document === "undefined") {
    throw new Error("Sheetwrite: downloadBytes requires a browser environment");
  }

  const needsCopy =
    typeof bytes !== "string" &&
    typeof SharedArrayBuffer !== "undefined" &&
    bytes.buffer instanceof SharedArrayBuffer;
  const part: BlobPart = needsCopy ? new Uint8Array(bytes) : (bytes as BlobPart);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      // A synchronous revoke can race download navigation in some engines.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

/** Resource dimensions bounded by every XLSX import and export path. */
export interface XlsxResourceLimits {
  /** Compressed workbook input bytes; defaults to 32 MiB. */
  maxInputBytes: number;
  /** Encoded workbook output bytes; defaults to 128 MiB. */
  maxOutputBytes: number;
  /** ZIP archive entries; defaults to 1,024. */
  maxArchiveEntries: number;
  /** Uncompressed bytes in any one ZIP entry; defaults to 64 MiB. */
  maxEntryUncompressedBytes: number;
  /** Aggregate uncompressed ZIP entry bytes; defaults to 256 MiB. */
  maxTotalUncompressedBytes: number;
  /** Uncompressed-to-compressed ratio for one ZIP entry; defaults to 100. */
  maxCompressionRatio: number;
  /** Workbook worksheets; defaults to 256. */
  maxSheets: number;
  /** Rows in any worksheet; defaults to 1,048,576. */
  maxRowsPerSheet: number;
  /** Columns in any worksheet; defaults to 16,384. */
  maxColumnsPerSheet: number;
  /** Cells accounted by the active conversion path; defaults to 1,000,000. */
  maxCells: number;
  /** Aggregate merged ranges; defaults to 100,000. */
  maxMerges: number;
  /** Shared-string table entries; defaults to 1,000,000. */
  maxSharedStrings: number;
  /** Style-related records; defaults to 65,536. */
  maxStyles: number;
  /** Elements in any one XML part; defaults to 2,000,000. */
  maxXmlElements: number;
  /** Element nesting depth in any one XML part; defaults to 64. */
  maxXmlDepth: number;
  /** Attributes on any one XML element; defaults to 128. */
  maxXmlAttributesPerElement: number;
  /** UTF-8 text bytes in one XML element or attribute; defaults to 16 MiB. */
  maxXmlTextBytes: number;
}

/**
 * Codec defaults combine SpreadsheetML worksheet dimensions with independent
 * ZIP/XML and aggregate-work ceilings for untrusted in-memory conversion.
 */
export const DEFAULT_XLSX_RESOURCE_LIMITS: Readonly<XlsxResourceLimits> = Object.freeze({
  // Bound caller input and the single returned byte array.
  maxInputBytes: 32 * 1024 * 1024,
  maxOutputBytes: 128 * 1024 * 1024,
  // Bound archive fan-out and decompression, including zip-bomb ratios.
  maxArchiveEntries: 1_024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 100,
  // SpreadsheetML worksheet compatibility dimensions.
  maxSheets: 256,
  maxRowsPerSheet: 1_048_576,
  maxColumnsPerSheet: 16_384,
  // Bound aggregate conversion collections.
  maxCells: 1_000_000,
  maxMerges: 100_000,
  maxSharedStrings: 1_000_000,
  maxStyles: 65_536,
  // Bound each hand-parsed XML part independently.
  maxXmlElements: 2_000_000,
  maxXmlDepth: 64,
  maxXmlAttributesPerElement: 128,
  maxXmlTextBytes: 16 * 1024 * 1024,
});

/** Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data. */
export class XlsxResourceError extends SheetwriteError {
  override readonly name = "XlsxResourceError";

  constructor(
    readonly resource: keyof XlsxResourceLimits,
    readonly limit: number,
    readonly actual: number,
    operation: "import" | "export",
  ) {
    super(
      "xlsx-resource-limit",
      `xlsx-${operation}`,
      `Sheetwrite: XLSX ${operation} ${resource} limit is ${limit}; observed ${actual}`,
      { context: { format: "xlsx", resource, limit, actual } },
    );
  }
}

/**
 * Pluggable first-row-header, first-sheet table export backend.
 */
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
}

let tableExportBackend: XlsxTableExportBackend | null = null;

/** Registers the optional table XLSX export implementation used by core. */
export function setXlsxTableExportBackend(next: XlsxTableExportBackend): void {
  tableExportBackend = next;
}

function missingXlsxBackend(
  functionName: string,
  operation: "xlsx-import" | "xlsx-export",
): SheetwriteError {
  return new SheetwriteError(
    "optional-backend-unavailable",
    operation,
    `Sheetwrite: XLSX backend not registered. Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling ${functionName}.`,
    { context: { backend: "xlsx", functionName }, retryable: false },
  );
}

/** Exports a table model through the registered optional XLSX backend. */
export async function toXlsxTable(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = tableExportBackend;
  if (!backend) throw missingXlsxBackend("toXlsxTable", "xlsx-export");
  try {
    return await backend.toXlsxTable(workbook, store, options);
  } catch (error) {
    throw normalizeSheetwriteError(error, "export-failed", "xlsx-export", {
      backend: backend.name,
      functionName: "toXlsxTable",
    });
  }
}

// ── xlsx import ──────────────────────────────────────────────────────────────

/**
 * Pluggable table import backend. Parses raw `.xlsx` bytes into the same
 * `ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
 * format-agnostic.
 */
export interface XlsxTableImportBackend {
  name: string;
  fromXlsxTable(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<ColumnarData>;
}

let tableImportBackend: XlsxTableImportBackend | null = null;

/** Registers the optional table XLSX import implementation used by core. */
export function setXlsxTableImportBackend(next: XlsxTableImportBackend): void {
  tableImportBackend = next;
}

/**
 * Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
 * row is treated as the header and its cell text becomes each column's key.
 * Numbers stay numbers, date cells use the date-serial convention, strings are
 * verbatim, and empty cells become `null`.
 */
export async function fromXlsxTable(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<ColumnarData> {
  const backend = tableImportBackend;
  if (!backend) throw missingXlsxBackend("fromXlsxTable", "xlsx-import");
  try {
    return await backend.fromXlsxTable(data, options);
  } catch (error) {
    throw normalizeSheetwriteError(error, "xlsx-import-failed", "xlsx-import", {
      backend: backend.name,
      functionName: "fromXlsxTable",
    });
  }
}

// ── Workbook-level XLSX round-trip ───────────────────────────────────────────

/** Structured fidelity warning emitted during XLSX conversion. */
export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature"
    | "external-relationship"
    | "external-formula"
    | "format-loss"
    | "validation-loss"
    | "invalid-metadata";
  message: string;
  sheet?: string;
  cell?: string;
  part?: string;
}

/** Shared options passed to every registered table and workbook XLSX backend. */
export interface XlsxWorkbookOptions {
  /** Abort before or between bounded codec operations. */
  signal?: AbortSignal;
  /** Cells accounted by the active conversion path; defaults to 1,000,000. */
  maxCells?: number;
  /** Positive overrides for every XLSX resource dimension except `maxCells`. */
  resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
}

/** Optional backend contract for complete workbook XLSX interchange. */
export interface XlsxWorkbookBackend {
  name: string;
  toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
}

let workbookBackend: XlsxWorkbookBackend | null = null;

/** Registers the optional workbook XLSX implementation used by core. */
export function setXlsxWorkbookBackend(next: XlsxWorkbookBackend): void {
  workbookBackend = next;
}

function workbookSnapshotOf(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
): WorkbookSnapshot {
  return "schemaVersion" in input ? input : input.exportSnapshot();
}

/** Formula-preserving, multi-sheet workbook export through the optional XLSX backend. */
export async function toXlsxWorkbook(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = workbookBackend;
  if (!backend) throw missingXlsxBackend("toXlsxWorkbook", "xlsx-export");
  try {
    return await backend.toXlsxWorkbook(workbookSnapshotOf(input), options);
  } catch (error) {
    throw normalizeSheetwriteError(error, "export-failed", "xlsx-export", {
      backend: backend.name,
      functionName: "toXlsxWorkbook",
    });
  }
}

/** Formula-preserving, multi-sheet workbook import through the optional XLSX backend. */
export async function fromXlsxWorkbook(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  const backend = workbookBackend;
  if (!backend) throw missingXlsxBackend("fromXlsxWorkbook", "xlsx-import");
  try {
    return await backend.fromXlsxWorkbook(data, options);
  } catch (error) {
    throw normalizeSheetwriteError(error, "xlsx-import-failed", "xlsx-import", {
      backend: backend.name,
      functionName: "fromXlsxWorkbook",
    });
  }
}
