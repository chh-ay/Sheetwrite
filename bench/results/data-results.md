## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.415 (0.511) | 602 (681) | **1450.1× faster** |
| 10,000 | 2.30 (2.68) | 5377 (5782) | **2342.5× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.014) | 0.062 (0.153) | **10.0× faster** |
| 10,000 | 0.006 (0.011) | 0.070 (0.142) | **11.5× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.444 (0.531) | 132 (211) | **296.5× faster** |
| 10,000 | 0.397 (1.57) | 422 (454) | **1062.2× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.038 (0.053) | 262 (321) | **6910.3× faster** |
| 10,000 | 0.188 (0.207) | 2214 (3302) | **11770.1× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.010) | 116 (135) | **17237.0× faster** |
| 10,000 | 0.042 (0.047) | 787 (929) | **18542.8× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.003 (0.006) | 0.159 (0.328) | **47.8× faster** |
| 10,000 | 0.018 (0.033) | 1.74 (3.17) | **95.4× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.415 (0.511) | 0.006 (0.014) | 0.444 (0.531) | 0.038 (0.053) | 0.007 (0.010) | 0.003 (0.006) |
| 10,000 | 2.30 (2.68) | 0.006 (0.011) | 0.397 (1.57) | 0.188 (0.207) | 0.042 (0.047) | 0.018 (0.033) |
| 100,000 | 29.43 (36.76) | 0.008 (0.015) | 0.181 (0.242) | 1.75 (2.90) | 0.293 (0.368) | 0.187 (0.620) |
| 500,000 | 146 (150) | 0.009 (0.022) | 0.289 (0.335) | 11.55 (13.21) | 1.54 (2.13) | 1.11 (2.33) |
| 1,000,000 | 309 (310) | 0.011 (0.020) | 0.379 (0.571) | 25.78 (29.03) | 2.91 (4.67) | 1.95 (4.36) |

### Memory

Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).

| rows | Sheetwrite data (WASM columnar store) | bytes/row |
|---:|---:|---:|
| 1,000 | 0.25 MiB | 262 B |
| 10,000 | 1.56 MiB | 164 B |
| 100,000 | 16.25 MiB | 170 B |
| 500,000 | 72.75 MiB | 153 B |
| 1,000,000 | 146.25 MiB | 153 B |

**Notes**
- Handsontable edit: edits wrapped in suspendRender/resumeRender to isolate the data path
- Handsontable aggregate: no native aggregate API — summed in plain JS over getSourceDataAtCol
- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.
- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.
- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.
