## Headless data-layer results

Bun 1.3.14 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.274 (0.321) | 509 (551) | **1857.2× faster** |
| 10,000 | 2.41 (2.57) | 4732 (4808) | **1967.3× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.010) | 0.056 (0.186) | **9.1× faster** |
| 10,000 | 0.007 (0.012) | 0.074 (0.085) | **11.2× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.99 (4.46) | 83.56 (124) | **41.9× faster** |
| 10,000 | 0.896 (1.70) | 463 (524) | **517.3× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.113 (0.161) | 230 (263) | **2030.6× faster** |
| 10,000 | 0.194 (0.213) | 2177 (2481) | **11222.1× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.013 (0.032) | 96.89 (143) | **7611.5× faster** |
| 10,000 | 0.044 (0.065) | 841 (1775) | **18955.2× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.003 (0.005) | 0.146 (0.280) | **45.7× faster** |
| 10,000 | 0.018 (0.027) | 1.01 (1.33) | **55.8× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.274 (0.321) | 0.006 (0.010) | 1.99 (4.46) | 0.113 (0.161) | 0.013 (0.032) | 0.003 (0.005) |
| 10,000 | 2.41 (2.57) | 0.007 (0.012) | 0.896 (1.70) | 0.194 (0.213) | 0.044 (0.065) | 0.018 (0.027) |
| 100,000 | 27.78 (30.24) | 0.008 (0.014) | 1.17 (2.22) | 2.13 (2.45) | 0.364 (0.436) | 0.206 (0.217) |
| 500,000 | 141 (147) | 0.009 (0.011) | 0.865 (1.04) | 12.65 (13.40) | 1.69 (2.12) | 0.899 (1.93) |
| 1,000,000 | 283 (283) | 0.011 (0.016) | 0.901 (1.50) | 23.45 (24.34) | 3.38 (3.85) | 1.80 (3.31) |

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
