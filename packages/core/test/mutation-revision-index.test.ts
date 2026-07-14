import { describe, expect, it } from "bun:test";
import { MutationRevisionIndex } from "../src/mutation-revision-index.js";
import type { CellAddress, DocumentOp } from "../src/types.js";

const address = (row: number, col: number): CellAddress => ({ sheet: "s1", row, col });

describe("MutationRevisionIndex", () => {
  it("retains sparse points and dense rectangles only while an older request can observe them", () => {
    const index = new MutationRevisionIndex();
    index.record(
      [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "ignored" } }],
      1,
    );
    expect(index.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });

    const release = index.retainRevision(0);
    const operations: DocumentOp[] = [
      { op: "set", addr: address(1, 1), value: { kind: "literal", value: 1 } },
      {
        op: "setRange",
        range: { sheet: "s1", start: { row: 10, col: 4 }, end: { row: 999, col: 99 } },
        cells: [
          { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
          { rowOffset: 989, colOffset: 95, value: { kind: "literal", value: "last" } },
        ],
      },
      {
        op: "setBlock",
        range: { sheet: "s1", start: { row: 20, col: 2 }, end: { row: 40, col: 3 } },
        block: { rowCount: 21, colCount: 2, values: new Array(42).fill(null) },
      },
      {
        op: "clearRange",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 999_999, col: 0 } },
      },
      {
        op: "clearRange",
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 999_999, col: 1 } },
        contents: false,
        style: true,
      },
      {
        op: "setRangeStyle",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 999_999, col: 3 } },
        style: { bold: true },
      },
    ];
    index.record(operations, 1);

    expect(index.stats()).toEqual({
      points: 3,
      rectangles: 2,
      retainedRequests: 1,
      retainedRevisions: 1,
    });
    expect(index.isNewerThan(address(10, 4), 0)).toBe(true);
    expect(index.isNewerThan(address(500, 50), 0)).toBe(false);
    expect(index.isNewerThan(address(30, 2), 0)).toBe(true);
    expect(index.isNewerThan(address(900_000, 0), 0)).toBe(true);
    expect(index.isNewerThan(address(900_000, 1), 0)).toBe(false);

    release();
    release();
    expect(index.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });
  });

  it("prunes revisions that no remaining overlapping request can observe", () => {
    const index = new MutationRevisionIndex();
    const releaseOldest = index.retainRevision(0);
    const releaseNewerA = index.retainRevision(2);
    const releaseNewerB = index.retainRevision(2);

    index.record(
      [{ op: "set", addr: address(1, 0), value: { kind: "literal", value: "early" } }],
      1,
    );
    index.record(
      [
        { op: "set", addr: address(2, 0), value: { kind: "literal", value: "late" } },
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 4, col: 0 }, end: { row: 8, col: 1 } },
        },
      ],
      3,
    );
    expect(index.stats()).toMatchObject({ points: 2, rectangles: 1, retainedRequests: 3 });

    releaseOldest();
    expect(index.stats()).toEqual({
      points: 1,
      rectangles: 1,
      retainedRequests: 2,
      retainedRevisions: 1,
    });
    expect(index.isNewerThan(address(1, 0), 2)).toBe(false);
    expect(index.isNewerThan(address(2, 0), 2)).toBe(true);

    releaseNewerA();
    expect(index.stats().retainedRequests).toBe(1);
    releaseNewerB();
    expect(index.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });
  });

  it("clears retained generations so obsolete coordinates cannot survive a structural reset", () => {
    const index = new MutationRevisionIndex();
    const release = index.retainRevision(4);
    index.record(
      [{ op: "set", addr: address(99, 2), value: { kind: "literal", value: "old row" } }],
      5,
    );
    index.clear();
    release();
    expect(index.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });
    expect(index.isNewerThan(address(99, 2), 4)).toBe(false);
  });
});
