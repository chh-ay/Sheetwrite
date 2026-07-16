## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.272 (0.329) | 496 (530) | **1823.4× faster** |
| 10,000 | 2.35 (3.32) | 3887 (4356) | **1655.1× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.009) | 0.089 (0.208) | **15.7× faster** |
| 10,000 | 0.005 (0.007) | 0.117 (0.129) | **21.3× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.97 (2.82) | 193 (247) | **98.3× faster** |
| 10,000 | 0.653 (1.61) | 454 (527) | **696.1× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.107 (0.162) | 196 (226) | **1837.6× faster** |
| 10,000 | 0.184 (0.192) | 1832 (2267) | **9948.1× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.020 (0.041) | 101 (119) | **4950.0× faster** |
| 10,000 | 0.044 (0.047) | 725 (1050) | **16536.7× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.110 (0.145) | 174 (194) | **1578.7× faster** |
| 10,000 | 0.406 (0.587) | 2163 (6452) | **5323.2× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.103 (0.261) | 0.165 (0.203) | **1.6× faster** |
| 10,000 | 0.421 (0.511) | 1.44 (2.51) | **3.4× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.473 (0.557) | 0.231 (0.340) | 2.1× slower |
| 10,000 | 2.27 (4.10) | 1.97 (2.30) | 1.2× slower |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.004 (0.005) | 0.134 (0.148) | **34.7× faster** |
| 10,000 | 0.021 (0.030) | 1.64 (2.44) | **77.9× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.272 (0.329) | 0.006 (0.009) | 1.97 (2.82) | 0.107 (0.162) | 0.020 (0.041) | 0.110 (0.145) | 0.103 (0.261) | 0.473 (0.557) | 0.004 (0.005) |
| 10,000 | 2.35 (3.32) | 0.005 (0.007) | 0.653 (1.61) | 0.184 (0.192) | 0.044 (0.047) | 0.406 (0.587) | 0.421 (0.511) | 2.27 (4.10) | 0.021 (0.030) |
| 100,000 | 25.33 (29.05) | 0.008 (0.011) | 0.655 (1.67) | 1.90 (2.09) | 0.315 (0.363) | 3.24 (3.65) | 3.56 (3.75) | 21.27 (28.70) | 0.179 (0.253) |
| 500,000 | 138 (143) | 0.009 (0.015) | 0.832 (0.876) | 11.82 (12.50) | 1.69 (2.08) | 16.64 (20.45) | 21.36 (24.75) | 118 (119) | 0.950 (1.47) |
| 1,000,000 | 277 (287) | 0.014 (0.023) | 0.847 (1.75) | 28.24 (32.43) | 3.68 (4.44) | 38.92 (47.02) | 37.48 (46.19) | 279 (282) | 2.19 (2.45) |

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
