# Auditable render benchmark

Protocol version: **1**  
Run ID: `e32eceb4-9381-4d45-881a-cfeff23deed2`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `aa1a895f66bb7f3e4e242a97a91400568b2b19f7` (dirty) |
| Timestamp | 2026-07-16T17:48:50.115Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.1.0; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 20 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.217 ms; p95 1.228; MAD 0.01240; 3 samples / 251 ops | median 82.400 ms; p95 85.730; MAD 3.700; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.240 ms; p95 1.281; MAD 0.04565; 3 samples / 247 ops | median 28.325 ms; p95 30.620; MAD 0.07500; 3 samples / 12 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42236 ms; p95 0.45361; MAD 0.00009; 3 samples / 694 ops | median 71.000 ms; p95 73.925; MAD 1.100; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.23800 ms; p95 0.30828; MAD 0.00683; 3 samples / 1171 ops | median 48.500 ms; p95 50.525; MAD 1.700; 3 samples / 8 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.46009 ms; p95 0.49866; MAD 0.02062; 3 samples / 650 ops | median 1.087 ms; p95 1.131; MAD 0.04941; 3 samples / 277 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.61595 ms; p95 0.66541; MAD 0.05496; 3 samples / 514 ops | median 1.506 ms; p95 1.549; MAD 0.03097; 3 samples / 200 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.45294 ms; p95 0.51162; MAD 0.00805; 3 samples / 639 ops | median 2.286 ms; p95 2.301; MAD 0.01591; 3 samples / 135 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.77820 ms; p95 0.79433; MAD 0.01793; 3 samples / 399 ops | median 34.367 ms; p95 34.877; MAD 0.56667; 3 samples / 10 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.727 ms; p95 2.841; MAD 0.10908; 3 samples / 117 ops | median 101.6 ms; p95 108.9; MAD 5.450; 3 samples / 4 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.563 ms; p95 2.747; MAD 0.10884; 3 samples / 124 ops | median 107.9 ms; p95 108.2; MAD 0.10000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.60909 ms; p95 0.63841; MAD 0.03258; 3 samples / 495 ops | median 1.494 ms; p95 1.513; MAD 0.02112; 3 samples / 202 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.62956 ms; p95 0.63988; MAD 0.01147; 3 samples / 481 ops | median 1.805 ms; p95 1.851; MAD 0.05020; 3 samples / 168 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.72158 ms; p95 0.81955; MAD 0.01607; 3 samples / 422 ops | median 3.360 ms; p95 3.446; MAD 0.09517; 3 samples / 92 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.26029 ms; p95 0.28306; MAD 0.01017; 3 samples / 1171 ops | median 7.000 ms; p95 7.405; MAD 0.38750; 3 samples / 45 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.265 ms; p95 1.389; MAD 0.01500; 3 samples / 232 ops | median 81.500 ms; p95 85.550; MAD 4.500; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.148 ms; p95 1.164; MAD 0.01855; 3 samples / 265 ops | median 29.700 ms; p95 30.960; MAD 1.400; 3 samples / 12 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.46605 ms; p95 0.46885; MAD 0.00311; 3 samples / 656 ops | median 72.350 ms; p95 73.025; MAD 0.75000; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.25561 ms; p95 0.30622; MAD 0.01728; 3 samples / 1133 ops | median 48.133 ms; p95 48.463; MAD 0.23333; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.55055 ms; p95 0.86013; MAD 0.09945; 3 samples / 537 ops | median 1.071 ms; p95 1.105; MAD 0.01443; 3 samples / 280 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.61790 ms; p95 0.63619; MAD 0.02032; 3 samples / 507 ops | median 1.400 ms; p95 1.414; MAD 0.00833; 3 samples / 215 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.47393 ms; p95 0.52001; MAD 0.05120; 3 samples / 647 ops | median 2.202 ms; p95 2.244; MAD 0.01304; 3 samples / 137 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.74519 ms; p95 0.79452; MAD 0.05481; 3 samples / 418 ops | median 33.333 ms; p95 33.573; MAD 0.26667; 3 samples / 10 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.547 ms; p95 2.990; MAD 0.01750; 3 samples / 113 ops | median 108.9 ms; p95 109.5; MAD 0.70000; 3 samples / 4 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.530 ms; p95 2.700; MAD 0.18842; 3 samples / 122 ops | median 111.5 ms; p95 120.2; MAD 6.450; 3 samples / 4 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.59294 ms; p95 0.70279; MAD 0.00522; 3 samples / 481 ops | median 1.446 ms; p95 1.518; MAD 0.00000; 3 samples / 206 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.56989 ms; p95 0.71458; MAD 0.00378; 3 samples / 490 ops | median 1.904 ms; p95 1.994; MAD 0.09663; 3 samples / 159 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.81382 ms; p95 0.82204; MAD 0.00913; 3 samples / 393 ops | median 3.329 ms; p95 3.653; MAD 0.03226; 3 samples / 90 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.27778 ms; p95 0.32695; MAD 0.00101; 3 samples / 1096 ops | median 6.867 ms; p95 7.160; MAD 0.32619; 3 samples / 46 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.270 ms; p95 1.315; MAD 0.05012; 3 samples / 240 ops | median 85.050 ms; p95 90.540; MAD 5.950; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.074 ms; p95 1.145; MAD 0.03735; 3 samples / 278 ops | median 31.750 ms; p95 33.595; MAD 2.050; 3 samples / 11 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42405 ms; p95 0.44143; MAD 0.00127; 3 samples / 700 ops | median 74.550 ms; p95 75.225; MAD 0.60000; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.25575 ms; p95 0.29585; MAD 0.02511; 3 samples / 1158 ops | median 51.050 ms; p95 51.995; MAD 0.55000; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.60838 ms; p95 0.75580; MAD 0.16380; 3 samples / 540 ops | median 1.099 ms; p95 1.168; MAD 0.05098; 3 samples / 273 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.55081 ms; p95 0.57583; MAD 0.02780; 3 samples / 558 ops | median 1.597 ms; p95 1.603; MAD 0.00635; 3 samples / 192 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.48502 ms; p95 0.56626; MAD 0.03945; 3 samples / 607 ops | median 2.207 ms; p95 2.282; MAD 0.02609; 3 samples / 136 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.76412 ms; p95 0.81680; MAD 0.04555; 3 samples / 399 ops | median 31.825 ms; p95 32.567; MAD 0.07500; 3 samples / 12 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.439 ms; p95 2.851; MAD 0.13221; 3 samples / 120 ops | median 100.0 ms; p95 101.8; MAD 2.000; 3 samples / 5 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.383 ms; p95 2.695; MAD 0.11222; 3 samples / 124 ops | median 105.5 ms; p95 116.0; MAD 3.500; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.56610 ms; p95 0.59986; MAD 0.00056; 3 samples / 520 ops | median 1.518 ms; p95 1.562; MAD 0.04901; 3 samples / 202 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.58462 ms; p95 0.60724; MAD 0.02514; 3 samples / 542 ops | median 1.856 ms; p95 1.951; MAD 0.09766; 3 samples / 163 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.76061 ms; p95 0.88240; MAD 0.05356; 3 samples / 397 ops | median 3.459 ms; p95 3.549; MAD 0.10000; 3 samples / 89 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.27311 ms; p95 0.31762; MAD 0.00007; 3 samples / 1167 ops | median 6.525 ms; p95 6.621; MAD 0.08125; 3 samples / 48 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.259 ms; p95 1.287; MAD 0.01184; 3 samples / 239 ops | median 84.200 ms; p95 84.290; MAD 0.10000; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.172 ms; p95 1.180; MAD 0.00908; 3 samples / 267 ops | median 31.650 ms; p95 31.785; MAD 0.15000; 3 samples / 12 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45135 ms; p95 0.45733; MAD 0.00664; 3 samples / 680 ops | median 71.750 ms; p95 73.505; MAD 0.70000; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.26863 ms; p95 0.31813; MAD 0.03852; 3 samples / 1117 ops | median 50.950 ms; p95 51.625; MAD 0.75000; 3 samples / 7 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.50402 ms; p95 0.71840; MAD 0.05222; 3 samples / 556 ops | median 1.112 ms; p95 1.117; MAD 0.00556; 3 samples / 272 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.59702 ms; p95 0.66781; MAD 0.01726; 3 samples / 489 ops | median 1.680 ms; p95 1.706; MAD 0.02847; 3 samples / 183 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.47311 ms; p95 0.49552; MAD 0.01675; 3 samples / 633 ops | median 2.174 ms; p95 2.313; MAD 0.01489; 3 samples / 137 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 0.80076 ms; p95 0.82368; MAD 0.02547; 3 samples / 389 ops | median 33.500 ms; p95 35.480; MAD 0.72500; 3 samples / 10 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.407 ms; p95 3.090; MAD 0.02619; 3 samples / 116 ops | median 94.600 ms; p95 116.8; MAD 2.750; 3 samples / 5 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.522 ms; p95 2.945; MAD 0.05665; 3 samples / 119 ops | median 107.8 ms; p95 132.1; MAD 12.600; 3 samples / 4 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.59702 ms; p95 0.64267; MAD 0.04454; 3 samples / 504 ops | median 1.562 ms; p95 1.618; MAD 0.06266; 3 samples / 197 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.61852 ms; p95 0.62548; MAD 0.00318; 3 samples / 485 ops | median 3.826 ms; p95 4.193; MAD 0.40741; 3 samples / 112 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.76565 ms; p95 0.82656; MAD 0.06768; 3 samples / 395 ops | median 3.380 ms; p95 3.674; MAD 0.15419; 3 samples / 89 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.30000 ms; p95 0.31125; MAD 0.01250; 3 samples / 1109 ops | median 7.279 ms; p95 7.407; MAD 0.02857; 3 samples / 42 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.172 ms; p95 1.283; MAD 0.00000; 3 samples / 250 ops | median 88.700 ms; p95 91.895; MAD 1.100; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.154 ms; p95 1.227; MAD 0.02818; 3 samples / 257 ops | median 30.625 ms; p95 30.805; MAD 0.20000; 3 samples / 12 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39216 ms; p95 0.46344; MAD 0.00036; 3 samples / 724 ops | median 81.350 ms; p95 83.105; MAD 1.950; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.23858 ms; p95 0.26322; MAD 0.00633; 3 samples / 1245 ops | median 57.800 ms; p95 58.925; MAD 0.05000; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.43565 ms; p95 0.61835; MAD 0.00518; 3 samples / 626 ops | median 1.217 ms; p95 1.301; MAD 0.01084; 3 samples / 243 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.56932 ms; p95 0.57034; MAD 0.00114; 3 samples / 541 ops | median 1.491 ms; p95 1.537; MAD 0.05036; 3 samples / 203 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.44777 ms; p95 0.45180; MAD 0.00448; 3 samples / 681 ops | median 2.273 ms; p95 2.329; MAD 0.06155; 3 samples / 136 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.74044 ms; p95 0.76175; MAD 0.02368; 3 samples / 409 ops | median 32.175 ms; p95 33.487; MAD 0.97500; 3 samples / 11 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.463 ms; p95 3.061; MAD 0.33150; 3 samples / 121 ops | median 100.1 ms; p95 103.2; MAD 3.400; 3 samples / 4 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.441 ms; p95 2.782; MAD 0.01289; 3 samples / 119 ops | median 107.4 ms; p95 127.6; MAD 10.600; 3 samples / 4 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.57471 ms; p95 0.59639; MAD 0.02409; 3 samples / 534 ops | median 1.524 ms; p95 1.563; MAD 0.04295; 3 samples / 201 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.55722 ms; p95 0.60390; MAD 0.01266; 3 samples / 529 ops | median 1.878 ms; p95 1.925; MAD 0.05299; 3 samples / 163 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.82131 ms; p95 0.83624; MAD 0.00082; 3 samples / 368 ops | median 3.353 ms; p95 3.544; MAD 0.03075; 3 samples / 90 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.26064 ms; p95 0.28000; MAD 0.00647; 3 samples / 1226 ops | median 6.827 ms; p95 7.890; MAD 0.48292; 3 samples / 44 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.171 ms; p95 1.180; MAD 0.01025; 3 samples / 258 ops | median 79.900 ms; p95 84.040; MAD 2.200; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.114 ms; p95 1.150; MAD 0.01771; 3 samples / 269 ops | median 30.225 ms; p95 30.518; MAD 0.32500; 3 samples / 12 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44643 ms; p95 0.45980; MAD 0.00370; 3 samples / 668 ops | median 73.150 ms; p95 81.385; MAD 0.10000; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.24052 ms; p95 0.27757; MAD 0.02407; 3 samples / 1244 ops | median 56.700 ms; p95 58.905; MAD 2.450; 3 samples / 7 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.44821 ms; p95 0.50967; MAD 0.04459; 3 samples / 666 ops | median 1.184 ms; p95 1.211; MAD 0.01144; 3 samples / 254 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.50150 ms; p95 0.51025; MAD 0.00596; 3 samples / 598 ops | median 1.467 ms; p95 1.573; MAD 0.01238; 3 samples / 203 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.45753 ms; p95 0.50443; MAD 0.02334; 3 samples / 647 ops | median 2.314 ms; p95 2.322; MAD 0.00909; 3 samples / 133 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 0.75564 ms; p95 0.76602; MAD 0.01154; 3 samples / 399 ops | median 34.100 ms; p95 34.580; MAD 0.53333; 3 samples / 10 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.433 ms; p95 2.882; MAD 0.07054; 3 samples / 123 ops | median 107.3 ms; p95 117.9; MAD 6.800; 3 samples / 3 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.545 ms; p95 2.787; MAD 0.17523; 3 samples / 119 ops | median 110.0 ms; p95 111.7; MAD 1.900; 3 samples / 3 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.66118 ms; p95 0.68317; MAD 0.02443; 3 samples / 467 ops | median 1.499 ms; p95 1.540; MAD 0.04611; 3 samples / 203 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.56610 ms; p95 0.65049; MAD 0.02394; 3 samples / 514 ops | median 1.927 ms; p95 1.993; MAD 0.07308; 3 samples / 159 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.83500 ms; p95 0.83650; MAD 0.00167; 3 samples / 384 ops | median 3.462 ms; p95 3.706; MAD 0.01379; 3 samples / 85 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.30488 ms; p95 0.33352; MAD 0.01444; 3 samples / 1012 ops | median 6.135 ms; p95 6.204; MAD 0.03529; 3 samples / 51 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.208 ms; p95 1.266; MAD 0.01902; 3 samples / 247 ops | median 83.500 ms; p95 88.360; MAD 1.200; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.222 ms; p95 1.238; MAD 0.01755; 3 samples / 255 ops | median 31.925 ms; p95 32.420; MAD 0.05000; 3 samples / 12 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.46083 ms; p95 0.48774; MAD 0.00000; 3 samples / 639 ops | median 73.300 ms; p95 77.980; MAD 0.05000; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.25381 ms; p95 0.33391; MAD 0.01260; 3 samples / 1101 ops | median 56.200 ms; p95 57.010; MAD 0.90000; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.52408 ms; p95 0.77745; MAD 0.02831; 3 samples / 529 ops | median 1.189 ms; p95 1.253; MAD 0.03424; 3 samples / 252 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.58824 ms; p95 0.61549; MAD 0.03028; 3 samples / 524 ops | median 1.615 ms; p95 1.707; MAD 0.02563; 3 samples / 184 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.44533 ms; p95 0.54503; MAD 0.00498; 3 samples / 633 ops | median 2.244 ms; p95 2.296; MAD 0.00667; 3 samples / 134 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 0.74148 ms; p95 0.74615; MAD 0.00519; 3 samples / 408 ops | median 31.875 ms; p95 32.797; MAD 0.10000; 3 samples / 12 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.532 ms; p95 2.866; MAD 0.08616; 3 samples / 121 ops | median 108.3 ms; p95 116.3; MAD 8.850; 3 samples / 5 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.730 ms; p95 2.865; MAD 0.15027; 3 samples / 117 ops | median 102.5 ms; p95 111.0; MAD 5.550; 3 samples / 5 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.55304 ms; p95 0.57658; MAD 0.00956; 3 samples / 538 ops | median 1.546 ms; p95 1.632; MAD 0.09483; 3 samples / 196 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.58372 ms; p95 0.60880; MAD 0.01875; 3 samples / 513 ops | median 1.978 ms; p95 2.019; MAD 0.04557; 3 samples / 153 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.80400 ms; p95 0.86739; MAD 0.00323; 3 samples / 388 ops | median 3.400 ms; p95 3.515; MAD 0.05484; 3 samples / 90 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.29129 ms; p95 0.30661; MAD 0.01701; 3 samples / 1090 ops | median 7.679 ms; p95 7.685; MAD 0.00714; 3 samples / 42 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.348 ms; p95 1.479; MAD 0.00933; 3 samples / 217 ops | median 83.100 ms; p95 91.965; MAD 3.950; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.196 ms; p95 1.256; MAD 0.06607; 3 samples / 256 ops | median 28.150 ms; p95 28.285; MAD 0.10000; 3 samples / 12 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45022 ms; p95 0.45164; MAD 0.00158; 3 samples / 671 ops | median 72.950 ms; p95 77.180; MAD 2.800; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.24096 ms; p95 0.33941; MAD 0.00320; 3 samples / 1122 ops | median 56.300 ms; p95 58.370; MAD 2.300; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.43147 ms; p95 0.66508; MAD 0.01130; 3 samples / 615 ops | median 1.241 ms; p95 1.270; MAD 0.02749; 3 samples / 243 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.63354 ms; p95 0.65182; MAD 0.02030; 3 samples / 496 ops | median 1.485 ms; p95 1.550; MAD 0.02153; 3 samples / 202 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.45022 ms; p95 0.49774; MAD 0.02104; 3 samples / 655 ops | median 2.189 ms; p95 2.266; MAD 0.04019; 3 samples / 137 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 0.81654 ms; p95 0.83871; MAD 0.02464; 3 samples / 384 ops | median 33.567 ms; p95 34.917; MAD 1.492; 3 samples / 10 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.545 ms; p95 3.089; MAD 0.32056; 3 samples / 117 ops | median 100.3 ms; p95 103.2; MAD 3.150; 3 samples / 4 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.661 ms; p95 2.701; MAD 0.04488; 3 samples / 119 ops | median 112.5 ms; p95 122.0; MAD 5.900; 3 samples / 4 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.58655 ms; p95 0.59230; MAD 0.00283; 3 samples / 513 ops | median 1.440 ms; p95 1.445; MAD 0.00571; 3 samples / 211 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.64140 ms; p95 0.65001; MAD 0.00957; 3 samples / 491 ops | median 1.782 ms; p95 1.858; MAD 0.02456; 3 samples / 168 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.74776 ms; p95 0.87139; MAD 0.06009; 3 samples / 401 ops | median 3.486 ms; p95 3.489; MAD 0.00345; 3 samples / 89 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.35035 ms; p95 0.35678; MAD 0.00715; 3 samples / 960 ops | median 6.519 ms; p95 6.603; MAD 0.09375; 3 samples / 48 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.263 ms; p95 1.413; MAD 0.14694; 3 samples / 240 ops | median 86.950 ms; p95 87.220; MAD 0.30000; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.184 ms; p95 1.185; MAD 0.00118; 3 samples / 262 ops | median 31.900 ms; p95 33.400; MAD 1.667; 3 samples / 11 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45708 ms; p95 0.46993; MAD 0.01428; 3 samples / 670 ops | median 75.100 ms; p95 78.655; MAD 0.60000; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.24934 ms; p95 0.26866; MAD 0.02147; 3 samples / 1273 ops | median 54.250 ms; p95 57.445; MAD 1.450; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.53175 ms; p95 0.84581; MAD 0.04199; 3 samples / 508 ops | median 1.145 ms; p95 1.188; MAD 0.04106; 3 samples / 264 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.61790 ms; p95 0.65901; MAD 0.04567; 3 samples / 493 ops | median 1.673 ms; p95 1.691; MAD 0.02000; 3 samples / 182 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.46558 ms; p95 0.46796; MAD 0.00264; 3 samples / 663 ops | median 2.305 ms; p95 2.472; MAD 0.14710; 3 samples / 132 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.81496 ms; p95 0.88325; MAD 0.06421; 3 samples / 381 ops | median 32.875 ms; p95 36.257; MAD 0.42500; 3 samples / 11 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.577 ms; p95 2.668; MAD 0.10165; 3 samples / 126 ops | median 101.8 ms; p95 109.9; MAD 5.450; 3 samples / 5 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.714 ms; p95 2.845; MAD 0.14649; 3 samples / 119 ops | median 108.7 ms; p95 116.6; MAD 0.80000; 3 samples / 3 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.58372 ms; p95 0.65678; MAD 0.00116; 3 samples / 495 ops | median 1.434 ms; p95 1.462; MAD 0.03093; 3 samples / 212 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.65325 ms; p95 0.68063; MAD 0.00065; 3 samples / 455 ops | median 2.090 ms; p95 2.105; MAD 0.01667; 3 samples / 150 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.78188 ms; p95 0.87624; MAD 0.06102; 3 samples / 401 ops | median 3.625 ms; p95 3.859; MAD 0.08362; 3 samples / 83 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.25012 ms; p95 0.36375; MAD 0.00380; 3 samples / 1126 ops | median 6.920 ms; p95 7.058; MAD 0.15333; 3 samples / 45 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.290 ms; p95 1.400; MAD 0.08617; 3 samples / 233 ops | median 81.150 ms; p95 84.975; MAD 2.650; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.280 ms; p95 1.284; MAD 0.00487; 3 samples / 241 ops | median 30.200 ms; p95 31.145; MAD 0.70000; 3 samples / 12 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.56517 ms; p95 0.57583; MAD 0.01184; 3 samples / 543 ops | median 81.500 ms; p95 87.125; MAD 2.400; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.25854 ms; p95 0.30046; MAD 0.00916; 3 samples / 1133 ops | median 52.550 ms; p95 56.510; MAD 2.200; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.51020 ms; p95 0.76027; MAD 0.00690; 3 samples / 542 ops | median 1.176 ms; p95 1.259; MAD 0.04838; 3 samples / 253 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.60120 ms; p95 0.67431; MAD 0.05256; 3 samples / 498 ops | median 1.546 ms; p95 1.563; MAD 0.01846; 3 samples / 201 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.47810 ms; p95 0.48180; MAD 0.00179; 3 samples / 629 ops | median 2.209 ms; p95 2.372; MAD 0.01739; 3 samples / 134 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 0.80160 ms; p95 0.82619; MAD 0.00391; 3 samples / 376 ops | median 38.800 ms; p95 40.870; MAD 1.067; 3 samples / 9 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.564 ms; p95 2.956; MAD 0.11288; 3 samples / 114 ops | median 102.0 ms; p95 104.1; MAD 2.350; 3 samples / 5 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.613 ms; p95 2.966; MAD 0.18901; 3 samples / 117 ops | median 118.4 ms; p95 137.0; MAD 7.400; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.61098 ms; p95 0.62940; MAD 0.01395; 3 samples / 491 ops | median 1.482 ms; p95 1.501; MAD 0.01235; 3 samples / 206 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.65260 ms; p95 0.65318; MAD 0.00065; 3 samples / 496 ops | median 1.835 ms; p95 1.937; MAD 0.00000; 3 samples / 162 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.77417 ms; p95 0.79527; MAD 0.02345; 3 samples / 414 ops | median 3.222 ms; p95 3.540; MAD 0.03125; 3 samples / 92 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.30488 ms; p95 0.35658; MAD 0.02787; 3 samples / 981 ops | median 6.550 ms; p95 6.618; MAD 0.06875; 3 samples / 48 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
