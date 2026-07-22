import { beforeAll, describe, expect, it } from "bun:test";
import {
  fromXlsxWorkbook,
  initSheetwrite,
  type WorkbookSnapshot,
  toXlsxWorkbook,
} from "@sheetwrite/core";
import { registerXlsxBackends } from "../src/index.js";

const FORMULA_SOURCES = [
  "=SUMPRODUCT(A1:A3,B1:B3)",
  '=COUNTIFS(A1:A3,">0",B1:B3,"ok")',
  '=TEXT(DATE(2024,2,29),"yyyy-mm-dd")',
  "=PERCENTILE.INC(A1:A3,0.5)",
  "=COVARIANCE.P(A1:A3,B1:B3)",
  "=FILTER(A1:A3,B1:B3>0)",
  "=LET(values,A1:A3,SUM(values))",
  "=IRR(A1:A3)",
  "=IFS(A1>0,TRUE(),A1=0,FALSE())",
  "=SWITCH(TYPE(A1),1,N(A1),T(A1))",
] as const;

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

function formulaWorkbook(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "formula-source-preservation",
    version: 1,
    workbook: { activeSheet: "formula" },
    sheets: [
      {
        id: "formula",
        name: "Formula Source",
        order: 0,
        rowCount: FORMULA_SOURCES.length,
        columns: [{ key: "formula", header: "Formula", width: 180, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: FORMULA_SOURCES.length,
            colCount: 1,
            cells: FORMULA_SOURCES.map((src, rowOffset) => ({
              rowOffset,
              colOffset: 0,
              value: { kind: "formula" as const, src },
            })),
          },
        ],
      },
    ],
  };
}

function formulaSources(snapshot: WorkbookSnapshot): string[] {
  return snapshot.sheets[0]!.cells.flatMap((block) =>
    block.cells.flatMap((cell) => (cell.value.kind === "formula" ? [cell.value.src] : [])),
  );
}

describe("XLSX formula source preservation", () => {
  it("round-trips supported source names verbatim without asserting recalculation", async () => {
    const encoded = await toXlsxWorkbook(formulaWorkbook());
    const decoded = await fromXlsxWorkbook(encoded);

    expect(formulaSources(decoded)).toEqual(FORMULA_SOURCES);
  });
});
