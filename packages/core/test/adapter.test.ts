import { describe, expect, it } from "bun:test";
import {
  ADAPTER_LIFECYCLE_CONTRACT,
  GRID_OPTION_CONFORMANCE,
} from "../../../test/adapter-lifecycle-contract.js";
import {
  applyChangedLiveGridOptions,
  createSimpleGridInput,
  extractGridOptions,
  GRID_OPTION_POLICY,
  getGridResetReason,
  gridSizeStyle,
} from "../src/adapter.js";
import type { GridController } from "../src/grid-controller.js";
import type { GridOptions } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

describe("shared adapter option policy", () => {
  it("defines all ten lifecycle observables without framework-specific copies", () => {
    expect(ADAPTER_LIFECYCLE_CONTRACT.map(({ id }) => id)).toEqual([
      "single-live-grid",
      "loading-fallback",
      "current-initialization-error",
      "retry-after-corrected-input",
      "stale-initialization-cancellation",
      "current-callbacks",
      "live-options",
      "construction-reset",
      "exact-cleanup",
      "publication-agreement",
    ]);
  });

  it("classifies every GridOptions key and reports its deterministic reset reason", () => {
    const initial: GridOptions = { workbook: makeWorkbook(1) };
    const changedValues: { [Key in keyof GridOptions]-?: GridOptions[Key] } = {
      workbook: makeWorkbook(2),
      data: { rowCount: 0, columns: {} },
      datasource: {
        getRows: async ({ start }) => ({ start, rows: [] }),
      },
      datasourceStorage: { mode: "paged" },
      renderer: "worker",
      workerUrl: new URL("https://sheetwrite.invalid/worker.js"),
      theme: { bg: "#fff" },
      readOnly: true,
      protectionResolver: () => "allow",
      mutationPolicy: "partial",
      renderers: {},
      overscan: 2,
      minColumns: 4,
      config: { toolbar: false },
    };

    const keys = Object.keys(GRID_OPTION_CONFORMANCE) as Array<keyof GridOptions>;
    expect(Object.keys(GRID_OPTION_POLICY).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const expected = GRID_OPTION_CONFORMANCE[key];
      expect(GRID_OPTION_POLICY[key], key).toBe(expected.policy);
      expect(getGridResetReason(initial, { ...initial, [key]: changedValues[key] }), key).toBe(
        expected.reason,
      );
    }
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
  it("extracts only supported grid options and normalizes explicit host sizing", () => {
    const workbook = makeWorkbook(1);
    expect(
      extractGridOptions({
        workbook,
        readOnly: true,
        className: "host-only",
        onReady: () => {},
      }),
    ).toEqual({ workbook, readOnly: true });
    expect(gridSizeStyle({ fill: true })).toEqual({
      width: "100%",
      height: "100%",
      minHeight: "0",
    });
    expect(gridSizeStyle({ height: 320 })).toEqual({ width: "100%", height: "320px" });
    expect(gridSizeStyle({ height: "40vh" })).toEqual({ width: "100%", height: "40vh" });
    expect(gridSizeStyle({})).toEqual({});
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
