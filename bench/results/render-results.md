# Auditable render benchmark

Protocol version: **1**  
Run ID: `814245c3-f51a-4e1c-aecb-e36b49e153f7`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `cacbb406bc64f0afa6a342aa1f071b668f40ff0e` (clean) |
| Timestamp | 2026-07-13T20:03:25.716Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.1.0; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable |
| Browser launches | 4 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 2.405 ms; p95 2.497; MAD 0.10274; 3 samples / 132 ops | median 53.367 ms; p95 54.477; MAD 0.96667; 3 samples / 7 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 2.059 ms; p95 2.286; MAD 0.03118; 3 samples / 143 ops | median 0.15267 ms; p95 0.16019; MAD 0.00836; 3 samples / 2033 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.74296 ms; p95 0.79031; MAD 0.05261; 3 samples / 563 ops | median 117.3 ms; p95 118.2; MAD 1.000; 3 samples / 4 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.94717 ms; p95 0.97025; MAD 0.02565; 3 samples / 323 ops | median 2.262 ms; p95 2.606; MAD 0.24822; 3 samples / 133 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 1.314 ms; p95 1.675; MAD 0.26949; 3 samples / 232 ops | median 2.595 ms; p95 2.774; MAD 0.19957; 3 samples / 119 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.78438 ms; p95 0.86231; MAD 0.02956; 3 samples / 387 ops | median 3.689 ms; p95 3.865; MAD 0.09618; 3 samples / 83 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 1.425 ms; p95 1.668; MAD 0.16160; 3 samples / 210 ops | median 60.500 ms; p95 75.845; MAD 6.100; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 5.368 ms; p95 7.152; MAD 0.52080; 3 samples / 54 ops | median 178.0 ms; p95 187.5; MAD 0.40000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 4.354 ms; p95 4.760; MAD 0.05000; 3 samples / 69 ops | median 237.8 ms; p95 266.1; MAD 31.400; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.90180 ms; p95 1.093; MAD 0.19900; 3 samples / 348 ops | median 2.909 ms; p95 2.991; MAD 0.08635; 3 samples / 105 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 1.303 ms; p95 1.372; MAD 0.07685; 3 samples / 236 ops | median 3.337 ms; p95 3.349; MAD 0.01333; 3 samples / 94 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 3.134 ms; p95 3.576; MAD 0.20866; 3 samples / 95 ops | median 74.450 ms; p95 80.660; MAD 6.900; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 2.909 ms; p95 3.194; MAD 0.31724; 3 samples / 106 ops | median 0.12072 ms; p95 0.12318; MAD 0.00273; 3 samples / 2520 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.52513 ms; p95 0.87903; MAD 0.01077; 3 samples / 495 ops | median 125.5 ms; p95 130.1; MAD 5.100; 3 samples / 4 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.98350 ms; p95 1.185; MAD 0.13812; 3 samples / 305 ops | median 2.631 ms; p95 3.216; MAD 0.28891; 3 samples / 113 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.86610 ms; p95 0.99201; MAD 0.05147; 3 samples / 341 ops | median 2.530 ms; p95 2.791; MAD 0.15791; 3 samples / 119 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.63291 ms; p95 0.76585; MAD 0.00993; 3 samples / 448 ops | median 4.056 ms; p95 4.212; MAD 0.17317; 3 samples / 76 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 1.169 ms; p95 1.318; MAD 0.01113; 3 samples / 249 ops | median 63.050 ms; p95 71.150; MAD 9.000; 3 samples / 7 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 4.044 ms; p95 5.597; MAD 0.28104; 3 samples / 75 ops | median 170.2 ms; p95 170.6; MAD 0.50000; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 4.714 ms; p95 4.971; MAD 0.28636; 3 samples / 67 ops | median 190.5 ms; p95 208.2; MAD 17.100; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 1.050 ms; p95 1.112; MAD 0.06868; 3 samples / 294 ops | median 3.510 ms; p95 3.548; MAD 0.04138; 3 samples / 88 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 1.164 ms; p95 1.215; MAD 0.05653; 3 samples / 274 ops | median 3.693 ms; p95 3.910; MAD 0.24176; 3 samples / 92 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
