// Uniform row geometry stays arithmetic and allocation-free. The first non-default
// height materializes parallel height/Fenwick arrays for O(log n) updates and lookups;
// structural rebuilds remain O(n) and are rare.

export class OffsetIndex {
  private n: number;
  private readonly defaultHeight: number;
  private heights: Float64Array | undefined;
  /** 1-indexed Fenwick tree of heights; absent while every row has the default height. */
  private tree: Float64Array | undefined;
  private total: number;

  constructor(count: number, defaultHeight: number) {
    this.n = count;
    this.defaultHeight = defaultHeight;
    this.total = count * defaultHeight;
  }

  /** Allocate the dense index only when the first non-default height requires it. */
  private materialize(): void {
    const heights = new Float64Array(this.n);
    heights.fill(this.defaultHeight);
    const tree = new Float64Array(this.n + 1);
    this.heights = heights;
    this.tree = tree;
    this.build();
  }

  /** O(n) Fenwick construction from `heights`; also refreshes `total`. */
  private build(): void {
    const heights = this.heights;
    const tree = this.tree;
    if (!heights || !tree) {
      this.total = this.n * this.defaultHeight;
      return;
    }
    tree.fill(0);
    let total = 0;
    for (let i = 1; i <= this.n; i++) {
      const h = heights[i - 1] ?? 0;
      total += h;
      tree[i] = (tree[i] ?? 0) + h;
      const j = i + (i & -i);
      if (j <= this.n) tree[j] = (tree[j] ?? 0) + (tree[i] ?? 0);
    }
    this.total = total;
  }

  get count(): number {
    return this.n;
  }

  get totalHeight(): number {
    return this.total;
  }

  get defaultRowHeight(): number {
    return this.defaultHeight;
  }

  /** Bytes reserved by the optional dense typed-array backing stores. */
  get backingStoreBytes(): number {
    return (this.heights?.byteLength ?? 0) + (this.tree?.byteLength ?? 0);
  }

  heightOf(row: number): number {
    return this.heights?.[row] ?? this.defaultHeight;
  }

  setHeight(row: number, h: number): void {
    if (row < 0 || row >= this.n) return;
    const current = this.heights?.[row] ?? this.defaultHeight;
    const delta = h - current;
    if (delta === 0) return;
    if (!this.heights || !this.tree) this.materialize();
    const heights = this.heights!;
    const tree = this.tree!;
    heights[row] = h;
    this.total += delta;
    for (let i = row + 1; i <= this.n; i += i & -i) {
      tree[i] = (tree[i] ?? 0) + delta;
    }
  }

  /** Sum of heights of rows [0, row); i.e. the top Y of `row`. */
  offsetOf(row: number): number {
    let r = Math.max(0, Math.min(row, this.n));
    const tree = this.tree;
    if (!tree) return r * this.defaultHeight;
    let sum = 0;
    while (r > 0) {
      sum += tree[r] ?? 0;
      r -= r & -r;
    }
    return sum;
  }

  /**
   * Row whose band contains content-space `offset`, with that row's top Y.
   * Clamps to the last row when `offset` is past the end.
   */
  rowAtOffset(offset: number): { row: number; top: number } {
    if (this.n === 0) return { row: 0, top: 0 };
    if (offset <= 0) return { row: 0, top: 0 };
    if (offset >= this.total) {
      const last = this.n - 1;
      return { row: last, top: this.offsetOf(last) };
    }
    const tree = this.tree;
    if (!tree) {
      const row = Math.floor(offset / this.defaultHeight);
      return { row, top: row * this.defaultHeight };
    }
    // Largest `pos` with prefix(pos) <= offset.
    let pos = 0;
    let remaining = offset;
    let logn = 1;
    while (1 << (logn + 1) <= this.n) logn++;
    for (let k = logn; k >= 0; k--) {
      const next = pos + (1 << k);
      if (next <= this.n && (tree[next] ?? 0) <= remaining) {
        pos = next;
        remaining -= tree[pos] ?? 0;
      }
    }
    // `pos` rows fit entirely above `offset`, so `offset` is inside row `pos`.
    return { row: pos, top: offset - remaining };
  }

  insertRows(at: number, count: number, height = this.defaultHeight): void {
    if (count <= 0) return;
    const clamp = Math.max(0, Math.min(at, this.n));
    const heights = this.heights;
    if (!heights) {
      this.n += count;
      if (height === this.defaultHeight) {
        this.total = this.n * this.defaultHeight;
        return;
      }
      const next = new Float64Array(this.n);
      next.fill(this.defaultHeight);
      next.fill(height, clamp, clamp + count);
      this.heights = next;
      this.tree = new Float64Array(this.n + 1);
      this.build();
      return;
    }
    const next = new Float64Array(this.n + count);
    next.set(heights.subarray(0, clamp), 0);
    next.fill(height, clamp, clamp + count);
    next.set(heights.subarray(clamp), clamp + count);
    this.heights = next;
    this.n += count;
    this.tree = new Float64Array(this.n + 1);
    this.build();
  }

  removeRows(at: number, count: number): void {
    if (count <= 0 || at >= this.n) return;
    const c = Math.min(count, this.n - at);
    const heights = this.heights;
    if (!heights) {
      this.n -= c;
      this.total = this.n * this.defaultHeight;
      return;
    }
    const next = new Float64Array(this.n - c);
    next.set(heights.subarray(0, at), 0);
    next.set(heights.subarray(at + c), at);
    this.heights = next;
    this.n -= c;
    this.tree = new Float64Array(this.n + 1);
    this.build();
  }
}

/**
 * Browsers cap element height (~33.5M px in Chrome). Above that the DOM sizer is
 * pinned to `cap` and a capped scroll position is mapped linearly onto the real
 * virtual range. Below the cap the mapping is identity.
 */
export class ScaledScroll {
  constructor(
    private totalHeight: number,
    private viewport: number,
    private cap: number,
  ) {}

  update(totalHeight: number, viewport: number, cap = this.cap): void {
    this.totalHeight = totalHeight;
    this.viewport = viewport;
    this.cap = cap;
  }

  get scaled(): boolean {
    return this.totalHeight > this.cap;
  }

  /** Height to give the DOM sizer element. */
  get sizerHeight(): number {
    return Math.min(this.totalHeight, this.cap);
  }

  /** DOM scrollTop -> content-space offset. */
  toContent(scrollTop: number): number {
    if (!this.scaled) return scrollTop;
    const scrollRange = this.cap - this.viewport;
    const contentRange = this.totalHeight - this.viewport;
    if (scrollRange <= 0) return 0;
    return (scrollTop / scrollRange) * contentRange;
  }

  /** Content-space offset -> DOM scrollTop. */
  toScroll(contentOffset: number): number {
    if (!this.scaled) return contentOffset;
    const scrollRange = this.cap - this.viewport;
    const contentRange = this.totalHeight - this.viewport;
    if (contentRange <= 0) return 0;
    return (contentOffset / contentRange) * scrollRange;
  }
}
