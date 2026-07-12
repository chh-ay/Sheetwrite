import { describe, expect, it } from "bun:test";
import {
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

  it("keeps the operation union exhaustive, targetable, and JSON-only", () => {
    const operations: DocumentOp[] = [
      { op: "set", addr: { sheet: "s", row: 0, col: 0 }, value: { kind: "literal", value: 1 } },
      {
        op: "setRange",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        cells: [],
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
      "N",
      "N",
    ]);
    expect(() => JSON.stringify(operations)).not.toThrow();
  });
});
