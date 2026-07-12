// Prefix-sum index over visible column widths: O(log n) content-X<->column and
// O(1) absolute column -> visible position. A parallel reverse map keeps callers
// in absolute-column space while render windows use visible-column positions.

export class ColumnIndex {
  private readonly columns: Int32Array;
  private readonly offsets: Float64Array;
  private readonly positions: Int32Array;
  private readonly total: number;

  constructor(columns: readonly number[], widths: ArrayLike<number>) {
    const count = columns.length;
    this.columns = Int32Array.from(columns);
    this.offsets = new Float64Array(count + 1);

    let maxColumn = -1;
    for (let i = 0; i < count; i++) {
      const column = columns[i];
      if (column !== undefined && column > maxColumn) maxColumn = column;
    }

    this.positions = new Int32Array(maxColumn + 1);
    this.positions.fill(-1);

    let total = 0;
    for (let i = 0; i < count; i++) {
      const column = columns[i];
      if (column !== undefined && column >= 0) this.positions[column] = i;
      total += widths[i] ?? 0;
      this.offsets[i + 1] = total;
    }

    this.total = total;
  }

  get count(): number {
    return this.columns.length;
  }

  get totalWidth(): number {
    return this.total;
  }

  /** Sum of widths of visible columns before `absoluteCol`. */
  leftOf(absoluteCol: number): number {
    const position = this.positionOf(absoluteCol);
    return position === -1 ? this.total : (this.offsets[position] ?? this.total);
  }

  /** Visible-column position of `absoluteCol`, or -1 when hidden/out of range. */
  positionOf(absoluteCol: number): number {
    const inRange =
      Number.isInteger(absoluteCol) && absoluteCol >= 0 && absoluteCol < this.positions.length;
    if (!inRange) return -1;

    return this.positions[absoluteCol] ?? -1;
  }

  /** Absolute column whose span contains content-space `contentX`, or -1 outside. */
  columnAtX(contentX: number): number {
    if (!(contentX >= 0) || contentX >= this.total) return -1;

    let lo = 0;
    let hi = this.offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.offsets[mid] ?? 0) <= contentX) lo = mid + 1;
      else hi = mid;
    }

    const position = lo - 1;
    return this.columns[position] ?? -1;
  }
}
