## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.352 (0.402) | 530 (547) | **1506.5× faster** |
| 10,000 | 2.44 (2.55) | 4045 (4572) | **1657.4× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.012) | 0.096 (0.260) | **13.4× faster** |
| 10,000 | 0.006 (0.009) | 0.106 (0.150) | **17.8× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.87 (2.95) | 170 (260) | **90.7× faster** |
| 10,000 | 0.628 (2.24) | 434 (673) | **690.8× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.103 (0.127) | 203 (226) | **1974.9× faster** |
| 10,000 | 0.171 (0.232) | 2237 (6360) | **13116.1× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.022 (0.029) | 101 (112) | **4696.5× faster** |
| 10,000 | 0.042 (0.050) | 1024 (1766) | **24273.5× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.169 (0.209) | 177 (219) | **1043.3× faster** |
| 10,000 | 0.417 (0.650) | 1663 (2148) | **3984.6× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.079 (0.099) | 0.184 (0.205) | **2.3× faster** |
| 10,000 | 0.447 (0.488) | 1.65 (1.91) | **3.7× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.315 (0.394) | 0.218 (0.240) | 1.4× slower |
| 10,000 | 2.05 (2.43) | 2.32 (4.27) | **1.1× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.003 (0.005) | 0.143 (0.155) | **42.5× faster** |
| 10,000 | 0.020 (0.026) | 4.03 (4.75) | **203.5× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.352 (0.402) | 0.007 (0.012) | 1.87 (2.95) | 0.103 (0.127) | 0.022 (0.029) | 0.169 (0.209) | 0.079 (0.099) | 0.315 (0.394) | 0.003 (0.005) |
| 10,000 | 2.44 (2.55) | 0.006 (0.009) | 0.628 (2.24) | 0.171 (0.232) | 0.042 (0.050) | 0.417 (0.650) | 0.447 (0.488) | 2.05 (2.43) | 0.020 (0.026) |
| 100,000 | 26.96 (32.86) | 0.009 (0.016) | 0.723 (1.66) | 1.85 (2.12) | 0.337 (0.419) | 6.51 (8.10) | 4.63 (5.13) | 21.00 (27.87) | 0.188 (0.245) |
| 500,000 | 134 (160) | 0.009 (0.014) | 0.822 (1.22) | 10.56 (11.73) | 1.62 (1.68) | 20.44 (22.55) | 22.53 (23.81) | 116 (121) | 0.997 (2.05) |
| 1,000,000 | 290 (290) | 0.011 (0.015) | 0.746 (0.902) | 23.13 (23.68) | 3.33 (4.04) | 39.85 (43.65) | 39.09 (45.12) | 279 (282) | 1.93 (2.50) |

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
