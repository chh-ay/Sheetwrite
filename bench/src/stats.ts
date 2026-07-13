/**
 * Timing + summary statistics shared by both benchmark targets.
 *
 * The measurement protocol runs a configurable number of untimed warm-up
 * iterations, optionally forces a GC before each timed sample, then records the
 * timed iterations as a finite sample. Summaries report the median as the
 * headline, an interpolated p95 estimate, the arithmetic mean, min/max, and
 * population standard deviation so small samples show both center and spread.
 */

/** High-resolution monotonic clock in milliseconds. */
export const now: () => number =
  typeof performance !== "undefined"
    ? () => performance.now()
    : () => Number(process.hrtime.bigint()) / 1e6;

/**
 * Summary of a sample of durations (all in milliseconds). For very small
 * samples, p95 is an interpolated estimate; min, max, and stddev show the true
 * observed spread. stddev is the population standard deviation of the sample.
 */
export interface Stat {
  readonly median: number;
  readonly p95: number;
  readonly mean: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
  readonly iters: number;
}

/** Linear-interpolated percentile over a copy-sorted sample (0 ≤ p ≤ 1). */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const q = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  const pos = (sorted.length - 1) * q;
  const lowerIdx = Math.floor(pos);
  const upperIdx = Math.ceil(pos);
  const lower = sorted[lowerIdx];
  const upper = sorted[upperIdx];
  if (lower === undefined || upper === undefined) return Number.NaN;
  return lower + (upper - lower) * (pos - lowerIdx);
}

/** Reduce a raw sample of per-iteration durations to a {@link Stat}. */
export function summarize(samples: readonly number[]): Stat {
  if (samples.length === 0) {
    return {
      median: Number.NaN,
      p95: Number.NaN,
      mean: Number.NaN,
      stddev: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      iters: 0,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    iters: sorted.length,
  };
}

/** Auditable aggregate timing sample for fast render operations. */
export interface AggregateSample {
  /** Total measured operation time, excluding setup and cleanup. */
  readonly durationMs: number;
  /** Number of identical logical operations included in the aggregate. */
  readonly operationCount: number;
  /** Aggregate duration divided by operation count. */
  readonly perOperationMs: number;
}

/** Median absolute deviation around the sample median. */
export function medianAbsoluteDeviation(samples: readonly number[]): number {
  assertFiniteSample(samples);
  const center = percentile(
    [...samples].sort((a, b) => a - b),
    0.5,
  );
  const deviations = samples.map((sample) => Math.abs(sample - center)).sort((a, b) => a - b);
  return percentile(deviations, 0.5);
}

/** Strict render-benchmark summary: empty or non-finite samples are invalid. */
export function summarizeFinite(
  samples: readonly number[],
): Pick<Stat, "median" | "p95" | "iters"> & { readonly mad: number } {
  assertFiniteSample(samples);
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mad: medianAbsoluteDeviation(sorted),
    iters: sorted.length,
  };
}

function assertFiniteSample(samples: readonly number[]): void {
  if (samples.length === 0) throw new RangeError("timing sample must not be empty");
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 0) {
      throw new RangeError(`timing sample must contain finite non-negative values: ${sample}`);
    }
  }
}

/**
 * Deterministic counterbalanced order. The seed fixes the first round and each
 * subsequent round rotates that base order. Every engine occupies every order
 * position once per complete rotation; with two engines this is AB/BA.
 */
export function counterbalancedOrder<T>(values: readonly T[], rounds: number, seed: number): T[][] {
  if (values.length === 0) throw new RangeError("counterbalance requires at least one value");
  if (!Number.isInteger(rounds) || rounds <= 0) {
    throw new RangeError(`rounds must be a positive integer: ${rounds}`);
  }

  const base = [...values];
  const rng = seededOrderRng(seed);
  for (let index = base.length - 1; index > 0; index--) {
    const swapWith = Math.floor(rng() * (index + 1));
    [base[index], base[swapWith]] = [base[swapWith]!, base[index]!];
  }

  const orders = new Array<T[]>(rounds);
  for (let round = 0; round < rounds; round++) {
    const offset = round % base.length;
    orders[round] = [...base.slice(offset), ...base.slice(0, offset)];
  }
  return orders;
}

function seededOrderRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
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
