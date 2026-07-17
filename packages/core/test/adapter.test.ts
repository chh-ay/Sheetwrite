import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GRID_OPTION_CONFORMANCE } from "../../../test/adapter-lifecycle-contract.js";
import {
  applyChangedLiveGridOptions,
  createGridController,
  createSimpleGridInput,
  extractGridOptions,
  GRID_OPTION_POLICY,
  getGridResetReason,
  gridSizeStyle,
} from "../src/adapter.js";
import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridOptions } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("shared adapter option policy", () => {
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

  it("applies live options to the existing grid and changes its behavior", () => {
    const host = mountHost();
    const workbook = makeWorkbook(3);
    const previous: GridOptions = {
      workbook,
      data: makeColumnarData(3),
      theme: { bg: "#ffffff" },
      readOnly: false,
      config: { toolbar: true },
    };
    const controller = createGridController(host, previous, {});
    const originalGrid = controller.grid;
    const addr = { sheet: "s1", row: 0, col: 0 };
    expect(host.querySelector(".sheetwrite-toolbar")).not.toBeNull();

    const next: GridOptions = {
      ...previous,
      theme: { bg: "#123456" },
      readOnly: true,
      config: { toolbar: false },
      overscan: 2,
      minColumns: 4,
    };
    applyChangedLiveGridOptions(controller, previous, next);

    expect(controller.grid).toBe(originalGrid);
    expect(originalGrid.getEffectiveTheme().bg).toBe("#123456");
    expect(host.getAttribute("aria-readonly")).toBe("true");
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();
    originalGrid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "blocked" } }],
    });
    expect(originalGrid.store.getCell(addr).resolved).toBe("Customer 0");

    applyChangedLiveGridOptions(controller, next, { ...next, readOnly: false });
    originalGrid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "editable" } }],
    });
    expect(host.hasAttribute("aria-readonly")).toBe(false);
    expect(originalGrid.store.getCell(addr).resolved).toBe("editable");

    controller.destroy();
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
