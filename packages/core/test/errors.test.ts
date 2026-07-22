import { describe, expect, it } from "bun:test";
import { SheetwriteError as AdapterSheetwriteError } from "../src/adapter.js";
import { DelimitedTextResourceError } from "../src/delimited-text.js";
import { SnapshotResourceError } from "../src/document-protocol.js";
import {
  isSheetwriteError,
  normalizeSheetwriteError,
  SHEETWRITE_ERROR_CODES,
  SHEETWRITE_ERROR_OPERATIONS,
  SheetwriteError,
} from "../src/errors.js";
import { XlsxResourceError } from "../src/export.js";
import { SheetwriteError as FullSheetwriteError } from "../src/index.js";
import { IndexedDbPendingCommitStorageError } from "../src/indexeddb.js";
import { PersistenceError } from "../src/persistence.js";
import { SyncProtocolError } from "../src/sync.js";

describe("SheetwriteError", () => {
  it("has one runtime identity across public core entries", () => {
    expect(FullSheetwriteError).toBe(SheetwriteError);
    expect(AdapterSheetwriteError).toBe(SheetwriteError);
  });

  it("serializes a stable envelope without leaking its cause", () => {
    const cause = new Error("socket closed");
    const error = new SheetwriteError(
      "datasource-request-failed",
      "datasource-request",
      cause.message,
      {
        cause,
        context: { sheet: "sales", request: { start: 20, count: 40 } },
        retryable: true,
      },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toEqual({
      name: "SheetwriteError",
      message: "socket closed",
      code: "datasource-request-failed",
      operation: "datasource-request",
      context: { sheet: "sales", request: { start: 20, count: 40 } },
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain("cause");
  });

  it("recognizes valid instances and serialized envelopes but rejects malformed context", () => {
    const error = new SheetwriteError("export-failed", "export-xlsx", "codec failed");
    expect(isSheetwriteError(error)).toBe(true);
    expect(isSheetwriteError(error.toJSON())).toBe(true);
    expect(isSheetwriteError({ ...error.toJSON(), name: "Error" })).toBe(false);
    expect(
      isSheetwriteError({
        ...error.toJSON(),
        name: "SheetwriteError|DelimitedTextResourceError",
      }),
    ).toBe(false);
    expect(isSheetwriteError({ ...error.toJSON(), retryable: "yes" })).toBe(false);
    expect(isSheetwriteError({ ...error.toJSON(), context: { invalid: () => undefined } })).toBe(
      false,
    );
    expect(
      isSheetwriteError({
        ...error.toJSON(),
        code: "export-failed-near-miss",
      }),
    ).toBe(false);
    expect(
      isSheetwriteError({
        ...error.toJSON(),
        operation: "export-xlsx-near-miss",
      }),
    ).toBe(false);
    expect(
      isSheetwriteError({
        ...error.toJSON(),
        context: { invalid: new (class Context {})() },
      }),
    ).toBe(false);
    const shared = { value: 1 };
    expect(
      isSheetwriteError({ ...error.toJSON(), context: { first: shared, second: shared } }),
    ).toBe(true);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isSheetwriteError({ ...error.toJSON(), context: cyclic })).toBe(false);
  });

  it("retains canonical instances, reconstructs serialized envelopes, and wraps causes once", () => {
    const canonical = new SheetwriteError("aborted", "persistence", "cancelled");
    expect(normalizeSheetwriteError(canonical, "not-found", "persistence")).toBe(canonical);

    const serialized = canonical.toJSON();
    const reconstructed = normalizeSheetwriteError(serialized, "not-found", "persistence");
    expect(reconstructed).toBeInstanceOf(SheetwriteError);
    expect(reconstructed).not.toBe(serialized);
    expect(reconstructed.toJSON()).toEqual(serialized);
    expect(reconstructed.cause).toBe(serialized);

    const cause = new TypeError("bad transport");
    const wrapped = normalizeSheetwriteError(
      cause,
      "datasource-request-failed",
      "datasource-request",
      {
        sheet: "s1",
      },
    );
    expect(wrapped).toMatchObject({
      code: "datasource-request-failed",
      operation: "datasource-request",
      message: "bad transport",
      context: { sheet: "s1" },
    });
    expect(wrapped.cause).toBe(cause);
  });

  it("keeps legacy domain subclasses inside the canonical envelope", () => {
    const failures = [
      new DelimitedTextResourceError("maxCells", 10, 11, "parse"),
      new XlsxResourceError("maxCells", 10, 11, "import"),
      new SnapshotResourceError("maxDenseCells", 10, 11),
      new PersistenceError("not-found", "missing document"),
      new IndexedDbPendingCommitStorageError("quota", "quota exceeded"),
      new SyncProtocolError("invalid-version", "invalid version"),
    ];
    const codes = new Set<string>(SHEETWRITE_ERROR_CODES);
    const operations = new Set<string>(SHEETWRITE_ERROR_OPERATIONS);

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(SheetwriteError);
      expect(codes.has(failure.code)).toBe(true);
      expect(operations.has(failure.operation)).toBe(true);
      expect(isSheetwriteError(failure)).toBe(true);
    }
  });
});
