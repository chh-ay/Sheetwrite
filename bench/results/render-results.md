# Auditable render benchmark

Protocol version: **1**  
Run ID: `e315eb00-dc4d-432c-97ee-a6d4e44c1e93`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `35c87b994b60da334202f6fbd1f550426f1b8681` (clean) |
| Timestamp | 2026-07-16T17:13:27.610Z |
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
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.692 ms; p95 1.722; MAD 0.03376; 3 samples / 189 ops | median 103.6 ms; p95 109.7; MAD 2.100; 3 samples / 4 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.397 ms; p95 1.444; MAD 0.05202; 3 samples / 223 ops | median 38.233 ms; p95 41.503; MAD 1.733; 3 samples / 9 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.52356 ms; p95 0.54198; MAD 0.01544; 3 samples / 572 ops | median 104.1 ms; p95 122.3; MAD 16.700; 3 samples / 4 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.30120 ms; p95 0.31693; MAD 0.00622; 3 samples / 1003 ops | median 68.100 ms; p95 74.625; MAD 2.500; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.62422 ms; p95 0.68311; MAD 0.03767; 3 samples / 477 ops | median 1.437 ms; p95 1.603; MAD 0.07768; 3 samples / 206 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.96346 ms; p95 1.364; MAD 0.14883; 3 samples / 300 ops | median 2.034 ms; p95 2.044; MAD 0.01090; 3 samples / 152 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.56610 ms; p95 0.73398; MAD 0.00387; 3 samples / 498 ops | median 2.592 ms; p95 3.091; MAD 0.11182; 3 samples / 112 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.98235 ms; p95 1.001; MAD 0.02065; 3 samples / 315 ops | median 39.700 ms; p95 41.890; MAD 2.433; 3 samples / 9 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.176 ms; p95 3.654; MAD 0.25576; 3 samples / 95 ops | median 125.6 ms; p95 127.6; MAD 2.200; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.839 ms; p95 3.341; MAD 0.15205; 3 samples / 104 ops | median 139.1 ms; p95 163.0; MAD 21.000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.65260 ms; p95 0.69906; MAD 0.02304; 3 samples / 455 ops | median 2.253 ms; p95 2.341; MAD 0.09783; 3 samples / 136 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.64487 ms; p95 0.66197; MAD 0.01900; 3 samples / 479 ops | median 2.574 ms; p95 2.673; MAD 0.02186; 3 samples / 117 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.99109 ms; p95 1.047; MAD 0.06260; 3 samples / 309 ops | median 4.032 ms; p95 4.183; MAD 0.11662; 3 samples / 75 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.28934 ms; p95 0.34366; MAD 0.00596; 3 samples / 1084 ops | median 8.377 ms; p95 11.918; MAD 0.64615; 3 samples / 35 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.464 ms; p95 1.612; MAD 0.11640; 3 samples / 208 ops | median 93.800 ms; p95 103.3; MAD 0.40000; 3 samples / 5 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.347 ms; p95 1.440; MAD 0.01904; 3 samples / 220 ops | median 41.400 ms; p95 45.120; MAD 4.133; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.57644 ms; p95 0.65605; MAD 0.00769; 3 samples / 501 ops | median 94.500 ms; p95 102.5; MAD 1.900; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.31509 ms; p95 0.32737; MAD 0.01364; 3 samples / 1036 ops | median 56.250 ms; p95 60.885; MAD 1.450; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.66447 ms; p95 0.69645; MAD 0.00275; 3 samples / 457 ops | median 1.212 ms; p95 1.289; MAD 0.00000; 3 samples / 244 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.75070 ms; p95 0.85924; MAD 0.07043; 3 samples / 404 ops | median 1.732 ms; p95 1.790; MAD 0.06423; 3 samples / 180 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.56369 ms; p95 0.68637; MAD 0.04771; 3 samples / 516 ops | median 2.488 ms; p95 2.510; MAD 0.02470; 3 samples / 122 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.99703 ms; p95 1.073; MAD 0.08416; 3 samples / 325 ops | median 38.633 ms; p95 40.343; MAD 1.900; 3 samples / 10 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.869 ms; p95 3.821; MAD 0.11992; 3 samples / 98 ops | median 112.3 ms; p95 120.8; MAD 5.200; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.853 ms; p95 3.148; MAD 0.12305; 3 samples / 105 ops | median 126.9 ms; p95 153.6; MAD 8.600; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.74296 ms; p95 0.76671; MAD 0.02638; 3 samples / 421 ops | median 2.047 ms; p95 2.136; MAD 0.08027; 3 samples / 148 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.67315 ms; p95 0.85995; MAD 0.03581; 3 samples / 421 ops | median 2.251 ms; p95 2.433; MAD 0.06850; 3 samples / 132 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.97670 ms; p95 1.065; MAD 0.05778; 3 samples / 307 ops | median 4.076 ms; p95 4.260; MAD 0.18341; 3 samples / 77 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.30030 ms; p95 0.35929; MAD 0.00356; 3 samples / 954 ops | median 8.315 ms; p95 8.932; MAD 0.11538; 3 samples / 38 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
