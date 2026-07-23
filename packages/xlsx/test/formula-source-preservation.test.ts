import { beforeAll, describe, expect, it } from "bun:test";
import {
  fromXlsxWorkbook,
  initSheetwrite,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { registerXlsxBackends } from "../src/index.js";

interface FormulaContractInventory {
  functions: {
    canonical: string;
    contractStatus: string;
  }[];
}

const INVENTORY = (await Bun.file(
  new URL("../../../test/conformance/formula-contract.inventory.json", import.meta.url),
).json()) as FormulaContractInventory;
const FORMULA_SOURCES = INVENTORY.functions
  .filter((entry) => entry.contractStatus === "required-supported")
  .map((entry) => `=${entry.canonical}()`);

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
  it("round-trips every required target source without asserting recalculation or producer compatibility", async () => {
    const encoded = await toXlsxWorkbook(formulaWorkbook());
    const decoded = await fromXlsxWorkbook(encoded);
    expect(FORMULA_SOURCES).toHaveLength(100);
    expect(new Set(FORMULA_SOURCES).size).toBe(100);

    expect(decoded.workbook.activeSheet).toBe("formula");
    expect(decoded.sheets).toHaveLength(1);
    expect(decoded.sheets[0]).toMatchObject({
      id: "formula",
      name: "Formula Source",
      order: 0,
      rowCount: 100,
    });
    expect(formulaSources(decoded)).toEqual(FORMULA_SOURCES);
  });
});
