import type { CellAddress, CellScalar, SheetId } from "./types.js";

/** Sentinel shown for a reference that participates in a cycle. */
export const REF_CYCLE = "#CYCLE!";

export function cellKey(a: CellAddress): string {
  return `${a.sheet}\u0000${a.row}\u0000${a.col}`;
}

/** Inverse of {@link cellKey}. The sheet id may itself contain separators, so
 *  the trailing `row`/`col` fields are split off from the end. */
export function parseCellKey(key: string): CellAddress {
  const j = key.lastIndexOf("\u0000");
  const i = key.lastIndexOf("\u0000", j - 1);
  return {
    sheet: key.slice(0, i),
    row: Number(key.slice(i + 1, j)),
    col: Number(key.slice(j + 1)),
  };
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

  /**
   * `onResolved` fires whenever a ref's resolved value changes (set, target
   * edit, rebase) and when a rebase drops a ref because its target vanished
   * (`value === null`). The store uses it to write resolved values through to
   * the WASM cell as derived shadow literals, keeping window reads, queries,
   * and formula evaluation consistent without a JS overlay pass.
   */
  constructor(private readonly onResolved?: (addr: CellAddress, value: CellScalar) => void) {}

  hasRefs(): boolean {
    return this.target.size > 0;
  }

  isRef(key: string): boolean {
    return this.target.has(key);
  }

  resolved(key: string): CellScalar {
    return this.cache.get(key) ?? null;
  }

  /** Target address of the ref at `key`, or null when `key` is not a ref. */
  targetOf(key: string): CellAddress | null {
    return this.target.get(key) ?? null;
  }

  /** Snapshot all live references as `[source, target]` pairs. */
  entries(): Array<[CellAddress, CellAddress]> {
    const out: Array<[CellAddress, CellAddress]> = [];
    for (const [key, target] of this.target) out.push([parseCellKey(key), target]);
    return out;
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

  /**
   * Rebase reference locations and targets within `sheet` after a structural
   * row insert/delete, rebuilding the resolved cache against `literalAt`.
   * `remap(row)` returns a row's new index, or null when the row was deleted;
   * a ref whose own row OR target row is deleted is dropped — the display tier
   * has no #REF! sentinel to leave behind. Rebuild is O(refs), which is fine:
   * structural ops are never on the render hot path.
   */
  rebaseRows(
    sheet: SheetId,
    remap: (row: number) => number | null,
    literalAt: LiteralLookup,
  ): void {
    if (this.target.size === 0) return;

    const entries: Array<[CellAddress, CellAddress]> = [];
    for (const [key, targetAddr] of this.target) entries.push([parseCellKey(key), targetAddr]);

    this.target.clear();
    this.targetKey.clear();
    this.dependents.clear();
    this.cache.clear();

    for (const [refAddr, targetAddr] of entries) {
      const ref = rebaseAddr(refAddr, sheet, remap);
      const target = rebaseAddr(targetAddr, sheet, remap);
      if (ref && target) this.setRef(ref, target, literalAt);
      else if (ref) this.onResolved?.(ref, null);
    }
  }

  /**
   * Rebase reference locations and targets within `sheet` after a structural
   * column insert/delete. Semantics match {@link rebaseRows}.
   */
  rebaseCols(
    sheet: SheetId,
    remap: (col: number) => number | null,
    literalAt: LiteralLookup,
  ): void {
    if (this.target.size === 0) return;

    const entries: Array<[CellAddress, CellAddress]> = [];
    for (const [key, targetAddr] of this.target) entries.push([parseCellKey(key), targetAddr]);

    this.target.clear();
    this.targetKey.clear();
    this.dependents.clear();
    this.cache.clear();

    for (const [refAddr, targetAddr] of entries) {
      const ref = rebaseAddrCol(refAddr, sheet, remap);
      const target = rebaseAddrCol(targetAddr, sheet, remap);
      if (ref && target) this.setRef(ref, target, literalAt);
      else if (ref) this.onResolved?.(ref, null);
    }
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

      const value = this.resolve(key, literalAt, new Set());
      this.cache.set(key, value);
      this.onResolved?.(parseCellKey(key), value);

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

/** Shift `addr` when it lives in `sheet`; null signals its row was deleted. */
function rebaseAddr(
  addr: CellAddress,
  sheet: SheetId,
  remap: (row: number) => number | null,
): CellAddress | null {
  if (addr.sheet !== sheet) return addr;
  const row = remap(addr.row);
  return row === null ? null : { sheet: addr.sheet, row, col: addr.col };
}

/** Shift `addr` when it lives in `sheet`; null signals its column was deleted. */
function rebaseAddrCol(
  addr: CellAddress,
  sheet: SheetId,
  remap: (col: number) => number | null,
): CellAddress | null {
  if (addr.sheet !== sheet) return addr;
  const col = remap(addr.col);
  return col === null ? null : { sheet: addr.sheet, row: addr.row, col };
}
