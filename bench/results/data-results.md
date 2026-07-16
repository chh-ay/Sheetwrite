## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.308 (0.413) | 480 (547) | **1556.9× faster** |
| 10,000 | 2.37 (2.61) | 4056 (4553) | **1709.6× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.011) | 0.080 (0.133) | **13.6× faster** |
| 10,000 | 0.006 (0.007) | 0.117 (0.148) | **20.2× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.65 (2.34) | 174 (242) | **105.4× faster** |
| 10,000 | 0.705 (1.47) | 466 (548) | **662.0× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.109 (0.231) | 193 (238) | **1762.9× faster** |
| 10,000 | 0.182 (0.198) | 1815 (2714) | **9977.5× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.021 (0.033) | 98.09 (108) | **4708.7× faster** |
| 10,000 | 0.045 (0.049) | 913 (2027) | **20304.6× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.193 (0.269) | 174 (211) | **903.8× faster** |
| 10,000 | 0.412 (0.453) | 1716 (2137) | **4160.9× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.078 (0.122) | 0.226 (0.346) | **2.9× faster** |
| 10,000 | 0.379 (0.418) | 1.42 (2.63) | **3.7× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.462 (0.508) | 0.295 (0.338) | 1.6× slower |
| 10,000 | 2.02 (2.29) | 1.81 (2.59) | 1.1× slower |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.003 (0.005) | 0.194 (0.336) | **57.7× faster** |
| 10,000 | 0.019 (0.020) | 1.38 (2.01) | **72.0× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.308 (0.413) | 0.006 (0.011) | 1.65 (2.34) | 0.109 (0.231) | 0.021 (0.033) | 0.193 (0.269) | 0.078 (0.122) | 0.462 (0.508) | 0.003 (0.005) |
| 10,000 | 2.37 (2.61) | 0.006 (0.007) | 0.705 (1.47) | 0.182 (0.198) | 0.045 (0.049) | 0.412 (0.453) | 0.379 (0.418) | 2.02 (2.29) | 0.019 (0.020) |
| 100,000 | 25.60 (27.60) | 0.008 (0.012) | 1.25 (2.36) | 1.82 (1.92) | 0.325 (0.356) | 3.49 (3.64) | 3.67 (3.76) | 21.50 (26.14) | 0.189 (0.257) |
| 500,000 | 143 (144) | 0.009 (0.014) | 0.674 (0.854) | 9.97 (10.50) | 1.61 (1.75) | 18.24 (20.60) | 22.17 (22.85) | 115 (125) | 1.06 (1.48) |
| 1,000,000 | 314 (320) | 0.011 (0.013) | 0.744 (0.805) | 24.61 (27.43) | 3.65 (4.27) | 35.93 (44.20) | 38.86 (40.30) | 257 (267) | 2.08 (2.31) |

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
