## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.24 (1.93) | 546 (624) | **441.3× faster** |
| 10,000 | 11.10 (13.25) | 4424 (4652) | **398.7× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.033 (0.052) | 0.065 (0.100) | **2.0× faster** |
| 10,000 | 0.025 (0.039) | 0.080 (0.108) | **3.1× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 10.27 (17.77) | 72.83 (106) | **7.1× faster** |
| 10,000 | 8.62 (15.26) | 374 (379) | **43.4× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.123 (0.126) | 197 (224) | **1603.9× faster** |
| 10,000 | 1.33 (1.48) | 1923 (2141) | **1444.9× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.139 (0.164) | 92.24 (98.20) | **661.8× faster** |
| 10,000 | 0.660 (0.723) | 686 (731) | **1038.4× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.010) | 0.186 (0.317) | **27.9× faster** |
| 10,000 | 0.018 (0.032) | 1.15 (1.93) | **64.5× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1.24 (1.93) | 0.033 (0.052) | 10.27 (17.77) | 0.123 (0.126) | 0.139 (0.164) | 0.007 (0.010) |
| 10,000 | 11.10 (13.25) | 0.025 (0.039) | 8.62 (15.26) | 1.33 (1.48) | 0.660 (0.723) | 0.018 (0.032) |
| 100,000 | 105 (112) | 0.022 (0.037) | 26.74 (32.27) | 16.16 (18.50) | 4.49 (4.79) | 0.187 (0.235) |
| 500,000 | 553 (578) | 0.023 (0.040) | 103 (107) | 97.81 (105) | 22.71 (22.88) | 0.941 (1.07) |
| 1,000,000 | 1298 (1322) | 0.026 (0.039) | 198 (200) | 214 (236) | 44.46 (47.38) | 1.91 (2.45) |

### Memory

Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).

| rows | Sheetwrite data (WASM columnar store) | bytes/row |
|---:|---:|---:|
| 1,000 | 0.44 MiB | 459 B |
| 10,000 | 3.19 MiB | 334 B |
| 100,000 | 33.50 MiB | 351 B |
| 500,000 | 160.00 MiB | 336 B |
| 1,000,000 | 319.56 MiB | 335 B |

**Notes**
- Handsontable edit: edits wrapped in suspendRender/resumeRender to isolate the data path
- Handsontable aggregate: no native aggregate API — summed in plain JS over getSourceDataAtCol
- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.
- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.
- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.
