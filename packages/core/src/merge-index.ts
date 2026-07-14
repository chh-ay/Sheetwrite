export interface MergeRect {
  readonly r0: number;
  readonly c0: number;
  readonly r1: number;
  readonly c1: number;
}

interface Projection {
  readonly merge: MergeRect;
  readonly start: number;
  readonly end: number;
}

interface ProjectionIndex {
  readonly entries: readonly Projection[];
  readonly prefixMaxEnd: readonly number[];
}

export interface MergeIndexResourceStats {
  readonly indexConstructions: number;
  readonly candidatesExamined: number;
}

let indexConstructions = 0;
let candidatesExamined = 0;
const indexCache = new WeakMap<ReadonlyArray<MergeRect>, PreparedMergeIndex>();

function projectionIndex(
  merges: ReadonlyArray<MergeRect>,
  start: (merge: MergeRect) => number,
  end: (merge: MergeRect) => number,
): ProjectionIndex {
  const entries = merges
    .map((merge) => ({ merge, start: start(merge), end: end(merge) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const prefixMaxEnd = new Array<number>(entries.length);
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < entries.length; index++) {
    maximum = Math.max(maximum, entries[index]!.end);
    prefixMaxEnd[index] = maximum;
  }
  return { entries, prefixMaxEnd };
}

function firstPossible(index: ProjectionIndex, minimum: number): number {
  let low = 0;
  let high = index.prefixMaxEnd.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.prefixMaxEnd[middle]! < minimum) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lastPossible(index: ProjectionIndex, maximum: number): number {
  let low = 0;
  let high = index.entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.entries[middle]!.start <= maximum) low = middle + 1;
    else high = middle;
  }
  return low;
}

function possibleCount(index: ProjectionIndex, minimum: number, maximum: number): number {
  return Math.max(0, lastPossible(index, maximum) - firstPossible(index, minimum));
}

function intersecting(index: ProjectionIndex, minimum: number, maximum: number): MergeRect[] {
  const matches: MergeRect[] = [];
  for (let position = firstPossible(index, minimum); position < index.entries.length; position++) {
    const entry = index.entries[position]!;
    if (entry.start > maximum) break;
    candidatesExamined += 1;
    if (entry.end >= minimum) matches.push(entry.merge);
  }
  return matches;
}

/** Prepared interval projections shared by interaction, clipboard, and paint paths. */
export class PreparedMergeIndex {
  private readonly rows: ProjectionIndex;
  private readonly columns: ProjectionIndex;

  constructor(readonly merges: ReadonlyArray<MergeRect>) {
    this.rows = projectionIndex(
      merges,
      (merge) => merge.r0,
      (merge) => merge.r1,
    );
    this.columns = projectionIndex(
      merges,
      (merge) => merge.c0,
      (merge) => merge.c1,
    );
    indexConstructions += 1;
  }

  private queryRectangle(
    rowMinimum: number,
    rowMaximum: number,
    columnMinimum: number,
    columnMaximum: number,
  ): MergeRect[] {
    const rowCount = possibleCount(this.rows, rowMinimum, rowMaximum);
    const columnCount = possibleCount(this.columns, columnMinimum, columnMaximum);
    if (rowCount <= columnCount) {
      return intersecting(this.rows, rowMinimum, rowMaximum).filter(
        (merge) => merge.c1 >= columnMinimum && merge.c0 <= columnMaximum,
      );
    }
    return intersecting(this.columns, columnMinimum, columnMaximum).filter(
      (merge) => merge.r1 >= rowMinimum && merge.r0 <= rowMaximum,
    );
  }

  anchorAt(row: number, column: number): MergeRect | null {
    return this.queryRectangle(row, row, column, column)[0] ?? null;
  }

  intersectingWindow(
    rowStart: number,
    rowEnd: number,
    columns: readonly number[],
  ): readonly MergeRect[] {
    if (rowStart >= rowEnd || columns.length === 0) return [];
    let minimumColumn = columns[0]!;
    let maximumColumn = minimumColumn;
    for (let index = 1; index < columns.length; index++) {
      minimumColumn = Math.min(minimumColumn, columns[index]!);
      maximumColumn = Math.max(maximumColumn, columns[index]!);
    }
    return this.queryRectangle(rowStart, rowEnd - 1, minimumColumn, maximumColumn);
  }

  /** Merges suppressing the horizontal boundary below `row`, ordered left-to-right. */
  horizontalGaps(
    row: number,
    columnMinimum = Number.NEGATIVE_INFINITY,
    columnMaximum = Number.POSITIVE_INFINITY,
  ): readonly MergeRect[] {
    return this.queryRectangle(row, row, columnMinimum, columnMaximum)
      .filter((merge) => merge.r0 <= row && row < merge.r1)
      .sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1);
  }

  /** Merges suppressing the vertical boundary before `column`, ordered top-to-bottom. */
  verticalGaps(
    column: number,
    rowMinimum = Number.NEGATIVE_INFINITY,
    rowMaximum = Number.POSITIVE_INFINITY,
  ): readonly MergeRect[] {
    return this.queryRectangle(rowMinimum, rowMaximum, column, column)
      .filter((merge) => merge.c0 < column && column <= merge.c1)
      .sort((a, b) => a.r0 - b.r0 || a.r1 - b.r1);
  }
}

/** Identity-keyed preparation; replacing merge metadata creates a fresh index. */
export function prepareMergeIndex(merges: ReadonlyArray<MergeRect>): PreparedMergeIndex {
  const cached = indexCache.get(merges);
  if (cached) return cached;
  const prepared = new PreparedMergeIndex(merges);
  indexCache.set(merges, prepared);
  return prepared;
}

/** Internal deterministic counters for structural performance gates. */
export function getMergeIndexResourceStatsForTest(): MergeIndexResourceStats {
  return { indexConstructions, candidatesExamined };
}

export function resetMergeIndexResourceStatsForTest(): void {
  indexConstructions = 0;
  candidatesExamined = 0;
}
