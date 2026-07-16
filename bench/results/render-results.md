# Auditable render benchmark

Protocol version: **1**  
Run ID: `e91e7fe9-768b-4dea-87d1-c76b18985414`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `a1567880e5be02bf7ed0f83a193f43f52800b0ae` (clean) |
| Timestamp | 2026-07-16T17:57:28.919Z |
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
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.196 ms; p95 1.276; MAD 0.05438; 3 samples / 250 ops | median 89.800 ms; p95 90.655; MAD 0.95000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.117 ms; p95 1.149; MAD 0.03621; 3 samples / 271 ops | median 31.200 ms; p95 31.267; MAD 0.07500; 3 samples / 12 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.46296 ms; p95 0.47210; MAD 0.01015; 3 samples / 658 ops | median 79.450 ms; p95 82.240; MAD 2.000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.24631 ms; p95 0.28652; MAD 0.02458; 3 samples / 1201 ops | median 61.750 ms; p95 66.070; MAD 2.250; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.48038 ms; p95 0.50814; MAD 0.03084; 3 samples / 652 ops | median 1.212 ms; p95 1.295; MAD 0.00482; 3 samples / 243 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.50812 ms; p95 0.50904; MAD 0.00066; 3 samples / 595 ops | median 1.564 ms; p95 1.570; MAD 0.00625; 3 samples / 193 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.51701 ms; p95 0.53491; MAD 0.01989; 3 samples / 596 ops | median 2.545 ms; p95 2.677; MAD 0.14711; 3 samples / 122 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.75149 ms; p95 0.77771; MAD 0.02323; 3 samples / 401 ops | median 39.933 ms; p95 42.033; MAD 2.333; 3 samples / 9 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.535 ms; p95 2.727; MAD 0.02750; 3 samples / 117 ops | median 114.1 ms; p95 114.2; MAD 0.10000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.600 ms; p95 2.638; MAD 0.04211; 3 samples / 117 ops | median 123.2 ms; p95 126.3; MAD 3.400; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.67248 ms; p95 0.73956; MAD 0.07076; 3 samples / 457 ops | median 1.517 ms; p95 1.539; MAD 0.01219; 3 samples / 198 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.62875 ms; p95 0.65346; MAD 0.02746; 3 samples / 490 ops | median 2.067 ms; p95 2.127; MAD 0.06670; 3 samples / 150 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.83388 ms; p95 0.93499; MAD 0.04045; 3 samples / 364 ops | median 3.245 ms; p95 3.471; MAD 0.12698; 3 samples / 93 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.26814 ms; p95 0.36795; MAD 0.02242; 3 samples / 1108 ops | median 6.600 ms; p95 6.611; MAD 0.01250; 3 samples / 48 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.243 ms; p95 1.363; MAD 0.02004; 3 samples / 236 ops | median 87.750 ms; p95 89.370; MAD 1.800; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.147 ms; p95 1.189; MAD 0.04746; 3 samples / 267 ops | median 27.575 ms; p95 27.913; MAD 0.37500; 3 samples / 12 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44933 ms; p95 0.46946; MAD 0.02237; 3 samples / 672 ops | median 74.700 ms; p95 75.600; MAD 0.15000; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.24120 ms; p95 0.27094; MAD 0.01421; 3 samples / 1269 ops | median 50.900 ms; p95 52.160; MAD 1.400; 3 samples / 7 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.46698 ms; p95 0.74577; MAD 0.02557; 3 samples / 571 ops | median 1.109 ms; p95 1.121; MAD 0.00220; 3 samples / 272 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.54945 ms; p95 0.56309; MAD 0.01516; 3 samples / 557 ops | median 1.685 ms; p95 1.754; MAD 0.04074; 3 samples / 178 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.48829 ms; p95 0.49749; MAD 0.01021; 3 samples / 624 ops | median 2.185 ms; p95 2.442; MAD 0.05978; 3 samples / 135 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.73971 ms; p95 0.74130; MAD 0.00178; 3 samples / 414 ops | median 32.325 ms; p95 32.438; MAD 0.12500; 3 samples / 12 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.333 ms; p95 2.671; MAD 0.01892; 3 samples / 131 ops | median 105.6 ms; p95 114.2; MAD 4.250; 3 samples / 4 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.473 ms; p95 2.680; MAD 0.21539; 3 samples / 123 ops | median 100.7 ms; p95 108.8; MAD 2.900; 3 samples / 4 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.56348 ms; p95 0.62882; MAD 0.00482; 3 samples / 515 ops | median 2.153 ms; p95 2.298; MAD 0.16044; 3 samples / 147 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.65490 ms; p95 0.67012; MAD 0.01691; 3 samples / 467 ops | median 2.057 ms; p95 2.190; MAD 0.14720; 3 samples / 149 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.69583 ms; p95 0.75547; MAD 0.03292; 3 samples / 448 ops | median 3.726 ms; p95 4.250; MAD 0.15093; 3 samples / 79 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.28169 ms; p95 0.30424; MAD 0.02506; 3 samples / 1090 ops | median 6.733 ms; p95 6.763; MAD 0.03333; 3 samples / 46 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.494 ms; p95 1.540; MAD 0.05059; 3 samples / 205 ops | median 87.400 ms; p95 88.705; MAD 1.450; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.254 ms; p95 1.583; MAD 0.02326; 3 samples / 224 ops | median 28.125 ms; p95 30.915; MAD 0.25000; 3 samples / 12 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.55304 ms; p95 0.56092; MAD 0.00876; 3 samples / 555 ops | median 80.350 ms; p95 81.970; MAD 1.800; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.31560 ms; p95 0.32217; MAD 0.00731; 3 samples / 974 ops | median 54.550 ms; p95 54.775; MAD 0.25000; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.58713 ms; p95 0.87246; MAD 0.02880; 3 samples / 471 ops | median 1.233 ms; p95 1.520; MAD 0.08747; 3 samples / 235 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.62174 ms; p95 0.68717; MAD 0.06760; 3 samples / 486 ops | median 1.971 ms; p95 2.387; MAD 0.06304; 3 samples / 146 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.52684 ms; p95 0.59215; MAD 0.04005; 3 samples / 569 ops | median 2.786 ms; p95 2.791; MAD 0.00578; 3 samples / 111 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.89823 ms; p95 1.103; MAD 0.01327; 3 samples / 315 ops | median 39.400 ms; p95 39.910; MAD 0.56667; 3 samples / 9 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.274 ms; p95 3.622; MAD 0.38652; 3 samples / 97 ops | median 129.9 ms; p95 134.6; MAD 5.200; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.797 ms; p95 2.864; MAD 0.07421; 3 samples / 109 ops | median 107.4 ms; p95 122.8; MAD 3.300; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.70493 ms; p95 0.73879; MAD 0.03762; 3 samples / 434 ops | median 1.840 ms; p95 1.852; MAD 0.01370; 3 samples / 172 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.71942 ms; p95 0.76034; MAD 0.03312; 3 samples / 416 ops | median 1.954 ms; p95 2.013; MAD 0.04630; 3 samples / 155 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 1.088 ms; p95 1.150; MAD 0.06895; 3 samples / 290 ops | median 3.927 ms; p95 4.169; MAD 0.26891; 3 samples / 79 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.32290 ms; p95 0.43994; MAD 0.04968; 3 samples / 897 ops | median 7.347 ms; p95 8.332; MAD 0.44667; 3 samples / 42 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.499 ms; p95 1.634; MAD 0.04360; 3 samples / 200 ops | median 97.350 ms; p95 100.8; MAD 1.800; 3 samples / 5 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.431 ms; p95 1.551; MAD 0.13298; 3 samples / 219 ops | median 34.567 ms; p95 39.607; MAD 2.592; 3 samples / 10 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.51598 ms; p95 0.53065; MAD 0.01630; 3 samples / 586 ops | median 86.750 ms; p95 87.155; MAD 0.45000; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.32468 ms; p95 0.33065; MAD 0.00663; 3 samples / 957 ops | median 67.250 ms; p95 68.960; MAD 1.800; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.73603 ms; p95 1.024; MAD 0.14708; 3 samples / 404 ops | median 1.475 ms; p95 1.517; MAD 0.04585; 3 samples / 208 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.71329 ms; p95 0.78359; MAD 0.01329; 3 samples / 414 ops | median 1.986 ms; p95 2.059; MAD 0.08107; 3 samples / 153 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.52789 ms; p95 0.57963; MAD 0.03960; 3 samples / 566 ops | median 2.705 ms; p95 2.749; MAD 0.04865; 3 samples / 114 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 0.97670 ms; p95 1.002; MAD 0.00194; 3 samples / 306 ops | median 38.500 ms; p95 40.750; MAD 1.567; 3 samples / 9 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.920 ms; p95 3.279; MAD 0.20108; 3 samples / 103 ops | median 114.6 ms; p95 120.0; MAD 6.000; 3 samples / 3 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.900 ms; p95 2.902; MAD 0.00263; 3 samples / 110 ops | median 122.5 ms; p95 126.6; MAD 4.100; 3 samples / 3 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.82195 ms; p95 0.95686; MAD 0.11060; 3 samples / 367 ops | median 1.807 ms; p95 1.872; MAD 0.07249; 3 samples / 169 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.73427 ms; p95 0.74209; MAD 0.00600; 3 samples / 416 ops | median 2.466 ms; p95 2.533; MAD 0.03014; 3 samples / 123 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.88761 ms; p95 0.96540; MAD 0.01544; 3 samples / 332 ops | median 3.912 ms; p95 4.060; MAD 0.13006; 3 samples / 78 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.36765 ms; p95 0.42332; MAD 0.06185; 3 samples / 928 ops | median 8.408 ms; p95 8.663; MAD 0.28397; 3 samples / 38 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.527 ms; p95 1.717; MAD 0.00152; 3 samples / 193 ops | median 93.450 ms; p95 96.870; MAD 1.850; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.454 ms; p95 1.526; MAD 0.00648; 3 samples / 207 ops | median 33.850 ms; p95 35.605; MAD 1.950; 3 samples / 11 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.53871 ms; p95 0.55537; MAD 0.01851; 3 samples / 560 ops | median 90.350 ms; p95 104.4; MAD 0.65000; 3 samples / 5 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.31657 ms; p95 0.31819; MAD 0.00181; 3 samples / 992 ops | median 57.900 ms; p95 58.395; MAD 0.55000; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.93333 ms; p95 1.210; MAD 0.30758; 3 samples / 358 ops | median 1.536 ms; p95 1.567; MAD 0.03395; 3 samples / 200 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.79365 ms; p95 0.83718; MAD 0.04837; 3 samples / 396 ops | median 1.994 ms; p95 2.028; MAD 0.03788; 3 samples / 155 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.53404 ms; p95 0.58367; MAD 0.00944; 3 samples / 564 ops | median 2.814 ms; p95 3.017; MAD 0.21645; 3 samples / 108 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.91727 ms; p95 0.93537; MAD 0.02011; 3 samples / 330 ops | median 43.467 ms; p95 43.767; MAD 0.33333; 3 samples / 9 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.393 ms; p95 3.561; MAD 0.18598; 3 samples / 95 ops | median 112.7 ms; p95 129.4; MAD 6.800; 3 samples / 3 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.112 ms; p95 3.131; MAD 0.02121; 3 samples / 102 ops | median 116.6 ms; p95 129.0; MAD 13.500; 3 samples / 3 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.69583 ms; p95 0.70980; MAD 0.00679; 3 samples / 431 ops | median 1.802 ms; p95 1.848; MAD 0.05094; 3 samples / 172 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.77000 ms; p95 0.88381; MAD 0.00000; 3 samples / 373 ops | median 2.429 ms; p95 2.486; MAD 0.02857; 3 samples / 125 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.91182 ms; p95 1.153; MAD 0.07765; 3 samples / 315 ops | median 4.028 ms; p95 4.766; MAD 0.29229; 3 samples / 74 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.34130 ms; p95 0.36531; MAD 0.02668; 3 samples / 955 ops | median 7.593 ms; p95 8.754; MAD 0.16429; 3 samples / 40 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.532 ms; p95 1.691; MAD 0.02734; 3 samples / 192 ops | median 86.700 ms; p95 87.330; MAD 0.70000; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.256 ms; p95 1.571; MAD 0.04059; 3 samples / 226 ops | median 31.600 ms; p95 33.700; MAD 1.150; 3 samples / 11 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.51598 ms; p95 0.52826; MAD 0.01365; 3 samples / 584 ops | median 86.050 ms; p95 91.720; MAD 6.050; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.32680 ms; p95 0.45143; MAD 0.03354; 3 samples / 863 ops | median 58.350 ms; p95 63.345; MAD 2.400; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.61852 ms; p95 0.88837; MAD 0.01310; 3 samples / 437 ops | median 1.280 ms; p95 1.443; MAD 0.08808; 3 samples / 232 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.67315 ms; p95 0.76447; MAD 0.00382; 3 samples / 429 ops | median 1.956 ms; p95 2.093; MAD 0.06898; 3 samples / 153 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.59583 ms; p95 0.70107; MAD 0.06794; 3 samples / 499 ops | median 2.825 ms; p95 2.890; MAD 0.07222; 3 samples / 111 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 1.064 ms; p95 1.067; MAD 0.00319; 3 samples / 283 ops | median 41.633 ms; p95 49.133; MAD 2.867; 3 samples / 9 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.122 ms; p95 3.271; MAD 0.16487; 3 samples / 106 ops | median 121.1 ms; p95 138.4; MAD 5.800; 3 samples / 3 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.751 ms; p95 2.849; MAD 0.10865; 3 samples / 111 ops | median 126.8 ms; p95 126.9; MAD 0.10000; 3 samples / 3 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.67133 ms; p95 0.81938; MAD 0.06467; 3 samples / 435 ops | median 1.805 ms; p95 1.833; MAD 0.02632; 3 samples / 169 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.75489 ms; p95 0.76098; MAD 0.00677; 3 samples / 415 ops | median 2.540 ms; p95 2.656; MAD 0.11857; 3 samples / 120 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.78594 ms; p95 0.98187; MAD 0.01363; 3 samples / 368 ops | median 4.092 ms; p95 4.302; MAD 0.18089; 3 samples / 76 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.36514 ms; p95 0.37373; MAD 0.00955; 3 samples / 997 ops | median 8.417 ms; p95 8.537; MAD 0.13333; 3 samples / 37 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.698 ms; p95 1.720; MAD 0.02373; 3 samples / 184 ops | median 109.6 ms; p95 118.1; MAD 9.450; 3 samples / 5 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.434 ms; p95 1.517; MAD 0.09147; 3 samples / 211 ops | median 37.367 ms; p95 38.117; MAD 0.83333; 3 samples / 9 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.67635 ms; p95 0.69952; MAD 0.02575; 3 samples / 470 ops | median 101.6 ms; p95 110.2; MAD 4.100; 3 samples / 4 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.32186 ms; p95 0.43276; MAD 0.05422; 3 samples / 929 ops | median 62.200 ms; p95 62.650; MAD 0.50000; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.56145 ms; p95 0.61547; MAD 0.00731; 3 samples / 523 ops | median 1.392 ms; p95 1.575; MAD 0.05433; 3 samples / 210 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.75564 ms; p95 0.92140; MAD 0.10820; 3 samples / 397 ops | median 2.047 ms; p95 2.135; MAD 0.03494; 3 samples / 146 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.62236 ms; p95 0.65826; MAD 0.00903; 3 samples / 477 ops | median 2.642 ms; p95 2.812; MAD 0.16650; 3 samples / 115 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 0.93704 ms; p95 0.96749; MAD 0.01869; 3 samples / 320 ops | median 40.900 ms; p95 43.030; MAD 0.16667; 3 samples / 9 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.420 ms; p95 3.560; MAD 0.15500; 3 samples / 94 ops | median 128.9 ms; p95 145.2; MAD 13.800; 3 samples / 3 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.166 ms; p95 3.460; MAD 0.00313; 3 samples / 93 ops | median 131.3 ms; p95 139.1; MAD 6.600; 3 samples / 3 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.80240 ms; p95 0.82385; MAD 0.02383; 3 samples / 380 ops | median 1.915 ms; p95 2.080; MAD 0.10617; 3 samples / 157 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.73750 ms; p95 0.75761; MAD 0.00684; 3 samples / 405 ops | median 2.639 ms; p95 2.644; MAD 0.00526; 3 samples / 120 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.88673 ms; p95 0.95838; MAD 0.00602; 3 samples / 331 ops | median 4.052 ms; p95 4.204; MAD 0.16883; 3 samples / 77 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.36268 ms; p95 0.37651; MAD 0.01537; 3 samples / 917 ops | median 7.854 ms; p95 7.944; MAD 0.10000; 3 samples / 40 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.533 ms; p95 1.733; MAD 0.22167; 3 samples / 203 ops | median 96.700 ms; p95 107.5; MAD 1.600; 3 samples / 5 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.403 ms; p95 1.412; MAD 0.00990; 3 samples / 222 ops | median 37.833 ms; p95 55.533; MAD 3.300; 3 samples / 8 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.56236 ms; p95 0.61580; MAD 0.03220; 3 samples / 528 ops | median 97.500 ms; p95 107.0; MAD 0.30000; 3 samples / 5 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.31566 ms; p95 0.32271; MAD 0.00783; 3 samples / 1003 ops | median 63.400 ms; p95 66.955; MAD 3.950; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.74118 ms; p95 1.017; MAD 0.11368; 3 samples / 392 ops | median 1.461 ms; p95 1.561; MAD 0.11144; 3 samples / 210 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.72230 ms; p95 0.78302; MAD 0.01531; 3 samples / 409 ops | median 1.975 ms; p95 2.082; MAD 0.11924; 3 samples / 154 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.59172 ms; p95 0.66789; MAD 0.00858; 3 samples / 489 ops | median 2.672 ms; p95 2.748; MAD 0.08496; 3 samples / 116 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 1.045 ms; p95 1.259; MAD 0.15807; 3 samples / 287 ops | median 37.933 ms; p95 40.573; MAD 0.26667; 3 samples / 9 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.006 ms; p95 3.876; MAD 0.06471; 3 samples / 94 ops | median 114.5 ms; p95 124.1; MAD 2.500; 3 samples / 3 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.184 ms; p95 3.327; MAD 0.10862; 3 samples / 95 ops | median 119.9 ms; p95 120.9; MAD 1.100; 3 samples / 3 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.79922 ms; p95 0.92659; MAD 0.07241; 3 samples / 374 ops | median 1.842 ms; p95 1.997; MAD 0.01818; 3 samples / 160 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.77099 ms; p95 0.77547; MAD 0.00498; 3 samples / 399 ops | median 2.500 ms; p95 2.590; MAD 0.04878; 3 samples / 120 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.95619 ms; p95 0.96505; MAD 0.00985; 3 samples / 331 ops | median 4.296 ms; p95 4.602; MAD 0.34053; 3 samples / 73 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.31572 ms; p95 0.43200; MAD 0.01085; 3 samples / 882 ops | median 7.393 ms; p95 8.337; MAD 0.22143; 3 samples / 40 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.336 ms; p95 1.352; MAD 0.01363; 3 samples / 225 ops | median 93.900 ms; p95 99.840; MAD 5.300; 3 samples / 5 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.359 ms; p95 1.395; MAD 0.03915; 3 samples / 225 ops | median 35.267 ms; p95 35.507; MAD 0.26667; 3 samples / 9 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.52461 ms; p95 0.52614; MAD 0.00171; 3 samples / 598 ops | median 86.700 ms; p95 89.400; MAD 0.35000; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.24655 ms; p95 0.30503; MAD 0.00501; 3 samples / 1141 ops | median 60.850 ms; p95 63.055; MAD 0.20000; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.51385 ms; p95 0.62521; MAD 0.00577; 3 samples / 550 ops | median 1.362 ms; p95 1.446; MAD 0.04637; 3 samples / 219 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.60120 ms; p95 0.65459; MAD 0.02961; 3 samples / 495 ops | median 1.870 ms; p95 1.897; MAD 0.02963; 3 samples / 166 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.59349 ms; p95 0.63743; MAD 0.04882; 3 samples / 546 ops | median 2.781 ms; p95 2.945; MAD 0.18230; 3 samples / 112 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.94340 ms; p95 1.097; MAD 0.04069; 3 samples / 307 ops | median 41.867 ms; p95 43.637; MAD 0.36667; 3 samples / 9 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.569 ms; p95 3.450; MAD 0.07899; 3 samples / 109 ops | median 122.4 ms; p95 125.6; MAD 3.500; 3 samples / 3 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.776 ms; p95 2.875; MAD 0.11004; 3 samples / 111 ops | median 122.1 ms; p95 142.7; MAD 3.500; 3 samples / 3 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.67770 ms; p95 0.76824; MAD 0.05410; 3 samples / 438 ops | median 1.835 ms; p95 2.207; MAD 0.03812; 3 samples / 156 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.66000 ms; p95 0.67472; MAD 0.01419; 3 samples / 458 ops | median 2.377 ms; p95 2.475; MAD 0.10862; 3 samples / 129 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.89464 ms; p95 1.101; MAD 0.11387; 3 samples / 331 ops | median 3.629 ms; p95 3.963; MAD 0.05357; 3 samples / 82 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.33449 ms; p95 0.34363; MAD 0.01015; 3 samples / 968 ops | median 7.400 ms; p95 7.490; MAD 0.10000; 3 samples / 44 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.736 ms; p95 1.882; MAD 0.03790; 3 samples / 170 ops | median 89.600 ms; p95 101.1; MAD 5.100; 3 samples / 5 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.528 ms; p95 1.620; MAD 0.03433; 3 samples / 196 ops | median 36.000 ms; p95 36.540; MAD 0.60000; 3 samples / 10 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.52684 ms; p95 0.55141; MAD 0.01300; 3 samples / 566 ops | median 81.850 ms; p95 87.880; MAD 4.100; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.31928 ms; p95 0.39049; MAD 0.01446; 3 samples / 915 ops | median 67.600 ms; p95 68.095; MAD 0.55000; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.64359 ms; p95 0.74742; MAD 0.11537; 3 samples / 480 ops | median 1.364 ms; p95 1.470; MAD 0.07121; 3 samples / 220 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.73750 ms; p95 0.79447; MAD 0.06330; 3 samples / 439 ops | median 1.825 ms; p95 1.871; MAD 0.05047; 3 samples / 167 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.55470 ms; p95 0.59172; MAD 0.01793; 3 samples / 553 ops | median 2.661 ms; p95 2.953; MAD 0.04001; 3 samples / 112 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 0.80000 ms; p95 0.97376; MAD 0.01181; 3 samples / 353 ops | median 34.300 ms; p95 37.120; MAD 0.06667; 3 samples / 9 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.755 ms; p95 3.509; MAD 0.02283; 3 samples / 103 ops | median 114.2 ms; p95 135.8; MAD 8.300; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.749 ms; p95 2.846; MAD 0.10849; 3 samples / 113 ops | median 113.5 ms; p95 131.9; MAD 4.200; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.75263 ms; p95 0.77460; MAD 0.02441; 3 samples / 410 ops | median 1.782 ms; p95 1.937; MAD 0.00351; 3 samples / 166 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.69653 ms; p95 0.78115; MAD 0.01815; 3 samples / 419 ops | median 2.102 ms; p95 2.106; MAD 0.00417; 3 samples / 145 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.79841 ms; p95 0.96572; MAD 0.01638; 3 samples / 356 ops | median 3.796 ms; p95 4.491; MAD 0.02593; 3 samples / 76 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.27800 ms; p95 0.39607; MAD 0.00073; 3 samples / 1090 ops | median 7.240 ms; p95 9.372; MAD 0.42000; 3 samples / 41 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
