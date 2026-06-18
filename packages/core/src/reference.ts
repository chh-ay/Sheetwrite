import type { CellAddress, CellScalar } from "./types";

/** Sentinel shown for a reference that participates in a cycle. */
export const REF_CYCLE = "#CYCLE!";

export function cellKey(a: CellAddress): string {
  return `${a.sheet}\u0000${a.row}\u0000${a.col}`;
}

export type LiteralLookup = (addr: CellAddress) => CellScalar;

/**
 * Plain cross-sheet references (display tier — no arithmetic). Tracks
 * `ref -> target`, the reverse `target -> dependents` edges, and a resolved-value
 * cache so the render path reads cached scalars instead of walking the graph.
 * Resolution follows ref chains and returns `REF_CYCLE` on a cycle.
 */
export class ReferenceGraph {
  private target = new Map<string, CellAddress>();
  private targetKey = new Map<string, string>();
  private dependents = new Map<string, Set<string>>();
  private cache = new Map<string, CellScalar>();

  isRef(key: string): boolean {
    return this.target.has(key);
  }

  resolved(key: string): CellScalar {
    return this.cache.get(key) ?? null;
  }

  setRef(refAddr: CellAddress, targetAddr: CellAddress, literalAt: LiteralLookup): void {
    const key = cellKey(refAddr);
    this.removeRef(key);

    const tkey = cellKey(targetAddr);
    this.target.set(key, targetAddr);
    this.targetKey.set(key, tkey);

    let deps = this.dependents.get(tkey);
    if (!deps) {
      deps = new Set();
      this.dependents.set(tkey, deps);
    }
    deps.add(key);

    this.recomputeFrom(key, literalAt);
  }

  removeRef(key: string): void {
    const tkey = this.targetKey.get(key);
    if (tkey) this.dependents.get(tkey)?.delete(key);
    this.target.delete(key);
    this.targetKey.delete(key);
    this.cache.delete(key);
  }

  /** A literal target changed: refresh every ref that (transitively) depends on it. */
  onLiteralChanged(targetKey: string, literalAt: LiteralLookup): void {
    const direct = this.dependents.get(targetKey);
    if (!direct) return;
    this.recomputeMany([...direct], literalAt);
  }

  private recomputeFrom(key: string, literalAt: LiteralLookup): void {
    this.recomputeMany([key], literalAt);
  }

  private recomputeMany(seeds: string[], literalAt: LiteralLookup): void {
    const queue = [...seeds];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      this.cache.set(key, this.resolve(key, literalAt, new Set()));

      const deps = this.dependents.get(key);
      if (deps) for (const d of deps) queue.push(d);
    }
  }

  private resolve(key: string, literalAt: LiteralLookup, seen: Set<string>): CellScalar {
    if (seen.has(key)) return REF_CYCLE;
    seen.add(key);

    const target = this.target.get(key);
    if (!target) return null;

    const tkey = this.targetKey.get(key)!;
    if (this.target.has(tkey)) return this.resolve(tkey, literalAt, seen);
    return literalAt(target);
  }
}
