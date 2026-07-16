# Auditable render benchmark

Protocol version: **1**  
Run ID: `7cce90f7-3dfa-46c7-b41c-4827e2ef5d95`  
Matrix: **complete with structured failures**

> Comparative headline ratios are intentionally omitted because one or more cells failed.

## Environment

| Field | Value |
|:--|:--|
| Commit | `a6c58917df64ea82e297f829fdeb99253fe5ce0e` (clean) |
| Timestamp | 2026-07-16T19:08:29.701Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.1.0; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 1,000 rows = `fnv1a32:66e40094`; 10,000 rows = `fnv1a32:a3ea4bd5`; 100,000 rows = `fnv1a32:178eac66`; 1,000,000 rows = `fnv1a32:cd4c521f` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 80 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 1,000 | [`r1-1000-scroll-down.top-left`](./render-results.json) | median 1.281 ms; p95 1.329; MAD 0.05365; 3 samples / 240 ops | median 26.525 ms; p95 26.863; MAD 0.27500; 3 samples / 12 ops |
| 1 | 1,000 | [`r1-1000-scroll-down.middle`](./render-results.json) | median 1.096 ms; p95 1.188; MAD 0.03986; 3 samples / 271 ops | median 4.387 ms; p95 5.038; MAD 0.10362; 3 samples / 67 ops |
| 1 | 1,000 | [`r1-1000-scroll-smooth.same-window`](./render-results.json) | median 0.43377 ms; p95 0.49838; MAD 0.01710; 3 samples / 669 ops | median 23.880 ms; p95 24.042; MAD 0.18000; 3 samples / 15 ops |
| 1 | 1,000 | [`r1-1000-scroll-right.top-left`](./render-results.json) | median 0.24864 ms; p95 0.26704; MAD 0.01199; 3 samples / 1198 ops | median 24.080 ms; p95 27.810; MAD 1.340; 3 samples / 14 ops |
| 1 | 1,000 | [`r1-1000-edit-open.top-left`](./render-results.json) | median 0.44454 ms; p95 0.99133; MAD 0.01264; 3 samples / 557 ops | median 1.297 ms; p95 1.465; MAD 0.02402; 3 samples / 225 ops |
| 1 | 1,000 | [`r1-1000-edit-open.middle`](./render-results.json) | median 0.54086 ms; p95 0.56940; MAD 0.00557; 3 samples / 548 ops | median 1.208 ms; p95 1.232; MAD 0.02571; 3 samples / 252 ops |
| 1 | 1,000 | [`r1-1000-edit-open.bottom-right`](./render-results.json) | median 0.43636 ms; p95 0.46786; MAD 0.00859; 3 samples / 678 ops | median 1.670 ms; p95 1.844; MAD 0.00607; 3 samples / 175 ops |
| 1 | 1,000 | [`r1-1000-edit-commit.middle`](./render-results.json) | median 0.76794 ms; p95 0.78900; MAD 0.02340; 3 samples / 397 ops | median 5.170 ms; p95 5.282; MAD 0.12474; 3 samples / 60 ops |
| 1 | 1,000 | [`r1-1000-altering.insert-5-rows-top`](./render-results.json) | median 1.015 ms; p95 1.244; MAD 0.21515; 3 samples / 303 ops | median 18.467 ms; p95 18.572; MAD 0.11667; 3 samples / 18 ops |
| 1 | 1,000 | [`r1-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.92294 ms; p95 0.99679; MAD 0.08206; 3 samples / 349 ops | median 21.480 ms; p95 22.506; MAD 1.140; 3 samples / 16 ops |
| 1 | 1,000 | [`r1-1000-arrow-down.top-left`](./render-results.json) | median 0.64903 ms; p95 0.65431; MAD 0.00587; 3 samples / 477 ops | median 1.440 ms; p95 1.621; MAD 0.07919; 3 samples / 205 ops |
| 1 | 1,000 | [`r1-1000-arrow-right.middle`](./render-results.json) | median 0.66556 ms; p95 0.72678; MAD 0.05829; 3 samples / 453 ops | median 1.335 ms; p95 1.393; MAD 0.04877; 3 samples / 225 ops |
| 1 | 1,000 | [`r1-1000-formatted-paint.top-left`](./render-results.json) | median 0.85641 ms; p95 0.90628; MAD 0.05541; 3 samples / 365 ops | median 3.462 ms; p95 3.502; MAD 0.04483; 3 samples / 90 ops |
| 1 | 1,000 | [`r1-1000-merge-heavy.paint`](./render-results.json) | median 0.29949 ms; p95 0.33815; MAD 0.02248; 3 samples / 1064 ops | median 3.958 ms; p95 4.086; MAD 0.14231; 3 samples / 78 ops |
| 1 | 10,000 | [`r1-10000-scroll-down.top-left`](./render-results.json) | median 1.216 ms; p95 1.224; MAD 0.00873; 3 samples / 251 ops | median 34.400 ms; p95 36.710; MAD 0.35000; 3 samples / 10 ops |
| 1 | 10,000 | [`r1-10000-scroll-down.middle`](./render-results.json) | median 1.075 ms; p95 1.194; MAD 0.02527; 3 samples / 272 ops | median 6.375 ms; p95 7.021; MAD 0.10441; 3 samples / 48 ops |
| 1 | 10,000 | [`r1-10000-scroll-smooth.same-window`](./render-results.json) | median 0.41276 ms; p95 0.43089; MAD 0.00210; 3 samples / 718 ops | median 30.850 ms; p95 31.030; MAD 0.20000; 3 samples / 12 ops |
| 1 | 10,000 | [`r1-10000-scroll-right.top-left`](./render-results.json) | median 0.31546 ms; p95 0.31909; MAD 0.00403; 3 samples / 1077 ops | median 28.875 ms; p95 30.990; MAD 2.175; 3 samples / 12 ops |
| 1 | 10,000 | [`r1-10000-edit-open.top-left`](./render-results.json) | median 0.48738 ms; p95 0.49212; MAD 0.00527; 3 samples / 619 ops | median 1.172 ms; p95 1.190; MAD 0.01957; 3 samples / 263 ops |
| 1 | 10,000 | [`r1-10000-edit-open.middle`](./render-results.json) | median 0.65987 ms; p95 0.72207; MAD 0.05686; 3 samples / 456 ops | median 1.188 ms; p95 1.197; MAD 0.00235; 3 samples / 254 ops |
| 1 | 10,000 | [`r1-10000-edit-open.bottom-right`](./render-results.json) | median 0.75149 ms; p95 1.019; MAD 0.05908; 3 samples / 375 ops | median 1.831 ms; p95 1.928; MAD 0.02019; 3 samples / 163 ops |
| 1 | 10,000 | [`r1-10000-edit-commit.middle`](./render-results.json) | median 0.78438 ms; p95 0.95921; MAD 0.00078; 3 samples / 359 ops | median 8.254 ms; p95 8.261; MAD 0.00769; 3 samples / 40 ops |
| 1 | 10,000 | [`r1-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.143 ms; p95 1.206; MAD 0.01509; 3 samples / 260 ops | median 27.000 ms; p95 27.585; MAD 0.65000; 3 samples / 12 ops |
| 1 | 10,000 | [`r1-10000-altering.remove-5-rows-top`](./render-results.json) | median 1.001 ms; p95 1.217; MAD 0.01375; 3 samples / 283 ops | median 26.975 ms; p95 31.565; MAD 0.52500; 3 samples / 12 ops |
| 1 | 10,000 | [`r1-10000-arrow-down.top-left`](./render-results.json) | median 0.64839 ms; p95 0.70498; MAD 0.03741; 3 samples / 461 ops | median 1.526 ms; p95 1.686; MAD 0.07503; 3 samples / 194 ops |
| 1 | 10,000 | [`r1-10000-arrow-right.middle`](./render-results.json) | median 0.60727 ms; p95 0.64311; MAD 0.00548; 3 samples / 487 ops | median 1.464 ms; p95 1.548; MAD 0.09337; 3 samples / 214 ops |
| 1 | 10,000 | [`r1-10000-formatted-paint.top-left`](./render-results.json) | median 0.78898 ms; p95 0.84882; MAD 0.06649; 3 samples / 409 ops | median 3.219 ms; p95 3.334; MAD 0.01250; 3 samples / 94 ops |
| 1 | 10,000 | [`r1-10000-merge-heavy.paint`](./render-results.json) | median 0.30119 ms; p95 0.34527; MAD 0.04478; 3 samples / 1018 ops | median 4.164 ms; p95 4.416; MAD 0.05600; 3 samples / 73 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.282 ms; p95 1.348; MAD 0.06010; 3 samples / 234 ops | median 78.900 ms; p95 84.885; MAD 0.35000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.254 ms; p95 1.279; MAD 0.02830; 3 samples / 250 ops | median 32.025 ms; p95 32.273; MAD 0.27500; 3 samples / 12 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44578 ms; p95 0.46850; MAD 0.00910; 3 samples / 668 ops | median 83.800 ms; p95 108.7; MAD 7.300; 3 samples / 5 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.24179 ms; p95 0.32180; MAD 0.01634; 3 samples / 1161 ops | median 57.350 ms; p95 57.395; MAD 0.05000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.54402 ms; p95 0.74563; MAD 0.08740; 3 samples / 550 ops | median 1.247 ms; p95 1.253; MAD 0.00684; 3 samples / 244 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.52513 ms; p95 0.57914; MAD 0.00221; 3 samples / 558 ops | median 1.494 ms; p95 1.634; MAD 0.02050; 3 samples / 196 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.46822 ms; p95 0.55263; MAD 0.01777; 3 samples / 615 ops | median 2.282 ms; p95 2.371; MAD 0.04182; 3 samples / 131 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.75985 ms; p95 0.77785; MAD 0.00571; 3 samples / 394 ops | median 38.567 ms; p95 39.047; MAD 0.53333; 3 samples / 9 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.212 ms; p95 3.738; MAD 0.34107; 3 samples / 94 ops | median 113.3 ms; p95 115.7; MAD 2.700; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.909 ms; p95 2.909; MAD 0.00000; 3 samples / 107 ops | median 108.8 ms; p95 112.3; MAD 0.20000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.61159 ms; p95 0.62580; MAD 0.01337; 3 samples / 500 ops | median 1.542 ms; p95 1.565; MAD 0.02565; 3 samples / 203 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.61030 ms; p95 0.67932; MAD 0.07668; 3 samples / 504 ops | median 1.915 ms; p95 1.947; MAD 0.03491; 3 samples / 159 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.79524 ms; p95 0.86526; MAD 0.01462; 3 samples / 370 ops | median 3.614 ms; p95 3.682; MAD 0.07500; 3 samples / 86 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.34364 ms; p95 0.39153; MAD 0.05000; 3 samples / 954 ops | median 6.887 ms; p95 7.091; MAD 0.22667; 3 samples / 46 ops |
| 1 | 1,000,000 | [`r1-1000000-scroll-down.top-left`](./render-results.json) | median 1.738 ms; p95 1.904; MAD 0.18471; 3 samples / 179 ops | median 682.9 ms; p95 691.2; MAD 9.200; 3 samples / 3 ops |
| 1 | 1,000,000 | [`r1-1000000-scroll-down.middle`](./render-results.json) | median 1.066 ms; p95 1.610; MAD 0.01122; 3 samples / 249 ops | median 322.8 ms; p95 328.6; MAD 6.400; 3 samples / 3 ops |
| 1 | 1,000,000 | [`r1-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.44097 ms; p95 0.45031; MAD 0.00634; 3 samples / 680 ops | median 705.9 ms; p95 749.2; MAD 48.100; 3 samples / 3 ops |
| 1 | 1,000,000 | [`r1-1000000-scroll-right.top-left`](./render-results.json) | median 0.26210 ms; p95 0.29919; MAD 0.04121; 3 samples / 1224 ops | median 341.5 ms; p95 348.4; MAD 1.800; 3 samples / 3 ops |
| 1 | 1,000,000 | [`r1-1000000-edit-open.top-left`](./render-results.json) | median 0.48317 ms; p95 0.63012; MAD 0.03340; 3 samples / 586 ops | median 1.162 ms; p95 1.246; MAD 0.06533; 3 samples / 259 ops |
| 1 | 1,000,000 | [`r1-1000000-edit-open.middle`](./render-results.json) | median 0.50352 ms; p95 0.66321; MAD 0.03403; 3 samples / 559 ops | median 1.782 ms; p95 1.795; MAD 0.01053; 3 samples / 170 ops |
| 1 | 1,000,000 | [`r1-1000000-edit-open.bottom-right`](./render-results.json) | median 0.41322 ms; p95 0.57232; MAD 0.02295; 3 samples / 669 ops | median 2.347 ms; p95 2.436; MAD 0.00465; 3 samples / 127 ops |
| 1 | 1,000,000 | [`r1-1000000-edit-commit.middle`](./render-results.json) | median 0.65621 ms; p95 3.687; MAD 0.00131; 3 samples / 331 ops | median 324.3 ms; p95 336.5; MAD 10.400; 3 samples / 3 ops |
| 1 | 1,000,000 | [`r1-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.467 ms; p95 19.572; MAD 0.11667; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 1 | 1,000,000 | [`r1-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.433 ms; p95 19.448; MAD 0.01667; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 1 | 1,000,000 | [`r1-1000000-arrow-down.top-left`](./render-results.json) | median 0.75758 ms; p95 0.80185; MAD 0.04919; 3 samples / 410 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 1 | 1,000,000 | [`r1-1000000-arrow-right.middle`](./render-results.json) | median 0.96000 ms; p95 1.313; MAD 0.08435; 3 samples / 294 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 1 | 1,000,000 | [`r1-1000000-formatted-paint.top-left`](./render-results.json) | median 0.65490 ms; p95 0.84422; MAD 0.00910; 3 samples / 426 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 1 | 1,000,000 | [`r1-1000000-merge-heavy.paint`](./render-results.json) | median 0.27677 ms; p95 0.31251; MAD 0.00496; 3 samples / 1169 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 2 | 1,000 | [`r2-1000-scroll-down.top-left`](./render-results.json) | median 1.168 ms; p95 1.182; MAD 0.00154; 3 samples / 258 ops | median 34.600 ms; p95 35.710; MAD 1.233; 3 samples / 11 ops |
| 2 | 1,000 | [`r2-1000-scroll-down.middle`](./render-results.json) | median 1.181 ms; p95 1.191; MAD 0.01049; 3 samples / 262 ops | median 5.075 ms; p95 5.263; MAD 0.19405; 3 samples / 60 ops |
| 2 | 1,000 | [`r2-1000-scroll-smooth.same-window`](./render-results.json) | median 0.47089 ms; p95 0.49980; MAD 0.01999; 3 samples / 634 ops | median 24.460 ms; p95 33.586; MAD 1.780; 3 samples / 13 ops |
| 2 | 1,000 | [`r2-1000-scroll-right.top-left`](./render-results.json) | median 0.29615 ms; p95 0.30262; MAD 0.00718; 3 samples / 1124 ops | median 30.100 ms; p95 33.040; MAD 1.475; 3 samples / 11 ops |
| 2 | 1,000 | [`r2-1000-edit-open.top-left`](./render-results.json) | median 0.45500 ms; p95 0.50796; MAD 0.01164; 3 samples / 641 ops | median 1.336 ms; p95 1.430; MAD 0.01100; 3 samples / 221 ops |
| 2 | 1,000 | [`r2-1000-edit-open.middle`](./render-results.json) | median 0.55611 ms; p95 0.56902; MAD 0.01434; 3 samples / 556 ops | median 1.232 ms; p95 1.301; MAD 0.01098; 3 samples / 241 ops |
| 2 | 1,000 | [`r2-1000-edit-open.bottom-right`](./render-results.json) | median 0.45917 ms; p95 0.46232; MAD 0.00350; 3 samples / 664 ops | median 1.971 ms; p95 2.002; MAD 0.03541; 3 samples / 153 ops |
| 2 | 1,000 | [`r2-1000-edit-commit.middle`](./render-results.json) | median 0.77000 ms; p95 0.77467; MAD 0.00519; 3 samples / 396 ops | median 6.727 ms; p95 7.281; MAD 0.17667; 3 samples / 45 ops |
| 2 | 1,000 | [`r2-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.93056 ms; p95 1.077; MAD 0.09306; 3 samples / 331 ops | median 23.620 ms; p95 24.574; MAD 0.26000; 3 samples / 15 ops |
| 2 | 1,000 | [`r2-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.93056 ms; p95 1.109; MAD 0.18833; 3 samples / 341 ops | median 25.150 ms; p95 26.072; MAD 1.025; 3 samples / 13 ops |
| 2 | 1,000 | [`r2-1000-arrow-down.top-left`](./render-results.json) | median 0.59231 ms; p95 0.60357; MAD 0.00859; 3 samples / 507 ops | median 1.530 ms; p95 1.549; MAD 0.02047; 3 samples / 200 ops |
| 2 | 1,000 | [`r2-1000-arrow-right.middle`](./render-results.json) | median 0.59408 ms; p95 0.63922; MAD 0.04760; 3 samples / 510 ops | median 1.487 ms; p95 1.500; MAD 0.01473; 3 samples / 208 ops |
| 2 | 1,000 | [`r2-1000-formatted-paint.top-left`](./render-results.json) | median 0.72681 ms; p95 0.83867; MAD 0.07968; 3 samples / 432 ops | median 3.306 ms; p95 3.699; MAD 0.04194; 3 samples / 90 ops |
| 2 | 1,000 | [`r2-1000-merge-heavy.paint`](./render-results.json) | median 0.24087 ms; p95 0.34072; MAD 0.01056; 3 samples / 1171 ops | median 3.846 ms; p95 4.476; MAD 0.12830; 3 samples / 76 ops |
| 2 | 10,000 | [`r2-10000-scroll-down.top-left`](./render-results.json) | median 1.227 ms; p95 1.359; MAD 0.03977; 3 samples / 240 ops | median 32.950 ms; p95 35.335; MAD 0.60000; 3 samples / 11 ops |
| 2 | 10,000 | [`r2-10000-scroll-down.middle`](./render-results.json) | median 1.182 ms; p95 1.195; MAD 0.01408; 3 samples / 260 ops | median 6.767 ms; p95 7.711; MAD 0.32292; 3 samples / 44 ops |
| 2 | 10,000 | [`r2-10000-scroll-smooth.same-window`](./render-results.json) | median 0.44578 ms; p95 0.50468; MAD 0.00718; 3 samples / 649 ops | median 35.075 ms; p95 37.258; MAD 1.525; 3 samples / 11 ops |
| 2 | 10,000 | [`r2-10000-scroll-right.top-left`](./render-results.json) | median 0.28118 ms; p95 0.34578; MAD 0.03668; 3 samples / 1086 ops | median 31.550 ms; p95 40.775; MAD 0.12500; 3 samples / 11 ops |
| 2 | 10,000 | [`r2-10000-edit-open.top-left`](./render-results.json) | median 0.47990 ms; p95 0.52976; MAD 0.00371; 3 samples / 606 ops | median 1.550 ms; p95 2.099; MAD 0.00077; 3 samples / 178 ops |
| 2 | 10,000 | [`r2-10000-edit-open.middle`](./render-results.json) | median 0.52910 ms; p95 0.61013; MAD 0.00527; 3 samples / 544 ops | median 1.257 ms; p95 1.588; MAD 0.14651; 3 samples / 233 ops |
| 2 | 10,000 | [`r2-10000-edit-open.bottom-right`](./render-results.json) | median 0.48173 ms; p95 0.48507; MAD 0.00371; 3 samples / 624 ops | median 1.793 ms; p95 1.803; MAD 0.01071; 3 samples / 170 ops |
| 2 | 10,000 | [`r2-10000-edit-commit.middle`](./render-results.json) | median 0.79603 ms; p95 0.80541; MAD 0.01042; 3 samples / 387 ops | median 7.600 ms; p95 7.815; MAD 0.23846; 3 samples / 41 ops |
| 2 | 10,000 | [`r2-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.065 ms; p95 1.233; MAD 0.00922; 3 samples / 271 ops | median 27.975 ms; p95 29.730; MAD 0.35000; 3 samples / 12 ops |
| 2 | 10,000 | [`r2-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.92593 ms; p95 1.291; MAD 0.02412; 3 samples / 301 ops | median 28.850 ms; p95 29.885; MAD 0.32500; 3 samples / 12 ops |
| 2 | 10,000 | [`r2-10000-arrow-down.top-left`](./render-results.json) | median 0.68299 ms; p95 0.69830; MAD 0.01701; 3 samples / 457 ops | median 1.440 ms; p95 1.449; MAD 0.01000; 3 samples / 211 ops |
| 2 | 10,000 | [`r2-10000-arrow-right.middle`](./render-results.json) | median 0.70207 ms; p95 0.76341; MAD 0.05335; 3 samples / 432 ops | median 1.468 ms; p95 1.830; MAD 0.00870; 3 samples / 192 ops |
| 2 | 10,000 | [`r2-10000-formatted-paint.top-left`](./render-results.json) | median 0.84034 ms; p95 1.036; MAD 0.04430; 3 samples / 357 ops | median 3.134 ms; p95 3.160; MAD 0.02813; 3 samples / 97 ops |
| 2 | 10,000 | [`r2-10000-merge-heavy.paint`](./render-results.json) | median 0.28321 ms; p95 0.29645; MAD 0.01471; 3 samples / 1120 ops | median 3.668 ms; p95 3.671; MAD 0.00000; 3 samples / 84 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.211 ms; p95 1.501; MAD 0.12171; 3 samples / 241 ops | median 90.400 ms; p95 92.110; MAD 1.050; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.126 ms; p95 1.153; MAD 0.02694; 3 samples / 267 ops | median 34.933 ms; p95 35.413; MAD 0.16667; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42596 ms; p95 0.49170; MAD 0.00191; 3 samples / 673 ops | median 91.600 ms; p95 114.9; MAD 4.600; 3 samples / 5 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.24541 ms; p95 0.31129; MAD 0.01530; 3 samples / 1209 ops | median 59.350 ms; p95 60.745; MAD 1.550; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.63822 ms; p95 0.69382; MAD 0.06178; 3 samples / 540 ops | median 1.251 ms; p95 1.307; MAD 0.06174; 3 samples / 242 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.57314 ms; p95 0.59996; MAD 0.02980; 3 samples / 543 ops | median 1.515 ms; p95 1.622; MAD 0.03280; 3 samples / 196 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.46129 ms; p95 0.53095; MAD 0.01039; 3 samples / 638 ops | median 2.320 ms; p95 2.375; MAD 0.06050; 3 samples / 131 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.79070 ms; p95 0.82489; MAD 0.03799; 3 samples / 388 ops | median 36.333 ms; p95 36.513; MAD 0.20000; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.634 ms; p95 2.878; MAD 0.27112; 3 samples / 125 ops | median 95.900 ms; p95 109.8; MAD 0.95000; 3 samples / 5 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.483 ms; p95 3.103; MAD 0.33612; 3 samples / 120 ops | median 113.9 ms; p95 119.8; MAD 2.600; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.62750 ms; p95 0.64630; MAD 0.02089; 3 samples / 486 ops | median 1.475 ms; p95 1.542; MAD 0.00441; 3 samples / 201 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.57919 ms; p95 0.65062; MAD 0.03354; 3 samples / 509 ops | median 2.014 ms; p95 2.028; MAD 0.01600; 3 samples / 154 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.73188 ms; p95 0.93429; MAD 0.07829; 3 samples / 409 ops | median 3.528 ms; p95 3.716; MAD 0.06207; 3 samples / 85 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.31437 ms; p95 0.31715; MAD 0.00309; 3 samples / 1001 ops | median 7.762 ms; p95 7.803; MAD 0.04615; 3 samples / 39 ops |
| 2 | 1,000,000 | [`r2-1000000-scroll-down.top-left`](./render-results.json) | median 1.386 ms; p95 1.389; MAD 0.00137; 3 samples / 219 ops | median 774.5 ms; p95 780.3; MAD 6.400; 3 samples / 3 ops |
| 2 | 1,000,000 | [`r2-1000000-scroll-down.middle`](./render-results.json) | median 1.070 ms; p95 3.111; MAD 0.07813; 3 samples / 232 ops | median 326.8 ms; p95 339.4; MAD 14.000; 3 samples / 3 ops |
| 2 | 1,000,000 | [`r2-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.42821 ms; p95 0.45314; MAD 0.01112; 3 samples / 694 ops | median 713.0 ms; p95 748.0; MAD 7.300; 3 samples / 3 ops |
| 2 | 1,000,000 | [`r2-1000000-scroll-right.top-left`](./render-results.json) | median 0.25897 ms; p95 0.28039; MAD 0.02379; 3 samples / 1241 ops | median 345.3 ms; p95 363.8; MAD 10.000; 3 samples / 3 ops |
| 2 | 1,000,000 | [`r2-1000000-edit-open.top-left`](./render-results.json) | median 0.48927 ms; p95 1.360; MAD 0.03082; 3 samples / 505 ops | median 1.216 ms; p95 1.278; MAD 0.06895; 3 samples / 255 ops |
| 2 | 1,000,000 | [`r2-1000000-edit-open.middle`](./render-results.json) | median 0.49167 ms; p95 0.61335; MAD 0.01042; 3 samples / 572 ops | median 1.857 ms; p95 1.959; MAD 0.10051; 3 samples / 163 ops |
| 2 | 1,000,000 | [`r2-1000000-edit-open.bottom-right`](./render-results.json) | median 0.42906 ms; p95 0.63620; MAD 0.02299; 3 samples / 633 ops | median 2.410 ms; p95 2.478; MAD 0.06534; 3 samples / 126 ops |
| 2 | 1,000,000 | [`r2-1000000-edit-commit.middle`](./render-results.json) | median 0.72086 ms; p95 0.74209; MAD 0.02358; 3 samples / 420 ops | median 333.9 ms; p95 373.3; MAD 13.700; 3 samples / 3 ops |
| 2 | 1,000,000 | [`r2-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.467 ms; p95 19.527; MAD 0.06667; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 2 | 1,000,000 | [`r2-1000000-altering.remove-5-rows-top`](./render-results.json) | median 20.300 ms; p95 20.390; MAD 0.10000; 3 samples / 16 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 2 | 1,000,000 | [`r2-1000000-arrow-down.top-left`](./render-results.json) | median 0.67963 ms; p95 0.85292; MAD 0.09308; 3 samples / 448 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 2 | 1,000,000 | [`r2-1000000-arrow-right.middle`](./render-results.json) | median 1.008 ms; p95 1.705; MAD 0.41276; 3 samples / 331 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 2 | 1,000,000 | [`r2-1000000-formatted-paint.top-left`](./render-results.json) | median 0.75263 ms; p95 1.045; MAD 0.09904; 3 samples / 379 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 2 | 1,000,000 | [`r2-1000000-merge-heavy.paint`](./render-results.json) | median 0.33531 ms; p95 0.41661; MAD 0.07869; 3 samples / 1001 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 3 | 1,000 | [`r3-1000-scroll-down.top-left`](./render-results.json) | median 1.411 ms; p95 1.453; MAD 0.04670; 3 samples / 214 ops | median 26.950 ms; p95 33.415; MAD 0.15000; 3 samples / 11 ops |
| 3 | 1,000 | [`r3-1000-scroll-down.middle`](./render-results.json) | median 1.271 ms; p95 1.566; MAD 0.11341; 3 samples / 229 ops | median 5.000 ms; p95 5.036; MAD 0.04000; 3 samples / 63 ops |
| 3 | 1,000 | [`r3-1000-scroll-smooth.same-window`](./render-results.json) | median 0.49216 ms; p95 0.50698; MAD 0.01647; 3 samples / 626 ops | median 22.020 ms; p95 25.174; MAD 0.34000; 3 samples / 14 ops |
| 3 | 1,000 | [`r3-1000-scroll-right.top-left`](./render-results.json) | median 0.27933 ms; p95 0.41440; MAD 0.03278; 3 samples / 1019 ops | median 24.020 ms; p95 24.146; MAD 0.14000; 3 samples / 15 ops |
| 3 | 1,000 | [`r3-1000-edit-open.top-left`](./render-results.json) | median 0.56818 ms; p95 0.82990; MAD 0.02840; 3 samples / 479 ops | median 1.206 ms; p95 1.223; MAD 0.01837; 3 samples / 252 ops |
| 3 | 1,000 | [`r3-1000-edit-open.middle`](./render-results.json) | median 0.60060 ms; p95 0.60715; MAD 0.00728; 3 samples / 509 ops | median 1.102 ms; p95 1.119; MAD 0.01891; 3 samples / 276 ops |
| 3 | 1,000 | [`r3-1000-edit-open.bottom-right`](./render-results.json) | median 0.47393 ms; p95 0.49695; MAD 0.02557; 3 samples / 654 ops | median 1.666 ms; p95 1.782; MAD 0.08432; 3 samples / 181 ops |
| 3 | 1,000 | [`r3-1000-edit-commit.middle`](./render-results.json) | median 0.76136 ms; p95 0.81532; MAD 0.00723; 3 samples / 387 ops | median 5.947 ms; p95 6.185; MAD 0.23595; 3 samples / 52 ops |
| 3 | 1,000 | [`r3-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.97573 ms; p95 1.055; MAD 0.08835; 3 samples / 324 ops | median 21.160 ms; p95 21.196; MAD 0.04000; 3 samples / 16 ops |
| 3 | 1,000 | [`r3-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.91182 ms; p95 0.96934; MAD 0.06391; 3 samples / 343 ops | median 20.160 ms; p95 23.148; MAD 0.84333; 3 samples / 16 ops |
| 3 | 1,000 | [`r3-1000-arrow-down.top-left`](./render-results.json) | median 0.59172 ms; p95 0.59176; MAD 0.00005; 3 samples / 511 ops | median 1.476 ms; p95 1.684; MAD 0.05957; 3 samples / 198 ops |
| 3 | 1,000 | [`r3-1000-arrow-right.middle`](./render-results.json) | median 0.59290 ms; p95 0.59290; MAD 0.00000; 3 samples / 521 ops | median 1.517 ms; p95 1.545; MAD 0.03103; 3 samples / 205 ops |
| 3 | 1,000 | [`r3-1000-formatted-paint.top-left`](./render-results.json) | median 0.70993 ms; p95 0.78742; MAD 0.02431; 3 samples / 413 ops | median 4.040 ms; p95 4.126; MAD 0.09600; 3 samples / 82 ops |
| 3 | 1,000 | [`r3-1000-merge-heavy.paint`](./render-results.json) | median 0.24005 ms; p95 0.30438; MAD 0.01683; 3 samples / 1206 ops | median 3.858 ms; p95 4.314; MAD 0.11695; 3 samples / 76 ops |
| 3 | 10,000 | [`r3-10000-scroll-down.top-left`](./render-results.json) | median 1.268 ms; p95 1.324; MAD 0.06191; 3 samples / 244 ops | median 36.100 ms; p95 39.070; MAD 2.167; 3 samples / 9 ops |
| 3 | 10,000 | [`r3-10000-scroll-down.middle`](./render-results.json) | median 1.141 ms; p95 1.196; MAD 0.00158; 3 samples / 261 ops | median 7.013 ms; p95 7.188; MAD 0.19381; 3 samples / 45 ops |
| 3 | 10,000 | [`r3-10000-scroll-smooth.same-window`](./render-results.json) | median 0.42596 ms; p95 0.43600; MAD 0.01116; 3 samples / 706 ops | median 28.225 ms; p95 28.428; MAD 0.22500; 3 samples / 12 ops |
| 3 | 10,000 | [`r3-10000-scroll-right.top-left`](./render-results.json) | median 0.25419 ms; p95 0.32198; MAD 0.01028; 3 samples / 1196 ops | median 31.625 ms; p95 31.670; MAD 0.05000; 3 samples / 12 ops |
| 3 | 10,000 | [`r3-10000-edit-open.top-left`](./render-results.json) | median 0.46776 ms; p95 0.48199; MAD 0.00601; 3 samples / 638 ops | median 1.164 ms; p95 1.166; MAD 0.00233; 3 samples / 260 ops |
| 3 | 10,000 | [`r3-10000-edit-open.middle`](./render-results.json) | median 0.55165 ms; p95 0.60731; MAD 0.00520; 3 samples / 528 ops | median 1.076 ms; p95 1.117; MAD 0.01039; 3 samples / 277 ops |
| 3 | 10,000 | [`r3-10000-edit-open.bottom-right`](./render-results.json) | median 0.44888 ms; p95 0.46155; MAD 0.01408; 3 samples / 676 ops | median 1.854 ms; p95 1.930; MAD 0.05370; 3 samples / 162 ops |
| 3 | 10,000 | [`r3-10000-edit-commit.middle`](./render-results.json) | median 0.77829 ms; p95 0.79497; MAD 0.01853; 3 samples / 388 ops | median 8.123 ms; p95 8.440; MAD 0.35192; 3 samples / 39 ops |
| 3 | 10,000 | [`r3-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.102 ms; p95 1.209; MAD 0.00330; 3 samples / 264 ops | median 29.650 ms; p95 29.763; MAD 0.12500; 3 samples / 13 ops |
| 3 | 10,000 | [`r3-10000-altering.remove-5-rows-top`](./render-results.json) | median 1.054 ms; p95 1.057; MAD 0.00314; 3 samples / 316 ops | median 25.525 ms; p95 27.798; MAD 0.17500; 3 samples / 12 ops |
| 3 | 10,000 | [`r3-10000-arrow-down.top-left`](./render-results.json) | median 0.59940 ms; p95 0.61037; MAD 0.01218; 3 samples / 502 ops | median 1.414 ms; p95 1.472; MAD 0.00282; 3 samples / 210 ops |
| 3 | 10,000 | [`r3-10000-arrow-right.middle`](./render-results.json) | median 0.59128 ms; p95 0.60455; MAD 0.01475; 3 samples / 515 ops | median 1.443 ms; p95 1.523; MAD 0.05119; 3 samples / 211 ops |
| 3 | 10,000 | [`r3-10000-formatted-paint.top-left`](./render-results.json) | median 0.78819 ms; p95 0.79525; MAD 0.00784; 3 samples / 409 ops | median 3.268 ms; p95 3.777; MAD 0.05212; 3 samples / 90 ops |
| 3 | 10,000 | [`r3-10000-merge-heavy.paint`](./render-results.json) | median 0.26810 ms; p95 0.29289; MAD 0.00000; 3 samples / 1090 ops | median 3.707 ms; p95 3.797; MAD 0.10000; 3 samples / 82 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.241 ms; p95 1.241; MAD 0.00000; 3 samples / 244 ops | median 91.900 ms; p95 93.250; MAD 1.400; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.067 ms; p95 1.118; MAD 0.00702; 3 samples / 278 ops | median 33.867 ms; p95 34.137; MAD 0.23333; 3 samples / 9 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45545 ms; p95 0.46850; MAD 0.01360; 3 samples / 660 ops | median 78.950 ms; p95 79.895; MAD 1.050; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.25075 ms; p95 0.30115; MAD 0.00744; 3 samples / 1137 ops | median 53.600 ms; p95 54.095; MAD 0.30000; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.59172 ms; p95 0.81142; MAD 0.10814; 3 samples / 496 ops | median 1.205 ms; p95 1.240; MAD 0.03968; 3 samples / 253 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.57586 ms; p95 0.60138; MAD 0.02829; 3 samples / 525 ops | median 1.548 ms; p95 1.662; MAD 0.09842; 3 samples / 194 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.46129 ms; p95 0.47151; MAD 0.00467; 3 samples / 648 ops | median 2.309 ms; p95 2.332; MAD 0.00682; 3 samples / 131 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.70993 ms; p95 0.75784; MAD 0.00643; 3 samples / 417 ops | median 31.875 ms; p95 41.288; MAD 0.87500; 3 samples / 11 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.510 ms; p95 2.843; MAD 0.25222; 3 samples / 120 ops | median 99.000 ms; p95 117.1; MAD 4.550; 3 samples / 5 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.613 ms; p95 2.924; MAD 0.23608; 3 samples / 116 ops | median 103.3 ms; p95 135.7; MAD 7.450; 3 samples / 4 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.58202 ms; p95 0.64761; MAD 0.03092; 3 samples / 513 ops | median 1.468 ms; p95 1.493; MAD 0.01014; 3 samples / 205 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.59290 ms; p95 0.61199; MAD 0.02121; 3 samples / 508 ops | median 1.963 ms; p95 1.966; MAD 0.00392; 3 samples / 160 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.77231 ms; p95 0.90451; MAD 0.07161; 3 samples / 398 ops | median 3.261 ms; p95 3.371; MAD 0.12204; 3 samples / 94 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.29070 ms; p95 0.29960; MAD 0.00989; 3 samples / 1046 ops | median 7.027 ms; p95 7.581; MAD 0.26667; 3 samples / 44 ops |
| 3 | 1,000,000 | [`r3-1000000-scroll-down.top-left`](./render-results.json) | median 1.738 ms; p95 1.929; MAD 0.21207; 3 samples / 179 ops | median 762.9 ms; p95 768.3; MAD 6.000; 3 samples / 3 ops |
| 3 | 1,000,000 | [`r3-1000000-scroll-down.middle`](./render-results.json) | median 1.182 ms; p95 1.277; MAD 0.01454; 3 samples / 250 ops | median 317.8 ms; p95 334.4; MAD 1.500; 3 samples / 3 ops |
| 3 | 1,000,000 | [`r3-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.50352 ms; p95 0.55933; MAD 0.01760; 3 samples / 582 ops | median 711.9 ms; p95 716.7; MAD 5.300; 3 samples / 3 ops |
| 3 | 1,000,000 | [`r3-1000000-scroll-right.top-left`](./render-results.json) | median 0.33464 ms; p95 0.71547; MAD 0.08310; 3 samples / 987 ops | median 386.2 ms; p95 399.9; MAD 15.200; 3 samples / 3 ops |
| 3 | 1,000,000 | [`r3-1000000-edit-open.top-left`](./render-results.json) | median 0.50556 ms; p95 0.69998; MAD 0.01536; 3 samples / 541 ops | median 1.314 ms; p95 1.324; MAD 0.01071; 3 samples / 242 ops |
| 3 | 1,000,000 | [`r3-1000000-edit-open.middle`](./render-results.json) | median 0.47536 ms; p95 0.71487; MAD 0.02310; 3 samples / 568 ops | median 1.755 ms; p95 1.767; MAD 0.01325; 3 samples / 174 ops |
| 3 | 1,000,000 | [`r3-1000000-edit-open.bottom-right`](./render-results.json) | median 0.41405 ms; p95 0.63803; MAD 0.01996; 3 samples / 647 ops | median 2.383 ms; p95 2.388; MAD 0.00476; 3 samples / 127 ops |
| 3 | 1,000,000 | [`r3-1000000-edit-commit.middle`](./render-results.json) | median 0.98824 ms; p95 1.733; MAD 0.29651; 3 samples / 322 ops | median 336.5 ms; p95 352.1; MAD 17.300; 3 samples / 3 ops |
| 3 | 1,000,000 | [`r3-1000000-altering.insert-5-rows-top`](./render-results.json) | median 18.850 ms; p95 19.090; MAD 0.08333; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 3 | 1,000,000 | [`r3-1000000-altering.remove-5-rows-top`](./render-results.json) | median 18.550 ms; p95 19.045; MAD 0.06667; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 3 | 1,000,000 | [`r3-1000000-arrow-down.top-left`](./render-results.json) | median 0.53298 ms; p95 0.68773; MAD 0.02742; 3 samples / 528 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 3 | 1,000,000 | [`r3-1000000-arrow-right.middle`](./render-results.json) | median 0.56667 ms; p95 0.75571; MAD 0.01252; 3 samples / 504 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 3 | 1,000,000 | [`r3-1000000-formatted-paint.top-left`](./render-results.json) | median 0.69310 ms; p95 0.81070; MAD 0.02377; 3 samples / 417 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 3 | 1,000,000 | [`r3-1000000-merge-heavy.paint`](./render-results.json) | median 0.27628 ms; p95 0.38134; MAD 0.00367; 3 samples / 1090 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 4 | 1,000 | [`r4-1000-scroll-down.top-left`](./render-results.json) | median 1.276 ms; p95 1.296; MAD 0.02277; 3 samples / 241 ops | median 28.500 ms; p95 29.355; MAD 0.95000; 3 samples / 12 ops |
| 4 | 1,000 | [`r4-1000-scroll-down.middle`](./render-results.json) | median 1.176 ms; p95 1.176; MAD 0.00089; 3 samples / 267 ops | median 4.287 ms; p95 4.792; MAD 0.11250; 3 samples / 69 ops |
| 4 | 1,000 | [`r4-1000-scroll-smooth.same-window`](./render-results.json) | median 0.46296 ms; p95 0.46728; MAD 0.00479; 3 samples / 658 ops | median 24.980 ms; p95 25.043; MAD 0.07000; 3 samples / 14 ops |
| 4 | 1,000 | [`r4-1000-scroll-right.top-left`](./render-results.json) | median 0.25503 ms; p95 0.30147; MAD 0.01154; 3 samples / 1183 ops | median 28.400 ms; p95 29.390; MAD 0.17500; 3 samples / 12 ops |
| 4 | 1,000 | [`r4-1000-edit-open.top-left`](./render-results.json) | median 0.47583 ms; p95 0.50258; MAD 0.01666; 3 samples / 627 ops | median 1.135 ms; p95 1.143; MAD 0.00449; 3 samples / 266 ops |
| 4 | 1,000 | [`r4-1000-edit-open.middle`](./render-results.json) | median 0.65921 ms; p95 0.66314; MAD 0.00437; 3 samples / 460 ops | median 1.096 ms; p95 1.269; MAD 0.03460; 3 samples / 265 ops |
| 4 | 1,000 | [`r4-1000-edit-open.bottom-right`](./render-results.json) | median 0.45339 ms; p95 0.49669; MAD 0.00496; 3 samples / 644 ops | median 1.608 ms; p95 1.720; MAD 0.01111; 3 samples / 184 ops |
| 4 | 1,000 | [`r4-1000-edit-commit.middle`](./render-results.json) | median 0.78819 ms; p95 0.84306; MAD 0.05753; 3 samples / 382 ops | median 5.379 ms; p95 5.758; MAD 0.13895; 3 samples / 57 ops |
| 4 | 1,000 | [`r4-1000-altering.insert-5-rows-top`](./render-results.json) | median 1.027 ms; p95 1.193; MAD 0.14320; 3 samples / 295 ops | median 19.550 ms; p95 20.297; MAD 0.61667; 3 samples / 17 ops |
| 4 | 1,000 | [`r4-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.97184 ms; p95 0.99006; MAD 0.02023; 3 samples / 334 ops | median 20.620 ms; p95 21.142; MAD 0.58000; 3 samples / 16 ops |
| 4 | 1,000 | [`r4-1000-arrow-down.top-left`](./render-results.json) | median 0.57288 ms; p95 0.57660; MAD 0.00299; 3 samples / 527 ops | median 1.404 ms; p95 1.496; MAD 0.02334; 3 samples / 212 ops |
| 4 | 1,000 | [`r4-1000-arrow-right.middle`](./render-results.json) | median 0.56667 ms; p95 0.57352; MAD 0.00762; 3 samples / 539 ops | median 1.361 ms; p95 1.411; MAD 0.02614; 3 samples / 220 ops |
| 4 | 1,000 | [`r4-1000-formatted-paint.top-left`](./render-results.json) | median 0.72681 ms; p95 0.84331; MAD 0.03983; 3 samples / 412 ops | median 3.459 ms; p95 3.679; MAD 0.06862; 3 samples / 87 ops |
| 4 | 1,000 | [`r4-1000-merge-heavy.paint`](./render-results.json) | median 0.24004 ms; p95 0.33295; MAD 0.01195; 3 samples / 1216 ops | median 3.841 ms; p95 4.469; MAD 0.23003; 3 samples / 78 ops |
| 4 | 10,000 | [`r4-10000-scroll-down.top-left`](./render-results.json) | median 1.244 ms; p95 1.252; MAD 0.00864; 3 samples / 245 ops | median 35.867 ms; p95 40.007; MAD 2.000; 3 samples / 9 ops |
| 4 | 10,000 | [`r4-10000-scroll-down.middle`](./render-results.json) | median 1.111 ms; p95 1.150; MAD 0.03047; 3 samples / 270 ops | median 7.150 ms; p95 7.279; MAD 0.14286; 3 samples / 44 ops |
| 4 | 10,000 | [`r4-10000-scroll-smooth.same-window`](./render-results.json) | median 0.46009 ms; p95 0.46587; MAD 0.00256; 3 samples / 652 ops | median 28.225 ms; p95 28.270; MAD 0.05000; 3 samples / 12 ops |
| 4 | 10,000 | [`r4-10000-scroll-right.top-left`](./render-results.json) | median 0.30000 ms; p95 0.31439; MAD 0.01599; 3 samples / 1018 ops | median 28.250 ms; p95 28.408; MAD 0.17500; 3 samples / 12 ops |
| 4 | 10,000 | [`r4-10000-edit-open.top-left`](./render-results.json) | median 0.56180 ms; p95 0.56483; MAD 0.00337; 3 samples / 558 ops | median 1.128 ms; p95 1.211; MAD 0.04529; 3 samples / 264 ops |
| 4 | 10,000 | [`r4-10000-edit-open.middle`](./render-results.json) | median 0.59524 ms; p95 0.63449; MAD 0.02592; 3 samples / 501 ops | median 1.116 ms; p95 1.129; MAD 0.01478; 3 samples / 273 ops |
| 4 | 10,000 | [`r4-10000-edit-open.bottom-right`](./render-results.json) | median 0.46605 ms; p95 0.49084; MAD 0.02071; 3 samples / 643 ops | median 1.745 ms; p95 1.760; MAD 0.01658; 3 samples / 176 ops |
| 4 | 10,000 | [`r4-10000-edit-commit.middle`](./render-results.json) | median 0.78203 ms; p95 0.80180; MAD 0.02197; 3 samples / 394 ops | median 7.329 ms; p95 7.361; MAD 0.03571; 3 samples / 42 ops |
| 4 | 10,000 | [`r4-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.023 ms; p95 1.227; MAD 0.18680; 3 samples / 310 ops | median 26.875 ms; p95 27.527; MAD 0.72500; 3 samples / 12 ops |
| 4 | 10,000 | [`r4-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.97404 ms; p95 1.260; MAD 0.07134; 3 samples / 303 ops | median 28.150 ms; p95 29.140; MAD 0.20000; 3 samples / 12 ops |
| 4 | 10,000 | [`r4-10000-arrow-down.top-left`](./render-results.json) | median 0.56554 ms; p95 0.57483; MAD 0.01033; 3 samples / 534 ops | median 1.430 ms; p95 1.769; MAD 0.02680; 3 samples / 199 ops |
| 4 | 10,000 | [`r4-10000-arrow-right.middle`](./render-results.json) | median 0.63418 ms; p95 0.63532; MAD 0.00127; 3 samples / 485 ops | median 1.462 ms; p95 1.541; MAD 0.06787; 3 samples / 206 ops |
| 4 | 10,000 | [`r4-10000-formatted-paint.top-left`](./render-results.json) | median 0.73212 ms; p95 0.81934; MAD 0.05945; 3 samples / 411 ops | median 3.486 ms; p95 3.669; MAD 0.20308; 3 samples / 89 ops |
| 4 | 10,000 | [`r4-10000-merge-heavy.paint`](./render-results.json) | median 0.27201 ms; p95 0.27274; MAD 0.00082; 3 samples / 1153 ops | median 4.348 ms; p95 4.547; MAD 0.13116; 3 samples / 70 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.304 ms; p95 1.420; MAD 0.00902; 3 samples / 225 ops | median 87.150 ms; p95 87.465; MAD 0.35000; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.101 ms; p95 1.215; MAD 0.00327; 3 samples / 266 ops | median 33.767 ms; p95 33.827; MAD 0.06667; 3 samples / 10 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.43103 ms; p95 0.46691; MAD 0.00056; 3 samples / 678 ops | median 75.750 ms; p95 80.565; MAD 2.350; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.24009 ms; p95 0.29509; MAD 0.00264; 3 samples / 1223 ops | median 52.750 ms; p95 56.890; MAD 2.050; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.70000 ms; p95 0.74872; MAD 0.05414; 3 samples / 462 ops | median 1.217 ms; p95 1.339; MAD 0.07028; 3 samples / 245 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.64188 ms; p95 0.64317; MAD 0.00144; 3 samples / 485 ops | median 1.513 ms; p95 1.536; MAD 0.02503; 3 samples / 200 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.50147 ms; p95 0.53761; MAD 0.04015; 3 samples / 609 ops | median 2.207 ms; p95 2.241; MAD 0.03792; 3 samples / 139 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 0.79444 ms; p95 0.79873; MAD 0.00476; 3 samples / 383 ops | median 31.875 ms; p95 33.577; MAD 1.100; 3 samples / 11 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.446 ms; p95 2.891; MAD 0.02491; 3 samples / 123 ops | median 104.3 ms; p95 107.7; MAD 3.800; 3 samples / 4 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.712 ms; p95 2.716; MAD 0.00372; 3 samples / 118 ops | median 102.1 ms; p95 103.9; MAD 2.000; 3 samples / 5 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.64423 ms; p95 0.64797; MAD 0.00416; 3 samples / 476 ops | median 1.430 ms; p95 1.559; MAD 0.01831; 3 samples / 206 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.64839 ms; p95 0.65627; MAD 0.00876; 3 samples / 470 ops | median 2.040 ms; p95 2.215; MAD 0.16593; 3 samples / 150 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.86379 ms; p95 0.88603; MAD 0.02470; 3 samples / 353 ops | median 3.679 ms; p95 3.971; MAD 0.10271; 3 samples / 83 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.25575 ms; p95 0.25934; MAD 0.00194; 3 samples / 1188 ops | median 6.953 ms; p95 7.736; MAD 0.13333; 3 samples / 43 ops |
| 4 | 1,000,000 | [`r4-1000000-scroll-down.top-left`](./render-results.json) | median 1.237 ms; p95 1.284; MAD 0.00655; 3 samples / 241 ops | median 901.1 ms; p95 901.5; MAD 0.40000; 3 samples / 3 ops |
| 4 | 1,000,000 | [`r4-1000000-scroll-down.middle`](./render-results.json) | median 0.97670 ms; p95 1.133; MAD 0.02241; 3 samples / 295 ops | median 382.9 ms; p95 407.6; MAD 3.700; 3 samples / 3 ops |
| 4 | 1,000,000 | [`r4-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.45249 ms; p95 0.47468; MAD 0.02465; 3 samples / 665 ops | median 682.3 ms; p95 695.8; MAD 15.000; 3 samples / 3 ops |
| 4 | 1,000,000 | [`r4-1000000-scroll-right.top-left`](./render-results.json) | median 0.26982 ms; p95 0.29247; MAD 0.01337; 3 samples / 1164 ops | median 357.7 ms; p95 411.6; MAD 14.100; 3 samples / 3 ops |
| 4 | 1,000,000 | [`r4-1000000-edit-open.top-left`](./render-results.json) | median 0.49261 ms; p95 0.53672; MAD 0.02965; 3 samples / 604 ops | median 1.449 ms; p95 1.575; MAD 0.05900; 3 samples / 204 ops |
| 4 | 1,000,000 | [`r4-1000000-edit-open.middle`](./render-results.json) | median 0.53636 ms; p95 0.73033; MAD 0.05415; 3 samples / 528 ops | median 1.876 ms; p95 1.963; MAD 0.09662; 3 samples / 163 ops |
| 4 | 1,000,000 | [`r4-1000000-edit-open.bottom-right`](./render-results.json) | median 0.44097 ms; p95 1.027; MAD 0.01374; 3 samples / 592 ops | median 2.358 ms; p95 2.409; MAD 0.00233; 3 samples / 128 ops |
| 4 | 1,000,000 | [`r4-1000000-edit-commit.middle`](./render-results.json) | median 0.68904 ms; p95 0.69953; MAD 0.01166; 3 samples / 442 ops | median 333.5 ms; p95 351.4; MAD 14.700; 3 samples / 3 ops |
| 4 | 1,000,000 | [`r4-1000000-altering.insert-5-rows-top`](./render-results.json) | median 18.817 ms; p95 19.387; MAD 0.21667; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 4 | 1,000,000 | [`r4-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.500 ms; p95 19.650; MAD 0.16667; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 4 | 1,000,000 | [`r4-1000000-arrow-down.top-left`](./render-results.json) | median 0.58480 ms; p95 0.71517; MAD 0.05022; 3 samples / 531 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 4 | 1,000,000 | [`r4-1000000-arrow-right.middle`](./render-results.json) | median 0.51436 ms; p95 0.74052; MAD 0.01386; 3 samples / 527 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 4 | 1,000,000 | [`r4-1000000-formatted-paint.top-left`](./render-results.json) | median 0.70140 ms; p95 0.80477; MAD 0.02959; 3 samples / 415 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 4 | 1,000,000 | [`r4-1000000-merge-heavy.paint`](./render-results.json) | median 0.28333 ms; p95 0.35156; MAD 0.03183; 3 samples / 1079 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 5 | 1,000 | [`r5-1000-scroll-down.top-left`](./render-results.json) | median 1.275 ms; p95 1.275; MAD 0.00000; 3 samples / 248 ops | median 28.650 ms; p95 30.698; MAD 0.82500; 3 samples / 12 ops |
| 5 | 1,000 | [`r5-1000-scroll-down.middle`](./render-results.json) | median 1.152 ms; p95 1.163; MAD 0.01223; 3 samples / 263 ops | median 4.714 ms; p95 4.817; MAD 0.05455; 3 samples / 65 ops |
| 5 | 1,000 | [`r5-1000-scroll-smooth.same-window`](./render-results.json) | median 0.45249 ms; p95 0.47063; MAD 0.01345; 3 samples / 661 ops | median 23.860 ms; p95 24.688; MAD 0.76000; 3 samples / 15 ops |
| 5 | 1,000 | [`r5-1000-scroll-right.top-left`](./render-results.json) | median 0.24655 ms; p95 0.26749; MAD 0.02326; 3 samples / 1225 ops | median 24.540 ms; p95 25.516; MAD 0.24000; 3 samples / 14 ops |
| 5 | 1,000 | [`r5-1000-edit-open.top-left`](./render-results.json) | median 0.50402 ms; p95 0.50631; MAD 0.00255; 3 samples / 612 ops | median 1.127 ms; p95 1.128; MAD 0.00112; 3 samples / 270 ops |
| 5 | 1,000 | [`r5-1000-edit-open.middle`](./render-results.json) | median 0.56034 ms; p95 0.62063; MAD 0.00367; 3 samples / 520 ops | median 1.043 ms; p95 1.112; MAD 0.00515; 3 samples / 284 ops |
| 5 | 1,000 | [`r5-1000-edit-open.bottom-right`](./render-results.json) | median 0.43377 ms; p95 0.49383; MAD 0.01710; 3 samples / 671 ops | median 1.758 ms; p95 1.825; MAD 0.01134; 3 samples / 170 ops |
| 5 | 1,000 | [`r5-1000-edit-commit.middle`](./render-results.json) | median 0.73188 ms; p95 0.73275; MAD 0.00096; 3 samples / 418 ops | median 5.321 ms; p95 5.387; MAD 0.04737; 3 samples / 57 ops |
| 5 | 1,000 | [`r5-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.94906 ms; p95 1.076; MAD 0.09094; 3 samples / 315 ops | median 19.117 ms; p95 19.237; MAD 0.13333; 3 samples / 18 ops |
| 5 | 1,000 | [`r5-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.88070 ms; p95 0.95909; MAD 0.03953; 3 samples / 351 ops | median 20.440 ms; p95 20.476; MAD 0.04000; 3 samples / 16 ops |
| 5 | 1,000 | [`r5-1000-arrow-down.top-left`](./render-results.json) | median 0.59643 ms; p95 0.59698; MAD 0.00061; 3 samples / 516 ops | median 1.454 ms; p95 1.503; MAD 0.04946; 3 samples / 208 ops |
| 5 | 1,000 | [`r5-1000-arrow-right.middle`](./render-results.json) | median 0.60542 ms; p95 0.65895; MAD 0.05322; 3 samples / 499 ops | median 1.332 ms; p95 1.512; MAD 0.06196; 3 samples / 221 ops |
| 5 | 1,000 | [`r5-1000-formatted-paint.top-left`](./render-results.json) | median 0.76136 ms; p95 0.91587; MAD 0.11491; 3 samples / 399 ops | median 3.255 ms; p95 3.403; MAD 0.08609; 3 samples / 93 ops |
| 5 | 1,000 | [`r5-1000-merge-heavy.paint`](./render-results.json) | median 0.28634 ms; p95 0.30694; MAD 0.02289; 3 samples / 1141 ops | median 3.800 ms; p95 3.862; MAD 0.06923; 3 samples / 81 ops |
| 5 | 10,000 | [`r5-10000-scroll-down.top-left`](./render-results.json) | median 1.143 ms; p95 1.154; MAD 0.00455; 3 samples / 263 ops | median 32.525 ms; p95 32.547; MAD 0.02500; 3 samples / 12 ops |
| 5 | 10,000 | [`r5-10000-scroll-down.middle`](./render-results.json) | median 1.075 ms; p95 1.150; MAD 0.00186; 3 samples / 274 ops | median 7.133 ms; p95 7.139; MAD 0.00667; 3 samples / 45 ops |
| 5 | 10,000 | [`r5-10000-scroll-smooth.same-window`](./render-results.json) | median 0.46512 ms; p95 0.48857; MAD 0.01331; 3 samples / 641 ops | median 28.850 ms; p95 30.335; MAD 1.650; 3 samples / 12 ops |
| 5 | 10,000 | [`r5-10000-scroll-right.top-left`](./render-results.json) | median 0.27350 ms; p95 0.32939; MAD 0.02511; 3 samples / 1078 ops | median 37.633 ms; p95 38.953; MAD 1.467; 3 samples / 10 ops |
| 5 | 10,000 | [`r5-10000-edit-open.top-left`](./render-results.json) | median 0.52408 ms; p95 0.53821; MAD 0.01570; 3 samples / 613 ops | median 1.090 ms; p95 1.167; MAD 0.01172; 3 samples / 271 ops |
| 5 | 10,000 | [`r5-10000-edit-open.middle`](./render-results.json) | median 0.57200 ms; p95 0.58509; MAD 0.01455; 3 samples / 529 ops | median 1.186 ms; p95 1.188; MAD 0.00235; 3 samples / 256 ops |
| 5 | 10,000 | [`r5-10000-edit-open.bottom-right`](./render-results.json) | median 0.49604 ms; p95 0.50277; MAD 0.00748; 3 samples / 626 ops | median 1.772 ms; p95 1.850; MAD 0.02365; 3 samples / 170 ops |
| 5 | 10,000 | [`r5-10000-edit-commit.middle`](./render-results.json) | median 0.74444 ms; p95 0.77212; MAD 0.03075; 3 samples / 410 ops | median 7.393 ms; p95 7.759; MAD 0.00000; 3 samples / 41 ops |
| 5 | 10,000 | [`r5-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.038 ms; p95 1.106; MAD 0.00309; 3 samples / 285 ops | median 26.775 ms; p95 28.170; MAD 1.550; 3 samples / 13 ops |
| 5 | 10,000 | [`r5-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.90631 ms; p95 1.300; MAD 0.00000; 3 samples / 297 ops | median 29.650 ms; p95 31.202; MAD 1.225; 3 samples / 12 ops |
| 5 | 10,000 | [`r5-10000-arrow-down.top-left`](./render-results.json) | median 0.57803 ms; p95 0.63220; MAD 0.00872; 3 samples / 506 ops | median 1.729 ms; p95 1.907; MAD 0.14494; 3 samples / 174 ops |
| 5 | 10,000 | [`r5-10000-arrow-right.middle`](./render-results.json) | median 0.58941 ms; p95 0.62074; MAD 0.03019; 3 samples / 510 ops | median 1.484 ms; p95 1.713; MAD 0.01861; 3 samples / 195 ops |
| 5 | 10,000 | [`r5-10000-formatted-paint.top-left`](./render-results.json) | median 0.76565 ms; p95 0.84617; MAD 0.08947; 3 samples / 410 ops | median 3.693 ms; p95 3.976; MAD 0.18596; 3 samples / 82 ops |
| 5 | 10,000 | [`r5-10000-merge-heavy.paint`](./render-results.json) | median 0.25000 ms; p95 0.34248; MAD 0.00645; 3 samples / 1126 ops | median 3.927 ms; p95 4.144; MAD 0.24108; 3 samples / 79 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.237 ms; p95 1.244; MAD 0.00741; 3 samples / 248 ops | median 83.900 ms; p95 90.380; MAD 1.150; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.098 ms; p95 1.164; MAD 0.01826; 3 samples / 271 ops | median 28.025 ms; p95 31.265; MAD 0.27500; 3 samples / 12 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44035 ms; p95 0.46431; MAD 0.02458; 3 samples / 684 ops | median 71.050 ms; p95 71.815; MAD 0.10000; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.30960 ms; p95 0.31850; MAD 0.00989; 3 samples / 1076 ops | median 56.850 ms; p95 59.145; MAD 2.500; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.56034 ms; p95 0.68416; MAD 0.02842; 3 samples / 511 ops | median 1.277 ms; p95 1.278; MAD 0.00127; 3 samples / 238 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.69653 ms; p95 1.600; MAD 0.12664; 3 samples / 379 ops | median 1.510 ms; p95 1.632; MAD 0.06188; 3 samples / 198 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.47488 ms; p95 0.49975; MAD 0.02763; 3 samples / 646 ops | median 2.410 ms; p95 2.443; MAD 0.03682; 3 samples / 129 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.75639 ms; p95 0.77210; MAD 0.01746; 3 samples / 402 ops | median 37.567 ms; p95 40.507; MAD 3.267; 3 samples / 10 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.451 ms; p95 2.991; MAD 0.16940; 3 samples / 118 ops | median 102.8 ms; p95 106.5; MAD 1.800; 3 samples / 3 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.532 ms; p95 2.634; MAD 0.11224; 3 samples / 120 ops | median 99.600 ms; p95 116.0; MAD 3.500; 3 samples / 5 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.63671 ms; p95 0.64606; MAD 0.01039; 3 samples / 488 ops | median 1.482 ms; p95 1.711; MAD 0.03950; 3 samples / 196 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.59070 ms; p95 0.66087; MAD 0.00298; 3 samples / 493 ops | median 1.967 ms; p95 2.096; MAD 0.00705; 3 samples / 151 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.78824 ms; p95 0.82882; MAD 0.03560; 3 samples / 389 ops | median 3.638 ms; p95 3.720; MAD 0.09064; 3 samples / 88 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.30000 ms; p95 0.31487; MAD 0.00024; 3 samples / 1090 ops | median 7.808 ms; p95 7.856; MAD 0.05385; 3 samples / 40 ops |
| 5 | 1,000,000 | [`r5-1000000-scroll-down.top-left`](./render-results.json) | median 1.251 ms; p95 1.285; MAD 0.01545; 3 samples / 239 ops | median 700.7 ms; p95 790.0; MAD 10.300; 3 samples / 3 ops |
| 5 | 1,000,000 | [`r5-1000000-scroll-down.middle`](./render-results.json) | median 1.138 ms; p95 1.167; MAD 0.03227; 3 samples / 272 ops | median 351.2 ms; p95 370.5; MAD 3.000; 3 samples / 3 ops |
| 5 | 1,000,000 | [`r5-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.44843 ms; p95 0.45106; MAD 0.00292; 3 samples / 681 ops | median 717.2 ms; p95 718.0; MAD 0.90000; 3 samples / 3 ops |
| 5 | 1,000,000 | [`r5-1000000-scroll-right.top-left`](./render-results.json) | median 0.24005 ms; p95 0.40418; MAD 0.01538; 3 samples / 1144 ops | median 380.5 ms; p95 406.5; MAD 3.600; 3 samples / 3 ops |
| 5 | 1,000,000 | [`r5-1000000-edit-open.top-left`](./render-results.json) | median 0.45339 ms; p95 0.69476; MAD 0.01047; 3 samples / 586 ops | median 1.144 ms; p95 1.337; MAD 0.01061; 3 samples / 251 ops |
| 5 | 1,000,000 | [`r5-1000000-edit-open.middle`](./render-results.json) | median 0.62864 ms; p95 0.69286; MAD 0.07136; 3 samples / 559 ops | median 1.740 ms; p95 1.766; MAD 0.02271; 3 samples / 174 ops |
| 5 | 1,000,000 | [`r5-1000000-edit-open.bottom-right`](./render-results.json) | median 0.43712 ms; p95 0.61061; MAD 0.01073; 3 samples / 638 ops | median 2.372 ms; p95 2.374; MAD 0.00233; 3 samples / 129 ops |
| 5 | 1,000,000 | [`r5-1000000-edit-commit.middle`](./render-results.json) | median 0.66490 ms; p95 0.67521; MAD 0.01145; 3 samples / 456 ops | median 352.3 ms; p95 356.0; MAD 4.100; 3 samples / 3 ops |
| 5 | 1,000,000 | [`r5-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.233 ms; p95 19.383; MAD 0.16667; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 5 | 1,000,000 | [`r5-1000000-altering.remove-5-rows-top`](./render-results.json) | median 18.483 ms; p95 19.383; MAD 0.06667; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 5 | 1,000,000 | [`r5-1000000-arrow-down.top-left`](./render-results.json) | median 0.55385 ms; p95 0.58586; MAD 0.00136; 3 samples / 533 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 5 | 1,000,000 | [`r5-1000000-arrow-right.middle`](./render-results.json) | median 0.68767 ms; p95 0.74546; MAD 0.06421; 3 samples / 474 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 5 | 1,000,000 | [`r5-1000000-formatted-paint.top-left`](./render-results.json) | median 0.72360 ms; p95 0.87890; MAD 0.09341; 3 samples / 450 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 5 | 1,000,000 | [`r5-1000000-merge-heavy.paint`](./render-results.json) | median 0.25330 ms; p95 0.26092; MAD 0.00171; 3 samples / 1226 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 6 | 1,000 | [`r6-1000-scroll-down.top-left`](./render-results.json) | median 1.329 ms; p95 1.359; MAD 0.00789; 3 samples / 226 ops | median 27.600 ms; p95 28.095; MAD 0.25000; 3 samples / 12 ops |
| 6 | 1,000 | [`r6-1000-scroll-down.middle`](./render-results.json) | median 1.117 ms; p95 1.180; MAD 0.03280; 3 samples / 268 ops | median 4.396 ms; p95 4.443; MAD 0.05217; 3 samples / 71 ops |
| 6 | 1,000 | [`r6-1000-scroll-smooth.same-window`](./render-results.json) | median 0.47630 ms; p95 0.51101; MAD 0.02405; 3 samples / 628 ops | median 24.480 ms; p95 24.822; MAD 0.38000; 3 samples / 15 ops |
| 6 | 1,000 | [`r6-1000-scroll-right.top-left`](./render-results.json) | median 0.26738 ms; p95 0.28737; MAD 0.02222; 3 samples / 1156 ops | median 25.340 ms; p95 27.216; MAD 1.900; 3 samples / 14 ops |
| 6 | 1,000 | [`r6-1000-edit-open.top-left`](./render-results.json) | median 0.50606 ms; p95 0.51684; MAD 0.01198; 3 samples / 599 ops | median 1.095 ms; p95 1.147; MAD 0.00000; 3 samples / 271 ops |
| 6 | 1,000 | [`r6-1000-edit-open.middle`](./render-results.json) | median 0.59176 ms; p95 0.59279; MAD 0.00113; 3 samples / 526 ops | median 1.144 ms; p95 1.206; MAD 0.03992; 3 samples / 262 ops |
| 6 | 1,000 | [`r6-1000-edit-open.bottom-right`](./render-results.json) | median 0.46343 ms; p95 0.49724; MAD 0.01765; 3 samples / 641 ops | median 1.779 ms; p95 1.803; MAD 0.02641; 3 samples / 176 ops |
| 6 | 1,000 | [`r6-1000-edit-commit.middle`](./render-results.json) | median 0.78516 ms; p95 0.79001; MAD 0.00539; 3 samples / 388 ops | median 6.012 ms; p95 6.017; MAD 0.00588; 3 samples / 51 ops |
| 6 | 1,000 | [`r6-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.96571 ms; p95 1.034; MAD 0.07552; 3 samples / 328 ops | median 21.920 ms; p95 22.316; MAD 0.44000; 3 samples / 16 ops |
| 6 | 1,000 | [`r6-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.95333 ms; p95 1.022; MAD 0.07647; 3 samples / 346 ops | median 21.280 ms; p95 25.280; MAD 1.613; 3 samples / 15 ops |
| 6 | 1,000 | [`r6-1000-arrow-down.top-left`](./render-results.json) | median 0.59349 ms; p95 0.63743; MAD 0.00059; 3 samples / 494 ops | median 1.552 ms; p95 1.571; MAD 0.02113; 3 samples / 201 ops |
| 6 | 1,000 | [`r6-1000-arrow-right.middle`](./render-results.json) | median 0.59821 ms; p95 0.61760; MAD 0.02154; 3 samples / 505 ops | median 1.444 ms; p95 1.473; MAD 0.03218; 3 samples / 213 ops |
| 6 | 1,000 | [`r6-1000-formatted-paint.top-left`](./render-results.json) | median 0.79683 ms; p95 0.82093; MAD 0.02679; 3 samples / 414 ops | median 3.343 ms; p95 3.540; MAD 0.11833; 3 samples / 91 ops |
| 6 | 1,000 | [`r6-1000-merge-heavy.paint`](./render-results.json) | median 0.26968 ms; p95 0.27260; MAD 0.00325; 3 samples / 1231 ops | median 4.052 ms; p95 4.245; MAD 0.21467; 3 samples / 76 ops |
| 6 | 10,000 | [`r6-10000-scroll-down.top-left`](./render-results.json) | median 1.303 ms; p95 1.311; MAD 0.00909; 3 samples / 234 ops | median 33.200 ms; p95 34.550; MAD 0.92500; 3 samples / 11 ops |
| 6 | 10,000 | [`r6-10000-scroll-down.middle`](./render-results.json) | median 1.152 ms; p95 1.185; MAD 0.03651; 3 samples / 265 ops | median 6.707 ms; p95 6.875; MAD 0.18667; 3 samples / 47 ops |
| 6 | 10,000 | [`r6-10000-scroll-smooth.same-window`](./render-results.json) | median 0.43047 ms; p95 0.44425; MAD 0.00269; 3 samples / 692 ops | median 26.950 ms; p95 27.175; MAD 0.25000; 3 samples / 12 ops |
| 6 | 10,000 | [`r6-10000-scroll-right.top-left`](./render-results.json) | median 0.31087 ms; p95 0.31658; MAD 0.00634; 3 samples / 1062 ops | median 26.875 ms; p95 27.370; MAD 0.55000; 3 samples / 12 ops |
| 6 | 10,000 | [`r6-10000-edit-open.top-left`](./render-results.json) | median 0.53016 ms; p95 0.54900; MAD 0.02094; 3 samples / 572 ops | median 1.065 ms; p95 1.101; MAD 0.02114; 3 samples / 281 ops |
| 6 | 10,000 | [`r6-10000-edit-open.middle`](./render-results.json) | median 0.59059 ms; p95 0.59121; MAD 0.00069; 3 samples / 513 ops | median 1.126 ms; p95 1.220; MAD 0.02584; 3 samples / 262 ops |
| 6 | 10,000 | [`r6-10000-edit-open.bottom-right`](./render-results.json) | median 0.44248 ms; p95 0.44644; MAD 0.00440; 3 samples / 688 ops | median 1.703 ms; p95 1.734; MAD 0.03454; 3 samples / 178 ops |
| 6 | 10,000 | [`r6-10000-edit-commit.middle`](./render-results.json) | median 0.75985 ms; p95 0.78263; MAD 0.01209; 3 samples / 394 ops | median 8.123 ms; p95 8.320; MAD 0.11538; 3 samples / 38 ops |
| 6 | 10,000 | [`r6-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.033 ms; p95 1.217; MAD 0.17743; 3 samples / 308 ops | median 25.175 ms; p95 25.580; MAD 0.37500; 3 samples / 13 ops |
| 6 | 10,000 | [`r6-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.93645 ms; p95 1.318; MAD 0.00404; 3 samples / 299 ops | median 26.225 ms; p95 26.900; MAD 0.60000; 3 samples / 12 ops |
| 6 | 10,000 | [`r6-10000-arrow-down.top-left`](./render-results.json) | median 0.60727 ms; p95 0.63092; MAD 0.01378; 3 samples / 492 ops | median 1.451 ms; p95 1.604; MAD 0.03961; 3 samples / 207 ops |
| 6 | 10,000 | [`r6-10000-arrow-right.middle`](./render-results.json) | median 0.61098 ms; p95 0.61888; MAD 0.00878; 3 samples / 501 ops | median 1.530 ms; p95 1.967; MAD 0.15085; 3 samples / 189 ops |
| 6 | 10,000 | [`r6-10000-formatted-paint.top-left`](./render-results.json) | median 0.89375 ms; p95 0.93011; MAD 0.04040; 3 samples / 371 ops | median 3.172 ms; p95 3.172; MAD 0.00000; 3 samples / 96 ops |
| 6 | 10,000 | [`r6-10000-merge-heavy.paint`](./render-results.json) | median 0.33146 ms; p95 0.37110; MAD 0.00855; 3 samples / 906 ops | median 3.664 ms; p95 3.716; MAD 0.01429; 3 samples / 83 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.285 ms; p95 1.297; MAD 0.01409; 3 samples / 238 ops | median 89.650 ms; p95 91.315; MAD 1.850; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.142 ms; p95 1.158; MAD 0.01772; 3 samples / 266 ops | median 27.575 ms; p95 28.452; MAD 0.02500; 3 samples / 12 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42681 ms; p95 0.42933; MAD 0.00281; 3 samples / 715 ops | median 76.800 ms; p95 77.655; MAD 0.95000; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.24355 ms; p95 0.28323; MAD 0.01560; 3 samples / 1199 ops | median 53.850 ms; p95 61.050; MAD 3.650; 3 samples / 7 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.54628 ms; p95 0.55286; MAD 0.00731; 3 samples / 600 ops | median 1.140 ms; p95 1.217; MAD 0.07169; 3 samples / 265 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.56230 ms; p95 0.61985; MAD 0.00870; 3 samples / 524 ops | median 1.527 ms; p95 1.553; MAD 0.02811; 3 samples / 199 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.50251 ms; p95 0.51751; MAD 0.01666; 3 samples / 614 ops | median 2.314 ms; p95 2.335; MAD 0.02357; 3 samples / 133 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 0.72536 ms; p95 0.77566; MAD 0.00072; 3 samples / 404 ops | median 34.450 ms; p95 34.465; MAD 0.01667; 3 samples / 10 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.449 ms; p95 2.679; MAD 0.03449; 3 samples / 122 ops | median 98.300 ms; p95 105.5; MAD 1.800; 3 samples / 5 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.577 ms; p95 2.793; MAD 0.20483; 3 samples / 118 ops | median 104.3 ms; p95 109.4; MAD 0.95000; 3 samples / 5 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.60225 ms; p95 0.64145; MAD 0.00639; 3 samples / 502 ops | median 1.573 ms; p95 1.695; MAD 0.10242; 3 samples / 192 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.64167 ms; p95 0.73283; MAD 0.01354; 3 samples / 451 ops | median 1.857 ms; p95 2.002; MAD 0.10741; 3 samples / 162 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.79762 ms; p95 0.92100; MAD 0.08917; 3 samples / 389 ops | median 3.274 ms; p95 3.465; MAD 0.09607; 3 samples / 92 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.28533 ms; p95 0.33697; MAD 0.02749; 3 samples / 1112 ops | median 6.967 ms; p95 7.151; MAD 0.20476; 3 samples / 45 ops |
| 6 | 1,000,000 | [`r6-1000000-scroll-down.top-left`](./render-results.json) | median 1.294 ms; p95 1.365; MAD 0.04117; 3 samples / 232 ops | median 676.9 ms; p95 699.6; MAD 25.200; 3 samples / 3 ops |
| 6 | 1,000,000 | [`r6-1000000-scroll-down.middle`](./render-results.json) | median 1.182 ms; p95 1.547; MAD 0.18532; 3 samples / 249 ops | median 344.4 ms; p95 414.2; MAD 48.400; 3 samples / 3 ops |
| 6 | 1,000,000 | [`r6-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.43319 ms; p95 0.44551; MAD 0.01369; 3 samples / 695 ops | median 645.5 ms; p95 711.5; MAD 14.100; 3 samples / 3 ops |
| 6 | 1,000,000 | [`r6-1000000-scroll-right.top-left`](./render-results.json) | median 0.24320 ms; p95 0.30673; MAD 0.00430; 3 samples / 1150 ops | median 332.6 ms; p95 378.9; MAD 16.400; 3 samples / 3 ops |
| 6 | 1,000,000 | [`r6-1000000-edit-open.top-left`](./render-results.json) | median 0.50100 ms; p95 0.61260; MAD 0.02742; 3 samples / 572 ops | median 1.324 ms; p95 1.551; MAD 0.22368; 3 samples / 232 ops |
| 6 | 1,000,000 | [`r6-1000000-edit-open.middle`](./render-results.json) | median 0.61037 ms; p95 1.653; MAD 0.12582; 3 samples / 436 ops | median 1.811 ms; p95 1.851; MAD 0.04484; 3 samples / 170 ops |
| 6 | 1,000,000 | [`r6-1000000-edit-open.bottom-right`](./render-results.json) | median 0.40526 ms; p95 0.58665; MAD 0.03415; 3 samples / 708 ops | median 2.405 ms; p95 2.642; MAD 0.11840; 3 samples / 124 ops |
| 6 | 1,000,000 | [`r6-1000000-edit-commit.middle`](./render-results.json) | median 0.69172 ms; p95 0.73623; MAD 0.04945; 3 samples / 439 ops | median 331.5 ms; p95 344.3; MAD 14.200; 3 samples / 3 ops |
| 6 | 1,000,000 | [`r6-1000000-altering.insert-5-rows-top`](./render-results.json) | median 18.983 ms; p95 19.388; MAD 0.35000; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 6 | 1,000,000 | [`r6-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.050 ms; p95 19.185; MAD 0.15000; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 6 | 1,000,000 | [`r6-1000000-arrow-down.top-left`](./render-results.json) | median 0.56554 ms; p95 0.64469; MAD 0.02971; 3 samples / 536 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 6 | 1,000,000 | [`r6-1000000-arrow-right.middle`](./render-results.json) | median 0.72230 ms; p95 0.77200; MAD 0.05522; 3 samples / 456 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 6 | 1,000,000 | [`r6-1000000-formatted-paint.top-left`](./render-results.json) | median 0.83667 ms; p95 1.107; MAD 0.11952; 3 samples / 348 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 6 | 1,000,000 | [`r6-1000000-merge-heavy.paint`](./render-results.json) | median 0.33034 ms; p95 0.36852; MAD 0.04242; 3 samples / 1004 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 7 | 1,000 | [`r7-1000-scroll-down.top-left`](./render-results.json) | median 1.455 ms; p95 1.580; MAD 0.13868; 3 samples / 216 ops | median 29.625 ms; p95 29.850; MAD 0.25000; 3 samples / 12 ops |
| 7 | 1,000 | [`r7-1000-scroll-down.middle`](./render-results.json) | median 1.113 ms; p95 1.129; MAD 0.01004; 3 samples / 270 ops | median 4.233 ms; p95 4.709; MAD 0.02500; 3 samples / 69 ops |
| 7 | 1,000 | [`r7-1000-scroll-smooth.same-window`](./render-results.json) | median 0.45545 ms; p95 0.45692; MAD 0.00162; 3 samples / 683 ops | median 21.280 ms; p95 22.648; MAD 0.32000; 3 samples / 15 ops |
| 7 | 1,000 | [`r7-1000-scroll-right.top-left`](./render-results.json) | median 0.27322 ms; p95 0.30255; MAD 0.03259; 3 samples / 1181 ops | median 27.175 ms; p95 27.423; MAD 0.27500; 3 samples / 12 ops |
| 7 | 1,000 | [`r7-1000-edit-open.top-left`](./render-results.json) | median 0.50251 ms; p95 0.51364; MAD 0.01236; 3 samples / 616 ops | median 1.116 ms; p95 1.167; MAD 0.01446; 3 samples / 267 ops |
| 7 | 1,000 | [`r7-1000-edit-open.middle`](./render-results.json) | median 0.58882 ms; p95 0.60049; MAD 0.00344; 3 samples / 509 ops | median 1.140 ms; p95 1.199; MAD 0.06625; 3 samples / 266 ops |
| 7 | 1,000 | [`r7-1000-edit-open.bottom-right`](./render-results.json) | median 0.48173 ms; p95 0.48507; MAD 0.00316; 3 samples / 624 ops | median 1.697 ms; p95 1.752; MAD 0.06128; 3 samples / 181 ops |
| 7 | 1,000 | [`r7-1000-edit-commit.middle`](./render-results.json) | median 0.70210 ms; p95 0.72093; MAD 0.00557; 3 samples / 426 ops | median 5.694 ms; p95 5.699; MAD 0.00556; 3 samples / 56 ops |
| 7 | 1,000 | [`r7-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.95333 ms; p95 1.092; MAD 0.01595; 3 samples / 313 ops | median 20.300 ms; p95 21.434; MAD 0.90000; 3 samples / 16 ops |
| 7 | 1,000 | [`r7-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.88938 ms; p95 0.90794; MAD 0.02062; 3 samples / 357 ops | median 20.180 ms; p95 20.198; MAD 0.02000; 3 samples / 16 ops |
| 7 | 1,000 | [`r7-1000-arrow-down.top-left`](./render-results.json) | median 0.58035 ms; p95 0.58391; MAD 0.00396; 3 samples / 522 ops | median 1.493 ms; p95 1.545; MAD 0.04825; 3 samples / 202 ops |
| 7 | 1,000 | [`r7-1000-arrow-right.middle`](./render-results.json) | median 0.55967 ms; p95 0.61319; MAD 0.01322; 3 samples / 526 ops | median 1.354 ms; p95 1.422; MAD 0.02248; 3 samples / 220 ops |
| 7 | 1,000 | [`r7-1000-formatted-paint.top-left`](./render-results.json) | median 0.78438 ms; p95 0.82028; MAD 0.03989; 3 samples / 414 ops | median 3.650 ms; p95 3.808; MAD 0.17593; 3 samples / 86 ops |
| 7 | 1,000 | [`r7-1000-merge-heavy.paint`](./render-results.json) | median 0.31685 ms; p95 0.34052; MAD 0.02630; 3 samples / 1007 ops | median 3.822 ms; p95 4.058; MAD 0.26178; 3 samples / 81 ops |
| 7 | 10,000 | [`r7-10000-scroll-down.top-left`](./render-results.json) | median 1.212 ms; p95 1.368; MAD 0.00241; 3 samples / 239 ops | median 34.433 ms; p95 34.696; MAD 0.29167; 3 samples / 11 ops |
| 7 | 10,000 | [`r7-10000-scroll-down.middle`](./render-results.json) | median 1.113 ms; p95 1.128; MAD 0.01603; 3 samples / 272 ops | median 6.488 ms; p95 7.135; MAD 0.26397; 3 samples / 47 ops |
| 7 | 10,000 | [`r7-10000-scroll-smooth.same-window`](./render-results.json) | median 0.43004 ms; p95 0.44163; MAD 0.01288; 3 samples / 703 ops | median 27.250 ms; p95 33.505; MAD 0.27500; 3 samples / 11 ops |
| 7 | 10,000 | [`r7-10000-scroll-right.top-left`](./render-results.json) | median 0.28197 ms; p95 0.33183; MAD 0.05540; 3 samples / 1114 ops | median 29.150 ms; p95 30.387; MAD 1.375; 3 samples / 12 ops |
| 7 | 10,000 | [`r7-10000-edit-open.top-left`](./render-results.json) | median 0.52135 ms; p95 0.54987; MAD 0.02474; 3 samples / 580 ops | median 1.176 ms; p95 1.181; MAD 0.00471; 3 samples / 262 ops |
| 7 | 10,000 | [`r7-10000-edit-open.middle`](./render-results.json) | median 0.57200 ms; p95 0.61677; MAD 0.02090; 3 samples / 518 ops | median 1.227 ms; p95 1.239; MAD 0.01391; 3 samples / 253 ops |
| 7 | 10,000 | [`r7-10000-edit-open.bottom-right`](./render-results.json) | median 0.47536 ms; p95 0.50708; MAD 0.01193; 3 samples / 625 ops | median 1.726 ms; p95 1.854; MAD 0.09683; 3 samples / 174 ops |
| 7 | 10,000 | [`r7-10000-edit-commit.middle`](./render-results.json) | median 0.82377 ms; p95 0.85545; MAD 0.03520; 3 samples / 369 ops | median 8.608 ms; p95 8.623; MAD 0.01667; 3 samples / 38 ops |
| 7 | 10,000 | [`r7-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.066 ms; p95 1.092; MAD 0.02012; 3 samples / 282 ops | median 29.375 ms; p95 29.600; MAD 0.00000; 3 samples / 12 ops |
| 7 | 10,000 | [`r7-10000-altering.remove-5-rows-top`](./render-results.json) | median 1.002 ms; p95 1.010; MAD 0.00929; 3 samples / 321 ops | median 29.250 ms; p95 29.407; MAD 0.17500; 3 samples / 12 ops |
| 7 | 10,000 | [`r7-10000-arrow-down.top-left`](./render-results.json) | median 0.64167 ms; p95 0.66027; MAD 0.02067; 3 samples / 479 ops | median 1.501 ms; p95 1.506; MAD 0.00448; 3 samples / 207 ops |
| 7 | 10,000 | [`r7-10000-arrow-right.middle`](./render-results.json) | median 0.57543 ms; p95 0.58237; MAD 0.00771; 3 samples / 526 ops | median 1.366 ms; p95 1.477; MAD 0.01688; 3 samples / 217 ops |
| 7 | 10,000 | [`r7-10000-formatted-paint.top-left`](./render-results.json) | median 0.72826 ms; p95 0.83748; MAD 0.02686; 3 samples / 412 ops | median 3.517 ms; p95 3.539; MAD 0.02414; 3 samples / 88 ops |
| 7 | 10,000 | [`r7-10000-merge-heavy.paint`](./render-results.json) | median 0.28090 ms; p95 0.28772; MAD 0.00757; 3 samples / 1126 ops | median 3.643 ms; p95 3.665; MAD 0.02500; 3 samples / 84 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.282 ms; p95 1.301; MAD 0.02055; 3 samples / 237 ops | median 88.500 ms; p95 93.180; MAD 2.350; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.199 ms; p95 1.260; MAD 0.06828; 3 samples / 257 ops | median 32.375 ms; p95 33.095; MAD 0.80000; 3 samples / 12 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.46698 ms; p95 0.50962; MAD 0.01198; 3 samples / 630 ops | median 79.900 ms; p95 84.940; MAD 4.250; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.25575 ms; p95 0.29292; MAD 0.04130; 3 samples / 1214 ops | median 49.400 ms; p95 54.080; MAD 0.23333; 3 samples / 8 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.49554 ms; p95 0.51971; MAD 0.01478; 3 samples / 602 ops | median 1.222 ms; p95 1.267; MAD 0.05020; 3 samples / 249 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.55470 ms; p95 0.67200; MAD 0.01713; 3 samples / 517 ops | median 1.572 ms; p95 1.583; MAD 0.01250; 3 samples / 193 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.49069 ms; p95 0.50419; MAD 0.00847; 3 samples / 623 ops | median 2.174 ms; p95 2.360; MAD 0.01647; 3 samples / 135 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 0.78594 ms; p95 0.79931; MAD 0.01486; 3 samples / 390 ops | median 33.250 ms; p95 34.555; MAD 1.450; 3 samples / 11 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.498 ms; p95 2.663; MAD 0.00976; 3 samples / 120 ops | median 103.1 ms; p95 103.4; MAD 0.30000; 3 samples / 4 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.595 ms; p95 3.012; MAD 0.09487; 3 samples / 118 ops | median 100.000 ms; p95 116.4; MAD 2.450; 3 samples / 5 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.65897 ms; p95 0.68357; MAD 0.02733; 3 samples / 470 ops | median 1.488 ms; p95 1.630; MAD 0.00882; 3 samples / 197 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.58034 ms; p95 0.70527; MAD 0.04217; 3 samples / 505 ops | median 2.090 ms; p95 2.135; MAD 0.05084; 3 samples / 148 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.80400 ms; p95 0.98201; MAD 0.09326; 3 samples / 386 ops | median 3.618 ms; p95 4.001; MAD 0.24452; 3 samples / 83 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.27579 ms; p95 0.33334; MAD 0.01538; 3 samples / 1090 ops | median 6.581 ms; p95 6.868; MAD 0.14375; 3 samples / 47 ops |
| 7 | 1,000,000 | [`r7-1000000-scroll-down.top-left`](./render-results.json) | median 1.305 ms; p95 1.332; MAD 0.02314; 3 samples / 231 ops | median 669.9 ms; p95 717.3; MAD 15.800; 3 samples / 3 ops |
| 7 | 1,000,000 | [`r7-1000000-scroll-down.middle`](./render-results.json) | median 1.036 ms; p95 1.439; MAD 0.01363; 3 samples / 263 ops | median 359.8 ms; p95 370.4; MAD 11.800; 3 samples / 3 ops |
| 7 | 1,000,000 | [`r7-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.45500 ms; p95 0.45705; MAD 0.00227; 3 samples / 662 ops | median 719.9 ms; p95 747.8; MAD 26.700; 3 samples / 3 ops |
| 7 | 1,000,000 | [`r7-1000000-scroll-right.top-left`](./render-results.json) | median 0.30060 ms; p95 0.41287; MAD 0.06452; 3 samples / 1187 ops | median 361.2 ms; p95 367.5; MAD 4.300; 3 samples / 3 ops |
| 7 | 1,000,000 | [`r7-1000000-edit-open.top-left`](./render-results.json) | median 0.43712 ms; p95 0.46315; MAD 0.00000; 3 samples / 673 ops | median 1.488 ms; p95 1.558; MAD 0.07739; 3 samples / 213 ops |
| 7 | 1,000,000 | [`r7-1000000-edit-open.middle`](./render-results.json) | median 0.49216 ms; p95 0.87821; MAD 0.02393; 3 samples / 527 ops | median 1.755 ms; p95 1.783; MAD 0.03079; 3 samples / 174 ops |
| 7 | 1,000,000 | [`r7-1000000-edit-open.bottom-right`](./render-results.json) | median 0.47136 ms; p95 0.61960; MAD 0.04647; 3 samples / 608 ops | median 2.388 ms; p95 2.447; MAD 0.05814; 3 samples / 127 ops |
| 7 | 1,000,000 | [`r7-1000000-edit-commit.middle`](./render-results.json) | median 0.70420 ms; p95 0.98133; MAD 0.01515; 3 samples / 388 ops | median 311.2 ms; p95 339.8; MAD 13.600; 3 samples / 3 ops |
| 7 | 1,000,000 | [`r7-1000000-altering.insert-5-rows-top`](./render-results.json) | median 20.320 ms; p95 22.264; MAD 0.98667; 3 samples / 16 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 7 | 1,000,000 | [`r7-1000000-altering.remove-5-rows-top`](./render-results.json) | median 20.100 ms; p95 20.406; MAD 0.34000; 3 samples / 17 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 7 | 1,000,000 | [`r7-1000000-arrow-down.top-left`](./render-results.json) | median 0.57977 ms; p95 0.93701; MAD 0.04287; 3 samples / 463 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 7 | 1,000,000 | [`r7-1000000-arrow-right.middle`](./render-results.json) | median 0.57919 ms; p95 1.137; MAD 0.01774; 3 samples / 480 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 7 | 1,000,000 | [`r7-1000000-formatted-paint.top-left`](./render-results.json) | median 0.82727 ms; p95 1.095; MAD 0.20040; 3 samples / 424 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 7 | 1,000,000 | [`r7-1000000-merge-heavy.paint`](./render-results.json) | median 0.26406 ms; p95 0.26773; MAD 0.00024; 3 samples / 1226 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 8 | 1,000 | [`r8-1000-scroll-down.top-left`](./render-results.json) | median 1.240 ms; p95 1.358; MAD 0.06509; 3 samples / 240 ops | median 30.750 ms; p95 31.808; MAD 1.175; 3 samples / 12 ops |
| 8 | 1,000 | [`r8-1000-scroll-down.middle`](./render-results.json) | median 1.098 ms; p95 1.112; MAD 0.01551; 3 samples / 278 ops | median 4.112 ms; p95 4.259; MAD 0.01600; 3 samples / 74 ops |
| 8 | 1,000 | [`r8-1000-scroll-smooth.same-window`](./render-results.json) | median 0.47990 ms; p95 0.49754; MAD 0.01960; 3 samples / 628 ops | median 23.640 ms; p95 27.159; MAD 0.48000; 3 samples / 14 ops |
| 8 | 1,000 | [`r8-1000-scroll-right.top-left`](./render-results.json) | median 0.26552 ms; p95 0.28355; MAD 0.02004; 3 samples / 1153 ops | median 27.425 ms; p95 28.550; MAD 0.77500; 3 samples / 12 ops |
| 8 | 1,000 | [`r8-1000-edit-open.top-left`](./render-results.json) | median 0.47500 ms; p95 0.73000; MAD 0.01065; 3 samples / 560 ops | median 1.194 ms; p95 1.230; MAD 0.01169; 3 samples / 251 ops |
| 8 | 1,000 | [`r8-1000-edit-open.middle`](./render-results.json) | median 0.57977 ms; p95 0.61288; MAD 0.00915; 3 samples / 513 ops | median 1.144 ms; p95 1.196; MAD 0.05687; 3 samples / 268 ops |
| 8 | 1,000 | [`r8-1000-edit-open.bottom-right`](./render-results.json) | median 0.44777 ms; p95 0.46534; MAD 0.01065; 3 samples / 667 ops | median 1.615 ms; p95 1.641; MAD 0.00658; 3 samples / 186 ops |
| 8 | 1,000 | [`r8-1000-edit-commit.middle`](./render-results.json) | median 0.77231 ms; p95 0.78739; MAD 0.01675; 3 samples / 394 ops | median 5.484 ms; p95 5.568; MAD 0.01053; 3 samples / 56 ops |
| 8 | 1,000 | [`r8-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.96538 ms; p95 1.156; MAD 0.16378; 3 samples / 314 ops | median 21.500 ms; p95 22.670; MAD 0.56000; 3 samples / 15 ops |
| 8 | 1,000 | [`r8-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.96731 ms; p95 1.120; MAD 0.17019; 3 samples / 320 ops | median 22.920 ms; p95 24.927; MAD 2.040; 3 samples / 14 ops |
| 8 | 1,000 | [`r8-1000-arrow-down.top-left`](./render-results.json) | median 0.56875 ms; p95 0.58424; MAD 0.01097; 3 samples / 527 ops | median 1.520 ms; p95 1.542; MAD 0.02492; 3 samples / 199 ops |
| 8 | 1,000 | [`r8-1000-arrow-right.middle`](./render-results.json) | median 0.56348 ms; p95 0.60960; MAD 0.02658; 3 samples / 528 ops | median 1.444 ms; p95 1.468; MAD 0.02598; 3 samples / 209 ops |
| 8 | 1,000 | [`r8-1000-formatted-paint.top-left`](./render-results.json) | median 0.77154 ms; p95 0.80476; MAD 0.03691; 3 samples / 419 ops | median 3.793 ms; p95 3.823; MAD 0.03333; 3 samples / 82 ops |
| 8 | 1,000 | [`r8-1000-merge-heavy.paint`](./render-results.json) | median 0.24558 ms; p95 0.31706; MAD 0.00895; 3 samples / 1205 ops | median 4.148 ms; p95 4.210; MAD 0.01200; 3 samples / 74 ops |
| 8 | 10,000 | [`r8-10000-scroll-down.top-left`](./render-results.json) | median 1.354 ms; p95 1.379; MAD 0.02814; 3 samples / 223 ops | median 34.700 ms; p95 35.540; MAD 0.93333; 3 samples / 9 ops |
| 8 | 10,000 | [`r8-10000-scroll-down.middle`](./render-results.json) | median 1.068 ms; p95 1.191; MAD 0.03951; 3 samples / 276 ops | median 6.947 ms; p95 7.464; MAD 0.44667; 3 samples / 45 ops |
| 8 | 10,000 | [`r8-10000-scroll-smooth.same-window`](./render-results.json) | median 0.44336 ms; p95 0.46814; MAD 0.00916; 3 samples / 670 ops | median 28.800 ms; p95 29.452; MAD 0.72500; 3 samples / 12 ops |
| 8 | 10,000 | [`r8-10000-scroll-right.top-left`](./render-results.json) | median 0.29762 ms; p95 0.32778; MAD 0.03351; 3 samples / 1053 ops | median 30.925 ms; p95 30.970; MAD 0.05000; 3 samples / 12 ops |
| 8 | 10,000 | [`r8-10000-edit-open.top-left`](./render-results.json) | median 0.48502 ms; p95 0.49185; MAD 0.00656; 3 samples / 619 ops | median 1.210 ms; p95 1.239; MAD 0.03057; 3 samples / 250 ops |
| 8 | 10,000 | [`r8-10000-edit-open.middle`](./render-results.json) | median 0.55667 ms; p95 0.61057; MAD 0.01742; 3 samples / 529 ops | median 1.160 ms; p95 1.185; MAD 0.02847; 3 samples / 263 ops |
| 8 | 10,000 | [`r8-10000-edit-open.bottom-right`](./render-results.json) | median 0.64013 ms; p95 0.68360; MAD 0.04831; 3 samples / 481 ops | median 1.745 ms; p95 1.783; MAD 0.00172; 3 samples / 172 ops |
| 8 | 10,000 | [`r8-10000-edit-commit.middle`](./render-results.json) | median 0.79603 ms; p95 0.99324; MAD 0.01851; 3 samples / 354 ops | median 8.775 ms; p95 8.918; MAD 0.15833; 3 samples / 38 ops |
| 8 | 10,000 | [`r8-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.073 ms; p95 1.269; MAD 0.19446; 3 samples / 298 ops | median 29.475 ms; p95 30.532; MAD 1.175; 3 samples / 12 ops |
| 8 | 10,000 | [`r8-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.98136 ms; p95 1.073; MAD 0.07685; 3 samples / 322 ops | median 26.300 ms; p95 27.335; MAD 1.150; 3 samples / 12 ops |
| 8 | 10,000 | [`r8-10000-arrow-down.top-left`](./render-results.json) | median 0.60542 ms; p95 0.62178; MAD 0.01818; 3 samples / 505 ops | median 1.554 ms; p95 1.623; MAD 0.07680; 3 samples / 199 ops |
| 8 | 10,000 | [`r8-10000-arrow-right.middle`](./render-results.json) | median 0.56667 ms; p95 0.56956; MAD 0.00322; 3 samples / 533 ops | median 1.518 ms; p95 1.568; MAD 0.05526; 3 samples / 199 ops |
| 8 | 10,000 | [`r8-10000-formatted-paint.top-left`](./render-results.json) | median 0.77674 ms; p95 0.88229; MAD 0.04921; 3 samples / 384 ops | median 3.294 ms; p95 3.428; MAD 0.05806; 3 samples / 92 ops |
| 8 | 10,000 | [`r8-10000-merge-heavy.paint`](./render-results.json) | median 0.27402 ms; p95 0.35046; MAD 0.02170; 3 samples / 1124 ops | median 4.032 ms; p95 4.351; MAD 0.33914; 3 samples / 76 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.227 ms; p95 1.532; MAD 0.00032; 3 samples / 229 ops | median 86.550 ms; p95 92.805; MAD 6.950; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.145 ms; p95 1.216; MAD 0.05850; 3 samples / 262 ops | median 29.225 ms; p95 32.128; MAD 0.17500; 3 samples / 12 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45917 ms; p95 0.46732; MAD 0.00905; 3 samples / 665 ops | median 71.450 ms; p95 72.620; MAD 1.150; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.23890 ms; p95 0.35756; MAD 0.04585; 3 samples / 1261 ops | median 50.350 ms; p95 52.645; MAD 0.35000; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.52408 ms; p95 0.53676; MAD 0.01409; 3 samples / 613 ops | median 1.208 ms; p95 1.283; MAD 0.02373; 3 samples / 246 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.63418 ms; p95 0.74214; MAD 0.03358; 3 samples / 458 ops | median 1.610 ms; p95 1.674; MAD 0.05722; 3 samples / 188 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.49505 ms; p95 0.56189; MAD 0.03053; 3 samples / 595 ops | median 2.337 ms; p95 2.444; MAD 0.07943; 3 samples / 129 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 0.78385 ms; p95 0.81756; MAD 0.02971; 3 samples / 385 ops | median 35.800 ms; p95 36.850; MAD 0.76667; 3 samples / 9 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.426 ms; p95 2.783; MAD 0.04286; 3 samples / 123 ops | median 111.8 ms; p95 114.3; MAD 2.750; 3 samples / 5 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.618 ms; p95 2.860; MAD 0.11295; 3 samples / 116 ops | median 101.0 ms; p95 106.3; MAD 1.500; 3 samples / 5 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.58605 ms; p95 0.67628; MAD 0.04334; 3 samples / 503 ops | median 1.753 ms; p95 1.860; MAD 0.10263; 3 samples / 184 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.60667 ms; p95 0.62840; MAD 0.00547; 3 samples / 491 ops | median 2.104 ms; p95 2.364; MAD 0.09217; 3 samples / 140 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.80726 ms; p95 0.92025; MAD 0.11474; 3 samples / 396 ops | median 4.024 ms; p95 4.175; MAD 0.16800; 3 samples / 77 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.28931 ms; p95 0.29520; MAD 0.00655; 3 samples / 1093 ops | median 7.164 ms; p95 7.806; MAD 0.24429; 3 samples / 42 ops |
| 8 | 1,000,000 | [`r8-1000000-scroll-down.top-left`](./render-results.json) | median 1.242 ms; p95 1.250; MAD 0.00927; 3 samples / 244 ops | median 680.2 ms; p95 716.6; MAD 21.500; 3 samples / 3 ops |
| 8 | 1,000,000 | [`r8-1000000-scroll-down.middle`](./render-results.json) | median 1.022 ms; p95 1.113; MAD 0.00730; 3 samples / 286 ops | median 312.6 ms; p95 353.1; MAD 0.40000; 3 samples / 3 ops |
| 8 | 1,000,000 | [`r8-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.43712 ms; p95 0.45444; MAD 0.00249; 3 samples / 680 ops | median 686.7 ms; p95 894.3; MAD 33.200; 3 samples / 3 ops |
| 8 | 1,000,000 | [`r8-1000000-scroll-right.top-left`](./render-results.json) | median 0.28277 ms; p95 0.39832; MAD 0.00940; 3 samples / 1003 ops | median 399.3 ms; p95 406.0; MAD 7.400; 3 samples / 3 ops |
| 8 | 1,000,000 | [`r8-1000000-edit-open.top-left`](./render-results.json) | median 0.47895 ms; p95 1.839; MAD 0.04518; 3 samples / 491 ops | median 1.411 ms; p95 1.597; MAD 0.20663; 3 samples / 225 ops |
| 8 | 1,000,000 | [`r8-1000000-edit-open.middle`](./render-results.json) | median 0.51487 ms; p95 0.53633; MAD 0.02384; 3 samples / 586 ops | median 1.753 ms; p95 1.762; MAD 0.00971; 3 samples / 173 ops |
| 8 | 1,000,000 | [`r8-1000000-edit-open.bottom-right`](./render-results.json) | median 0.45180 ms; p95 0.52954; MAD 0.03472; 3 samples / 648 ops | median 2.436 ms; p95 2.543; MAD 0.11929; 3 samples / 126 ops |
| 8 | 1,000,000 | [`r8-1000000-edit-commit.middle`](./render-results.json) | median 0.77597 ms; p95 1.152; MAD 0.05883; 3 samples / 353 ops | median 336.6 ms; p95 350.4; MAD 15.300; 3 samples / 3 ops |
| 8 | 1,000,000 | [`r8-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.183 ms; p95 19.633; MAD 0.45000; 3 samples / 18 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 8 | 1,000,000 | [`r8-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.250 ms; p95 19.340; MAD 0.10000; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 8 | 1,000,000 | [`r8-1000000-arrow-down.top-left`](./render-results.json) | median 0.54402 ms; p95 0.90393; MAD 0.04502; 3 samples / 492 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 8 | 1,000,000 | [`r8-1000000-arrow-right.middle`](./render-results.json) | median 0.67554 ms; p95 1.177; MAD 0.10679; 3 samples / 446 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 8 | 1,000,000 | [`r8-1000000-formatted-paint.top-left`](./render-results.json) | median 0.82463 ms; p95 1.612; MAD 0.02780; 3 samples / 342 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 8 | 1,000,000 | [`r8-1000000-merge-heavy.paint`](./render-results.json) | median 0.32438 ms; p95 0.33608; MAD 0.01300; 3 samples / 1001 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 9 | 1,000 | [`r9-1000-scroll-down.top-left`](./render-results.json) | median 1.276 ms; p95 1.321; MAD 0.05030; 3 samples / 241 ops | median 27.775 ms; p95 28.045; MAD 0.15000; 3 samples / 12 ops |
| 9 | 1,000 | [`r9-1000-scroll-down.middle`](./render-results.json) | median 1.119 ms; p95 1.153; MAD 0.03814; 3 samples / 274 ops | median 4.771 ms; p95 4.934; MAD 0.06688; 3 samples / 64 ops |
| 9 | 1,000 | [`r9-1000-scroll-smooth.same-window`](./render-results.json) | median 0.45917 ms; p95 0.46816; MAD 0.00782; 3 samples / 654 ops | median 23.940 ms; p95 28.832; MAD 2.500; 3 samples / 14 ops |
| 9 | 1,000 | [`r9-1000-scroll-right.top-left`](./render-results.json) | median 0.30862 ms; p95 0.35261; MAD 0.04888; 3 samples / 1027 ops | median 27.500 ms; p95 28.332; MAD 0.92500; 3 samples / 12 ops |
| 9 | 1,000 | [`r9-1000-edit-open.top-left`](./render-results.json) | median 0.46869 ms; p95 0.52306; MAD 0.00294; 3 samples / 622 ops | median 1.278 ms; p95 1.289; MAD 0.01139; 3 samples / 241 ops |
| 9 | 1,000 | [`r9-1000-edit-open.middle`](./render-results.json) | median 0.53191 ms; p95 0.56624; MAD 0.01119; 3 samples / 558 ops | median 1.128 ms; p95 1.205; MAD 0.02260; 3 samples / 263 ops |
| 9 | 1,000 | [`r9-1000-edit-open.bottom-right`](./render-results.json) | median 0.43991 ms; p95 0.44399; MAD 0.00453; 3 samples / 686 ops | median 1.728 ms; p95 1.804; MAD 0.07759; 3 samples / 176 ops |
| 9 | 1,000 | [`r9-1000-edit-commit.middle`](./render-results.json) | median 0.79683 ms; p95 0.80400; MAD 0.00079; 3 samples / 377 ops | median 6.006 ms; p95 6.835; MAD 0.08235; 3 samples / 49 ops |
| 9 | 1,000 | [`r9-1000-altering.insert-5-rows-top`](./render-results.json) | median 1.004 ms; p95 1.174; MAD 0.18926; 3 samples / 313 ops | median 20.600 ms; p95 22.166; MAD 1.367; 3 samples / 16 ops |
| 9 | 1,000 | [`r9-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.90909 ms; p95 0.97679; MAD 0.07522; 3 samples / 345 ops | median 20.040 ms; p95 22.002; MAD 1.257; 3 samples / 16 ops |
| 9 | 1,000 | [`r9-1000-arrow-down.top-left`](./render-results.json) | median 0.56236 ms; p95 0.61986; MAD 0.00625; 3 samples / 518 ops | median 1.619 ms; p95 1.643; MAD 0.00161; 3 samples / 185 ops |
| 9 | 1,000 | [`r9-1000-arrow-right.middle`](./render-results.json) | median 0.58092 ms; p95 0.58344; MAD 0.00280; 3 samples / 519 ops | median 1.631 ms; p95 1.693; MAD 0.06935; 3 samples / 187 ops |
| 9 | 1,000 | [`r9-1000-formatted-paint.top-left`](./render-results.json) | median 0.74519 ms; p95 0.81702; MAD 0.06883; 3 samples / 415 ops | median 3.212 ms; p95 3.481; MAD 0.05000; 3 samples / 93 ops |
| 9 | 1,000 | [`r9-1000-merge-heavy.paint`](./render-results.json) | median 0.26455 ms; p95 0.26743; MAD 0.00320; 3 samples / 1206 ops | median 3.661 ms; p95 4.060; MAD 0.04286; 3 samples / 81 ops |
| 9 | 10,000 | [`r9-10000-scroll-down.top-left`](./render-results.json) | median 1.278 ms; p95 1.325; MAD 0.05178; 3 samples / 246 ops | median 49.333 ms; p95 55.063; MAD 6.367; 3 samples / 8 ops |
| 9 | 10,000 | [`r9-10000-scroll-down.middle`](./render-results.json) | median 1.098 ms; p95 1.107; MAD 0.00987; 3 samples / 276 ops | median 8.958 ms; p95 10.193; MAD 1.372; 3 samples / 36 ops |
| 9 | 10,000 | [`r9-10000-scroll-smooth.same-window`](./render-results.json) | median 0.43609 ms; p95 0.43819; MAD 0.00234; 3 samples / 692 ops | median 37.233 ms; p95 41.313; MAD 3.900; 3 samples / 9 ops |
| 9 | 10,000 | [`r9-10000-scroll-right.top-left`](./render-results.json) | median 0.27911 ms; p95 0.33149; MAD 0.00588; 3 samples / 1060 ops | median 55.100 ms; p95 56.360; MAD 1.400; 3 samples / 7 ops |
| 9 | 10,000 | [`r9-10000-edit-open.top-left`](./render-results.json) | median 0.47042 ms; p95 0.50669; MAD 0.00484; 3 samples / 624 ops | median 1.443 ms; p95 1.623; MAD 0.19977; 3 samples / 214 ops |
| 9 | 10,000 | [`r9-10000-edit-open.middle`](./render-results.json) | median 0.58171 ms; p95 0.59037; MAD 0.00032; 3 samples / 520 ops | median 1.143 ms; p95 1.200; MAD 0.05514; 3 samples / 264 ops |
| 9 | 10,000 | [`r9-10000-edit-open.bottom-right`](./render-results.json) | median 0.43565 ms; p95 0.45347; MAD 0.01980; 3 samples / 693 ops | median 1.657 ms; p95 1.845; MAD 0.02673; 3 samples / 178 ops |
| 9 | 10,000 | [`r9-10000-edit-commit.middle`](./render-results.json) | median 0.74370 ms; p95 0.79797; MAD 0.00074; 3 samples / 395 ops | median 7.600 ms; p95 8.154; MAD 0.23571; 3 samples / 41 ops |
| 9 | 10,000 | [`r9-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.035 ms; p95 1.174; MAD 0.12965; 3 samples / 306 ops | median 30.325 ms; p95 30.618; MAD 0.32500; 3 samples / 12 ops |
| 9 | 10,000 | [`r9-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.97864 ms; p95 1.255; MAD 0.06591; 3 samples / 297 ops | median 28.350 ms; p95 30.172; MAD 1.900; 3 samples / 12 ops |
| 9 | 10,000 | [`r9-10000-arrow-down.top-left`](./render-results.json) | median 0.63481 ms; p95 0.64907; MAD 0.01584; 3 samples / 477 ops | median 1.510 ms; p95 1.517; MAD 0.00773; 3 samples / 202 ops |
| 9 | 10,000 | [`r9-10000-arrow-right.middle`](./render-results.json) | median 0.61840 ms; p95 0.64426; MAD 0.00429; 3 samples / 483 ops | median 1.449 ms; p95 1.608; MAD 0.07049; 3 samples / 205 ops |
| 9 | 10,000 | [`r9-10000-formatted-paint.top-left`](./render-results.json) | median 0.75263 ms; p95 0.85944; MAD 0.02001; 3 samples / 396 ops | median 3.679 ms; p95 3.805; MAD 0.11650; 3 samples / 84 ops |
| 9 | 10,000 | [`r9-10000-merge-heavy.paint`](./render-results.json) | median 0.27452 ms; p95 0.30958; MAD 0.01171; 3 samples / 1090 ops | median 4.422 ms; p95 4.594; MAD 0.13841; 3 samples / 69 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.258 ms; p95 1.304; MAD 0.03433; 3 samples / 239 ops | median 87.700 ms; p95 98.860; MAD 10.200; 3 samples / 5 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.129 ms; p95 1.212; MAD 0.07342; 3 samples / 266 ops | median 29.875 ms; p95 34.728; MAD 2.275; 3 samples / 11 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.45225 ms; p95 0.45660; MAD 0.00090; 3 samples / 663 ops | median 78.300 ms; p95 81.540; MAD 3.600; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.22750 ms; p95 0.32151; MAD 0.00052; 3 samples / 1219 ops | median 51.850 ms; p95 55.990; MAD 1.500; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.51045 ms; p95 0.66872; MAD 0.01685; 3 samples / 550 ops | median 1.194 ms; p95 1.205; MAD 0.01198; 3 samples / 255 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.56554 ms; p95 0.60255; MAD 0.04113; 3 samples / 535 ops | median 1.587 ms; p95 1.593; MAD 0.00635; 3 samples / 191 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.51538 ms; p95 0.56205; MAD 0.03548; 3 samples / 581 ops | median 2.307 ms; p95 2.448; MAD 0.02955; 3 samples / 129 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.83306 ms; p95 0.87003; MAD 0.04108; 3 samples / 367 ops | median 36.500 ms; p95 39.200; MAD 3.000; 3 samples / 10 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.560 ms; p95 3.099; MAD 0.22744; 3 samples / 115 ops | median 113.2 ms; p95 129.1; MAD 16.150; 3 samples / 4 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.595 ms; p95 2.762; MAD 0.15097; 3 samples / 116 ops | median 102.1 ms; p95 111.6; MAD 0.45000; 3 samples / 5 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.64076 ms; p95 0.67632; MAD 0.03951; 3 samples / 491 ops | median 1.425 ms; p95 1.647; MAD 0.00986; 3 samples / 202 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.60542 ms; p95 0.62828; MAD 0.00120; 3 samples / 491 ops | median 1.831 ms; p95 1.926; MAD 0.02912; 3 samples / 163 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.81545 ms; p95 0.86651; MAD 0.05673; 3 samples / 407 ops | median 3.350 ms; p95 3.460; MAD 0.12241; 3 samples / 91 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.26769 ms; p95 0.27564; MAD 0.00884; 3 samples / 1208 ops | median 7.264 ms; p95 7.712; MAD 0.49725; 3 samples / 43 ops |
| 9 | 1,000,000 | [`r9-1000000-scroll-down.top-left`](./render-results.json) | median 1.295 ms; p95 1.331; MAD 0.03979; 3 samples / 233 ops | median 690.5 ms; p95 693.6; MAD 3.400; 3 samples / 3 ops |
| 9 | 1,000,000 | [`r9-1000000-scroll-down.middle`](./render-results.json) | median 1.090 ms; p95 1.969; MAD 0.00850; 3 samples / 262 ops | median 312.8 ms; p95 347.7; MAD 3.300; 3 samples / 3 ops |
| 9 | 1,000,000 | [`r9-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.42961 ms; p95 0.43257; MAD 0.00323; 3 samples / 699 ops | median 702.4 ms; p95 703.2; MAD 0.90000; 3 samples / 3 ops |
| 9 | 1,000,000 | [`r9-1000000-scroll-right.top-left`](./render-results.json) | median 0.31687 ms; p95 1.766; MAD 0.03783; 3 samples / 799 ops | median 349.0 ms; p95 353.3; MAD 4.800; 3 samples / 3 ops |
| 9 | 1,000,000 | [`r9-1000000-edit-open.top-left`](./render-results.json) | median 0.45500 ms; p95 0.48628; MAD 0.00206; 3 samples / 646 ops | median 1.453 ms; p95 1.778; MAD 0.25167; 3 samples / 210 ops |
| 9 | 1,000,000 | [`r9-1000000-edit-open.middle`](./render-results.json) | median 0.52618 ms; p95 0.52630; MAD 0.00014; 3 samples / 577 ops | median 1.816 ms; p95 1.923; MAD 0.00357; 3 samples / 164 ops |
| 9 | 1,000,000 | [`r9-1000000-edit-open.bottom-right`](./render-results.json) | median 0.42638 ms; p95 0.58782; MAD 0.00085; 3 samples / 661 ops | median 2.419 ms; p95 2.428; MAD 0.00952; 3 samples / 128 ops |
| 9 | 1,000,000 | [`r9-1000000-edit-commit.middle`](./render-results.json) | median 0.69241 ms; p95 0.74729; MAD 0.03016; 3 samples / 429 ops | median 325.7 ms; p95 370.9; MAD 8.100; 3 samples / 3 ops |
| 9 | 1,000,000 | [`r9-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.283 ms; p95 103.0; MAD 0.68333; 3 samples / 13 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 9 | 1,000,000 | [`r9-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.650 ms; p95 19.785; MAD 0.15000; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 9 | 1,000,000 | [`r9-1000000-arrow-down.top-left`](./render-results.json) | median 0.57102 ms; p95 0.58605; MAD 0.01670; 3 samples / 530 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 9 | 1,000,000 | [`r9-1000000-arrow-right.middle`](./render-results.json) | median 0.66424 ms; p95 0.81394; MAD 0.05882; 3 samples / 438 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 9 | 1,000,000 | [`r9-1000000-formatted-paint.top-left`](./render-results.json) | median 0.68562 ms; p95 2.313; MAD 0.01246; 3 samples / 356 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 9 | 1,000,000 | [`r9-1000000-merge-heavy.paint`](./render-results.json) | median 0.27066 ms; p95 0.27308; MAD 0.00269; 3 samples / 1226 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 10 | 1,000 | [`r10-1000-scroll-down.top-left`](./render-results.json) | median 1.221 ms; p95 1.292; MAD 0.07927; 3 samples / 247 ops | median 28.025 ms; p95 29.172; MAD 0.42500; 3 samples / 12 ops |
| 10 | 1,000 | [`r10-1000-scroll-down.middle`](./render-results.json) | median 1.100 ms; p95 1.146; MAD 0.04896; 3 samples / 274 ops | median 4.132 ms; p95 4.164; MAD 0.01200; 3 samples / 75 ops |
| 10 | 1,000 | [`r10-1000-scroll-smooth.same-window`](./render-results.json) | median 0.42863 ms; p95 0.43456; MAD 0.00585; 3 samples / 701 ops | median 21.440 ms; p95 22.322; MAD 0.50000; 3 samples / 15 ops |
| 10 | 1,000 | [`r10-1000-scroll-right.top-left`](./render-results.json) | median 0.21502 ms; p95 0.31733; MAD 0.01720; 3 samples / 1310 ops | median 25.160 ms; p95 27.851; MAD 1.760; 3 samples / 14 ops |
| 10 | 1,000 | [`r10-1000-edit-open.top-left`](./render-results.json) | median 0.46916 ms; p95 0.51613; MAD 0.00741; 3 samples / 623 ops | median 1.144 ms; p95 1.207; MAD 0.02432; 3 samples / 261 ops |
| 10 | 1,000 | [`r10-1000-edit-open.middle`](./render-results.json) | median 0.58655 ms; p95 0.59226; MAD 0.00635; 3 samples / 520 ops | median 1.109 ms; p95 1.159; MAD 0.02384; 3 samples / 271 ops |
| 10 | 1,000 | [`r10-1000-edit-open.bottom-right`](./render-results.json) | median 0.46869 ms; p95 0.47426; MAD 0.00140; 3 samples / 639 ops | median 2.168 ms; p95 2.269; MAD 0.11191; 3 samples / 146 ops |
| 10 | 1,000 | [`r10-1000-edit-commit.middle`](./render-results.json) | median 0.75833 ms; p95 0.78662; MAD 0.02230; 3 samples / 395 ops | median 5.912 ms; p95 5.917; MAD 0.00588; 3 samples / 52 ops |
| 10 | 1,000 | [`r10-1000-altering.insert-5-rows-top`](./render-results.json) | median 0.87931 ms; p95 1.036; MAD 0.12668; 3 samples / 352 ops | median 21.280 ms; p95 21.424; MAD 0.16000; 3 samples / 16 ops |
| 10 | 1,000 | [`r10-1000-altering.remove-5-rows-top`](./render-results.json) | median 0.94434 ms; p95 1.087; MAD 0.14990; 3 samples / 338 ops | median 19.350 ms; p95 19.815; MAD 0.40000; 3 samples / 18 ops |
| 10 | 1,000 | [`r10-1000-arrow-down.top-left`](./render-results.json) | median 0.56201 ms; p95 0.58155; MAD 0.01283; 3 samples / 534 ops | median 1.538 ms; p95 1.564; MAD 0.02895; 3 samples / 199 ops |
| 10 | 1,000 | [`r10-1000-arrow-right.middle`](./render-results.json) | median 0.58941 ms; p95 0.59840; MAD 0.00627; 3 samples / 509 ops | median 1.330 ms; p95 1.364; MAD 0.01447; 3 samples / 226 ops |
| 10 | 1,000 | [`r10-1000-formatted-paint.top-left`](./render-results.json) | median 0.89077 ms; p95 1.126; MAD 0.10874; 3 samples / 345 ops | median 3.242 ms; p95 3.508; MAD 0.09819; 3 samples / 92 ops |
| 10 | 1,000 | [`r10-1000-merge-heavy.paint`](./render-results.json) | median 0.28618 ms; p95 0.34989; MAD 0.05362; 3 samples / 1122 ops | median 3.661 ms; p95 3.859; MAD 0.07143; 3 samples / 82 ops |
| 10 | 10,000 | [`r10-10000-scroll-down.top-left`](./render-results.json) | median 1.193 ms; p95 1.305; MAD 0.05915; 3 samples / 249 ops | median 33.550 ms; p95 34.165; MAD 0.68333; 3 samples / 11 ops |
| 10 | 10,000 | [`r10-10000-scroll-down.middle`](./render-results.json) | median 1.090 ms; p95 1.145; MAD 0.00217; 3 samples / 272 ops | median 6.356 ms; p95 6.457; MAD 0.11250; 3 samples / 49 ops |
| 10 | 10,000 | [`r10-10000-scroll-smooth.same-window`](./render-results.json) | median 0.44229 ms; p95 0.46605; MAD 0.01463; 3 samples / 676 ops | median 25.775 ms; p95 27.688; MAD 0.07500; 3 samples / 12 ops |
| 10 | 10,000 | [`r10-10000-scroll-right.top-left`](./render-results.json) | median 0.28676 ms; p95 0.33751; MAD 0.05012; 3 samples / 1077 ops | median 26.350 ms; p95 26.598; MAD 0.27500; 3 samples / 12 ops |
| 10 | 10,000 | [`r10-10000-edit-open.top-left`](./render-results.json) | median 0.50863 ms; p95 0.73926; MAD 0.00511; 3 samples / 527 ops | median 1.127 ms; p95 1.253; MAD 0.00000; 3 samples / 257 ops |
| 10 | 10,000 | [`r10-10000-edit-open.middle`](./render-results.json) | median 0.49751 ms; p95 0.55975; MAD 0.00824; 3 samples / 583 ops | median 1.236 ms; p95 1.273; MAD 0.04141; 3 samples / 247 ops |
| 10 | 10,000 | [`r10-10000-edit-open.bottom-right`](./render-results.json) | median 0.42458 ms; p95 0.45318; MAD 0.01478; 3 samples / 701 ops | median 1.697 ms; p95 1.880; MAD 0.03759; 3 samples / 173 ops |
| 10 | 10,000 | [`r10-10000-edit-commit.middle`](./render-results.json) | median 0.73066 ms; p95 0.79595; MAD 0.03413; 3 samples / 406 ops | median 7.379 ms; p95 7.430; MAD 0.02143; 3 samples / 42 ops |
| 10 | 10,000 | [`r10-10000-altering.insert-5-rows-top`](./render-results.json) | median 1.129 ms; p95 1.165; MAD 0.03939; 3 samples / 267 ops | median 27.825 ms; p95 29.332; MAD 0.90000; 3 samples / 12 ops |
| 10 | 10,000 | [`r10-10000-altering.remove-5-rows-top`](./render-results.json) | median 0.99109 ms; p95 1.010; MAD 0.02118; 3 samples / 323 ops | median 26.525 ms; p95 27.133; MAD 0.67500; 3 samples / 13 ops |
| 10 | 10,000 | [`r10-10000-arrow-down.top-left`](./render-results.json) | median 0.63145 ms; p95 0.63258; MAD 0.00126; 3 samples / 492 ops | median 1.430 ms; p95 1.463; MAD 0.03667; 3 samples / 212 ops |
| 10 | 10,000 | [`r10-10000-arrow-right.middle`](./render-results.json) | median 0.59349 ms; p95 0.60314; MAD 0.01073; 3 samples / 508 ops | median 1.430 ms; p95 1.673; MAD 0.07324; 3 samples / 203 ops |
| 10 | 10,000 | [`r10-10000-formatted-paint.top-left`](./render-results.json) | median 0.73603 ms; p95 0.80260; MAD 0.00537; 3 samples / 413 ops | median 3.582 ms; p95 3.742; MAD 0.17712; 3 samples / 88 ops |
| 10 | 10,000 | [`r10-10000-merge-heavy.paint`](./render-results.json) | median 0.26455 ms; p95 0.27533; MAD 0.01198; 3 samples / 1226 ops | median 3.973 ms; p95 4.012; MAD 0.04292; 3 samples / 79 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.208 ms; p95 1.291; MAD 0.02726; 3 samples / 245 ops | median 85.000 ms; p95 88.375; MAD 2.850; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.152 ms; p95 1.175; MAD 0.02588; 3 samples / 261 ops | median 29.175 ms; p95 31.223; MAD 0.52500; 3 samples / 12 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.43652 ms; p95 0.48443; MAD 0.01467; 3 samples / 673 ops | median 81.850 ms; p95 86.485; MAD 5.150; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.23194 ms; p95 0.29993; MAD 0.00100; 3 samples / 1226 ops | median 54.450 ms; p95 58.905; MAD 3.250; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.48357 ms; p95 0.78299; MAD 0.02090; 3 samples / 547 ops | median 1.195 ms; p95 1.241; MAD 0.05044; 3 samples / 258 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.53057 ms; p95 0.65486; MAD 0.01140; 3 samples / 536 ops | median 1.587 ms; p95 1.612; MAD 0.02721; 3 samples / 195 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.47857 ms; p95 0.50331; MAD 0.00190; 3 samples / 618 ops | median 2.262 ms; p95 2.278; MAD 0.01732; 3 samples / 135 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 0.73897 ms; p95 0.86337; MAD 0.02111; 3 samples / 390 ops | median 34.300 ms; p95 35.080; MAD 0.86667; 3 samples / 10 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.495 ms; p95 2.732; MAD 0.16489; 3 samples / 125 ops | median 108.4 ms; p95 108.9; MAD 0.60000; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.473 ms; p95 2.952; MAD 0.08508; 3 samples / 118 ops | median 100.6 ms; p95 107.7; MAD 2.350; 3 samples / 4 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.60422 ms; p95 0.62461; MAD 0.01013; 3 samples / 495 ops | median 1.697 ms; p95 1.716; MAD 0.02161; 3 samples / 178 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.56236 ms; p95 0.61748; MAD 0.01291; 3 samples / 521 ops | median 1.969 ms; p95 1.979; MAD 0.01094; 3 samples / 154 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.77752 ms; p95 0.84199; MAD 0.07163; 3 samples / 395 ops | median 3.528 ms; p95 3.709; MAD 0.04828; 3 samples / 85 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.25770 ms; p95 0.30702; MAD 0.00129; 3 samples / 1119 ops | median 6.350 ms; p95 6.457; MAD 0.00625; 3 samples / 48 ops |
| 10 | 1,000,000 | [`r10-1000000-scroll-down.top-left`](./render-results.json) | median 1.244 ms; p95 1.308; MAD 0.00123; 3 samples / 239 ops | median 731.9 ms; p95 765.3; MAD 37.100; 3 samples / 3 ops |
| 10 | 1,000,000 | [`r10-1000000-scroll-down.middle`](./render-results.json) | median 1.133 ms; p95 1.164; MAD 0.03486; 3 samples / 272 ops | median 320.5 ms; p95 337.9; MAD 7.000; 3 samples / 3 ops |
| 10 | 1,000,000 | [`r10-1000000-scroll-smooth.same-window`](./render-results.json) | median 0.44185 ms; p95 0.44818; MAD 0.00703; 3 samples / 681 ops | median 754.1 ms; p95 763.4; MAD 10.300; 3 samples / 3 ops |
| 10 | 1,000,000 | [`r10-1000000-scroll-right.top-left`](./render-results.json) | median 0.24527 ms; p95 0.25732; MAD 0.00088; 3 samples / 1241 ops | median 382.4 ms; p95 436.7; MAD 24.100; 3 samples / 3 ops |
| 10 | 1,000,000 | [`r10-1000000-edit-open.top-left`](./render-results.json) | median 0.52135 ms; p95 0.64169; MAD 0.10119; 3 samples / 608 ops | median 1.334 ms; p95 1.485; MAD 0.06839; 3 samples / 222 ops |
| 10 | 1,000,000 | [`r10-1000000-edit-open.middle`](./render-results.json) | median 0.53298 ms; p95 1.375; MAD 0.03348; 3 samples / 473 ops | median 1.763 ms; p95 1.876; MAD 0.01316; 3 samples / 169 ops |
| 10 | 1,000,000 | [`r10-1000000-edit-open.bottom-right`](./render-results.json) | median 0.43420 ms; p95 0.66904; MAD 0.05137; 3 samples / 637 ops | median 2.471 ms; p95 2.709; MAD 0.12655; 3 samples / 123 ops |
| 10 | 1,000,000 | [`r10-1000000-edit-commit.middle`](./render-results.json) | median 0.73824 ms; p95 0.77359; MAD 0.03928; 3 samples / 417 ops | median 332.1 ms; p95 371.3; MAD 14.000; 3 samples / 3 ops |
| 10 | 1,000,000 | [`r10-1000000-altering.insert-5-rows-top`](./render-results.json) | median 19.183 ms; p95 21.394; MAD 0.31667; 3 samples / 17 ops | **FAILED (warmup)** — RangeError: Maximum call stack size exceeded |
| 10 | 1,000,000 | [`r10-1000000-altering.remove-5-rows-top`](./render-results.json) | median 19.333 ms; p95 19.753; MAD 0.06667; 3 samples / 18 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 10 | 1,000,000 | [`r10-1000000-arrow-down.top-left`](./render-results.json) | median 0.54348 ms; p95 0.64050; MAD 0.02160; 3 samples / 532 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 10 | 1,000,000 | [`r10-1000000-arrow-right.middle`](./render-results.json) | median 0.57257 ms; p95 0.61794; MAD 0.00833; 3 samples / 515 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 10 | 1,000,000 | [`r10-1000000-formatted-paint.top-left`](./render-results.json) | median 0.67248 ms; p95 0.97998; MAD 0.00000; 3 samples / 397 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |
| 10 | 1,000,000 | [`r10-1000000-merge-heavy.paint`](./render-results.json) | median 0.27426 ms; p95 0.40886; MAD 0.00996; 3 samples / 1090 ops | **FAILED (validate)** — ScenarioValidationError: canonical row count: expected 1000000, observed 1000005 |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
