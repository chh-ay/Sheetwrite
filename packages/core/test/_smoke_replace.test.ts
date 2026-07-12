import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { replaceInText } from "../src/search-replace.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

const A = (row: number, col: number) => ({ sheet: "s1", row, col });

describe("replaceInText", () => {
  it("case-insensitive substring preserves surrounding casing", () => {
    expect(replaceInText("aXbXc", "x", "-")).toBe("a-b-c");
    expect(replaceInText("Tokyo", "tok", "Kyo")).toBe("Kyoyo");
  });
  it("matchCase only hits exact casing", () => {
    expect(replaceInText("aXbxc", "x", "-", { matchCase: true })).toBe("aXb-c");
  });
  it("wholeCell swaps entire text or nothing", () => {
    expect(replaceInText("Tokyo", "tokyo", "Kyoto", { wholeCell: true })).toBe("Kyoto");
    expect(replaceInText("Tokyo!", "tokyo", "Kyoto", { wholeCell: true })).toBeNull();
  });
  it("returns null with no match / empty query", () => {
    expect(replaceInText("abc", "z", "q")).toBeNull();
    expect(replaceInText("abc", "", "q")).toBeNull();
  });
});

describe("replaceAll", () => {
  it("replaces all, counts, single undo restores all, data-space under sort", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.sortBy(1, false); // active sort view; matches must stay data-space
    grid.search("Tokyo");
    const { replaced, result } = grid.replaceAll("Kyoto");

    expect(replaced).toBe(7);
    expect(result.matches.length).toBe(0);
    const tokyoRows = [1, 4, 7, 10, 13, 16, 19];
    for (const r of tokyoRows) expect(store.getCell(A(r, 2)).resolved).toBe("Kyoto");
    expect(store.getCell(A(0, 2)).resolved).toBe("Phnom Penh");

    grid.undo();
    for (const r of tokyoRows) expect(store.getCell(A(r, 2)).resolved).toBe("Tokyo");

    grid.destroy();
  });

  it("skips formula cells (never rewrites source)", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    store.applyTransaction({
      patches: [{ op: "set", addr: A(5, 1), value: { kind: "formula", src: "=21+21" } }],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    expect(store.getCell(A(5, 1)).resolved).toBe(42);
    grid.search("42");
    const { replaced } = grid.replaceAll("99");
    expect(replaced).toBe(0);
    expect(store.getFormula(A(5, 1))).toBe("=21+21");
    expect(store.getCell(A(5, 1)).resolved).toBe(42);

    grid.destroy();
  });

  it("number column stays numeric; wholeCell swaps", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.search("90.5", { wholeCell: true }); // amount row 9 == 90.5
    grid.replaceAll("123");
    expect(store.getCell(A(9, 1)).resolved).toBe(123);
    expect(typeof store.getCell(A(9, 1)).resolved).toBe("number");

    grid.destroy();
  });
});

describe("replaceCurrent", () => {
  it("edits only the active match and advances", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.search("Tokyo"); // active = row 1
    const res = grid.replaceCurrent("Kyoto");
    expect(store.getCell(A(1, 2)).resolved).toBe("Kyoto");
    expect(store.getCell(A(4, 2)).resolved).toBe("Tokyo");
    expect(res.matches.length).toBe(6);
    expect(res.matches[res.active]?.row).toBe(4);

    grid.destroy();
  });
});

describe("readOnly", () => {
  it("replace is a no-op", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, readOnly: true }, store);

    grid.search("Tokyo");
    expect(grid.replaceAll("Kyoto").replaced).toBe(0);
    grid.replaceCurrent("Kyoto");
    expect(store.getCell(A(1, 2)).resolved).toBe("Tokyo");

    grid.destroy();
  });
});
