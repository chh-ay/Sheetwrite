# Auditable render benchmark

Protocol version: **1**  
Run ID: `498ce36d-ded1-426a-bf01-66d02257fcd3`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `572c15cb27d428d987c59f57fa69f81ebddfedcc` (clean) |
| Timestamp | 2026-07-27T14:41:01.920Z |
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
| 1 | 100,000 | [`r1-100000-formula-dense.paint`](./render-results.json) | median 0.45387 ms; p95 0.50812; MAD 0.03521; 3 samples / 773 ops |
| 1 | 100,000 | [`r1-100000-text-heavy.long-scroll`](./render-results.json) | median 4014.6 ms; p95 4053.3; MAD 43.000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-scroll-fractional.same-window`](./render-results.json) | median 0.64774 ms; p95 0.71355; MAD 0.00351; 3 samples / 450 ops |
| 1 | 100,000 | [`r1-100000-geometry-unresized.1m`](./render-results.json) | median 6.900 ms; p95 7.228; MAD 0.36429; 3 samples / 46 ops |
| 2 | 100,000 | [`r2-100000-formula-dense.paint`](./render-results.json) | median 0.41056 ms; p95 0.41658; MAD 0.00669; 3 samples / 852 ops |
| 2 | 100,000 | [`r2-100000-text-heavy.long-scroll`](./render-results.json) | median 4126.8 ms; p95 4216.1; MAD 99.200; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-scroll-fractional.same-window`](./render-results.json) | median 0.64167 ms; p95 0.65209; MAD 0.01158; 3 samples / 476 ops |
| 2 | 100,000 | [`r2-100000-geometry-unresized.1m`](./render-results.json) | median 6.987 ms; p95 8.506; MAD 0.98667; 3 samples / 44 ops |
| 3 | 100,000 | [`r3-100000-formula-dense.paint`](./render-results.json) | median 0.46338 ms; p95 0.49322; MAD 0.01849; 3 samples / 711 ops |
| 3 | 100,000 | [`r3-100000-text-heavy.long-scroll`](./render-results.json) | median 3959.7 ms; p95 4255.4; MAD 102.2; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-scroll-fractional.same-window`](./render-results.json) | median 0.80480 ms; p95 0.97602; MAD 0.11308; 3 samples / 371 ops |
| 3 | 100,000 | [`r3-100000-geometry-unresized.1m`](./render-results.json) | median 7.113 ms; p95 7.731; MAD 0.68667; 3 samples / 44 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render:diagnostic`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
