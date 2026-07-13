import { describe, expect, it } from "bun:test";
import { SelectionModel, type SelRect } from "../src/selection.js";
import { StyleActions } from "../src/style-actions.js";
import type { CellStyle, Patch, ResolvedCell, Sheet, Store, Theme } from "../src/types.js";

/**
 * Build a `StyleActions` over a real `SelectionModel` and a mutable in-memory
 * style map. `commit` applies each set patch back into the map so a follow-up
 * toggle observes the freshly written style (mirroring the store round-trip).
 */
function makeHarness() {
  const styles = new Map<string, CellStyle>();
  const keyOf = (row: number, col: number): string => `${row},${col}`;

  const store = {
    getCell: (addr: { row: number; col: number }): ResolvedCell => ({
      resolved: null,
      style: styles.get(keyOf(addr.row, addr.col)) ?? {},
    }),
  } as unknown as Store;

  const selection = new SelectionModel(100, 0, 2);
  const commits: Patch[][] = [];

  const merges: SelRect[] = [];

  const actions = new StyleActions({
    store,
    loadable: null,
    selection: () => selection,
    activeSheet: () => "s1",
    sheet: () => ({ columns: [{}, {}, {}] }) as unknown as Sheet,
    readOnly: () => false,
    theme: () => ({ fg: "#000000" }) as unknown as Theme,
    merges: () => merges,
    anchorCell: (row, col) => ({ row, col }),
    toDataRow: (viewRow) => viewRow,
    commit: (patches) => {
      commits.push(patches);
      for (const p of patches) {
        if (p.op === "set") styles.set(keyOf(p.addr.row, p.addr.col), p.style ?? {});
      }
    },
  });

  return { actions, selection, commits };
}

describe("StyleActions underline/strikethrough toggles", () => {
  it("sets underline across the whole selection in one transaction", () => {
    const { actions, selection, commits } = makeHarness();
    selection.selectCell(0, 0);
    selection.extendTo(0, 1); // 1x2 range spanning columns 0 and 1

    actions.toggleStyle("underline");

    expect(commits).toHaveLength(1); // single undo step
    const patches = commits[0]!;
    expect(patches).toHaveLength(2); // one per selected cell
    for (const p of patches) {
      expect(p.op).toBe("set");
      if (p.op === "set") expect(p.style?.underline).toBe(true);
    }
  });

  it("clears underline on the re-toggle when the focus cell already has it", () => {
    const { actions, selection, commits } = makeHarness();
    selection.selectCell(0, 0);
    selection.extendTo(0, 1);

    actions.toggleStyle("underline");
    actions.toggleStyle("underline");

    expect(commits).toHaveLength(2);
    for (const p of commits[1]!) {
      if (p.op === "set") expect(p.style?.underline).toBe(false);
    }
  });

  it("toggles strikethrough independently of underline", () => {
    const { actions, selection, commits } = makeHarness();
    selection.selectCell(1, 0);

    actions.toggleStyle("strikethrough");

    const patch = commits[0]![0]!;
    expect(patch.op).toBe("set");
    if (patch.op === "set") {
      expect(patch.style?.strikethrough).toBe(true);
      expect(patch.style?.underline).toBeUndefined();
    }
  });

  it("preserves an existing style flag when adding another decoration", () => {
    const { actions, selection, commits } = makeHarness();
    selection.selectCell(2, 0);

    actions.toggleStyle("underline");
    actions.toggleStyle("strikethrough");

    const patch = commits[1]![0]!;
    if (patch.op === "set") {
      expect(patch.style?.underline).toBe(true);
      expect(patch.style?.strikethrough).toBe(true);
    }
  });

  it("does nothing when the selection is empty", () => {
    const { actions, commits } = makeHarness();

    actions.toggleStyle("underline");

    expect(commits).toHaveLength(0);
  });
});

describe("StyleActions merge policy", () => {
  it("keeps the anchor and clears every covered cell in one commit", () => {
    const { actions, selection, commits } = makeHarness();
    selection.selectCell(1, 0);
    selection.extendTo(2, 1);

    actions.mergeSelection();

    expect(commits).toEqual([
      [
        { op: "addMerge", sheet: "s1", merge: { r0: 1, c0: 0, r1: 2, c1: 1 } },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "literal", value: null },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 0 },
          value: { kind: "literal", value: null },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "literal", value: null },
        },
      ],
    ]);
  });
});
