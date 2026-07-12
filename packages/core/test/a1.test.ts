import { describe, expect, it } from "bun:test";
import { cellA1, colToA1, labelToCol, rangeA1, shiftA1Refs } from "../src/a1.js";

describe("A1 column labels", () => {
  it("converts indices to labels across the 26-wrap boundary", () => {
    expect(colToA1(0)).toBe("A");
    expect(colToA1(25)).toBe("Z");
    expect(colToA1(26)).toBe("AA");
    expect(colToA1(51)).toBe("AZ");
    expect(colToA1(52)).toBe("BA");
    expect(colToA1(701)).toBe("ZZ");
    expect(colToA1(702)).toBe("AAA");
  });

  it("round-trips label → index → label", () => {
    for (const col of [0, 25, 26, 51, 701, 702, 18277]) {
      expect(labelToCol(colToA1(col))).toBe(col);
    }
  });

  it("builds cell and range references with normalized corners", () => {
    expect(cellA1(0, 0)).toBe("A1");
    expect(cellA1(9, 2)).toBe("C10");
    expect(rangeA1({ row: 0, col: 0 }, { row: 0, col: 0 })).toBe("A1");
    expect(rangeA1({ row: 2, col: 1 }, { row: 0, col: 0 })).toBe("A1:B3");
  });
});

describe("shiftA1Refs", () => {
  it("shifts relative references by the delta", () => {
    expect(shiftA1Refs("=A1+B1", 1, 0)).toBe("=A2+B2");
    expect(shiftA1Refs("=A1*2", 3, 1)).toBe("=B4*2");
  });

  it("preserves absolute row/column parts", () => {
    expect(shiftA1Refs("=$A$1", 5, 5)).toBe("=$A$1");
    expect(shiftA1Refs("=$A1", 2, 3)).toBe("=$A3");
    expect(shiftA1Refs("=A$1", 2, 3)).toBe("=D$1");
  });

  it("clamps below the A1 origin instead of going negative", () => {
    expect(shiftA1Refs("=A1", -5, 0)).toBe("=A1");
    expect(shiftA1Refs("=B2", 0, -10)).toBe("=A2");
  });

  it("leaves function names intact while shifting their arguments", () => {
    expect(shiftA1Refs("=SUM(A1:A3)", 1, 0)).toBe("=SUM(A2:A4)");
    expect(shiftA1Refs("=IF(A1>0,B1,C1)", 2, 0)).toBe("=IF(A3>0,B3,C3)");
  });

  it("is a no-op when both deltas are zero", () => {
    expect(shiftA1Refs("=A1+$B$2", 0, 0)).toBe("=A1+$B$2");
  });
});
