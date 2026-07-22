/** Stable public failure codes. Messages are diagnostic and are not API contracts. */
export const SHEETWRITE_ERROR_CODES = [
  "initialization-failed",
  "initialization-required",
  "datasource-request-failed",
  "renderer-fallback",
  "export-failed",
  "xlsx-import-failed",
  "optional-backend-unavailable",
  "delimited-text-resource-limit",
  "delimited-text-invalid-limit",
  "xlsx-resource-limit",
  "resource-limit",
  "invalid-snapshot",
  "aborted",
  "not-found",
  "commit-rejected",
  "unavailable",
  "blocked",
  "quota",
  "unsupported-schema",
  "transaction",
  "conflict",
  "limit",
  "invalid-limits",
  "invalid-version",
  "invalid-id",
  "invalid-operations",
  "operation-limit",
  "payload-limit",
  "response-id-mismatch",
  "future-distance-limit",
  "buffer-count-limit",
  "buffer-operation-limit",
  "buffer-byte-limit",
  "pending-count-limit",
  "pending-operation-limit",
  "pending-byte-limit",
  "late-echo",
  "remote-operations-rejected",
  "pending-capacity",
  "presence-failed",
  "revision-failed",
  "comment-failed",
  "sync-failed",
  "sync-storage-failed",
  "incomplete-data",
  "xlsx-invalid-options",
] as const;

/** Exhaustive stable discriminator for consumer-visible Sheetwrite failures. */
export type SheetwriteErrorCode = (typeof SHEETWRITE_ERROR_CODES)[number];

/** Stable operations at which a consumer-visible failure can surface. */
export const SHEETWRITE_ERROR_OPERATIONS = [
  "initialize",
  "create-grid",
  "datasource-request",
  "renderer-worker",
  "export-xlsx",
  "xlsx-import",
  "xlsx-export",
  "delimited-parse",
  "delimited-import",
  "delimited-encode",
  "delimited-export",
  "delimited-options",
  "snapshot-validate",
  "snapshot-allocate",
  "persistence",
  "pending-storage",
  "synchronize",
  "presence",
  "revision",
  "comments",
  "query",
] as const;

/** Exhaustive stable operation discriminator for consumer-visible failures. */
export type SheetwriteErrorOperation = (typeof SHEETWRITE_ERROR_OPERATIONS)[number];

/** JSON-safe values accepted in a public failure context. */
export type SheetwriteErrorContextValue =
  | null
  | string
  | number
  | boolean
  | readonly SheetwriteErrorContextValue[]
  | { readonly [key: string]: SheetwriteErrorContextValue };

/** Stable, serialization-safe diagnostic context. */
export type SheetwriteErrorContext = Readonly<Record<string, SheetwriteErrorContextValue>>;

/** Structural form preserved across realms and JSON serialization. */
export interface SheetwriteErrorEnvelope {
  readonly name: string;
  readonly message: string;
  readonly code: SheetwriteErrorCode;
  readonly operation: SheetwriteErrorOperation;
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;
}

/** Optional cause, diagnostic context, and boundary-known retryability. */
export interface SheetwriteErrorOptions extends ErrorOptions {
  context?: SheetwriteErrorContext;
  /** Present only when Sheetwrite can determine retryability from the boundary itself. */
  retryable?: boolean;
}

/** Canonical envelope for thrown and callback-delivered Sheetwrite failures. */
export class SheetwriteError extends Error implements SheetwriteErrorEnvelope {
  override readonly name: string = "SheetwriteError";
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;

  constructor(
    readonly code: SheetwriteErrorCode,
    readonly operation: SheetwriteErrorOperation,
    message: string,
    options: SheetwriteErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.context = options.context;
    this.retryable = options.retryable;
  }

  toJSON(): SheetwriteErrorEnvelope {
    return {
      name: "SheetwriteError",
      message: this.message,
      code: this.code,
      operation: this.operation,
      ...(this.context === undefined ? {} : { context: this.context }),
      ...(this.retryable === undefined ? {} : { retryable: this.retryable }),
    };
  }
}

const ERROR_NAMES =
  "|SheetwriteError|DelimitedTextResourceError|DelimitedTextOptionsError|XlsxResourceError|SnapshotResourceError|SnapshotValidationError|PersistenceError|IndexedDbPendingCommitStorageError|SyncProtocolError|SyncPendingCapacityError|IncompleteDataError|";

function isContextValue(value: unknown): value is SheetwriteErrorContextValue {
  const pending: Array<{ value: unknown; exit: boolean }> = [{ value, exit: false }];
  const active = new WeakSet<object>();
  try {
    while (pending.length > 0) {
      const frame = pending.pop()!;
      const candidate = frame.value;
      if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
        continue;
      }
      if (typeof candidate === "number" && Number.isFinite(candidate)) continue;
      if (typeof candidate !== "object") return false;
      if (frame.exit) {
        active.delete(candidate);
        continue;
      }
      if (active.has(candidate)) return false;
      active.add(candidate);
      pending.push({ value: candidate, exit: true });
      if (!Array.isArray(candidate)) {
        const prototype = Object.getPrototypeOf(candidate);
        if (
          Object.prototype.toString.call(candidate) !== "[object Object]" ||
          (prototype !== null && prototype.constructor?.name !== "Object")
        ) {
          return false;
        }
      }
      for (const key of Object.keys(candidate)) {
        pending.push({ value: (candidate as Record<string, unknown>)[key], exit: false });
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Narrow same-realm errors, cross-realm errors, and serialized failure envelopes. */
export function isSheetwriteError(value: unknown): value is SheetwriteErrorEnvelope {
  if (value instanceof SheetwriteError) return true;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SheetwriteErrorEnvelope>;
  try {
    return (
      typeof candidate.name === "string" &&
      !candidate.name.includes("|") &&
      ERROR_NAMES.includes(`|${candidate.name}|`) &&
      typeof candidate.message === "string" &&
      typeof candidate.code === "string" &&
      SHEETWRITE_ERROR_CODES.includes(candidate.code as SheetwriteErrorCode) &&
      typeof candidate.operation === "string" &&
      SHEETWRITE_ERROR_OPERATIONS.includes(candidate.operation as SheetwriteErrorOperation) &&
      (candidate.context === undefined || isContextValue(candidate.context)) &&
      (candidate.retryable === undefined || typeof candidate.retryable === "boolean")
    );
  } catch {
    return false;
  }
}

/** Internal boundary helper: retain canonical failures and wrap arbitrary causes once. */
export function normalizeSheetwriteError(
  error: unknown,
  code: SheetwriteErrorCode,
  operation: SheetwriteErrorOperation,
  context?: SheetwriteErrorContext,
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
    code,
    operation,
    error instanceof Error ? error.message : `Sheetwrite ${operation} failed`,
    { cause: error, context },
  );
}

export class JsonByteLengthError extends Error {
  override readonly name = "JsonByteLengthError";

  constructor(
    readonly code: "invalid" | "limit",
    message: string,
    readonly actual?: number,
    readonly limit?: number,
  ) {
    super(message);
  }
}

export interface JsonByteLengthOptions {
  /** Match JSON object encoding by omitting own properties whose value is undefined. */
  omitUndefinedProperties?: boolean;
}

/** Computes exact JSON UTF-8 bytes without constructing the encoded payload. */
export function boundedJsonByteLength(
  value: unknown,
  limit: number,
  options: JsonByteLengthOptions = {},
): number {
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (amount: number): void => {
    bytes += amount;
    if (bytes > limit) {
      throw new JsonByteLengthError(
        "limit",
        `Encoded JSON exceeds the ${limit} byte limit`,
        bytes,
        limit,
      );
    }
  };
  const addString = (input: string): void => {
    add(2);
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      if (
        code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
      ) {
        add(2);
      } else if (code < 0x20) {
        add(6);
      } else if (code <= 0x7f) {
        add(1);
      } else if (code <= 0x7ff) {
        add(2);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = input.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          index += 1;
        } else {
          add(6);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        add(6);
      } else {
        add(3);
      }
    }
  };
  const visit = (input: unknown): void => {
    if (input === null) {
      add(4);
      return;
    }
    if (typeof input === "string") {
      addString(input);
      return;
    }
    if (typeof input === "boolean") {
      add(input ? 4 : 5);
      return;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new JsonByteLengthError("invalid", "JSON numbers must be finite");
      }
      add(JSON.stringify(input).length);
      return;
    }
    if (typeof input !== "object") {
      throw new JsonByteLengthError("invalid", "Value is not JSON-safe");
    }
    if (ancestors.has(input)) {
      throw new JsonByteLengthError("invalid", "JSON values cannot contain cycles");
    }
    ancestors.add(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) {
        throw new JsonByteLengthError("invalid", "Arrays must use Array prototype");
      }
      add(2);
      for (let index = 0; index < input.length; index++) {
        if (index > 0) add(1);
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new JsonByteLengthError("invalid", "Arrays cannot be sparse");
        }
        visit(descriptor.value);
      }
      for (const key in input) {
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          index >= input.length
        ) {
          throw new JsonByteLengthError("invalid", "Arrays cannot contain named properties");
        }
      }
      ancestors.delete(input);
      return;
    }
    if (Object.getPrototypeOf(input) !== Object.prototype) {
      throw new JsonByteLengthError("invalid", "JSON values must contain only plain objects");
    }
    const record = input as Record<string, unknown>;
    if (Object.getOwnPropertyDescriptor(record, "toJSON")) {
      throw new JsonByteLengthError("invalid", "JSON values cannot define toJSON");
    }
    add(2);
    let first = true;
    for (const key in record) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new JsonByteLengthError("invalid", "JSON fields must be enumerable data properties");
      }
      if (descriptor.value === undefined && options.omitUndefinedProperties) continue;
      if (!first) add(1);
      first = false;
      addString(key);
      add(1);
      visit(descriptor.value);
    }
    ancestors.delete(input);
  };
  visit(value);
  return bytes;
}
