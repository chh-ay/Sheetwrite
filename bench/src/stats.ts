/**
 * Timing + summary statistics shared by both benchmark targets.
 *
 * The measurement protocol is deliberately conservative: a configurable number
 * of untimed warm-up iterations let JIT, allocation pools, and CPU caches reach
 * steady state, then a larger set of timed iterations is collected and reduced
 * to robust order statistics (median + p95) rather than a mean, so a single
 * GC pause or scheduler hiccup can't dominate the headline number.
 */

/** High-resolution monotonic clock in milliseconds. */
export const now: () => number =
  typeof performance !== "undefined"
    ? () => performance.now()
    : () => Number(process.hrtime.bigint()) / 1e6;

/** Robust summary of a sample of durations (all in milliseconds). */
export interface Stat {
  readonly median: number;
  readonly p95: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly iters: number;
}

/** Nearest-rank percentile over a copy-sorted sample (0 ≤ p ≤ 1). */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil(p * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

/** Reduce a raw sample of per-iteration durations to a {@link Stat}. */
export function summarize(samples: readonly number[]): Stat {
  if (samples.length === 0) {
    return {
      median: Number.NaN,
      p95: Number.NaN,
      mean: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      iters: 0,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean: sum / sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    iters: sorted.length,
  };
}

/** Knobs for a single measured workload. */
export interface MeasureOptions {
  /** Untimed iterations run before sampling, to reach steady state. */
  readonly warmup: number;
  /** Timed iterations collected into the sample. */
  readonly iters: number;
  /** Untimed per-iteration setup (e.g. build fresh inputs). */
  readonly before?: () => void;
  /** Untimed per-iteration teardown (e.g. reset a view, destroy an instance). */
  readonly after?: () => void;
  /** Force a GC, when the runtime exposes one, before each timed sample. */
  readonly gcBetween?: boolean;
}

/** Force a synchronous GC where available (Bun / `--expose-gc`), else no-op. */
export function forceGc(): void {
  const g = globalThis as { Bun?: { gc?: (sync: boolean) => void }; gc?: () => void };
  if (g.Bun?.gc) g.Bun.gc(true);
  else if (typeof g.gc === "function") g.gc();
}

/**
 * Run `fn` under the warm-up + timed-sample protocol and return the raw
 * per-iteration durations (ms). `before`/`after` bracket every iteration but
 * are never included in the timing.
 */
export function collect(fn: () => void, opts: MeasureOptions): number[] {
  const { warmup, iters, before, after, gcBetween } = opts;

  for (let i = 0; i < warmup; i++) {
    before?.();
    fn();
    after?.();
  }

  const samples = new Array<number>(iters);
  for (let i = 0; i < iters; i++) {
    before?.();
    if (gcBetween) forceGc();
    const t0 = now();
    fn();
    const t1 = now();
    after?.();
    samples[i] = t1 - t0;
  }
  return samples;
}

/** {@link collect} reduced to a {@link Stat}. */
export function measure(fn: () => void, opts: MeasureOptions): Stat {
  return summarize(collect(fn, opts));
}

/** Format milliseconds for table cells (sub-ms gets more precision). */
export function ms(value: number): string {
  if (Number.isNaN(value)) return "n/a";
  if (value >= 100) return value.toFixed(0);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

/** Format a byte count as MiB with two decimals. */
export function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
