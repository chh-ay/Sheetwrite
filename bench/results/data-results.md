## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.334 (0.690) | 539 (588) | **1612.8× faster** |
| 10,000 | 3.87 (4.37) | 4931 (6038) | **1272.7× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.015) | 0.051 (0.143) | **7.4× faster** |
| 10,000 | 0.007 (0.013) | 0.093 (0.185) | **14.0× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.768 (1.14) | 84.86 (120) | **110.5× faster** |
| 10,000 | 0.281 (0.394) | 441 (510) | **1571.1× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.089 (0.108) | 237 (274) | **2662.0× faster** |
| 10,000 | 0.197 (0.266) | 2635 (4596) | **13378.3× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.011 (0.015) | 103 (132) | **9082.4× faster** |
| 10,000 | 0.041 (0.047) | 983 (1441) | **24250.5× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.004 (0.005) | 0.139 (0.282) | **36.6× faster** |
| 10,000 | 0.025 (0.028) | 2.41 (6.43) | **97.9× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.334 (0.690) | 0.007 (0.015) | 0.768 (1.14) | 0.089 (0.108) | 0.011 (0.015) | 0.004 (0.005) |
| 10,000 | 3.87 (4.37) | 0.007 (0.013) | 0.281 (0.394) | 0.197 (0.266) | 0.041 (0.047) | 0.025 (0.028) |
| 100,000 | 25.13 (28.57) | 0.008 (0.011) | 0.246 (0.972) | 1.92 (2.08) | 0.336 (0.368) | 0.232 (0.241) |
| 500,000 | 136 (153) | 0.011 (0.014) | 0.361 (0.420) | 10.62 (12.75) | 1.76 (2.24) | 1.22 (1.50) |
| 1,000,000 | 277 (319) | 0.011 (0.012) | 0.480 (0.710) | 22.15 (22.97) | 3.37 (4.12) | 2.12 (2.65) |

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
