# Auditable render benchmark

Protocol version: **1**  
Run ID: `ba51cb5f-7326-42e3-b088-fbe79b32b9b9`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `79239ba9ec838398ed1c65c8dd801256d9bb714c` (clean) |
| Timestamp | 2026-07-26T12:37:04.001Z |
| Runtime | Bun 1.3.14; Node 24.3.0 |
| Browser | 149.0.7827.55 |
| OS / arch | linux 7.1.3-2-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.3.1; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 20 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.390 ms; p95 1.393; MAD 0.00278; 3 samples / 221 ops | median 182.0 ms; p95 209.9; MAD 2.000; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.297 ms; p95 1.313; MAD 0.01685; 3 samples / 241 ops | median 54.400 ms; p95 57.820; MAD 0.25000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.46837 ms; p95 0.51362; MAD 0.00062; 3 samples / 622 ops | median 148.0 ms; p95 161.9; MAD 3.600; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.36630 ms; p95 0.38049; MAD 0.01577; 3 samples / 863 ops | median 56.950 ms; p95 57.445; MAD 0.55000; 3 samples / 6 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.55730 ms; p95 0.58310; MAD 0.01908; 3 samples / 547 ops | median 1.262 ms; p95 1.337; MAD 0.08283; 3 samples / 240 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.57143 ms; p95 0.61603; MAD 0.01587; 3 samples / 517 ops | median 1.645 ms; p95 1.658; MAD 0.01386; 3 samples / 190 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.52073 ms; p95 0.53905; MAD 0.00534; 3 samples / 573 ops | median 2.347 ms; p95 2.370; MAD 0.02558; 3 samples / 131 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.89831 ms; p95 0.93768; MAD 0.04375; 3 samples / 349 ops | median 35.600 ms; p95 36.050; MAD 0.20000; 3 samples / 9 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.634 ms; p95 3.124; MAD 0.03677; 3 samples / 109 ops | median 119.4 ms; p95 126.0; MAD 7.300; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.926 ms; p95 3.568; MAD 0.27571; 3 samples / 101 ops | median 106.0 ms; p95 109.5; MAD 2.700; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.61280 ms; p95 0.63298; MAD 0.00305; 3 samples / 487 ops | median 1.542 ms; p95 1.548; MAD 0.00769; 3 samples / 199 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.64581 ms; p95 0.66578; MAD 0.02219; 3 samples / 469 ops | median 2.069 ms; p95 2.129; MAD 0.06678; 3 samples / 148 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.82869 ms; p95 0.91434; MAD 0.09516; 3 samples / 372 ops | median 4.448 ms; p95 5.080; MAD 0.34783; 3 samples / 68 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.28519 ms; p95 0.36593; MAD 0.00894; 3 samples / 980 ops | median 7.529 ms; p95 7.891; MAD 0.14286; 3 samples / 41 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.434 ms; p95 1.704; MAD 0.07212; 3 samples / 202 ops | median 92.350 ms; p95 105.6; MAD 4.350; 3 samples / 5 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.214 ms; p95 1.282; MAD 0.04934; 3 samples / 247 ops | median 34.133 ms; p95 36.443; MAD 0.20000; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.53245 ms; p95 0.54168; MAD 0.01026; 3 samples / 581 ops | median 90.600 ms; p95 121.6; MAD 17.250; 3 samples / 5 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.46605 ms; p95 0.47809; MAD 0.01338; 3 samples / 665 ops | median 56.750 ms; p95 58.505; MAD 1.950; 3 samples / 6 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.57314 ms; p95 0.60003; MAD 0.02987; 3 samples / 539 ops | median 1.258 ms; p95 1.276; MAD 0.02098; 3 samples / 242 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.61840 ms; p95 0.62476; MAD 0.00706; 3 samples / 497 ops | median 1.889 ms; p95 1.909; MAD 0.01461; 3 samples / 160 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.47895 ms; p95 0.50800; MAD 0.03228; 3 samples / 635 ops | median 2.540 ms; p95 2.578; MAD 0.04205; 3 samples / 120 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.86983 ms; p95 1.066; MAD 0.03483; 3 samples / 328 ops | median 37.367 ms; p95 38.747; MAD 0.86667; 3 samples / 9 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.770 ms; p95 2.842; MAD 0.03243; 3 samples / 110 ops | median 108.1 ms; p95 112.5; MAD 4.900; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.674 ms; p95 3.657; MAD 0.09933; 3 samples / 104 ops | median 119.4 ms; p95 121.6; MAD 2.400; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.65260 ms; p95 0.69526; MAD 0.01438; 3 samples / 466 ops | median 1.664 ms; p95 1.671; MAD 0.00773; 3 samples / 189 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.68299 ms; p95 0.70464; MAD 0.02405; 3 samples / 448 ops | median 2.193 ms; p95 2.271; MAD 0.00217; 3 samples / 137 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.84000 ms; p95 0.91299; MAD 0.05094; 3 samples / 357 ops | median 3.950 ms; p95 4.183; MAD 0.25833; 3 samples / 79 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.31087 ms; p95 0.34524; MAD 0.03204; 3 samples / 1001 ops | median 7.371 ms; p95 7.564; MAD 0.21429; 3 samples / 44 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.351 ms; p95 1.403; MAD 0.05710; 3 samples / 223 ops | median 90.500 ms; p95 92.210; MAD 1.900; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.241 ms; p95 1.289; MAD 0.01025; 3 samples / 241 ops | median 35.200 ms; p95 38.650; MAD 3.833; 3 samples / 10 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44489 ms; p95 0.61946; MAD 0.01299; 3 samples / 614 ops | median 77.850 ms; p95 80.145; MAD 2.050; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.32362 ms; p95 0.33498; MAD 0.01260; 3 samples / 979 ops | median 54.100 ms; p95 56.215; MAD 0.60000; 3 samples / 6 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.52963 ms; p95 0.55446; MAD 0.02759; 3 samples / 571 ops | median 1.275 ms; p95 1.356; MAD 0.04298; 3 samples / 235 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.56404 ms; p95 0.57768; MAD 0.00935; 3 samples / 532 ops | median 1.767 ms; p95 1.797; MAD 0.03046; 3 samples / 171 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.46114 ms; p95 0.47924; MAD 0.02011; 3 samples / 668 ops | median 2.515 ms; p95 2.561; MAD 0.05167; 3 samples / 122 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.87043 ms; p95 0.89222; MAD 0.02421; 3 samples / 351 ops | median 39.400 ms; p95 40.300; MAD 1.000; 3 samples / 9 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.615 ms; p95 2.814; MAD 0.04538; 3 samples / 115 ops | median 120.5 ms; p95 124.5; MAD 4.500; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.746 ms; p95 3.572; MAD 0.02973; 3 samples / 102 ops | median 116.2 ms; p95 119.4; MAD 3.600; 3 samples / 3 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.63885 ms; p95 0.69577; MAD 0.01663; 3 samples / 462 ops | median 1.560 ms; p95 1.711; MAD 0.08899; 3 samples / 192 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.68966 ms; p95 0.72375; MAD 0.01750; 3 samples / 441 ops | median 2.100 ms; p95 2.172; MAD 0.04694; 3 samples / 143 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.78438 ms; p95 1.140; MAD 0.03174; 3 samples / 357 ops | median 3.555 ms; p95 3.650; MAD 0.10554; 3 samples / 87 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.31478 ms; p95 0.41852; MAD 0.02037; 3 samples / 891 ops | median 7.564 ms; p95 8.616; MAD 0.15714; 3 samples / 40 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.362 ms; p95 1.400; MAD 0.04200; 3 samples / 228 ops | median 82.850 ms; p95 89.690; MAD 1.800; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.270 ms; p95 1.314; MAD 0.04880; 3 samples / 239 ops | median 31.150 ms; p95 34.465; MAD 0.25000; 3 samples / 11 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.47667 ms; p95 0.47710; MAD 0.00048; 3 samples / 632 ops | median 76.400 ms; p95 81.305; MAD 4.450; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.32787 ms; p95 0.34889; MAD 0.02336; 3 samples / 970 ops | median 60.250 ms; p95 67.135; MAD 4.400; 3 samples / 6 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.50863 ms; p95 0.51710; MAD 0.00941; 3 samples / 599 ops | median 1.301 ms; p95 1.380; MAD 0.02788; 3 samples / 229 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.53529 ms; p95 0.56251; MAD 0.01664; 3 samples / 557 ops | median 2.049 ms; p95 2.229; MAD 0.07643; 3 samples / 145 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.48592 ms; p95 0.50221; MAD 0.00878; 3 samples / 615 ops | median 2.574 ms; p95 2.586; MAD 0.01282; 3 samples / 120 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 0.87478 ms; p95 0.88473; MAD 0.01106; 3 samples / 346 ops | median 36.900 ms; p95 37.800; MAD 1.000; 3 samples / 9 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.637 ms; p95 2.651; MAD 0.01579; 3 samples / 117 ops | median 112.4 ms; p95 133.1; MAD 0.90000; 3 samples / 3 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.863 ms; p95 3.455; MAD 0.13583; 3 samples / 101 ops | median 108.1 ms; p95 132.5; MAD 4.100; 3 samples / 3 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.62360 ms; p95 0.98532; MAD 0.04499; 3 samples / 432 ops | median 1.714 ms; p95 1.725; MAD 0.01230; 3 samples / 183 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.73066 ms; p95 0.97667; MAD 0.04367; 3 samples / 383 ops | median 2.160 ms; p95 2.342; MAD 0.08815; 3 samples / 139 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.84286 ms; p95 0.93674; MAD 0.04206; 3 samples / 350 ops | median 3.908 ms; p95 4.261; MAD 0.31126; 3 samples / 78 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.51122 ms; p95 0.51202; MAD 0.00088; 3 samples / 625 ops | median 7.350 ms; p95 7.446; MAD 0.10714; 3 samples / 44 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 2.121 ms; p95 2.138; MAD 0.01959; 3 samples / 160 ops | median 95.400 ms; p95 98.325; MAD 1.900; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.770 ms; p95 1.794; MAD 0.02625; 3 samples / 173 ops | median 30.875 ms; p95 36.658; MAD 0.10000; 3 samples / 12 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.50914 ms; p95 0.53316; MAD 0.02669; 3 samples / 593 ops | median 89.450 ms; p95 108.7; MAD 0.55000; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.34792 ms; p95 0.36272; MAD 0.01645; 3 samples / 969 ops | median 58.950 ms; p95 59.940; MAD 1.100; 3 samples / 6 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.56222 ms; p95 0.59622; MAD 0.03101; 3 samples / 536 ops | median 1.497 ms; p95 1.840; MAD 0.01025; 3 samples / 189 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.57102 ms; p95 0.59282; MAD 0.02422; 3 samples / 540 ops | median 1.833 ms; p95 1.890; MAD 0.06350; 3 samples / 165 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.47895 ms; p95 0.48955; MAD 0.01119; 3 samples / 628 ops | median 2.515 ms; p95 2.660; MAD 0.08405; 3 samples / 120 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.83140 ms; p95 0.83614; MAD 0.00526; 3 samples / 370 ops | median 37.900 ms; p95 43.510; MAD 0.33333; 3 samples / 9 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.831 ms; p95 3.010; MAD 0.10353; 3 samples / 106 ops | median 116.8 ms; p95 118.5; MAD 0.00000; 3 samples / 3 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.131 ms; p95 3.851; MAD 0.23403; 3 samples / 94 ops | median 113.6 ms; p95 124.0; MAD 7.300; 3 samples / 3 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.76641 ms; p95 0.84240; MAD 0.08444; 3 samples / 400 ops | median 1.958 ms; p95 2.136; MAD 0.15412; 3 samples / 155 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.75414 ms; p95 0.91291; MAD 0.08547; 3 samples / 391 ops | median 2.244 ms; p95 2.384; MAD 0.15556; 3 samples / 136 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.90583 ms; p95 1.163; MAD 0.09938; 3 samples / 349 ops | median 3.582 ms; p95 3.899; MAD 0.15881; 3 samples / 84 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.35496 ms; p95 0.41244; MAD 0.01713; 3 samples / 817 ops | median 7.846 ms; p95 7.998; MAD 0.01538; 3 samples / 39 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.476 ms; p95 1.518; MAD 0.01270; 3 samples / 203 ops | median 94.050 ms; p95 97.200; MAD 2.250; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.268 ms; p95 1.350; MAD 0.06954; 3 samples / 238 ops | median 40.600 ms; p95 49.285; MAD 5.200; 3 samples / 8 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.64581 ms; p95 0.69458; MAD 0.02018; 3 samples / 459 ops | median 100.4 ms; p95 104.9; MAD 4.800; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.61951 ms; p95 0.67542; MAD 0.06212; 3 samples / 565 ops | median 60.150 ms; p95 60.555; MAD 0.45000; 3 samples / 6 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.63758 ms; p95 0.79174; MAD 0.00945; 3 samples / 441 ops | median 1.385 ms; p95 1.750; MAD 0.11405; 3 samples / 208 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.65359 ms; p95 0.67760; MAD 0.02668; 3 samples / 469 ops | median 1.756 ms; p95 1.805; MAD 0.01821; 3 samples / 171 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.47170 ms; p95 0.49672; MAD 0.02636; 3 samples / 638 ops | median 2.579 ms; p95 2.584; MAD 0.00513; 3 samples / 118 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 0.92385 ms; p95 0.92939; MAD 0.00615; 3 samples / 347 ops | median 37.233 ms; p95 39.753; MAD 2.800; 3 samples / 9 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.743 ms; p95 2.927; MAD 0.14068; 3 samples / 110 ops | median 116.8 ms; p95 126.0; MAD 10.200; 3 samples / 4 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.892 ms; p95 3.225; MAD 0.07523; 3 samples / 105 ops | median 109.9 ms; p95 117.1; MAD 6.900; 3 samples / 3 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.63145 ms; p95 0.66614; MAD 0.01925; 3 samples / 473 ops | median 1.986 ms; p95 2.065; MAD 0.08719; 3 samples / 157 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.61411 ms; p95 0.79824; MAD 0.00744; 3 samples / 451 ops | median 2.449 ms; p95 2.449; MAD 0.00000; 3 samples / 130 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 1.193 ms; p95 1.250; MAD 0.06319; 3 samples / 313 ops | median 3.781 ms; p95 3.902; MAD 0.13390; 3 samples / 81 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.48664 ms; p95 0.48769; MAD 0.00117; 3 samples / 708 ops | median 6.727 ms; p95 6.781; MAD 0.06000; 3 samples / 46 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.328 ms; p95 1.342; MAD 0.01637; 3 samples / 228 ops | median 82.800 ms; p95 91.710; MAD 0.65000; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.287 ms; p95 1.336; MAD 0.05399; 3 samples / 239 ops | median 32.500 ms; p95 33.550; MAD 0.90000; 3 samples / 11 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.53069 ms; p95 0.56941; MAD 0.04303; 3 samples / 594 ops | median 82.750 ms; p95 83.740; MAD 1.100; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.38760 ms; p95 0.54892; MAD 0.08457; 3 samples / 778 ops | median 55.000 ms; p95 59.455; MAD 2.750; 3 samples / 6 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.58314 ms; p95 0.68087; MAD 0.03982; 3 samples / 504 ops | median 1.542 ms; p95 1.689; MAD 0.16355; 3 samples / 205 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.73897 ms; p95 0.85209; MAD 0.01235; 3 samples / 391 ops | median 1.906 ms; p95 1.925; MAD 0.02126; 3 samples / 161 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.62750 ms; p95 0.91435; MAD 0.05049; 3 samples / 440 ops | median 2.517 ms; p95 2.592; MAD 0.07604; 3 samples / 120 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 1.128 ms; p95 1.356; MAD 0.21908; 3 samples / 273 ops | median 39.267 ms; p95 40.587; MAD 1.467; 3 samples / 9 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.070 ms; p95 3.176; MAD 0.03333; 3 samples / 98 ops | median 114.0 ms; p95 121.9; MAD 8.800; 3 samples / 3 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.088 ms; p95 3.715; MAD 0.36085; 3 samples / 97 ops | median 118.7 ms; p95 139.6; MAD 9.300; 3 samples / 3 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.64968 ms; p95 0.65850; MAD 0.00980; 3 samples / 478 ops | median 1.878 ms; p95 2.190; MAD 0.00741; 3 samples / 153 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.65855 ms; p95 0.67518; MAD 0.01847; 3 samples / 461 ops | median 2.224 ms; p95 2.272; MAD 0.05283; 3 samples / 136 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.95714 ms; p95 1.216; MAD 0.23799; 3 samples / 327 ops | median 4.254 ms; p95 4.374; MAD 0.05833; 3 samples / 71 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.36329 ms; p95 0.36895; MAD 0.00629; 3 samples / 916 ops | median 7.421 ms; p95 7.569; MAD 0.04286; 3 samples / 42 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.364 ms; p95 1.532; MAD 0.04641; 3 samples / 215 ops | median 92.150 ms; p95 95.795; MAD 0.70000; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.235 ms; p95 1.260; MAD 0.01098; 3 samples / 244 ops | median 37.800 ms; p95 38.138; MAD 0.37500; 3 samples / 10 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.43103 ms; p95 0.43998; MAD 0.00283; 3 samples / 693 ops | median 89.800 ms; p95 94.705; MAD 5.450; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.33670 ms; p95 0.37109; MAD 0.03821; 3 samples / 952 ops | median 58.200 ms; p95 60.720; MAD 0.15000; 3 samples / 6 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.51701 ms; p95 0.55270; MAD 0.01450; 3 samples / 573 ops | median 1.326 ms; p95 1.351; MAD 0.02808; 3 samples / 235 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.57701 ms; p95 0.66294; MAD 0.01521; 3 samples / 501 ops | median 1.748 ms; p95 1.801; MAD 0.05336; 3 samples / 173 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.50337 ms; p95 0.53002; MAD 0.02961; 3 samples / 621 ops | median 2.520 ms; p95 2.578; MAD 0.06462; 3 samples / 121 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 0.98137 ms; p95 1.028; MAD 0.05162; 3 samples / 311 ops | median 37.067 ms; p95 37.427; MAD 0.40000; 3 samples / 9 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 3.141 ms; p95 3.153; MAD 0.01392; 3 samples / 101 ops | median 110.4 ms; p95 120.5; MAD 9.600; 3 samples / 3 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.377 ms; p95 3.575; MAD 0.21989; 3 samples / 94 ops | median 110.9 ms; p95 119.4; MAD 4.900; 3 samples / 3 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.77829 ms; p95 0.81775; MAD 0.01341; 3 samples / 382 ops | median 1.687 ms; p95 1.722; MAD 0.03920; 3 samples / 179 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.85641 ms; p95 1.166; MAD 0.14719; 3 samples / 342 ops | median 2.130 ms; p95 2.132; MAD 0.00213; 3 samples / 142 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.81538 ms; p95 1.002; MAD 0.02011; 3 samples / 373 ops | median 3.604 ms; p95 3.922; MAD 0.05530; 3 samples / 83 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.29674 ms; p95 0.35491; MAD 0.01840; 3 samples / 974 ops | median 7.193 ms; p95 8.909; MAD 0.22619; 3 samples / 41 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.411 ms; p95 1.578; MAD 0.11752; 3 samples / 213 ops | median 95.250 ms; p95 156.8; MAD 5.650; 3 samples / 5 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.185 ms; p95 1.190; MAD 0.00471; 3 samples / 255 ops | median 32.950 ms; p95 33.835; MAD 0.82500; 3 samples / 11 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.44425 ms; p95 0.47548; MAD 0.01463; 3 samples / 668 ops | median 83.150 ms; p95 89.450; MAD 1.00000; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.33102 ms; p95 0.37960; MAD 0.05398; 3 samples / 984 ops | median 57.300 ms; p95 59.550; MAD 1.150; 3 samples / 6 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.50743 ms; p95 0.52537; MAD 0.01994; 3 samples / 609 ops | median 1.296 ms; p95 1.307; MAD 0.01164; 3 samples / 237 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.61159 ms; p95 0.66987; MAD 0.03124; 3 samples / 485 ops | median 1.811 ms; p95 1.864; MAD 0.01607; 3 samples / 166 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.48125 ms; p95 0.52276; MAD 0.01978; 3 samples / 616 ops | median 2.600 ms; p95 2.633; MAD 0.03684; 3 samples / 117 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.88938 ms; p95 0.98448; MAD 0.04108; 3 samples / 332 ops | median 38.267 ms; p95 41.117; MAD 3.100; 3 samples / 9 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.900 ms; p95 3.053; MAD 0.04444; 3 samples / 104 ops | median 116.1 ms; p95 121.0; MAD 3.600; 3 samples / 3 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 3.064 ms; p95 3.469; MAD 0.26919; 3 samples / 98 ops | median 131.1 ms; p95 155.9; MAD 23.100; 3 samples / 3 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.67114 ms; p95 0.77361; MAD 0.02691; 3 samples / 445 ops | median 2.209 ms; p95 2.368; MAD 0.14543; 3 samples / 137 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.69583 ms; p95 0.69896; MAD 0.00347; 3 samples / 449 ops | median 2.530 ms; p95 2.710; MAD 0.19973; 3 samples / 121 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.77385 ms; p95 0.78403; MAD 0.01131; 3 samples / 393 ops | median 4.890 ms; p95 5.709; MAD 0.82248; 3 samples / 64 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.32186 ms; p95 0.40330; MAD 0.03575; 3 samples / 907 ops | median 7.200 ms; p95 7.878; MAD 0.33333; 3 samples / 42 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.509 ms; p95 1.542; MAD 0.03720; 3 samples / 211 ops | median 94.000 ms; p95 95.620; MAD 1.800; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.300 ms; p95 1.324; MAD 0.02632; 3 samples / 238 ops | median 32.175 ms; p95 32.512; MAD 0.37500; 3 samples / 12 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.47714 ms; p95 0.48380; MAD 0.00740; 3 samples / 639 ops | median 88.850 ms; p95 89.030; MAD 0.20000; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.28073 ms; p95 0.31418; MAD 0.02005; 3 samples / 1094 ops | median 58.700 ms; p95 60.590; MAD 2.100; 3 samples / 6 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.50352 ms; p95 0.54216; MAD 0.00202; 3 samples / 582 ops | median 1.328 ms; p95 1.359; MAD 0.03453; 3 samples / 232 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.54863 ms; p95 0.63986; MAD 0.00353; 3 samples / 521 ops | median 1.900 ms; p95 2.008; MAD 0.07455; 3 samples / 158 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.49314 ms; p95 0.50066; MAD 0.00003; 3 samples / 607 ops | median 2.429 ms; p95 2.560; MAD 0.05415; 3 samples / 125 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 0.85169 ms; p95 0.91644; MAD 0.00085; 3 samples / 346 ops | median 37.933 ms; p95 43.813; MAD 1.333; 3 samples / 9 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.934 ms; p95 2.999; MAD 0.07160; 3 samples / 105 ops | median 108.3 ms; p95 109.8; MAD 1.300; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 2.880 ms; p95 3.160; MAD 0.15027; 3 samples / 104 ops | median 109.9 ms; p95 123.7; MAD 0.70000; 3 samples / 3 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.61595 ms; p95 0.65101; MAD 0.00872; 3 samples / 482 ops | median 1.661 ms; p95 1.753; MAD 0.01475; 3 samples / 179 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.63924 ms; p95 0.74332; MAD 0.00506; 3 samples / 449 ops | median 2.224 ms; p95 2.284; MAD 0.00000; 3 samples / 134 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.78881 ms; p95 0.93602; MAD 0.06867; 3 samples / 387 ops | median 3.721 ms; p95 3.893; MAD 0.19011; 3 samples / 83 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.34014 ms; p95 0.38709; MAD 0.00535; 3 samples / 879 ops | median 6.513 ms; p95 6.843; MAD 0.02500; 3 samples / 47 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
