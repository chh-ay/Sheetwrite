import { beforeAll, describe, expect, it } from "bun:test";
import { MAX_CONDITIONAL_FORMAT_RULES } from "../src/conditional-format.js";
import { validateWorkbookSnapshot } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { ConditionalFormatRule, WorkbookSnapshot } from "../src/types.js";
import { WorkerRenderer } from "../src/worker-renderer.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

function styleAt(store: SheetwriteStore, row: number) {
  const view = store.getVisibleWindow("s1", { start: row, end: row + 1 }, [1]);
  return view.styles[view.styleIds[0]!] ?? {};
}

describe("conditional formula formats", () => {
  it("uses range-anchor relative references and updates after dependency edits", () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.conditionalFormats = [
      {
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
        when: { kind: "formula", source: "=A1>$C$1" },
        style: { backgroundColor: "#00FF00" },
      },
    ];
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 1 } },
        { op: "set", addr: { sheet: "s1", row: 1, col: 0 }, value: { kind: "literal", value: 5 } },
        { op: "set", addr: { sheet: "s1", row: 2, col: 0 }, value: { kind: "literal", value: 8 } },
        { op: "set", addr: { sheet: "s1", row: 0, col: 2 }, value: { kind: "literal", value: 4 } },
      ],
    });

    expect(styleAt(store, 0).backgroundColor).toBeUndefined();
    expect(styleAt(store, 1).backgroundColor).toBe("#00FF00");
    expect(styleAt(store, 2).backgroundColor).toBe("#00FF00");

    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "s1", row: 1, col: 0 }, value: { kind: "literal", value: 2 } },
      ],
    });
    expect(styleAt(store, 1).backgroundColor).toBeUndefined();
    expect(styleAt(store, 2).backgroundColor).toBe("#00FF00");
  });

  it("uses array order as precedence and applies stopIfTrue before mask folding", () => {
    const workbook = makeWorkbook(1);
    const range = { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } };
    workbook.sheets[0]!.conditionalFormats = [
      {
        range,
        when: { kind: "formula", source: "=TRUE" },
        style: { color: "#111111", bold: true },
      },
      {
        range,
        when: { kind: "formula", source: "=TRUE" },
        style: { color: "#222222", italic: true },
      },
    ];
    const store = new SheetwriteStore(workbook);
    expect(styleAt(store, 0)).toMatchObject({
      color: "#111111",
      bold: true,
      italic: true,
    });

    workbook.sheets[0]!.conditionalFormats![0]!.stopIfTrue = true;
    store.applyTransaction({
      patches: [
        {
          op: "setSheetMeta",
          sheet: "s1",
          patch: { conditionalFormats: structuredClone(workbook.sheets[0]!.conditionalFormats) },
        },
      ],
    });
    expect(styleAt(store, 0)).toMatchObject({ color: "#111111", bold: true });
    expect(styleAt(store, 0).italic).toBeUndefined();
  });

  it("feeds identical resolved hyperlink/formula styles to main and Worker renderers", () => {
    const workbook = makeWorkbook(1);
    const range = { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } };
    workbook.sheets[0]!.hyperlinks = [
      {
        id: "linked-cell",
        range,
        target: { kind: "external", url: "https://example.com" },
      },
    ];
    workbook.sheets[0]!.conditionalFormats = [
      {
        range,
        when: { kind: "formula", source: "=TRUE" },
        style: { backgroundColor: "#00FF00", bold: true },
      },
    ];
    const store = new SheetwriteStore(workbook);
    const mainView = store.getVisibleWindow("s1", { start: 0, end: 1 }, [1]);
    const messages: unknown[] = [];
    const renderer = new WorkerRenderer();
    Reflect.set(renderer, "worker", {
      postMessage(message: unknown) {
        messages.push(message);
      },
    });

    renderer.paint(mainView);

    const workerPayload = messages[0] as {
      styles: typeof mainView.styles;
      styleIds: Uint32Array;
    };
    expect(workerPayload.styles).toEqual(mainView.styles);
    expect(Array.from(workerPayload.styleIds)).toEqual(Array.from(mainView.styleIds));
    expect(mainView.styles[mainView.styleIds[0]!]).toMatchObject({
      color: "#0563C1",
      underline: true,
      backgroundColor: "#00FF00",
      bold: true,
    });
  });

  it("rewrites formula source and range coherently under row structure", () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.conditionalFormats = [
      {
        range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
        when: { kind: "formula", source: "=A2>0" },
        style: { bold: true },
      },
    ];
    const store = new SheetwriteStore(workbook);
    expect(
      store.applyTransaction({
        patches: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }],
      }).status,
    ).toBe("applied");
    expect(store.exportSnapshot().sheets[0]!.conditionalFormats).toEqual([
      {
        range: { sheet: "s1", start: { row: 2, col: 1 }, end: { row: 3, col: 1 } },
        when: { kind: "formula", source: "=A3>0" },
        style: { bold: true },
      },
    ]);
    expect(
      store.applyTransaction({
        patches: [{ op: "moveRows", sheet: "s1", from: 2, count: 2, to: 0 }],
      }).status,
    ).toBe("applied");
    expect(store.exportSnapshot().sheets[0]!.conditionalFormats).toEqual([
      {
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
        when: { kind: "formula", source: "=A1>0" },
        style: { bold: true },
      },
    ]);
    expect(
      store.applyTransaction({
        patches: [
          {
            op: "addColumns",
            sheet: "s1",
            at: 0,
            columns: [{ key: "inserted", header: "Inserted", width: 100, type: "number" }],
          },
        ],
      }).status,
    ).toBe("applied");
    expect(store.exportSnapshot().sheets[0]!.conditionalFormats).toEqual([
      {
        range: { sheet: "s1", start: { row: 0, col: 2 }, end: { row: 1, col: 2 } },
        when: { kind: "formula", source: "=B1>0" },
        style: { bold: true },
      },
    ]);
    expect(
      store.applyTransaction({
        patches: [{ op: "moveColumns", sheet: "s1", from: 2, count: 1, to: 0 }],
      }).status,
    ).toBe("applied");
    expect(store.exportSnapshot().sheets[0]!.conditionalFormats).toEqual([
      {
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
        when: { kind: "formula", source: "=C1>0" },
        style: { bold: true },
      },
    ]);
  });

  it("rejects a 33rd renderer rule before snapshot allocation", () => {
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s1" },
      sheets: [
        {
          id: "s1",
          name: "Sheet 1",
          order: 0,
          rowCount: 1,
          columns: [{ key: "a", header: "A", width: 100, type: "number" }],
          conditionalFormats: Array.from(
            { length: MAX_CONDITIONAL_FORMAT_RULES + 1 },
            (): ConditionalFormatRule => ({
              range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
              when: { kind: "greaterThan", value: 0 },
              style: { bold: true },
            }),
          ),
          cells: [],
        },
      ],
    };
    const validation = validateWorkbookSnapshot(snapshot);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors).toContainEqual(
        expect.objectContaining({ path: "sheets[0].conditionalFormats", code: "resource-limit" }),
      );
    }
  });
});
