import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid";
import { SheetwriteStore } from "../src/store";
import { makeColumnarData, makeWorkbook } from "./fixtures";

beforeAll(async () => {
  await initSheetwrite();
});

// Fixture: 20 rows. col0 name "Customer {r}", col1 amount r*10+0.5,
// col2 city cycling [Phnom Penh, Tokyo, Berlin] — "Tokyo" lands where r % 3 === 1.
function store(): SheetwriteStore {
  return new SheetwriteStore(makeWorkbook(20), makeColumnarData(20));
}

describe("SheetwriteStore.searchCells", () => {
  it("matches case-insensitively by substring, row-major", () => {
    const matches = store().searchCells("s1", "tokyo");

    expect(matches.length).toBe(7);
    expect(matches.every((m) => m.col === 2)).toBe(true);
    expect(matches.map((m) => m.row)).toEqual([1, 4, 7, 10, 13, 16, 19]);
  });

  it("honors matchCase", () => {
    expect(store().searchCells("s1", "tokyo", { matchCase: true })).toHaveLength(0);
    expect(store().searchCells("s1", "Tokyo", { matchCase: true })).toHaveLength(7);
  });

  it("honors wholeCell", () => {
    expect(store().searchCells("s1", "Tok", { wholeCell: true })).toHaveLength(0);
    expect(store().searchCells("s1", "Tokyo", { wholeCell: true })).toHaveLength(7);
  });

  it("matches a number by its text", () => {
    expect(store().searchCells("s1", "190.5")).toEqual([{ sheet: "s1", row: 19, col: 1 }]);
  });

  it("restricts to the requested columns", () => {
    expect(store().searchCells("s1", "Tokyo", { columns: [0] })).toHaveLength(0);
    expect(store().searchCells("s1", "Customer 7", { columns: [0] })).toEqual([
      { sheet: "s1", row: 7, col: 0 },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(store().searchCells("s1", "")).toHaveLength(0);
  });
});
