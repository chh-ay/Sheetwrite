import { describe, expect, it } from "bun:test";
import { cellKey, REF_CYCLE, ReferenceGraph } from "../src/reference.js";
import type { CellAddress, CellScalar } from "../src/types.js";

function makeLiterals() {
  const m = new Map<string, CellScalar>();
  const at = (a: CellAddress): CellScalar => m.get(cellKey(a)) ?? null;
  return { m, at };
}

const A = (row: number, col: number, sheet = "A"): CellAddress => ({ sheet, row, col });

describe("ReferenceGraph", () => {
  it("resolves a plain reference to the target literal", () => {
    const { m, at } = makeLiterals();
    m.set(cellKey(A(0, 0)), 42);
    const g = new ReferenceGraph();
    g.setRef(A(1, 1, "B"), A(0, 0, "A"), at);
    expect(g.resolved(cellKey(A(1, 1, "B")))).toBe(42);
  });

  it("propagates a cross-sheet target edit to dependents", () => {
    const { m, at } = makeLiterals();
    m.set(cellKey(A(0, 0, "A")), "old");
    const g = new ReferenceGraph();
    g.setRef(A(1, 1, "B"), A(0, 0, "A"), at);
    expect(g.resolved(cellKey(A(1, 1, "B")))).toBe("old");

    m.set(cellKey(A(0, 0, "A")), "new");
    g.onLiteralChanged(cellKey(A(0, 0, "A")), at);
    expect(g.resolved(cellKey(A(1, 1, "B")))).toBe("new");
  });

  it("follows reference chains and propagates through them", () => {
    const { m, at } = makeLiterals();
    m.set(cellKey(A(0, 0)), 7);
    const g = new ReferenceGraph();
    g.setRef(A(1, 0), A(0, 0), at); // B -> A
    g.setRef(A(2, 0), A(1, 0), at); // C -> B
    expect(g.resolved(cellKey(A(2, 0)))).toBe(7);

    m.set(cellKey(A(0, 0)), 9);
    g.onLiteralChanged(cellKey(A(0, 0)), at);
    expect(g.resolved(cellKey(A(2, 0)))).toBe(9);
  });

  it("detects cycles and resolves them to the cycle sentinel", () => {
    const { at } = makeLiterals();
    const g = new ReferenceGraph();
    g.setRef(A(0, 0), A(1, 0), at); // X -> Y
    g.setRef(A(1, 0), A(0, 0), at); // Y -> X
    expect(g.resolved(cellKey(A(0, 0)))).toBe(REF_CYCLE);
    expect(g.resolved(cellKey(A(1, 0)))).toBe(REF_CYCLE);
  });

  it("tears down edges when a ref is removed", () => {
    const { m, at } = makeLiterals();
    m.set(cellKey(A(0, 0)), 1);
    const g = new ReferenceGraph();
    g.setRef(A(1, 0), A(0, 0), at);
    g.removeRef(cellKey(A(1, 0)));
    expect(g.isRef(cellKey(A(1, 0)))).toBe(false);
    // a later target change must not resurrect the removed dependent
    m.set(cellKey(A(0, 0)), 2);
    g.onLiteralChanged(cellKey(A(0, 0)), at);
    expect(g.resolved(cellKey(A(1, 0)))).toBeNull();
  });
});
