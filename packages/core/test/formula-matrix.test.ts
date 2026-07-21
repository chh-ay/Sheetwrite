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
  it("applies incumbent operator precedence and coercion", () => {
    const store = new SheetwriteStore(makeWorkbook(8));
    const formulas: readonly [string, string | number][] = [
      ["=-2^2", 4],
      ["=2^-2", 0.25],
      ["=2^3^2", 64],
      ["=50%", 0.5],
      ["=200*10%", 20],
      ['="A"&1+2', "A3"],
      ['="Привет "&"世界"', "Привет 世界"],
    ];
    store.applyTransaction({
      patches: formulas.map(([src], row) => ({
        op: "set" as const,
        addr: address(row, 0),
        value: { kind: "formula" as const, src },
      })),
    });

    expect(formulas.map((_, row) => store.getCell(address(row, 0)).resolved)).toEqual(
      formulas.map(([, expected]) => expected),
    );
    store.dispose();
  });

  it("owns, resizes, obstructs, copies, persists, and restores FILTER spills", () => {
    const store = new SheetwriteStore(makeWorkbook(12));
    const values = [3, 1, 3, 2, 4];
    const include = [true, true, false, true, false];
    store.applyTransaction({
      patches: [
        ...values.map((value, row) => ({
          op: "set" as const,
          addr: address(row, 0),
          value: { kind: "literal" as const, value },
        })),
        ...include.map((value, row) => ({
          op: "set" as const,
          addr: address(row, 1),
          value: { kind: "literal" as const, value },
        })),
        {
          op: "set",
          addr: address(4, 2),
          value: { kind: "literal", value: "blocker" },
        },
        {
          op: "set",
          addr: address(0, 2),
          value: { kind: "formula", src: "=FILTER(A1:A5,B1:B5)" },
        },
      ],
    });

    expect([0, 1, 2].map((row) => store.getCell(address(row, 2)).resolved)).toEqual([3, 1, 2]);
    expect(store.getSpillAnchor(address(1, 2))).toEqual(address(0, 2));
    expect(store.getFormula(address(1, 2))).toBeNull();

    store.applyTransaction({
      patches: [{ op: "set", addr: address(2, 1), value: { kind: "literal", value: true } }],
    });
    expect([0, 1, 2, 3].map((row) => store.getCell(address(row, 2)).resolved)).toEqual([
      3, 1, 3, 2,
    ]);

    store.applyTransaction({
      patches: [{ op: "set", addr: address(4, 1), value: { kind: "literal", value: true } }],
    });
    expect(store.getCell(address(0, 2)).resolved).toBe("#SPILL!");
    expect(store.getCell(address(1, 2)).resolved).toBeNull();

    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 4, col: 2 }, end: { row: 4, col: 2 } },
        },
      ],
    });
    expect([0, 1, 2, 3, 4].map((row) => store.getCell(address(row, 2)).resolved)).toEqual(values);

    store.applyTransaction({
      patches: [{ op: "set", addr: address(1, 2), value: { kind: "literal", value: "rejected" } }],
    });
    expect(store.getCell(address(1, 2)).resolved).toBe(1);

    const clipboard = store.getClipboardWindow("s1", { start: 0, end: 5 }, [2]);
    expect(Array.from(clipboard.values)).toEqual(values);
    expect(Array.from(clipboard.spillDerived)).toEqual([0, 1, 1, 1, 1]);
    expect(clipboard.formulas).toEqual([{ offset: 0, source: "=FILTER(A1:A5,B1:B5)" }]);
    store.sortBy("s1", 0, false);
    const sortedClipboard = store.getClipboardWindow("s1", { start: 0, end: 12 }, [2]);
    const spillOffsets = Array.from(sortedClipboard.dataRows, (row, offset) =>
      row < values.length ? offset : -1,
    ).filter((offset) => offset >= 0);
    expect(spillOffsets.map((offset) => sortedClipboard.values[offset])).toEqual(
      spillOffsets.map((offset) => values[sortedClipboard.dataRows[offset]!]!),
    );
    expect(spillOffsets.map((offset) => sortedClipboard.spillDerived[offset])).toEqual(
      spillOffsets.map((offset) => (sortedClipboard.dataRows[offset] === 0 ? 0 : 1)),
    );

    const history = store.captureRangeHistory({
      sheet: "s1",
      start: { row: 0, col: 2 },
      end: { row: 4, col: 2 },
    });
    expect(history).not.toBeNull();
    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 0, col: 2 }, end: { row: 4, col: 2 } },
        },
      ],
    });
    expect(store.getCell(address(0, 2)).resolved).toBeNull();
    store.applyTransaction({
      patches: [
        history!.toDocumentOp({
          sheet: "s1",
          start: { row: 0, col: 2 },
          end: { row: 4, col: 2 },
        }),
      ],
    });
    history!.dispose();
    expect([0, 1, 2, 3, 4].map((row) => store.getCell(address(row, 2)).resolved)).toEqual(values);

    const snapshot = store.exportSnapshot();
    expect(
      snapshot.sheets[0]!.cells.flatMap((block) => block.cells)
        .filter((cell) => cell.colOffset === 2)
        .map((cell) => cell.value),
    ).toEqual([{ kind: "formula", src: "=FILTER(A1:A5,B1:B5)" }]);
    const restored = SheetwriteStore.fromSnapshot(snapshot);
    expect([0, 1, 2, 3, 4].map((row) => restored.getCell(address(row, 2)).resolved)).toEqual(
      values,
    );
    expect(restored.getSpillAnchor(address(4, 2))).toEqual(address(0, 2));

    restored.dispose();
    store.dispose();
  });
});
