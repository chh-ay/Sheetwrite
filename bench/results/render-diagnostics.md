# Auditable render benchmark

Protocol version: **1**  
Run ID: `a42aaa37-341b-413f-95fd-b25c911d4a2f`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `66a0df7c6288a89dfb2c8d2226a2fe0b88b3d25e` (clean) |
| Timestamp | 2026-08-09T14:10:47.440Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.3.1; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: sheetwrite; round 2: sheetwrite |
| Browser launches | 2 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-formula-dense.paint`](./render-results.json) | median 0.46972 ms; p95 0.59065; MAD 0.06901; 3 samples / 764 ops |
| 1 | 100,000 | [`r1-100000-text-heavy.long-scroll`](./render-results.json) | median 4140.7 ms; p95 4450.4; MAD 38.200; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-scroll-fractional.same-window`](./render-results.json) | median 0.66424 ms; p95 0.68656; MAD 0.02480; 3 samples / 456 ops |
| 1 | 100,000 | [`r1-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00013; MAD 0.00000; 3 samples / 2464559 ops |
| 1 | 100,000 | [`r1-100000-window-transfer.scroll.baseline`](./render-results.json) | median 1.533 ms; p95 1.728; MAD 0.02736; 3 samples / 191 ops; validity product-valid; copied/frame 3432.000 B; allocations/frame 1.000; copied/read 3432.000 B; allocations/read 1.000 |
| 1 | 100,000 | [`r1-100000-window-transfer.scroll.reuse-decoded-view-upper-bound`](./render-results.json) | median 0.65065 ms; p95 0.69194; MAD 0.00578; 3 samples / 454 ops; validity pixel-data-invalid; copied/frame 0.000 B; allocations/frame 0.000; copied/read n/a; allocations/read n/a |
| 2 | 100,000 | [`r2-100000-formula-dense.paint`](./render-results.json) | median 0.38697 ms; p95 0.43039; MAD 0.02488; 3 samples / 845 ops |
| 2 | 100,000 | [`r2-100000-text-heavy.long-scroll`](./render-results.json) | median 4311.3 ms; p95 4356.4; MAD 50.100; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-scroll-fractional.same-window`](./render-results.json) | median 0.70915 ms; p95 0.71506; MAD 0.00656; 3 samples / 430 ops |
| 2 | 100,000 | [`r2-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00015; MAD 0.00001; 3 samples / 2325951 ops |
| 2 | 100,000 | [`r2-100000-window-transfer.scroll.baseline`](./render-results.json) | median 1.551 ms; p95 1.571; MAD 0.00154; 3 samples / 194 ops; validity product-valid; copied/frame 3432.000 B; allocations/frame 1.000; copied/read 3432.000 B; allocations/read 1.000 |
| 2 | 100,000 | [`r2-100000-window-transfer.scroll.reuse-decoded-view-upper-bound`](./render-results.json) | median 0.71714 ms; p95 0.75558; MAD 0.00792; 3 samples / 413 ops; validity pixel-data-invalid; copied/frame 0.000 B; allocations/frame 0.000; copied/read n/a; allocations/read n/a |

## Visible-window transfer diagnostic

> The reuse upper bound deliberately paints a prior decoded view. Its pixels/data are invalid and it is not a product-valid rendering result.

Counterbalanced scenario order: round 1: window-transfer.scroll.baseline → window-transfer.scroll.reuse-decoded-view-upper-bound; round 2: window-transfer.scroll.reuse-decoded-view-upper-bound → window-transfer.scroll.baseline

| rows | baseline repetition medians | upper-bound repetition medians | estimated transfer cost | cross-variant spread | maximum within-variant spread | resolution |
|---:|:--|:--|---:|---:|---:|:--|
| 100,000 | 1.533, 1.551 ms | 0.65065, 0.71714 ms | 0.85816 ms | 0.85816 ms | 0.06649 ms | resolved |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render:diagnostic`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
