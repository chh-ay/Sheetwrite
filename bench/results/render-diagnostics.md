# Auditable render benchmark

Protocol version: **1**  
Run ID: `9b53c653-199a-4c15-b545-72c34cad1de7`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `83d6745a98cea4eebf23a978072d89d0fffdeb06` (clean) |
| Timestamp | 2026-07-27T15:34:48.766Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.3.1; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: sheetwrite; round 2: sheetwrite; round 3: sheetwrite |
| Browser launches | 3 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-formula-dense.paint`](./render-results.json) | median 0.37852 ms; p95 0.48785; MAD 0.00254; 3 samples / 763 ops |
| 1 | 100,000 | [`r1-100000-text-heavy.long-scroll`](./render-results.json) | median 4022.5 ms; p95 4185.8; MAD 52.800; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-scroll-fractional.same-window`](./render-results.json) | median 0.71857 ms; p95 0.72063; MAD 0.00229; 3 samples / 424 ops |
| 1 | 100,000 | [`r1-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00013; MAD 0.00001; 3 samples / 2415151 ops |
| 2 | 100,000 | [`r2-100000-formula-dense.paint`](./render-results.json) | median 0.39683 ms; p95 0.41806; MAD 0.01408; 3 samples / 852 ops |
| 2 | 100,000 | [`r2-100000-text-heavy.long-scroll`](./render-results.json) | median 3918.8 ms; p95 3983.9; MAD 72.300; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-scroll-fractional.same-window`](./render-results.json) | median 0.67200 ms; p95 0.69099; MAD 0.02110; 3 samples / 453 ops |
| 2 | 100,000 | [`r2-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00013; MAD 0.00001; 3 samples / 2463523 ops |
| 3 | 100,000 | [`r3-100000-formula-dense.paint`](./render-results.json) | median 0.37430 ms; p95 0.54879; MAD 0.00529; 3 samples / 731 ops |
| 3 | 100,000 | [`r3-100000-text-heavy.long-scroll`](./render-results.json) | median 4007.2 ms; p95 4009.3; MAD 2.300; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-scroll-fractional.same-window`](./render-results.json) | median 0.62174 ms; p95 0.63772; MAD 0.01775; 3 samples / 485 ops |
| 3 | 100,000 | [`r3-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00012; MAD 0.00000; 3 samples / 2512673 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render:diagnostic`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
