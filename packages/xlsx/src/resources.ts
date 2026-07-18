import {
  DEFAULT_XLSX_RESOURCE_LIMITS,
  validateWorkbookSnapshot,
  XlsxResourceError,
  type XlsxResourceLimits,
  type XlsxWorkbookOptions,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";

export interface XlsxCodecContext {
  readonly operation: "import" | "export";
  readonly limits: Readonly<XlsxResourceLimits>;
  readonly options: XlsxWorkbookOptions | undefined;
}

const RESOURCE_KEYS = Object.keys(DEFAULT_XLSX_RESOURCE_LIMITS) as (keyof XlsxResourceLimits)[];

function positiveLimit(name: keyof XlsxResourceLimits, value: number): number {
  const integerOnly = name !== "maxCompressionRatio";
  if (!Number.isFinite(value) || value <= 0 || (integerOnly && !Number.isInteger(value))) {
    throw new RangeError(
      `Sheetwrite: XLSX ${name} must be ${integerOnly ? "a positive integer" : "positive"}`,
    );
  }
  return value;
}

/** Resolve and validate every XLSX resource limit before codec work begins. */
export function createCodecContext(
  operation: "import" | "export",
  options?: XlsxWorkbookOptions,
): XlsxCodecContext {
  const overrides = options?.resourceLimits;
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      if (!RESOURCE_KEYS.includes(key as keyof XlsxResourceLimits) || key === "maxCells") {
        throw new TypeError(`Sheetwrite: unknown XLSX resource limit ${key}`);
      }
    }
  }
  const limits = { ...DEFAULT_XLSX_RESOURCE_LIMITS };
  for (const key of RESOURCE_KEYS) {
    if (key === "maxCells") continue;
    const value = overrides?.[key];
    if (value !== undefined) limits[key] = positiveLimit(key, value);
  }
  if (options?.maxCells !== undefined) {
    limits.maxCells = positiveLimit("maxCells", options.maxCells);
  }
  checkAbort(options);
  return { operation, limits: Object.freeze(limits), options };
}

export function checkAbort(options: XlsxWorkbookOptions | undefined): void {
  if (!options?.signal?.aborted) return;
  throw options.signal.reason ?? new DOMException("XLSX operation aborted", "AbortError");
}

export function assertResource(
  context: XlsxCodecContext,
  resource: keyof XlsxResourceLimits,
  actual: number,
): void {
  const limit = context.limits[resource];
  if (actual > limit) {
    throw new XlsxResourceError(resource, limit, actual, context.operation);
  }
}

export function inputView(data: ArrayBuffer | Uint8Array, context: XlsxCodecContext): Uint8Array {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  assertResource(context, "maxInputBytes", bytes.byteLength);
  return bytes;
}

/** Validate a sparse codec snapshot without applying live dense-store allocation ceilings. */
export function validateCodecSnapshot(input: unknown, context: XlsxCodecContext) {
  return validateWorkbookSnapshot(input, {
    storage: "paged",
    resourceLimits: {
      maxSheets: context.limits.maxSheets,
      maxRowsPerSheet: context.limits.maxRowsPerSheet,
      maxColumnsPerSheet: context.limits.maxColumnsPerSheet,
      maxLogicalCellsPerSheet: context.limits.maxRowsPerSheet * context.limits.maxColumnsPerSheet,
      maxDenseCells: 0,
      maxMetadataEntries: Number.MAX_SAFE_INTEGER,
      maxSerializedBytes: context.limits.maxTotalUncompressedBytes,
    },
  });
}

export function emitWarning(context: XlsxCodecContext, warning: XlsxWorkbookWarning): void {
  context.options?.onWarning?.(warning);
}
