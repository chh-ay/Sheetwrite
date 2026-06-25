/**
 * Seeded synthetic dataset shared by both benchmark targets.
 *
 * The generator is fully deterministic: a given `(rowCount, seed)` pair always
 * yields byte-identical content, so every workload runs over the *same* data on
 * both engines and results are reproducible across machines and runs. Only the
 * in-memory representation differs between engines — Sheetwrite consumes a
 * columnar shape (typed arrays per column, the layout its WASM store ingests),
 * Handsontable consumes a row-major array-of-arrays — but the logical rows are
 * identical.
 *
 * Columns: id (number) · date (text) · customer (text) · city (text) ·
 * amount (number).
 */

/** Logical column descriptor, engine-neutral. */
export interface BenchColumn {
  readonly key: string;
  readonly header: string;
  readonly width: number;
  readonly type: "number" | "text";
}

/** Column schema, identical for both grids. */
export const COLUMNS: readonly BenchColumn[] = [
  { key: "id", header: "ID", width: 90, type: "number" },
  { key: "date", header: "Date", width: 120, type: "text" },
  { key: "customer", header: "Customer", width: 240, type: "text" },
  { key: "city", header: "City", width: 160, type: "text" },
  { key: "amount", header: "Amount", width: 140, type: "number" },
];

/** Stable column indices for direct, name-free addressing in both engines. */
export const COL = { id: 0, date: 1, customer: 2, city: 3, amount: 4 } as const;

/** Distinct city values; assignment is uniform-ish via the PRNG. */
export const CITIES = [
  "Phnom Penh",
  "Tokyo",
  "Berlin",
  "Lisbon",
  "Nairobi",
  "Lima",
  "Oslo",
] as const;

/** Default seed — pinned so the published results table is reproducible. */
export const DEFAULT_SEED = 0x5eed_c0de;

/** Text-filter workload: substring-match the `city` column. */
export const FILTER_COL = COL.city;
/** Matches exactly one city (~1/7 of rows) so the filter is meaningfully selective. */
export const FILTER_NEEDLE = "Tokyo";

/** Numeric-sort workload column. */
export const SORT_COL = COL.amount;
/** Numeric-aggregate workload column. */
export const AGG_COL = COL.amount;

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Same seed produces
 * the same stream forever, which is exactly what a benchmark fixture needs.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Columnar dataset — typed arrays per column, the shape Sheetwrite ingests. */
export interface ColumnarDataset {
  readonly rowCount: number;
  readonly id: Float64Array;
  readonly date: string[];
  readonly customer: string[];
  readonly city: string[];
  readonly amount: Float64Array;
}

/** Precompute the date pool once; only ~1000 distinct days ever appear. */
function buildDays(): string[] {
  const days: string[] = [];
  for (let d = 0; d < 1000; d++) {
    days.push(new Date(Date.UTC(2020, 0, 1 + d)).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Generate `rowCount` deterministic rows. Numeric columns are typed arrays;
 * text columns are string arrays. The PRNG stream is consumed in a fixed order
 * (amount, city, day) per row so output never depends on iteration timing.
 */
export function makeColumnar(rowCount: number, seed: number = DEFAULT_SEED): ColumnarDataset {
  const rng = mulberry32(seed);
  const days = buildDays();

  const id = new Float64Array(rowCount);
  const date = new Array<string>(rowCount);
  const customer = new Array<string>(rowCount);
  const city = new Array<string>(rowCount);
  const amount = new Float64Array(rowCount);

  for (let r = 0; r < rowCount; r++) {
    id[r] = r + 1;
    // Two cents of precision over a 0–10,000 range — realistic money values.
    amount[r] = Math.round(rng() * 1_000_000) / 100;
    city[r] = CITIES[Math.floor(rng() * CITIES.length)] ?? CITIES[0];
    date[r] = days[Math.floor(rng() * days.length)] ?? days[0]!;
    customer[r] = `Customer ${String(r + 1).padStart(6, "0")}`;
  }

  return { rowCount, id, date, customer, city, amount };
}

/**
 * The columnar payload Sheetwrite's store ingests: a `rowCount` plus a map of
 * column name → `ArrayLike` of scalars. Structurally matches core's
 * `ColumnarData`, kept local so the dataset module stays engine-neutral.
 */
export interface SheetwriteColumnar {
  readonly rowCount: number;
  readonly columns: Record<string, ArrayLike<string | number>>;
}

/** Project a {@link ColumnarDataset} into the shape Sheetwrite's store ingests. */
export function toSheetwriteColumnar(ds: ColumnarDataset): SheetwriteColumnar {
  return {
    rowCount: ds.rowCount,
    columns: {
      id: ds.id,
      date: ds.date,
      customer: ds.customer,
      city: ds.city,
      amount: ds.amount,
    },
  };
}

/** A single row in COLUMNS order — the cell tuple Handsontable stores. */
export type BenchRow = [number, string, string, string, number];

/**
 * Row-major array-of-arrays in COLUMNS order — the shape Handsontable ingests.
 * A fresh array is returned each call so a destructive grid never corrupts the
 * canonical dataset between iterations.
 */
export function toAoA(ds: ColumnarDataset): BenchRow[] {
  const rows = new Array<BenchRow>(ds.rowCount);
  for (let r = 0; r < ds.rowCount; r++) {
    rows[r] = [ds.id[r]!, ds.date[r]!, ds.customer[r]!, ds.city[r]!, ds.amount[r]!];
  }
  return rows;
}
