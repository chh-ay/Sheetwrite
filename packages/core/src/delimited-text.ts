/** Resource ceilings shared by synchronous CSV and TSV parsing and encoding. */
export interface DelimitedTextResourceLimits {
  /** Maximum UTF-8 bytes accepted from one input string. */
  maxInputBytes: number;
  /** Maximum UTF-8 bytes produced by one output string, including a BOM when present. */
  maxOutputBytes: number;
  /** Maximum syntactically present records. */
  maxRows: number;
  /** Maximum fields in any record. */
  maxColumns: number;
  /** Maximum fields across all records. */
  maxCells: number;
  /** Maximum decoded UTF-8 bytes in one field. */
  maxFieldBytes: number;
  /** Maximum rows fetched by an export writer in one packed store read. */
  maxWriterWindowRows: number;
}

/** Optional resource ceilings for an in-memory delimited-text operation. */
export interface DelimitedTextOptions {
  resourceLimits?: Partial<DelimitedTextResourceLimits>;
}

/** Conservative defaults for synchronous, in-memory CSV and TSV operations. */
export const DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS: Readonly<DelimitedTextResourceLimits> =
  Object.freeze({
    maxInputBytes: 32 * 1024 * 1024,
    maxOutputBytes: 64 * 1024 * 1024,
    maxRows: 1_000_000,
    maxColumns: 16_384,
    maxCells: 1_000_000,
    maxFieldBytes: 1 * 1024 * 1024,
    maxWriterWindowRows: 4_096,
  });

/** Phase reported by a typed delimited-text resource failure. */
export type DelimitedTextOperation = "parse" | "import" | "encode" | "export";

/** Stable resource-limit failure raised before the next oversized parse or encode allocation. */
export class DelimitedTextResourceError extends RangeError {
  override readonly name = "DelimitedTextResourceError";
  readonly code = "DELIMITED_TEXT_RESOURCE_LIMIT";

  constructor(
    readonly resource: keyof DelimitedTextResourceLimits,
    readonly limit: number,
    readonly actual: number,
    readonly operation: DelimitedTextOperation,
  ) {
    super(
      `Sheetwrite: delimited-text ${operation} ${resource} limit is ${limit}; observed ${actual}`,
    );
  }
}

/** Stable invalid-option failure for a delimited-text resource ceiling. */
export class DelimitedTextOptionsError extends TypeError {
  override readonly name = "DelimitedTextOptionsError";
  readonly code = "DELIMITED_TEXT_INVALID_LIMIT";

  constructor(
    readonly resource: keyof DelimitedTextResourceLimits,
    readonly value: unknown,
  ) {
    super(`Sheetwrite: delimited-text ${resource} must be a positive safe integer`);
  }
}

const RESOURCE_KEYS = Object.freeze([
  "maxInputBytes",
  "maxOutputBytes",
  "maxRows",
  "maxColumns",
  "maxCells",
  "maxFieldBytes",
  "maxWriterWindowRows",
] as const);

export function resolveDelimitedTextResourceLimits(
  options: DelimitedTextOptions = {},
): Readonly<DelimitedTextResourceLimits> {
  const limits: DelimitedTextResourceLimits = { ...DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS };
  const overrides = options.resourceLimits;
  if (overrides === undefined) return limits;

  for (const resource of RESOURCE_KEYS) {
    const value = overrides[resource];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new DelimitedTextOptionsError(resource, value);
    }
    limits[resource] = value;
  }
  return limits;
}

function utf8WidthAt(text: string, index: number): { bytes: number; advance: number } {
  const first = text.charCodeAt(index);
  if (first <= 0x7f) return { bytes: 1, advance: 1 };
  if (first <= 0x7ff) return { bytes: 2, advance: 1 };
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = text.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return { bytes: 4, advance: 2 };
  }
  return { bytes: 3, advance: 1 };
}

function boundedUtf8InputBytes(text: string, limit: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; ) {
    const width = utf8WidthAt(text, index);
    bytes += width.bytes;
    if (bytes > limit) return bytes;
    index += width.advance;
  }
  return bytes;
}

function failResource(
  resource: keyof DelimitedTextResourceLimits,
  limit: number,
  actual: number,
  operation: DelimitedTextOperation,
): never {
  throw new DelimitedTextResourceError(resource, limit, actual, operation);
}

/** Validate rectangular dimensions without multiplying beyond the configured cell ceiling. */
export function assertDelimitedTextDimensions(
  rows: number,
  columns: number,
  limits: Readonly<DelimitedTextResourceLimits>,
  operation: DelimitedTextOperation,
): void {
  if (rows > limits.maxRows) failResource("maxRows", limits.maxRows, rows, operation);
  if (columns > limits.maxColumns) {
    failResource("maxColumns", limits.maxColumns, columns, operation);
  }
  if (rows !== 0 && columns > Math.floor(limits.maxCells / rows)) {
    const actual = rows * columns;
    failResource(
      "maxCells",
      limits.maxCells,
      Number.isSafeInteger(actual) ? actual : limits.maxCells + 1,
      operation,
    );
  }
}

/**
 * Parse a fixed comma or tab dialect into raw strings. The input is already an
 * in-memory string; scanning is incremental and checks UTF-8 byte, field, row,
 * column, and cell ceilings before materializing the next oversized value.
 */
export function parseDelimitedText(
  text: string,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
): string[][] {
  const limits = resolveDelimitedTextResourceLimits(options);
  const inputBytes = boundedUtf8InputBytes(text, limits.maxInputBytes);
  if (inputBytes > limits.maxInputBytes) {
    failResource("maxInputBytes", limits.maxInputBytes, inputBytes, "parse");
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let fieldParts: string[] = [];
  let fieldBytes = 0;
  let cells = 0;
  let fieldPresent = false;
  let quoted = false;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let segmentStart = index;

  const appendSegment = (end: number): void => {
    if (end > segmentStart) fieldParts.push(text.slice(segmentStart, end));
  };

  const materializeField = (end: number): void => {
    const nextColumn = row.length + 1;
    if (nextColumn > limits.maxColumns) {
      failResource("maxColumns", limits.maxColumns, nextColumn, "parse");
    }
    const nextCells = cells + 1;
    if (nextCells > limits.maxCells) {
      failResource("maxCells", limits.maxCells, nextCells, "parse");
    }
    appendSegment(end);
    row.push(
      fieldParts.length === 0 ? "" : fieldParts.length === 1 ? fieldParts[0]! : fieldParts.join(""),
    );
    fieldParts = [];
    fieldBytes = 0;
    fieldPresent = false;
    cells = nextCells;
  };

  const materializeRow = (end: number): void => {
    materializeField(end);
    const nextRows = rows.length + 1;
    if (nextRows > limits.maxRows) {
      failResource("maxRows", limits.maxRows, nextRows, "parse");
    }
    rows.push(row);
    row = [];
  };

  const countFieldCodePoint = (): void => {
    const width = utf8WidthAt(text, index);
    fieldBytes += width.bytes;
    if (fieldBytes > limits.maxFieldBytes) {
      failResource("maxFieldBytes", limits.maxFieldBytes, fieldBytes, "parse");
    }
    fieldPresent = true;
    index += width.advance;
  };

  while (index < text.length) {
    const ch = text[index]!;
    if (quoted) {
      if (ch !== '"') {
        countFieldCodePoint();
        continue;
      }
      if (text[index + 1] === '"') {
        appendSegment(index);
        fieldBytes++;
        if (fieldBytes > limits.maxFieldBytes) {
          failResource("maxFieldBytes", limits.maxFieldBytes, fieldBytes, "parse");
        }
        fieldParts.push('"');
        index += 2;
        segmentStart = index;
        continue;
      }
      appendSegment(index);
      quoted = false;
      index++;
      segmentStart = index;
      continue;
    }

    if (ch === '"' && !fieldPresent && fieldParts.length === 0) {
      quoted = true;
      fieldPresent = true;
      index++;
      segmentStart = index;
      continue;
    }
    if (ch === delimiter) {
      materializeField(index);
      if (row.length >= limits.maxColumns) {
        failResource("maxColumns", limits.maxColumns, limits.maxColumns + 1, "parse");
      }
      if (cells >= limits.maxCells) {
        failResource("maxCells", limits.maxCells, limits.maxCells + 1, "parse");
      }
      index++;
      segmentStart = index;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      materializeRow(index);
      if (ch === "\r" && text[index + 1] === "\n") index++;
      index++;
      segmentStart = index;
      if (index < text.length && rows.length >= limits.maxRows) {
        failResource("maxRows", limits.maxRows, limits.maxRows + 1, "parse");
      }
      continue;
    }
    countFieldCodePoint();
  }

  if (fieldPresent || row.length > 0 || fieldParts.length > 0) materializeRow(index);
  return rows;
}

interface EncodedFieldPlan {
  readonly text: string;
  readonly quote: boolean;
  readonly quoteCount: number;
  readonly bytes: number;
}

function planEncodedField(
  text: string,
  delimiter: "," | "\t",
  forceQuote: boolean,
  limits: Readonly<DelimitedTextResourceLimits>,
  operation: DelimitedTextOperation,
): EncodedFieldPlan {
  let bytes = 0;
  let quoteCount = 0;
  let quote = forceQuote;
  for (let index = 0; index < text.length; ) {
    const ch = text[index]!;
    const width = utf8WidthAt(text, index);
    bytes += width.bytes;
    if (bytes > limits.maxFieldBytes) {
      failResource("maxFieldBytes", limits.maxFieldBytes, bytes, operation);
    }
    if (ch === '"') {
      quote = true;
      quoteCount++;
    } else if (ch === delimiter || ch === "\r" || ch === "\n") {
      quote = true;
    }
    index += width.advance;
  }
  return { text, quote, quoteCount, bytes };
}

/**
 * Encode raw string rows with CRLF record separators. The returned value is a
 * single in-memory string; iterable rows let callers fetch backing store windows
 * incrementally rather than materializing the entire logical grid first.
 */
export function encodeDelimitedText(
  rows: Iterable<readonly string[]>,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
  config: { bom?: boolean; operation?: DelimitedTextOperation } = {},
): string {
  const limits = resolveDelimitedTextResourceLimits(options);
  const operation = config.operation ?? "encode";
  const lines: string[] = [];
  let outputBytes = config.bom ? 3 : 0;
  let rowCount = 0;
  let cells = 0;
  if (outputBytes > limits.maxOutputBytes) {
    failResource("maxOutputBytes", limits.maxOutputBytes, outputBytes, operation);
  }

  for (const row of rows) {
    const nextRows = rowCount + 1;
    if (nextRows > limits.maxRows) {
      failResource("maxRows", limits.maxRows, nextRows, operation);
    }
    if (row.length > limits.maxColumns) {
      failResource("maxColumns", limits.maxColumns, row.length, operation);
    }
    const nextCells = cells + row.length;
    if (nextCells > limits.maxCells) {
      failResource("maxCells", limits.maxCells, nextCells, operation);
    }

    const plans: EncodedFieldPlan[] = new Array(row.length);
    let rowBytes = row.length > 0 ? row.length - 1 : 0;
    for (let column = 0; column < row.length; column++) {
      const plan = planEncodedField(
        row[column]!,
        delimiter,
        row.length === 1 && row[column] === "",
        limits,
        operation,
      );
      plans[column] = plan;
      rowBytes += plan.bytes + plan.quoteCount + (plan.quote ? 2 : 0);
    }
    const required = rowBytes + (rowCount > 0 ? 2 : 0);
    if (required > limits.maxOutputBytes - outputBytes) {
      const actual = outputBytes + required;
      failResource(
        "maxOutputBytes",
        limits.maxOutputBytes,
        Number.isSafeInteger(actual) ? actual : limits.maxOutputBytes + 1,
        operation,
      );
    }

    const encodedFields: string[] = new Array(plans.length);
    for (let column = 0; column < plans.length; column++) {
      const plan = plans[column]!;
      encodedFields[column] = plan.quote ? `"${plan.text.replaceAll('"', '""')}"` : plan.text;
    }
    lines.push(encodedFields.join(delimiter));
    outputBytes += required;
    rowCount = nextRows;
    cells = nextCells;
  }

  const body = lines.join("\r\n");
  return config.bom ? `\ufeff${body}` : body;
}
