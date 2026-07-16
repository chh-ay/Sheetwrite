## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.880 (0.909) | 651 (794) | **740.1× faster** |
| 10,000 | 3.40 (4.87) | 4577 (5291) | **1348.0× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.017) | 0.106 (0.235) | **16.6× faster** |
| 10,000 | 0.006 (0.012) | 0.153 (0.363) | **24.9× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.93 (3.55) | 237 (417) | **122.5× faster** |
| 10,000 | 0.693 (1.58) | 575 (747) | **830.3× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.145 (0.210) | 253 (316) | **1747.3× faster** |
| 10,000 | 0.211 (0.226) | 2174 (4818) | **10327.7× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.025 (0.110) | 125 (142) | **4949.7× faster** |
| 10,000 | 0.046 (0.055) | 881 (1164) | **18952.8× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.230 (0.345) | 231 (277) | **1005.1× faster** |
| 10,000 | 0.510 (0.900) | 2470 (6335) | **4845.1× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.148 (0.202) | 0.230 (0.258) | **1.6× faster** |
| 10,000 | 0.603 (0.682) | 1.84 (2.00) | **3.0× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.618 (1.11) | 0.258 (0.266) | 2.4× slower |
| 10,000 | 2.47 (4.12) | 2.23 (2.43) | 1.1× slower |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.004 (0.006) | 0.165 (0.344) | **45.9× faster** |
| 10,000 | 0.022 (0.042) | 1.99 (3.52) | **90.9× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.880 (0.909) | 0.006 (0.017) | 1.93 (3.55) | 0.145 (0.210) | 0.025 (0.110) | 0.230 (0.345) | 0.148 (0.202) | 0.618 (1.11) | 0.004 (0.006) |
| 10,000 | 3.40 (4.87) | 0.006 (0.012) | 0.693 (1.58) | 0.211 (0.226) | 0.046 (0.055) | 0.510 (0.900) | 0.603 (0.682) | 2.47 (4.12) | 0.022 (0.042) |
| 100,000 | 30.94 (33.22) | 0.008 (0.014) | 0.761 (1.74) | 1.95 (2.76) | 0.365 (1.13) | 3.64 (7.45) | 3.67 (6.91) | 24.16 (32.01) | 0.196 (0.298) |
| 500,000 | 167 (169) | 0.011 (0.020) | 0.719 (0.822) | 12.38 (14.87) | 2.12 (3.46) | 21.79 (24.80) | 20.49 (29.31) | 140 (147) | 1.41 (3.26) |
| 1,000,000 | 335 (348) | 0.012 (0.026) | 0.899 (2.36) | 35.52 (39.41) | 3.39 (6.67) | 44.27 (46.75) | 49.52 (53.83) | 452 (484) | 2.28 (4.32) |

### Memory

Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).

| rows | Sheetwrite data (WASM columnar store) | bytes/row |
|---:|---:|---:|
| 1,000 | 0.25 MiB | 262 B |
| 10,000 | 2.06 MiB | 216 B |
| 100,000 | 17.94 MiB | 188 B |
| 500,000 | 104.00 MiB | 218 B |
| 1,000,000 | 207.13 MiB | 217 B |

**Notes**
- Handsontable edit: edits wrapped in suspendRender/resumeRender to isolate the data path
- Handsontable aggregate: no native aggregate API — summed in plain JS over getSourceDataAtCol
- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.
- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.
- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.
