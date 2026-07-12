import { describe, expect, it } from "bun:test";
import {
  applyChangedLiveGridOptions,
  createSimpleGridInput,
  GRID_OPTION_POLICY,
  getGridResetReason,
} from "../src/adapter.js";
import type { GridController } from "../src/grid-controller.js";
import type { GridOptions } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

describe("shared adapter option policy", () => {
  it("classifies every GridOptions key and reports deterministic reset reasons", () => {
    expect(Object.keys(GRID_OPTION_POLICY).sort()).toEqual([
      "config",
      "data",
      "datasource",
      "minColumns",
      "overscan",
      "readOnly",
      "renderer",
      "renderers",
      "theme",
      "workbook",
      "workerUrl",
    ]);
    const initial: GridOptions = { workbook: makeWorkbook(1) };
    expect(getGridResetReason(initial, { ...initial, data: { rowCount: 0, columns: {} } })).toBe(
      "input-reset",
    );
    expect(getGridResetReason(initial, { ...initial, renderer: "worker" })).toBe("renderer-reset");
    expect(getGridResetReason(initial, { ...initial, readOnly: true })).toBeNull();
  });

  it("applies each changed live option exactly once without recreating", () => {
    const calls: string[] = [];
    const controller = {
      setTheme: () => calls.push("theme"),
      setReadOnly: () => calls.push("readOnly"),
      setConfig: () => calls.push("config"),
      setOverscan: () => calls.push("overscan"),
      setMinColumns: () => calls.push("minColumns"),
    } as unknown as GridController;
    const previous: GridOptions = { workbook: makeWorkbook(1) };
    const next: GridOptions = {
      ...previous,
      theme: { bg: "#fff" },
      readOnly: true,
      config: { toolbar: false },
      overscan: 2,
      minColumns: 4,
    };
    applyChangedLiveGridOptions(controller, previous, next);
    expect(calls).toEqual(["theme", "readOnly", "config", "overscan", "minColumns"]);
    calls.length = 0;
    applyChangedLiveGridOptions(controller, next, next);
    expect(calls).toEqual([]);
  });
});

describe("simple data conversion", () => {
  it("builds columnar input without mutating rows and fills missing values with null", () => {
    const rows: readonly { name: string; price?: number | null }[] = [
      { name: "A", price: 2 },
      { name: "B" },
    ];
    const before = structuredClone(rows);
    const input = createSimpleGridInput({
      columns: [
        { key: "name", title: "Name" },
        { key: "price", title: "Price", type: "currency" },
      ],
      defaultRows: rows,
    });
    expect(input.workbook.sheets[0]?.columns[0]?.header).toBe("Name");
    expect(Array.from(input.data.columns.price ?? [])).toEqual([2, null]);
    expect(rows).toEqual(before);
  });

  it("rejects duplicate and missing keys with actionable messages", () => {
    expect(() =>
      createSimpleGridInput({
        columns: [
          { key: "name", title: "Name" },
          { key: "name", title: "Again" },
        ],
        defaultRows: [{ name: "A" }],
      }),
    ).toThrow('duplicate simple column key "name"');
    expect(() =>
      createSimpleGridInput({
        columns: [{ key: "", title: "Missing" }],
        defaultRows: [{ "": "A" }],
      }),
    ).toThrow("requires a non-empty key");
  });
});
