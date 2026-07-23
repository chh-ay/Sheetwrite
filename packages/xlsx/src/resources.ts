import {
  DEFAULT_XLSX_RESOURCE_LIMITS,
  isSheetwriteError,
  SheetwriteError,
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

function positiveLimit(
  operation: "import" | "export",
  name: keyof XlsxResourceLimits,
  value: number,
): number {
  const integerOnly = name !== "maxCompressionRatio";
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    (integerOnly ? !Number.isSafeInteger(value) : false)
  ) {
    throw new SheetwriteError(
      "xlsx-invalid-options",
      `xlsx-${operation}`,
      `Sheetwrite: XLSX ${name} must be ${integerOnly ? "a positive integer" : "positive"}`,
      { context: { format: "xlsx", resource: name } },
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
        throw new SheetwriteError(
          "xlsx-invalid-options",
          `xlsx-${operation}`,
          `Sheetwrite: unknown XLSX resource limit ${key}`,
          { context: { format: "xlsx", resource: key } },
        );
      }
    }
  }
  const limits = { ...DEFAULT_XLSX_RESOURCE_LIMITS };
  for (const key of RESOURCE_KEYS) {
    if (key === "maxCells") continue;
    const value = overrides?.[key];
    if (value !== undefined) limits[key] = positiveLimit(operation, key, value);
  }
  if (options?.maxCells !== undefined) {
    limits.maxCells = positiveLimit(operation, "maxCells", options.maxCells);
  }
  const context = { operation, limits: Object.freeze(limits), options };
  checkAbort(context);
  return context;
}
/** Normalize direct optional-package backend failures into the shared core envelope. */
export function xlsxFailure(
  error: unknown,
  operation: "import" | "export",
  backend: string,
): SheetwriteError {
  if (error instanceof SheetwriteError) return error;
  if (isSheetwriteError(error)) {
    return new SheetwriteError(error.code, error.operation, error.message, {
      cause: error,
      context: error.context,
      retryable: error.retryable,
    });
  }
  return new SheetwriteError(
    operation === "import" ? "xlsx-import-failed" : "export-failed",
    `xlsx-${operation}`,
    error instanceof Error ? error.message : `Sheetwrite XLSX ${operation} failed`,
    { cause: error, context: { format: "xlsx", backend } },
  );
}

export function checkAbort(context: XlsxCodecContext): void {
  const signal = context.options?.signal;
  if (!signal?.aborted) return;
  const cause = signal.reason ?? new DOMException("XLSX operation aborted", "AbortError");
  throw new SheetwriteError(
    "aborted",
    `xlsx-${context.operation}`,
    cause instanceof Error ? cause.message : `Sheetwrite XLSX ${context.operation} aborted`,
    { cause, context: { format: "xlsx" } },
  );
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
