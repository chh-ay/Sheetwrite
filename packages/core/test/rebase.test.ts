import { describe, expect, it } from "bun:test";
import {
  type CellAddress,
  type CellValue,
  type Column,
  type DocumentOp,
  type Range,
  type RebaseConflictCode,
  rebaseDocumentOperations,
  type SheetSnapshot,
} from "../src/index.js";

const SHEET = "s1";
const OTHER_SHEET = "s2";
const AXES = ["row", "column"] as const;
type Axis = (typeof AXES)[number];
type StructuralKind = "insert" | "delete";

type RebaseConflictFamily = "cell" | "range" | "sheet" | "named-range";

const OP_CONFLICT_FAMILY = {
  set: "cell",
  setNote: "cell",
  setRange: "range",
  setBlock: "range",
  setRangeStyle: "range",
  clearRange: "range",
  addRows: "sheet",
  removeRows: "sheet",
  moveRows: "sheet",
  addColumns: "sheet",
  removeColumns: "sheet",
  moveColumns: "sheet",
  setColumn: "sheet",
  setRowMeta: "sheet",
  addMerge: "range",
  removeMerge: "range",
  addSheet: "sheet",
  removeSheet: "sheet",
  renameSheet: "sheet",
  moveSheet: "sheet",
  setSheetVisibility: "sheet",
  setSheetMeta: "sheet",
  addTable: "range",
  updateTable: "sheet",
  removeTable: "sheet",
  setHyperlink: "range",
  removeHyperlink: "range",
  setValidationRule: "range",
  removeValidationRule: "range",
  setProtectedRange: "range",
  removeProtectedRange: "range",
  setNamedRange: "named-range",
  removeNamedRange: "named-range",
} satisfies Record<DocumentOp["op"], RebaseConflictFamily>;

function columns(count: number): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `column-${index}`,
    header: `Column ${index}`,
    width: 100,
    type: "text",
  }));
}

function address(axis: Axis, index: number, sheet = SHEET): CellAddress {
  return axis === "row" ? { sheet, row: index, col: 1 } : { sheet, row: 1, col: index };
}

function range(axis: Axis, start: number, end: number, sheet = SHEET): Range {
  return axis === "row"
    ? { sheet, start: { row: start, col: 1 }, end: { row: end, col: 2 } }
    : { sheet, start: { row: 1, col: start }, end: { row: 2, col: end } };
}

function structure(axis: Axis, kind: StructuralKind, at = 4, count = 2, sheet = SHEET): DocumentOp {
  if (axis === "row") {
    return kind === "insert"
      ? { op: "addRows", sheet, at, count }
      : { op: "removeRows", sheet, at, count };
  }
  return kind === "insert"
    ? { op: "addColumns", sheet, at, columns: columns(count) }
    : { op: "removeColumns", sheet, at, count };
}

function literal(value: string | number = "value"): CellValue {
  return { kind: "literal", value };
}

function snapshot(id = "new-sheet", values: CellValue[] = [literal()]): SheetSnapshot {
  return {
    id,
    name: `Sheet ${id}`,
    order: 2,
    rowCount: 20,
    columns: columns(3),
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: values.length,
        colCount: 1,
        cells: values.map((value, rowOffset) => ({ rowOffset, colOffset: 0, value })),
      },
    ],
  };
}

function expectRebased(
  local: readonly DocumentOp[],
  remote: readonly DocumentOp[],
  expected: readonly DocumentOp[],
): void {
  expect(rebaseDocumentOperations(local, remote)).toEqual({
    status: "rebased",
    operations: expected,
  });
}

function expectConflict(
  local: readonly DocumentOp[],
  remote: readonly DocumentOp[],
  code: RebaseConflictCode,
  localOperationIndex = 0,
  remoteOperationIndex = 0,
): void {
  const result = rebaseDocumentOperations(local, remote);
  expect(result.status).toBe("conflict");
  if (result.status !== "conflict") throw new Error("Expected a rebase conflict");
  expect(result.conflict).toEqual({
    code,
    localOperationIndex,
    remoteOperationIndex,
    message: expect.any(String),
  });
}

interface PointFactory {
  name: string;
  make(axis: Axis, index: number, sheet?: string): DocumentOp;
}

function pointFactories(axis: Axis): PointFactory[] {
  const factories: PointFactory[] = [
    {
      name: "set",
      make: (targetAxis, index, sheet) => ({
        op: "set",
        addr: address(targetAxis, index, sheet),
        value: literal(),
      }),
    },
    {
      name: "setNote",
      make: (targetAxis, index, sheet) => ({
        op: "setNote",
        addr: address(targetAxis, index, sheet),
        text: "note",
      }),
    },
  ];
  factories.push(
    axis === "row"
      ? {
          name: "setRowMeta",
          make: (_targetAxis, index, sheet = SHEET) => ({
            op: "setRowMeta",
            sheet,
            row: index,
            meta: { height: 32 },
          }),
        }
      : {
          name: "setColumn",
          make: (_targetAxis, index, sheet = SHEET) => ({
            op: "setColumn",
            sheet,
            col: index,
            patch: { width: 160 },
          }),
        },
  );
  return factories;
}

interface RangeFactory {
  name: string;
  make(axis: Axis, start: number, end: number, sheet?: string): DocumentOp;
}

const RANGE_FACTORIES: RangeFactory[] = [
  {
    name: "setRange",
    make: (axis, start, end, sheet) => ({
      op: "setRange",
      range: range(axis, start, end, sheet),
      cells: [{ rowOffset: 0, colOffset: 0, value: literal() }],
    }),
  },
  {
    name: "setBlock",
    make: (axis, start, end, sheet) => ({
      op: "setBlock",
      range: range(axis, start, end, sheet),
      block: { rowCount: 1, colCount: 1, values: [1] },
    }),
  },
  {
    name: "setRangeStyle",
    make: (axis, start, end, sheet) => ({
      op: "setRangeStyle",
      range: range(axis, start, end, sheet),
      style: { bold: true },
    }),
  },
  {
    name: "clearRange",
    make: (axis, start, end, sheet) => ({
      op: "clearRange",
      range: range(axis, start, end, sheet),
      contents: true,
    }),
  },
  {
    name: "addMerge",
    make: (axis, start, end, sheet = SHEET) => {
      const target = range(axis, start, end, sheet);
      return {
        op: "addMerge",
        sheet,
        merge: {
          r0: target.start.row,
          c0: target.start.col,
          r1: target.end.row,
          c1: target.end.col,
        },
      };
    },
  },
  {
    name: "removeMerge",
    make: (axis, start, end, sheet = SHEET) => {
      const target = range(axis, start, end, sheet);
      return {
        op: "removeMerge",
        sheet,
        merge: {
          r0: target.start.row,
          c0: target.start.col,
          r1: target.end.row,
          c1: target.end.col,
        },
      };
    },
  },
  {
    name: "setValidationRule",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setValidationRule",
      sheet,
      rule: {
        id: "validation-1",
        range: range(axis, start, end, sheet),
        condition: { kind: "number", min: 0 },
        policy: "reject",
      },
    }),
  },
  {
    name: "setProtectedRange",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setProtectedRange",
      sheet,
      protectedRange: {
        id: "protection-1",
        range: range(axis, start, end, sheet),
        permissionKey: "edit",
      },
    }),
  },
  {
    name: "setNamedRange",
    make: (axis, start, end, sheet = SHEET) => ({
      op: "setNamedRange",
      namedRange: { name: "Sales", scope: sheet, range: range(axis, start, end, sheet) },
    }),
  },
];

interface SpanFactory {
  name: string;
  make(axis: Axis, at: number, count: number, sheet?: string): DocumentOp;
}

const SPAN_FACTORIES: SpanFactory[] = [
  {
    name: "remove",
    make: (axis, at, count, sheet = SHEET) =>
      axis === "row"
        ? { op: "removeRows", sheet, at, count }
        : { op: "removeColumns", sheet, at, count },
  },
  {
    name: "move",
    make: (axis, at, count, sheet = SHEET) =>
      axis === "row"
        ? { op: "moveRows", sheet, from: at, count, to: 0 }
        : { op: "moveColumns", sheet, from: at, count, to: 0 },
  },
];

for (const axis of AXES) {
  describe(`${axis} structural target matrix`, () => {
    for (const factory of pointFactories(axis)) {
      it(`${factory.name} handles insert/delete positions and sheet identity`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 2)], [insert], [factory.make(axis, 2)]);
        expectRebased([factory.make(axis, 4)], [insert], [factory.make(axis, 6)]);
        expectRebased([factory.make(axis, 7)], [insert], [factory.make(axis, 9)]);
        expectRebased(
          [factory.make(axis, 4, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 4, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 2)], [deletion], [factory.make(axis, 2)]);
        expectConflict([factory.make(axis, 4)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 7)], [deletion], [factory.make(axis, 5)]);
        expectRebased([factory.make(axis, 3)], [deletion], [factory.make(axis, 3)]);
        expectRebased([factory.make(axis, 6)], [deletion], [factory.make(axis, 4)]);
        expectRebased(
          [factory.make(axis, 4, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 4, OTHER_SHEET)],
        );
      });
    }

    for (const factory of RANGE_FACTORIES) {
      it(`${factory.name} handles the complete range relation matrix`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 1, 2)], [insert], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 4, 5)], [insert], [factory.make(axis, 6, 7)]);
        expectRebased([factory.make(axis, 7, 8)], [insert], [factory.make(axis, 9, 10)]);
        expectConflict([factory.make(axis, 3, 6)], [insert], "structural-overlap");
        expectRebased([factory.make(axis, 2, 3)], [insert], [factory.make(axis, 2, 3)]);
        expectRebased(
          [factory.make(axis, 3, 6, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 3, 6, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 1, 2)], [deletion], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 7, 8)], [deletion], [factory.make(axis, 5, 6)]);
        expectConflict([factory.make(axis, 4, 5)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 4)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 6)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 2, 3)], [deletion], [factory.make(axis, 2, 3)]);
        expectRebased([factory.make(axis, 6, 7)], [deletion], [factory.make(axis, 4, 5)]);
        expectRebased(
          [factory.make(axis, 3, 6, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 3, 6, OTHER_SHEET)],
        );
      });
    }

    it(`add${axis === "row" ? "Rows" : "Columns"} transforms insertion positions`, () => {
      const make = (at: number, sheet = SHEET): DocumentOp =>
        axis === "row"
          ? { op: "addRows", sheet, at, count: 2 }
          : { op: "addColumns", sheet, at, columns: columns(2) };
      const insert = structure(axis, "insert");
      expectRebased([make(2)], [insert], [make(2)]);
      expectRebased([make(4)], [insert], [make(6)]);
      expectRebased([make(7)], [insert], [make(9)]);
      expectRebased([make(4, OTHER_SHEET)], [insert], [make(4, OTHER_SHEET)]);

      const deletion = structure(axis, "delete");
      expectRebased([make(2)], [deletion], [make(2)]);
      expectRebased([make(4)], [deletion], [make(4)]);
      expectRebased([make(5)], [deletion], [make(4)]);
      expectRebased([make(7)], [deletion], [make(5)]);
      expectRebased([make(4, OTHER_SHEET)], [deletion], [make(4, OTHER_SHEET)]);
    });

    for (const factory of SPAN_FACTORIES) {
      it(`${factory.name} ${axis} operations handle the complete span relation matrix`, () => {
        const insert = structure(axis, "insert");
        expectRebased([factory.make(axis, 1, 2)], [insert], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 4, 2)], [insert], [factory.make(axis, 6, 2)]);
        expectRebased([factory.make(axis, 7, 2)], [insert], [factory.make(axis, 9, 2)]);
        expectConflict([factory.make(axis, 3, 4)], [insert], "structural-overlap");
        expectRebased(
          [factory.make(axis, 3, 4, OTHER_SHEET)],
          [insert],
          [factory.make(axis, 3, 4, OTHER_SHEET)],
        );

        const deletion = structure(axis, "delete");
        expectRebased([factory.make(axis, 1, 2)], [deletion], [factory.make(axis, 1, 2)]);
        expectRebased([factory.make(axis, 7, 2)], [deletion], [factory.make(axis, 5, 2)]);
        expectConflict([factory.make(axis, 4, 2)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 2)], [deletion], "structural-overlap");
        expectConflict([factory.make(axis, 3, 4)], [deletion], "structural-overlap");
        expectRebased([factory.make(axis, 2, 2)], [deletion], [factory.make(axis, 2, 2)]);
        expectRebased([factory.make(axis, 6, 2)], [deletion], [factory.make(axis, 4, 2)]);
        expectRebased(
          [factory.make(axis, 3, 4, OTHER_SHEET)],
          [deletion],
          [factory.make(axis, 3, 4, OTHER_SHEET)],
        );
      });
    }

    it(`moves the ${axis} destination when the server changes preceding indices`, () => {
      const local: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 7 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 7 };
      const inserted: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 9 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 9 };
      const deleted: DocumentOp =
        axis === "row"
          ? { op: "moveRows", sheet: SHEET, from: 0, count: 1, to: 5 }
          : { op: "moveColumns", sheet: SHEET, from: 0, count: 1, to: 5 };
      expectRebased([local], [structure(axis, "insert")], [inserted]);
      expectRebased([local], [structure(axis, "delete")], [deleted]);
    });
  });
}

describe("embedded references and formulas", () => {
  const containers = [
    {
      name: "set",
      make: (value: CellValue): DocumentOp => ({
        op: "set",
        addr: { sheet: OTHER_SHEET, row: 0, col: 0 },
        value,
      }),
      expected: (value: CellValue): DocumentOp => ({
        op: "set",
        addr: { sheet: OTHER_SHEET, row: 0, col: 0 },
        value,
      }),
    },
    {
      name: "setRange sparse cells",
      make: (value: CellValue): DocumentOp => ({
        op: "setRange",
        range: range("row", 0, 0, OTHER_SHEET),
        cells: [{ rowOffset: 0, colOffset: 0, value }],
      }),
      expected: (value: CellValue): DocumentOp => ({
        op: "setRange",
        range: range("row", 0, 0, OTHER_SHEET),
        cells: [{ rowOffset: 0, colOffset: 0, value }],
      }),
    },
    {
      name: "addSheet snapshot cells",
      make: (value: CellValue): DocumentOp => ({ op: "addSheet", sheet: snapshot("new", [value]) }),
      expected: (value: CellValue): DocumentOp => ({
        op: "addSheet",
        sheet: snapshot("new", [value]),
      }),
    },
  ];

  for (const container of containers) {
    it(`${container.name} shifts refs, preserves other-sheet refs, and rejects deletion`, () => {
      const source = { kind: "ref", target: address("row", 7) } as const;
      const shifted = { kind: "ref", target: address("row", 5) } as const;
      expectRebased(
        [container.make(source)],
        [structure("row", "delete")],
        [container.expected(shifted)],
      );

      const other = { kind: "ref", target: address("row", 4, OTHER_SHEET) } as const;
      expectRebased(
        [container.make(other)],
        [structure("row", "delete")],
        [container.expected(other)],
      );

      const deleted = { kind: "ref", target: address("row", 4) } as const;
      expectConflict([container.make(deleted)], [structure("row", "delete")], "structural-overlap");
    });

    it(`${container.name} rejects formulas across structural edits`, () => {
      expectConflict(
        [container.make({ kind: "formula", src: "=s1!A1+1" })],
        [structure("row", "insert")],
        "formula-structural",
      );
    });
  }

  it("set preserves literals while shifting its direct target", () => {
    expectRebased(
      [{ op: "set", addr: address("column", 7), value: literal(42) }],
      [structure("column", "delete")],
      [{ op: "set", addr: address("column", 5), value: literal(42) }],
    );
  });

  it("setBlock packed refs shift, preserve other sheets, and reject deletion", () => {
    const make = (target: CellAddress): DocumentOp => ({
      op: "setBlock",
      range: range("row", 0, 0, OTHER_SHEET),
      block: { rowCount: 1, colCount: 1, values: [null], refs: [[0, target]] },
    });
    expectRebased(
      [make(address("column", 7))],
      [structure("column", "delete")],
      [make(address("column", 5))],
    );
    expectRebased(
      [make(address("column", 4, OTHER_SHEET))],
      [structure("column", "delete")],
      [make(address("column", 4, OTHER_SHEET))],
    );
    expectConflict(
      [make(address("column", 4))],
      [structure("column", "delete")],
      "structural-overlap",
    );
  });

  it("setBlock rejects packed formulas across structural edits", () => {
    expectConflict(
      [
        {
          op: "setBlock",
          range: range("row", 0, 0, OTHER_SHEET),
          block: { rowCount: 1, colCount: 1, values: [null], formulas: [[0, "=s1!A1"]] },
        },
      ],
      [structure("row", "insert")],
      "formula-structural",
    );
  });

  it("conflicts every embedded ref container when its target sheet is removed or moved", () => {
    const reference = { kind: "ref", target: address("row", 7) } as const;
    const referencing: DocumentOp[] = [
      ...containers.map((container) => container.make(reference)),
      {
        op: "setBlock",
        range: range("row", 0, 0, OTHER_SHEET),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, reference.target]],
        },
      },
    ];
    for (const operation of referencing) {
      expectConflict([operation], [{ op: "removeSheet", sheet: SHEET }], "sheet-removed");
      expectConflict(
        [operation],
        [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
        "unsupported-structural",
      );
    }
  });
});

describe("metadata, identity, and sheet lifecycle", () => {
  it("setSheetMeta conflicts on the structurally changed sheet and passes on another sheet", () => {
    const same: DocumentOp = {
      op: "setSheetMeta",
      sheet: SHEET,
      patch: { frozenRows: 2 },
    };
    const other: DocumentOp = {
      op: "setSheetMeta",
      sheet: OTHER_SHEET,
      patch: { frozenRows: 2 },
    };
    expectConflict([same], [structure("row", "insert")], "unsupported-structural");
    expectRebased([other], [structure("row", "insert")], [other]);
  });

  it("keeps row and column axes independent", () => {
    const local: DocumentOp[] = [
      { op: "addColumns", sheet: SHEET, at: 4, columns: columns(1) },
      { op: "removeColumns", sheet: SHEET, at: 6, count: 1 },
      { op: "moveColumns", sheet: SHEET, from: 8, count: 1, to: 10 },
      { op: "setColumn", sheet: SHEET, col: 4, patch: { width: 140 } },
    ];
    expectRebased(local, [structure("row", "insert")], local);
  });

  it("keeps sheet lifecycle and stable remove-by-ID operations across structural edits", () => {
    const local: DocumentOp[] = [
      { op: "addSheet", sheet: snapshot("new") },
      { op: "removeSheet", sheet: SHEET },
      { op: "renameSheet", sheet: SHEET, name: "Renamed" },
      { op: "moveSheet", sheet: SHEET, to: 2 },
      { op: "removeValidationRule", sheet: SHEET, id: "validation-1" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-1" },
      { op: "removeNamedRange", name: "Sales", scope: SHEET },
    ];
    expectRebased(local, [structure("row", "insert")], local);
  });

  it("treats remote row and column moves as conservative conflicts on their sheet", () => {
    const local: DocumentOp = {
      op: "set",
      addr: { sheet: SHEET, row: 8, col: 8 },
      value: literal(),
    };
    expectConflict(
      [local],
      [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
      "unsupported-structural",
    );
    expectConflict(
      [local],
      [{ op: "moveColumns", sheet: SHEET, from: 1, count: 2, to: 5 }],
      "unsupported-structural",
    );
    expectRebased(
      [{ ...local, addr: { ...local.addr, sheet: OTHER_SHEET } }],
      [{ op: "moveRows", sheet: SHEET, from: 1, count: 2, to: 5 }],
      [{ ...local, addr: { ...local.addr, sheet: OTHER_SHEET } }],
    );
  });

  it("detects duplicate sheet IDs and same-sheet rename/move lifecycle ambiguity", () => {
    expectConflict(
      [{ op: "addSheet", sheet: snapshot("stable-id") }],
      [{ op: "addSheet", sheet: snapshot("stable-id") }],
      "sheet-lifecycle",
    );
    expectConflict(
      [{ op: "renameSheet", sheet: SHEET, name: "Offline" }],
      [{ op: "renameSheet", sheet: SHEET, name: "Server" }],
      "sheet-lifecycle",
    );
    expectConflict(
      [{ op: "moveSheet", sheet: SHEET, to: 2 }],
      [{ op: "moveSheet", sheet: SHEET, to: 3 }],
      "sheet-lifecycle",
    );
    expectRebased(
      [{ op: "renameSheet", sheet: OTHER_SHEET, name: "Offline" }],
      [{ op: "renameSheet", sheet: SHEET, name: "Server" }],
      [{ op: "renameSheet", sheet: OTHER_SHEET, name: "Offline" }],
    );
  });

  it("conflicts direct, scoped named-range, and formula work with sheet removal", () => {
    expectConflict(
      [{ op: "setNote", addr: address("row", 1), text: "note" }],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    expectConflict(
      [
        {
          op: "setNamedRange",
          namedRange: {
            name: "Local",
            scope: SHEET,
            range: range("row", 0, 1, OTHER_SHEET),
          },
        },
      ],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    expectConflict(
      [
        {
          op: "set",
          addr: address("row", 1, OTHER_SHEET),
          value: { kind: "formula", src: "=s1!A1" },
        },
      ],
      [{ op: "removeSheet", sheet: SHEET }],
      "sheet-removed",
    );
    const unrelated: DocumentOp = {
      op: "set",
      addr: address("row", 1, OTHER_SHEET),
      value: literal("unrelated"),
    };
    expectRebased([unrelated], [{ op: "removeSheet", sheet: SHEET }], [unrelated]);
  });

  it("detects sheet-removal conflicts across representative operation families", () => {
    const cases: Array<{ family: RebaseConflictFamily; operation: DocumentOp }> = [
      {
        family: "cell",
        operation: { op: "setNote", addr: address("row", 1), text: "review" },
      },
      {
        family: "range",
        operation: {
          op: "setRangeStyle",
          range: range("row", 0, 2),
          style: { bold: true },
        },
      },
      {
        family: "sheet",
        operation: { op: "setRowMeta", sheet: SHEET, row: 2, meta: { height: 24 } },
      },
      {
        family: "named-range",
        operation: {
          op: "setNamedRange",
          namedRange: {
            name: "Local",
            scope: SHEET,
            range: range("row", 0, 2),
          },
        },
      },
      {
        family: "named-range",
        operation: { op: "removeNamedRange", name: "Local", scope: SHEET },
      },
    ];

    for (const { family, operation } of cases) {
      expect(OP_CONFLICT_FAMILY[operation.op]).toBe(family);
      expectConflict([operation], [{ op: "removeSheet", sheet: SHEET }], "sheet-removed");
    }
  });

  it("detects representative overlapping edits for each conflict family", () => {
    const cases: Array<{
      family: RebaseConflictFamily;
      local: DocumentOp;
      remote: DocumentOp;
    }> = [
      {
        family: "cell",
        local: { op: "set", addr: address("row", 1), value: literal("local") },
        remote: { op: "setNote", addr: address("row", 1), text: "remote" },
      },
      {
        family: "range",
        local: {
          op: "setRange",
          range: range("row", 0, 2),
          cells: [{ rowOffset: 0, colOffset: 0, value: literal("local") }],
        },
        remote: {
          op: "setRangeStyle",
          range: range("row", 1, 3),
          style: { italic: true },
        },
      },
      {
        family: "range",
        local: {
          op: "setRangeStyle",
          range: range("row", 0, 2),
          style: { bold: true },
        },
        remote: { op: "clearRange", range: range("row", 1, 3), contents: true },
      },
      {
        family: "range",
        local: { op: "addMerge", sheet: SHEET, merge: { r0: 0, c0: 0, r1: 2, c1: 2 } },
        remote: { op: "removeMerge", sheet: SHEET, merge: { r0: 1, c0: 1, r1: 3, c1: 3 } },
      },
      {
        family: "sheet",
        local: { op: "setColumn", sheet: SHEET, col: 2, patch: { width: 120 } },
        remote: { op: "setColumn", sheet: SHEET, col: 2, patch: { header: "Remote" } },
      },
      {
        family: "named-range",
        local: {
          op: "setNamedRange",
          namedRange: { name: "Sales", scope: SHEET, range: range("row", 0, 2) },
        },
        remote: { op: "removeNamedRange", name: "Sales", scope: SHEET },
      },
    ];

    for (const { family, local, remote } of cases) {
      expect(OP_CONFLICT_FAMILY[local.op]).toBe(family);
      expect(OP_CONFLICT_FAMILY[remote.op]).toBe(family);
      expectConflict([local], [remote], "overlapping-edit");
    }
  });

  it("detects same identities without requiring a cell range", () => {
    const identities: Array<[DocumentOp, DocumentOp]> = [
      [
        { op: "setColumn", sheet: SHEET, col: 2, patch: { width: 120 } },
        { op: "setColumn", sheet: SHEET, col: 2, patch: { header: "Server" } },
      ],
      [
        { op: "setRowMeta", sheet: SHEET, row: 2, meta: { height: 24 } },
        { op: "setRowMeta", sheet: SHEET, row: 2, meta: { hidden: true } },
      ],
      [
        { op: "removeValidationRule", sheet: SHEET, id: "validation-1" },
        RANGE_FACTORIES[6]!.make("row", 3, 4),
      ],
      [
        { op: "removeProtectedRange", sheet: SHEET, id: "protection-1" },
        RANGE_FACTORIES[7]!.make("row", 3, 4),
      ],
      [
        { op: "removeNamedRange", name: "sales", scope: SHEET },
        RANGE_FACTORIES[8]!.make("row", 3, 4),
      ],
      [
        { op: "setSheetMeta", sheet: SHEET, patch: { frozenRows: 1 } },
        { op: "setSheetMeta", sheet: SHEET, patch: { frozenCols: 1 } },
      ],
    ];
    for (const [local, remote] of identities) {
      expectConflict([local], [remote], "overlapping-edit");
    }
  });

  it("allows non-overlapping metadata identities", () => {
    const local: DocumentOp[] = [
      { op: "removeValidationRule", sheet: SHEET, id: "validation-local" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-local" },
      { op: "removeNamedRange", name: "Local", scope: SHEET },
      { op: "setSheetMeta", sheet: OTHER_SHEET, patch: { frozenRows: 1 } },
    ];
    const remote: DocumentOp[] = [
      { op: "removeValidationRule", sheet: SHEET, id: "validation-remote" },
      { op: "removeProtectedRange", sheet: SHEET, id: "protection-remote" },
      { op: "removeNamedRange", name: "Remote", scope: SHEET },
      { op: "setSheetMeta", sheet: SHEET, patch: { frozenRows: 1 } },
    ];
    expectRebased(local, remote, local);
  });
});

describe("server ordering, immutability, and determinism", () => {
  it("applies structural transformations in remote server order", () => {
    const local: DocumentOp[] = [{ op: "set", addr: address("row", 4), value: literal("offline") }];
    const insert = structure("row", "insert", 2, 2);
    const deletion = structure("row", "delete", 5, 2);
    expectConflict(local, [insert, deletion], "structural-overlap", 0, 1);
    expectRebased(
      local,
      [deletion, insert],
      [{ op: "set", addr: address("row", 6), value: literal("offline") }],
    );
  });

  it("reports the first conflict by remote order and then local order", () => {
    const local: DocumentOp[] = [
      { op: "set", addr: address("row", 0, OTHER_SHEET), value: literal("safe") },
      { op: "set", addr: address("row", 8), value: { kind: "formula", src: "=A1" } },
      { op: "set", addr: address("row", 4), value: literal("deleted") },
    ];
    const remote: DocumentOp[] = [
      { op: "set", addr: address("row", 10), value: literal("server") },
      structure("row", "delete"),
    ];
    expectConflict(local, remote, "formula-structural", 1, 1);
  });

  it("preserves successful local operation order", () => {
    const local: DocumentOp[] = [
      { op: "setNote", addr: address("row", 7), text: "first" },
      { op: "set", addr: address("row", 8), value: literal("second") },
      { op: "renameSheet", sheet: OTHER_SHEET, name: "third" },
    ];
    expectRebased(
      local,
      [structure("row", "insert")],
      [
        { op: "setNote", addr: address("row", 9), text: "first" },
        { op: "set", addr: address("row", 10), value: literal("second") },
        { op: "renameSheet", sheet: OTHER_SHEET, name: "third" },
      ],
    );
  });

  it("does not mutate local or remote arrays or their nested objects", () => {
    const local: DocumentOp[] = [
      {
        op: "setRange",
        range: range("row", 7, 8),
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "ref", target: address("column", 7) },
            style: { bold: true },
          },
        ],
      },
      {
        op: "setBlock",
        range: range("row", 9, 9),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, address("column", 8)]],
          styleTable: [{ italic: true }],
          styleIds: [0],
        },
      },
    ];
    const remote: DocumentOp[] = [structure("row", "insert"), structure("column", "insert")];
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const result = rebaseDocumentOperations(local, remote);

    expect(result.status).toBe("rebased");
    expect(local).toEqual(localBefore);
    expect(remote).toEqual(remoteBefore);
    if (result.status !== "rebased") throw new Error("Expected successful rebase");
    expect(result.operations[0]).not.toBe(local[0]);
    expect(result.operations[1]).not.toBe(local[1]);
    expect(result.operations).toEqual([
      {
        op: "setRange",
        range: range("row", 9, 10),
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "ref", target: address("column", 9) },
            style: { bold: true },
          },
        ],
      },
      {
        op: "setBlock",
        range: range("row", 11, 11),
        block: {
          rowCount: 1,
          colCount: 1,
          values: [null],
          refs: [[0, address("column", 10)]],
          styleTable: [{ italic: true }],
          styleIds: [0],
        },
      },
    ]);
  });

  it("returns deep-equal results for repeated equivalent JSON inputs", () => {
    const local: DocumentOp[] = [
      { op: "set", addr: address("row", 7), value: literal("one") },
      RANGE_FACTORIES[7]!.make("column", 7, 8),
      { op: "removeNamedRange", name: "Unused", scope: OTHER_SHEET },
    ];
    const remote: DocumentOp[] = [structure("row", "insert"), structure("column", "delete")];
    const expected = rebaseDocumentOperations(local, remote);
    for (let iteration = 0; iteration < 20; iteration++) {
      const localJson = JSON.parse(JSON.stringify(local)) as DocumentOp[];
      const remoteJson = JSON.parse(JSON.stringify(remote)) as DocumentOp[];
      expect(rebaseDocumentOperations(localJson, remoteJson)).toEqual(expected);
    }
  });
});
