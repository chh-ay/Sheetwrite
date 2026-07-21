import type { SourceSnapshot } from "@sheetwrite/wasm";
import type { CellAddress, SheetId } from "./types/coordinates.js";

/** Sentinel shown for a reference that participates in a cycle. */
export const REF_CYCLE = "#CYCLE!";

/** Compact, serializable range-local projection of Rust-owned persisted sources. */
export class RangeSourceProjection {
  constructor(
    readonly formulaOffsets: Uint32Array,
    readonly formulaSources: readonly string[],
    readonly referenceOffsets: Uint32Array,
    readonly referenceTargets: Uint32Array,
    private readonly sheetIds: readonly SheetId[],
  ) {
    if (
      formulaOffsets.length !== formulaSources.length ||
      referenceTargets.length !== referenceOffsets.length * 3
    ) {
      throw new Error("invalid persisted-source projection");
    }
  }

  formulaAt(offset: number): string | null {
    const index = sortedIndexOf(this.formulaOffsets, offset);
    return index < 0 ? null : (this.formulaSources[index] ?? null);
  }

  referenceAt(offset: number): CellAddress | null {
    const index = sortedIndexOf(this.referenceOffsets, offset);
    if (index < 0) return null;
    return this.referenceTarget(index);
  }

  *formulas(): IterableIterator<readonly [offset: number, source: string]> {
    for (let index = 0; index < this.formulaOffsets.length; index++) {
      yield [this.formulaOffsets[index]!, this.formulaSources[index]!];
    }
  }

  *references(): IterableIterator<readonly [offset: number, target: CellAddress]> {
    for (let index = 0; index < this.referenceOffsets.length; index++) {
      yield [this.referenceOffsets[index]!, this.referenceTarget(index)];
    }
  }

  private referenceTarget(index: number): CellAddress {
    const target = index * 3;
    const sheet = this.sheetIds[this.referenceTargets[target]!];
    if (sheet === undefined) throw new Error("persisted reference targets an unknown sheet");
    return {
      sheet,
      row: this.referenceTargets[target + 1]!,
      col: this.referenceTargets[target + 2]!,
    };
  }
}

/**
 * Copy one opaque WASM source snapshot into a transaction/document-local
 * projection, then release the WASM allocation even when decoding fails.
 */
export function consumeSourceSnapshot(
  snapshot: SourceSnapshot,
  sheetIds: readonly SheetId[],
): RangeSourceProjection {
  try {
    return new RangeSourceProjection(
      snapshot.formulaOffsets(),
      snapshot.formulaSources(),
      snapshot.referenceOffsets(),
      snapshot.referenceTargets(),
      sheetIds,
    );
  } finally {
    snapshot.free();
  }
}

export function referenceTargetFromPacked(
  packed: Uint32Array | undefined,
  sheetIds: readonly SheetId[],
): CellAddress | null {
  if (!packed || packed.length !== 3) return null;
  const sheet = sheetIds[packed[0]!];
  return sheet === undefined ? null : { sheet, row: packed[1]!, col: packed[2]! };
}

function sortedIndexOf(values: Uint32Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low < values.length && values[low] === target ? low : -1;
}
