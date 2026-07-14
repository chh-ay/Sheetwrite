## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.298 (0.345) | 504 (591) | **1693.1× faster** |
| 10,000 | 2.76 (2.80) | 4230 (17451) | **1534.4× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.011) | 0.077 (0.169) | **11.6× faster** |
| 10,000 | 0.007 (0.007) | 0.173 (0.193) | **25.7× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.77 (3.02) | 148 (241) | **83.9× faster** |
| 10,000 | 0.651 (1.51) | 473 (557) | **726.7× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.100 (0.125) | 213 (277) | **2116.7× faster** |
| 10,000 | 0.192 (0.207) | 3281 (10781) | **17117.2× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.016 (0.042) | 106 (144) | **6483.6× faster** |
| 10,000 | 0.067 (0.124) | 790 (1617) | **11811.7× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.004 (0.005) | 0.159 (0.211) | **43.8× faster** |
| 10,000 | 0.019 (0.022) | 1.22 (1.55) | **63.9× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.298 (0.345) | 0.007 (0.011) | 1.77 (3.02) | 0.100 (0.125) | 0.016 (0.042) | 0.004 (0.005) |
| 10,000 | 2.76 (2.80) | 0.007 (0.007) | 0.651 (1.51) | 0.192 (0.207) | 0.067 (0.124) | 0.019 (0.022) |
| 100,000 | 29.03 (33.00) | 0.016 (0.018) | 0.756 (1.56) | 1.84 (1.90) | 0.326 (0.400) | 0.185 (0.193) |
| 500,000 | 135 (145) | 0.016 (0.017) | 0.833 (0.923) | 11.27 (12.51) | 1.95 (2.02) | 1.04 (2.13) |
| 1,000,000 | 329 (415) | 0.012 (0.018) | 0.784 (0.840) | 29.74 (31.86) | 3.88 (5.17) | 2.17 (3.63) |

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
