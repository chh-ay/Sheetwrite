import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite, SheetwriteStore } from "../src/index.js";
import { makeWorkbook } from "./fixtures.js";

const address = (row: number, col: number) => ({ sheet: "s1", row, col });

// biome-ignore lint/suspicious/noApproximativeNumericConstant: exact three-decimal result of ROUND(PI(), 3).
const ROUNDED_PI = 3.142;

beforeAll(async () => {
  await initSheetwrite();
});

describe("formula behavior matrix", () => {
  it("evaluates aggregate, criteria, logical, text, error, and lookup formulas", () => {
    const store = new SheetwriteStore(makeWorkbook(12));
    const formulas: readonly [source: string, expected: string | number | boolean][] = [
      ["=SUM(A1:A4)", 10],
      ["=AVERAGE(A1:A4)", 2.5],
      ['=COUNTIF(A1:A4,">2")', 2],
      ['=IF(SUM(A1:A4)=10,"balanced","wrong")', "balanced"],
      ["=ROUND(PI(),3)", ROUNDED_PI],
      ['=CONCAT("total=",SUM(A1:A4))', "total=10"],
      ['=IFERROR(1/0,"fallback")', "fallback"],
      ["=AND(A1<A2,A4>A3)", true],
      ["=XLOOKUP(3,A1:A4,A1:A4)", 3],
    ];

    store.applyTransaction({
      patches: [
        ...[1, 2, 3, 4].map((value, row) => ({
          op: "set" as const,
          addr: address(row, 0),
          value: { kind: "literal" as const, value },
        })),
        ...formulas.map(([source], row) => ({
          op: "set" as const,
          addr: address(row, 1),
          value: { kind: "formula" as const, src: source },
        })),
      ],
    });

    for (const [row, [source, expected]] of formulas.entries()) {
      expect(store.getFormula(address(row, 1)), source).toBe(source);
      expect(store.getCell(address(row, 1)).resolved, source).toBe(expected);
    }

    store.applyTransaction({
      patches: [{ op: "set", addr: address(3, 0), value: { kind: "literal", value: 8 } }],
    });
    expect(formulas.map((_, row) => store.getCell(address(row, 1)).resolved)).toEqual([
      14,
      3.5,
      2,
      "wrong",
      ROUNDED_PI,
      "total=14",
      "fallback",
      true,
      3,
    ]);
    store.dispose();
  });
});
