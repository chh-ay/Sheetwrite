import { describe, expect, it } from "bun:test";
import {
  type DocumentValidationError,
  type DocumentValidationResult,
  documentOpTarget,
  validateWorkbookSnapshot,
  WORKBOOK_SCHEMA_VERSION,
} from "../src/document-protocol.js";
import type { DocumentOp, WorkbookSnapshot } from "../src/types.js";

function richSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    documentId: "doc-1",
    version: 7,
    workbook: {
      activeSheet: "sheet-a",
      namedRanges: [
        {
          name: "Totals",
          range: { sheet: "sheet-a", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
        },
      ],
    },
    sheets: [
      {
        id: "sheet-b",
        name: "Lookup",
        order: 1,
        rowCount: 2,
        columns: [{ key: "label", header: "Label", width: 120, type: "text" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 1,
            cells: [
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "later" } },
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
            ],
          },
        ],
      },
      {
        id: "sheet-a",
        name: "Main",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 100, type: "number", visible: false },
        ],
        frozenRows: 1,
        frozenCols: 1,
        rowMeta: [
          [2, { hidden: true }],
          [0, { height: 42 }],
        ],
        merges: [{ r0: 1, c0: 1, r1: 0, c1: 0 }],
        conditionalFormats: [
          {
            range: { sheet: "sheet-a", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
            when: { kind: "greaterThan", value: 10 },
            style: { color: "#ff0000" },
          },
        ],
        rowGroups: [{ start: 1, end: 3, collapsed: true }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              {
                rowOffset: 2,
                colOffset: 1,
                value: { kind: "ref", target: { sheet: "sheet-b", row: 0, col: 0 } },
              },
              {
                rowOffset: 1,
                colOffset: 1,
                value: { kind: "formula", src: "=SUM(B1:B1)" },
                style: { bold: true, fontSize: 18 },
              },
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "title" } },
            ],
          },
        ],
      },
    ],
  };
}

function withoutTopLevel(key: string): unknown {
  const snapshot = { ...richSnapshot() } as Record<string, unknown>;
  delete snapshot[key];
  return snapshot;
}

function withWorkbook(patch: Record<string, unknown>): unknown {
  const snapshot = richSnapshot();
  return { ...snapshot, workbook: { ...snapshot.workbook, ...patch } };
}

function withFirstSheet(patch: Record<string, unknown>): unknown {
  const snapshot = richSnapshot();
  return {
    ...snapshot,
    sheets: [{ ...snapshot.sheets[0]!, ...patch }, ...snapshot.sheets.slice(1)],
  };
}

function withFirstBlock(patch: Record<string, unknown>): unknown {
  const snapshot = richSnapshot();
  const sheet = snapshot.sheets[0]!;
  return {
    ...snapshot,
    sheets: [
      {
        ...sheet,
        cells: [{ ...sheet.cells[0]!, ...patch }, ...sheet.cells.slice(1)],
      },
      ...snapshot.sheets.slice(1),
    ],
  };
}

function withoutFirstBlockField(key: string): unknown {
  const snapshot = richSnapshot();
  const sheet = snapshot.sheets[0]!;
  const block = { ...sheet.cells[0]! } as Record<string, unknown>;
  delete block[key];
  return {
    ...snapshot,
    sheets: [{ ...sheet, cells: [block, ...sheet.cells.slice(1)] }, ...snapshot.sheets.slice(1)],
  };
}

function withoutFirstCellField(key: string): unknown {
  const snapshot = richSnapshot();
  const sheet = snapshot.sheets[0]!;
  const block = sheet.cells[0]!;
  const cell = { ...block.cells[0]! } as Record<string, unknown>;
  delete cell[key];
  return {
    ...snapshot,
    sheets: [
      {
        ...sheet,
        cells: [{ ...block, cells: [cell, ...block.cells.slice(1)] }, ...sheet.cells.slice(1)],
      },
      ...snapshot.sheets.slice(1),
    ],
  };
}

function withFirstCell(patch: Record<string, unknown>): unknown {
  const snapshot = richSnapshot();
  const sheet = snapshot.sheets[0]!;
  const block = sheet.cells[0]!;
  return {
    ...snapshot,
    sheets: [
      {
        ...sheet,
        cells: [
          {
            ...block,
            cells: [{ ...block.cells[0]!, ...patch }, ...block.cells.slice(1)],
          },
          ...sheet.cells.slice(1),
        ],
      },
      ...snapshot.sheets.slice(1),
    ],
  };
}

function expectInvalid(
  value: unknown,
  expected: Pick<DocumentValidationError, "path" | "code">,
): DocumentValidationResult {
  let result: DocumentValidationResult | undefined;
  expect(() => {
    result = validateWorkbookSnapshot(value);
  }).not.toThrow();
  if (!result || result.ok) throw new Error("malformed snapshot unexpectedly accepted");
  expect(result.errors).toContainEqual(expect.objectContaining(expected));
  return result;
}

describe("workbook document protocol", () => {
  it("round-trips every authoritative field through JSON", () => {
    const parsed: unknown = JSON.parse(JSON.stringify(richSnapshot()));
    const result = validateWorkbookSnapshot(parsed);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("snapshot unexpectedly invalid");
    expect(result.value.sheets.map((sheet) => sheet.id)).toEqual(["sheet-a", "sheet-b"]);
    expect(result.value.sheets[0]?.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);
    expect(result.value.sheets[0]?.rowMeta?.map(([row]) => row)).toEqual([0, 2]);
    expect(result.value.sheets[0]?.cells[0]?.cells.map((cell) => cell.rowOffset)).toEqual([
      0, 1, 2,
    ]);
    expect(result.value.sheets[0]?.cells[0]?.cells[1]).toMatchObject({
      value: { kind: "formula", src: "=SUM(B1:B1)" },
      style: { bold: true, fontSize: 18 },
    });
    expect(result.value).not.toHaveProperty("selection");
    expect(result.value).not.toHaveProperty("scrollTop");
    expect(result.value).not.toHaveProperty("zoom");
  });

  it("returns stable structured errors for every top-level trust-boundary value", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
    inherited.schemaVersion = WORKBOOK_SCHEMA_VERSION;
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype.schemaVersion = WORKBOOK_SCHEMA_VERSION;
    const hostileProxy = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new Error("validator trusted proxy reflection");
        },
      },
    );

    const cases: Array<{
      name: string;
      value: unknown;
      path: string;
      code: DocumentValidationError["code"];
    }> = [
      { name: "null", value: null, path: "$", code: "invalid-value" },
      { name: "undefined", value: undefined, path: "$", code: "non-serializable" },
      { name: "string", value: "snapshot", path: "$", code: "invalid-value" },
      { name: "number", value: 1, path: "$", code: "invalid-value" },
      { name: "boolean", value: true, path: "$", code: "invalid-value" },
      { name: "array", value: [], path: "$", code: "invalid-value" },
      { name: "function", value: () => undefined, path: "$", code: "non-serializable" },
      { name: "date", value: new Date(0), path: "$", code: "non-serializable" },
      { name: "map", value: new Map(), path: "$", code: "non-serializable" },
      { name: "set", value: new Set(), path: "$", code: "non-serializable" },
      { name: "typed array", value: new Uint8Array(), path: "$", code: "non-serializable" },
      { name: "cycle", value: cyclic, path: "self", code: "non-serializable" },
      { name: "inherited prototype", value: inherited, path: "$", code: "non-serializable" },
      { name: "null prototype", value: nullPrototype, path: "$", code: "non-serializable" },
      { name: "hostile proxy", value: hostileProxy, path: "$", code: "invalid-value" },
    ];

    for (const testCase of cases) {
      expectInvalid(testCase.value, { path: testCase.path, code: testCase.code });
    }
  });

  it("rejects malformed containers without descending through them", () => {
    const optionalContainers = [
      "rowMeta",
      "merges",
      "conditionalFormats",
      "validationRules",
      "protectedRanges",
      "notes",
      "sortKeys",
      "filters",
      "rowGroups",
    ];
    const cases: Array<{ value: unknown; path: string }> = [
      { value: withoutTopLevel("workbook"), path: "workbook" },
      { value: { ...richSnapshot(), workbook: null }, path: "workbook" },
      { value: { ...richSnapshot(), workbook: 1 }, path: "workbook" },
      { value: withWorkbook({ activeSheet: null }), path: "workbook.activeSheet" },
      { value: withoutTopLevel("sheets"), path: "sheets" },
      { value: { ...richSnapshot(), sheets: null }, path: "sheets" },
      { value: { ...richSnapshot(), sheets: "not-an-array" }, path: "sheets" },
      { value: { ...richSnapshot(), sheets: [] }, path: "sheets" },
      { value: { ...richSnapshot(), sheets: [null] }, path: "sheets[0]" },
      { value: { ...richSnapshot(), sheets: [1] }, path: "sheets[0]" },
      { value: withFirstSheet({ columns: null }), path: "sheets[0].columns" },
      { value: withFirstSheet({ columns: [null] }), path: "sheets[0].columns[0]" },
      { value: withFirstSheet({ cells: null }), path: "sheets[0].cells" },
      { value: withFirstSheet({ cells: [null] }), path: "sheets[0].cells[0]" },
      { value: withFirstBlock({ cells: null }), path: "sheets[0].cells[0].cells" },
      { value: withFirstBlock({ cells: [null] }), path: "sheets[0].cells[0].cells[0]" },
      { value: withoutFirstBlockField("cells"), path: "sheets[0].cells[0].cells" },
      { value: withoutFirstCellField("value"), path: "sheets[0].cells[0].cells[0].value" },
      ...optionalContainers.flatMap((field) => [
        {
          value: withFirstSheet({ [field]: null }),
          path: `sheets[0].${field}`,
        },
        {
          value: withFirstSheet({ [field]: [null] }),
          path: `sheets[0].${field}[0]`,
        },
        {
          value: withFirstSheet({ [field]: [1] }),
          path: `sheets[0].${field}[0]`,
        },
      ]),
    ];

    for (const testCase of cases) {
      expectInvalid(testCase.value, { path: testCase.path, code: "invalid-value" });
    }
  });

  it("rejects malformed blocks, cells, ranges, values, and styles at exact paths", () => {
    const sheet = richSnapshot().sheets[0]!;
    const block = sheet.cells[0]!;
    const cell = block.cells[0]!;
    const conditionalFormat = {
      range: { sheet: "sheet-b", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      when: { kind: "greaterThan", value: 0 },
      style: { bold: true },
    };
    const cases: Array<{ value: unknown; path: string; code?: DocumentValidationError["code"] }> = [
      {
        value: withFirstBlock({ startRow: 0.5 }),
        path: "sheets[0].cells[0].startRow",
      },
      {
        value: withFirstBlock({ rowCount: 0 }),
        path: "sheets[0].cells[0].rowCount",
      },
      {
        value: withFirstCell({ rowOffset: "0" }),
        path: "sheets[0].cells[0].cells[0].rowOffset",
      },
      {
        value: withFirstCell({ value: { kind: "unknown" } }),
        path: "sheets[0].cells[0].cells[0].value.kind",
      },
      {
        value: withFirstCell({ value: { kind: "formula", src: 1 } }),
        path: "sheets[0].cells[0].cells[0].value.src",
      },
      {
        value: withFirstCell({ value: { kind: "ref", target: null } }),
        path: "sheets[0].cells[0].cells[0].value.target",
      },
      {
        value: withFirstCell({ style: null }),
        path: "sheets[0].cells[0].cells[0].style",
      },
      {
        value: withFirstCell({ style: { bold: "yes" } }),
        path: "sheets[0].cells[0].cells[0].style.bold",
      },
      {
        value: withFirstSheet({
          conditionalFormats: [{ ...conditionalFormat, range: null }],
        }),
        path: "sheets[0].conditionalFormats[0].range",
      },
      {
        value: withFirstSheet({
          conditionalFormats: [
            {
              ...conditionalFormat,
              range: {
                ...conditionalFormat.range,
                start: { row: 0.25, col: 0 },
              },
            },
          ],
        }),
        path: "sheets[0].conditionalFormats[0].range.start.row",
      },
      {
        value: withFirstCell({
          ...cell,
          value: { kind: "ref", target: { sheet: "missing", row: 0, col: 0 } },
        }),
        path: "sheets[0].cells[0].cells[0].value.target",
        code: "missing-reference",
      },
      {
        value: withFirstCell({
          ...cell,
          value: { kind: "ref", target: { sheet: "sheet-b", row: 99, col: 0 } },
        }),
        path: "sheets[0].cells[0].cells[0].value.target",
        code: "out-of-bounds",
      },
      {
        value: withWorkbook({
          namedRanges: [
            {
              name: "Missing",
              range: { sheet: "missing", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
            },
          ],
        }),
        path: "workbook.namedRanges[0].range",
        code: "missing-reference",
      },
      {
        value: withWorkbook({
          namedRanges: [
            {
              name: "Outside",
              range: { sheet: "sheet-b", start: { row: 0, col: 0 }, end: { row: 9, col: 0 } },
            },
          ],
        }),
        path: "workbook.namedRanges[0].range",
        code: "out-of-bounds",
      },
    ];

    for (const testCase of cases) {
      expectInvalid(testCase.value, {
        path: testCase.path,
        code: testCase.code ?? "invalid-value",
      });
    }
  });

  it("rejects every value that is not closed under JSON serialization", () => {
    const accessor = Object.create(Object.prototype) as Record<string, unknown>;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get(): never {
        throw new Error("validator invoked an untrusted getter");
      },
    });
    const sparse: unknown[] = [];
    sparse.length = 1;
    const nestedPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
    nestedPrototype.value = "unsafe";

    const values: Array<{ value: unknown; path: string }> = [
      { value: Number.NaN, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: Number.POSITIVE_INFINITY, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: Number.NEGATIVE_INFINITY, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: undefined, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: new Date(0), path: "sheets[0].cells[0].cells[0].value.value" },
      { value: Symbol("unsafe"), path: "sheets[0].cells[0].cells[0].value.value" },
      { value: 1n, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: accessor, path: "sheets[0].cells[0].cells[0].value.value.value" },
      { value: nestedPrototype, path: "sheets[0].cells[0].cells[0].value.value" },
      { value: sparse, path: "sheets[0].cells[0].cells[0].value.value[0]" },
    ];

    for (const testCase of values) {
      expectInvalid(withFirstCell({ value: { kind: "literal", value: testCase.value } }), {
        path: testCase.path,
        code: "non-serializable",
      });
    }

    const metadataValues: Array<{ value: unknown; path: string }> = [
      {
        value: withFirstSheet({ rowMeta: [[0, { height: Number.NaN }]] }),
        path: "sheets[0].rowMeta[0][1].height",
      },
      {
        value: withFirstSheet({
          columns: [
            {
              ...richSnapshot().sheets[0]!.columns[0]!,
              headerStyle: { color: new Date(0) },
            },
          ],
        }),
        path: "sheets[0].columns[0].headerStyle.color",
      },
    ];
    for (const testCase of metadataValues) {
      expectInvalid(testCase.value, { path: testCase.path, code: "non-serializable" });
    }
  });

  it("keeps every accepted snapshot semantically stable across a JSON round-trip", () => {
    const snapshot = richSnapshot();
    const sheet = snapshot.sheets[0]!;
    sheet.cells[0]!.cells[0]!.value = { kind: "literal", value: true };
    sheet.cells[0]!.cells[1]!.value = { kind: "literal", value: null };

    const result = validateWorkbookSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("JSON-safe snapshot unexpectedly invalid");
    const reparsed: unknown = JSON.parse(JSON.stringify(result.value));
    expect(reparsed).toEqual(result.value);
    const roundTrip = validateWorkbookSnapshot(reparsed);
    expect(roundTrip).toEqual(result);
    expect(validateWorkbookSnapshot(result.value)).toEqual(result);
  });

  it("returns results for a deterministic required-container replacement corpus", () => {
    const replacements: unknown[] = [null, 0, false, "invalid"];
    const factories: Array<(replacement: unknown) => unknown> = [
      (replacement) => ({ ...richSnapshot(), workbook: replacement }),
      (replacement) => ({ ...richSnapshot(), sheets: replacement }),
      (replacement) => withFirstSheet({ columns: replacement }),
      (replacement) => withFirstSheet({ cells: replacement }),
      (replacement) => withFirstBlock({ cells: replacement }),
      (replacement) => withFirstCell({ value: replacement }),
    ];

    for (const factory of factories) {
      for (const replacement of replacements) {
        const value = factory(replacement);
        expect(() => validateWorkbookSnapshot(value)).not.toThrow();
        expect(validateWorkbookSnapshot(value).ok).toBe(false);
      }
    }
  });

  it("returns structured errors for invalid identities, bounds, merges, and schemas", () => {
    const future = { ...richSnapshot(), schemaVersion: 2 };
    const futureResult = validateWorkbookSnapshot(future);
    expect(futureResult.ok).toBe(false);
    if (futureResult.ok) throw new Error("future schema unexpectedly accepted");
    expect(futureResult.errors.map((error) => error.code)).toContain("unsupported-schema");

    const invalid = richSnapshot();
    invalid.sheets[1]!.id = "sheet-a";
    invalid.sheets[0]!.columns.push({
      ...invalid.sheets[0]!.columns[0]!,
      key: invalid.sheets[0]!.columns[0]!.key,
    });
    invalid.sheets[0]!.merges = [
      { r0: 0, c0: 0, r1: 1, c1: 0 },
      { r0: 1, c0: 0, r1: 1, c1: 1 },
    ];
    invalid.sheets[0]!.cells[0]!.cells.push({
      rowOffset: 99,
      colOffset: 0,
      value: { kind: "literal", value: null },
    });

    const result = validateWorkbookSnapshot(invalid);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("invalid snapshot unexpectedly accepted");
    expect(new Set(result.errors.map((error) => error.code))).toEqual(
      new Set(["duplicate-id", "overlapping-merge", "out-of-bounds"]),
    );
  });

  it("validates named range scope, identity, and formula-safe names", () => {
    const scoped = richSnapshot();
    scoped.workbook.namedRanges!.push({
      name: "Totals",
      scope: "sheet-a",
      range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    expect(validateWorkbookSnapshot(scoped).ok).toBe(true);

    scoped.workbook.namedRanges!.push({
      name: "totals",
      scope: "sheet-a",
      range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    const duplicate = validateWorkbookSnapshot(scoped);
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error("duplicate named range unexpectedly accepted");
    expect(duplicate.errors.map((error) => error.code)).toContain("duplicate-id");

    const invalid = richSnapshot();
    invalid.workbook.namedRanges = [
      {
        name: "A1",
        scope: "missing",
        range: { sheet: "sheet-a", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    const invalidResult = validateWorkbookSnapshot(invalid);
    expect(invalidResult.ok).toBe(false);
    if (invalidResult.ok) throw new Error("invalid named range unexpectedly accepted");
    expect(new Set(invalidResult.errors.map((error) => error.code))).toEqual(
      new Set(["invalid-value"]),
    );

    const missingScope = richSnapshot();
    missingScope.workbook.namedRanges![0]!.scope = "missing";
    const missingScopeResult = validateWorkbookSnapshot(missingScope);
    expect(missingScopeResult.ok).toBe(false);
    if (missingScopeResult.ok) throw new Error("missing scope unexpectedly accepted");
    expect(missingScopeResult.errors.map((error) => error.code)).toContain("missing-reference");
  });

  it("keeps the operation union exhaustive, targetable, and JSON-only", () => {
    const operations: DocumentOp[] = [
      { op: "set", addr: { sheet: "s", row: 0, col: 0 }, value: { kind: "literal", value: 1 } },
      {
        op: "setRange",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        cells: [],
      },
      {
        op: "setBlock",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        block: { rowCount: 1, colCount: 1, values: [1] },
      },
      {
        op: "setRangeStyle",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        style: { bold: true },
      },
      {
        op: "clearRange",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        contents: true,
      },
      { op: "addRows", sheet: "s", at: 0, count: 1 },
      { op: "removeRows", sheet: "s", at: 0, count: 1 },
      { op: "moveRows", sheet: "s", from: 0, count: 1, to: 2 },
      { op: "addColumns", sheet: "s", at: 0, columns: [] },
      { op: "removeColumns", sheet: "s", at: 0, count: 1 },
      { op: "moveColumns", sheet: "s", from: 0, count: 1, to: 2 },
      { op: "setColumn", sheet: "s", col: 0, patch: { width: 80 } },
      { op: "setRowMeta", sheet: "s", row: 0, meta: { height: 32 } },
      { op: "addMerge", sheet: "s", merge: { r0: 0, c0: 0, r1: 1, c1: 1 } },
      { op: "removeMerge", sheet: "s", merge: { r0: 0, c0: 0, r1: 1, c1: 1 } },
      {
        op: "addSheet",
        sheet: {
          id: "s",
          name: "S",
          order: 0,
          rowCount: 1,
          columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          cells: [],
        },
      },
      { op: "removeSheet", sheet: "s" },
      { op: "renameSheet", sheet: "s", name: "Renamed" },
      { op: "moveSheet", sheet: "s", to: 0 },
      { op: "setSheetMeta", sheet: "s", patch: { frozenRows: 1 } },
      {
        op: "setNamedRange",
        namedRange: {
          name: "N",
          range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        },
      },
      { op: "removeNamedRange", name: "N" },
    ];

    expect(operations.map(documentOpTarget)).toEqual([
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "s",
      "N",
      "N",
    ]);
    expect(() => JSON.stringify(operations)).not.toThrow();
  });
});
