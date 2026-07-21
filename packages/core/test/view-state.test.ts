import { describe, expect, it } from "bun:test";
import type { Workbook } from "../src/types.js";
import { StoreViewState } from "../src/store/view-state.js";
import type { RecomputingCellStore } from "../src/store/wasm-contract.js";

function workbook(rowCount: number): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        sortKeys: [{ col: 0, ascending: true }],
      },
    ],
  };
}

function sortedView(
  rowCount: number,
  initialOrder: readonly number[],
): {
  readonly workbook: Workbook;
  readonly view: StoreViewState;
  setOrder(order: readonly number[]): void;
} {
  const document = workbook(rowCount);
  let order = Uint32Array.from(initialOrder);
  const wasm = {
    sortRowsMulti: () => order,
  } as unknown as RecomputingCellStore;
  const view = new StoreViewState(wasm, document, new Map([["s1", 0]]));
  view.metadataChanged("s1");
  return {
    workbook: document,
    view,
    setOrder(next) {
      order = Uint32Array.from(next);
      view.metadataChanged("s1");
    },
  };
}

describe("StoreViewState packed inverse index", () => {
  it("uses absent entries for filtered rows and rejects every invalid coordinate shape", () => {
    const { view } = sortedView(6, [5, 1, 3]);

    expect(view.viewRowOf("s1", 5)).toBe(0);
    expect(view.viewRowOf("s1", 1)).toBe(1);
    expect(view.viewRowOf("s1", 3)).toBe(2);
    expect(view.viewRowOf("s1", 0)).toBeNull();
    expect(view.viewRowOf("s1", 2)).toBeNull();
    expect(view.viewRowOf("s1", 4)).toBeNull();
    expect(view.viewRowOf("s1", -1)).toBeNull();
    expect(view.viewRowOf("s1", 1.5)).toBeNull();
    expect(view.viewRowOf("s1", Number.NaN)).toBeNull();
    expect(view.viewRowOf("s1", Number.POSITIVE_INFINITY)).toBeNull();
    expect(view.viewRowOf("s1", 6)).toBeNull();
  });

  it("invalidates reused storage after query changes without exposing stale entries", () => {
    const state = sortedView(6, [5, 1, 3]);
    expect(state.view.viewRowOf("s1", 5)).toBe(0);
    expect(state.view.viewRowOf("s1", 0)).toBeNull();

    state.setOrder([0, 4, 2]);

    expect(state.view.viewRowOf("s1", 5)).toBeNull();
    expect(state.view.viewRowOf("s1", 1)).toBeNull();
    expect(state.view.viewRowOf("s1", 0)).toBe(0);
    expect(state.view.viewRowOf("s1", 4)).toBe(1);
    expect(state.view.viewRowOf("s1", 2)).toBe(2);
  });

  it("reallocates on structural growth and drops the inverse when the view resets", () => {
    const state = sortedView(4, [3, 1]);
    expect(state.view.viewRowOf("s1", 3)).toBe(0);

    const sheet = state.workbook.sheets[0]!;
    sheet.rowCount = 6;
    sheet.hiddenRows = new Set([1]);
    state.view.rowsChanged("s1");
    expect(state.view.viewRowOf("s1", 1)).toBeNull();
    expect(state.view.viewRowOf("s1", 5)).toBe(4);

    sheet.rowCount = 3;
    sheet.hiddenRows.clear();
    state.view.rowsChanged("s1");
    expect(state.view.hasView("s1")).toBe(false);
    expect(state.view.viewRowOf("s1", 2)).toBe(2);
    expect(state.view.viewRowOf("s1", 3)).toBeNull();
  });

  it("maps collapsed groups and explicitly rejects layouts wider than the sentinel", () => {
    const document = workbook(6);
    const sheet = document.sheets[0]!;
    sheet.sortKeys = [];
    sheet.rowGroups = [{ start: 2, end: 4, collapsed: true }];
    const view = new StoreViewState({} as RecomputingCellStore, document, new Map([["s1", 0]]));
    view.metadataChanged("s1");

    expect(Array.from(view.order("s1") ?? [])).toEqual([0, 1, 5]);
    expect(view.viewRowOf("s1", 0)).toBe(0);
    expect(view.viewRowOf("s1", 5)).toBe(2);
    expect(view.viewRowOf("s1", 2)).toBeNull();
    expect(view.viewRowOf("s1", 4)).toBeNull();

    const oversized = sortedView(0x1_0000_0000, [0]);
    expect(() => oversized.view.viewRowOf("s1", 0)).toThrow(
      "exceeds the packed inverse row limit of 4294967295",
    );
  });

  it("isolates sheet caches and releases every retained index on removal and disposal", () => {
    const document = workbook(4);
    document.sheets.push({
      ...document.sheets[0]!,
      id: "s2",
      name: "Sheet 2",
    });
    const orders = [Uint32Array.from([3, 1]), Uint32Array.from([2, 0])];
    const wasm = {
      sortRowsMulti: (handle: number) => orders[handle]!,
    } as unknown as RecomputingCellStore;
    const view = new StoreViewState(
      wasm,
      document,
      new Map([
        ["s1", 0],
        ["s2", 1],
      ]),
    );
    view.metadataChanged("s1");
    view.metadataChanged("s2");

    expect(view.viewRowOf("s1", 3)).toBe(0);
    expect(view.viewRowOf("s2", 2)).toBe(0);
    expect(view.viewRowOf("s2", 3)).toBeNull();

    view.removeSheet("s1");
    document.sheets.splice(0, 1);
    expect(view.order("s1")).toBeUndefined();
    expect(view.viewRowOf("s1", 3)).toBeNull();
    expect(view.viewRowOf("s2", 2)).toBe(0);

    view.dispose();
    expect(view.order("s2")).toBeUndefined();
    expect(view.viewRowOf("s2", 2)).toBe(2);
  });

  it("rejects corrupt view orders instead of creating coordinate aliases", () => {
    const { view } = sortedView(3, [0, 3]);
    expect(() => view.viewRowOf("s1", 0)).toThrow(
      "view order for sheet s1 contains out-of-bounds data row 3",
    );
  });
});
