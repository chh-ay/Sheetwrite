---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
This page never turns an unvalidated, incomplete, or protocol-mismatched local artifact into a product claim. Comparative ratios are intentionally absent.

## Controlled browser render protocol

<div class="evidence-available"><strong>Validated evidence.</strong> Every configured engine/scenario/round completed and every correctness checkpoint passed.</div>

**Protocol:** 1  
**Captured:** 2026-07-13T20:03:25.716Z  
**Commit:** `cacbb406bc64f0afa6a342aa1f071b668f40ff0e` (clean worktree)  
**Environment:** Bun 1.3.14; Node 24.3.0; Chromium 149.0.7827.55; linux 7.1.3-2-cachyos x64; 12th Gen Intel(R) Core(TM) i9-12900H  
**Completeness:** 44/44; failures: 0  
**Raw artifact:** `bench/results/render-results.json`

| Engine | Scenario | Round | Median (ms/op) | p95 | MAD | Memory Δ (bytes) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| handsontable | scroll-down.top-left | 1 | 53.367 | 54.477 | 0.967 | 1538334 |
| handsontable | scroll-down.middle | 1 | 0.153 | 0.160 | 0.008 | -6660439 |
| handsontable | scroll-right.top-left | 1 | 117.300 | 118.200 | 1.000 | 4200653 |
| handsontable | edit-open.top-left | 1 | 2.262 | 2.606 | 0.248 | -6436724 |
| handsontable | edit-open.middle | 1 | 2.595 | 2.774 | 0.200 | 6441373 |
| handsontable | edit-open.bottom-right | 1 | 3.689 | 3.865 | 0.096 | 1512201 |
| handsontable | edit-commit.middle | 1 | 60.500 | 75.845 | 6.100 | 11394662 |
| handsontable | altering.insert-5-rows-top | 1 | 178.000 | 187.540 | 0.400 | 117049805 |
| handsontable | altering.remove-5-rows-top | 1 | 237.800 | 266.060 | 31.400 | 26582342 |
| handsontable | arrow-down.top-left | 1 | 2.909 | 2.991 | 0.086 | -20608996 |
| handsontable | arrow-right.middle | 1 | 3.337 | 3.349 | 0.013 | 12336320 |
| sheetwrite | scroll-down.top-left | 1 | 2.405 | 2.497 | 0.103 | -8663301 |
| sheetwrite | scroll-down.middle | 1 | 2.059 | 2.286 | 0.031 | -3714332 |
| sheetwrite | scroll-right.top-left | 1 | 0.743 | 0.790 | 0.053 | 1918173 |
| sheetwrite | edit-open.top-left | 1 | 0.947 | 0.970 | 0.026 | -1655156 |
| sheetwrite | edit-open.middle | 1 | 1.314 | 1.675 | 0.269 | 954591 |
| sheetwrite | edit-open.bottom-right | 1 | 0.784 | 0.862 | 0.030 | -1183644 |
| sheetwrite | edit-commit.middle | 1 | 1.425 | 1.668 | 0.162 | 2609745 |
| sheetwrite | altering.insert-5-rows-top | 1 | 5.368 | 7.152 | 0.521 | 65411384 |
| sheetwrite | altering.remove-5-rows-top | 1 | 4.354 | 4.760 | 0.050 | -60718367 |
| sheetwrite | arrow-down.top-left | 1 | 0.902 | 1.093 | 0.199 | -4982751 |
| sheetwrite | arrow-right.middle | 1 | 1.303 | 1.372 | 0.077 | 834567 |
| sheetwrite | scroll-down.top-left | 2 | 3.134 | 3.576 | 0.209 | -11228375 |
| sheetwrite | scroll-down.middle | 2 | 2.909 | 3.194 | 0.317 | 457887 |
| sheetwrite | scroll-right.top-left | 2 | 0.525 | 0.879 | 0.011 | 1287964 |
| sheetwrite | edit-open.top-left | 2 | 0.983 | 1.185 | 0.138 | -456301 |
| sheetwrite | edit-open.middle | 2 | 0.866 | 0.992 | 0.051 | -1202623 |
| sheetwrite | edit-open.bottom-right | 2 | 0.633 | 0.766 | 0.010 | 1437068 |
| sheetwrite | edit-commit.middle | 2 | 1.169 | 1.318 | 0.011 | -130353 |
| sheetwrite | altering.insert-5-rows-top | 2 | 4.044 | 5.597 | 0.281 | 54637458 |
| sheetwrite | altering.remove-5-rows-top | 2 | 4.714 | 4.971 | 0.286 | 1716151 |
| sheetwrite | arrow-down.top-left | 2 | 1.050 | 1.112 | 0.069 | -55460983 |
| sheetwrite | arrow-right.middle | 2 | 1.164 | 1.215 | 0.057 | 1633331 |
| handsontable | scroll-down.top-left | 2 | 74.450 | 80.660 | 6.900 | 1451122 |
| handsontable | scroll-down.middle | 2 | 0.121 | 0.123 | 0.003 | -4965477 |
| handsontable | scroll-right.top-left | 2 | 125.500 | 130.090 | 5.100 | 5005286 |
| handsontable | edit-open.top-left | 2 | 2.631 | 3.216 | 0.289 | -10557393 |
| handsontable | edit-open.middle | 2 | 2.530 | 2.791 | 0.158 | 1610936 |
| handsontable | edit-open.bottom-right | 2 | 4.056 | 4.212 | 0.173 | -291307 |
| handsontable | edit-commit.middle | 2 | 63.050 | 71.150 | 9.000 | -2781448 |
| handsontable | altering.insert-5-rows-top | 2 | 170.200 | 170.650 | 0.500 | 146909725 |
| handsontable | altering.remove-5-rows-top | 2 | 190.500 | 208.230 | 17.100 | -70248936 |
| handsontable | arrow-down.top-left | 2 | 3.510 | 3.548 | 0.041 | 16248764 |
| handsontable | arrow-right.middle | 2 | 3.693 | 3.910 | 0.242 | -26487452 |

Reproduce and validate with:

```sh verify title="Controlled render evidence"
bun run --filter @sheetwrite/bench bench:render:prepare
bun run --filter @sheetwrite/bench bench:render
bun run --filter @sheetwrite/bench bench:render:validate
```

## `bench/results/data-results.json`

<div class="evidence-unavailable"><strong>Evidence unavailable.</strong> artifact has no protocol-bound commit and timestamp, so freshness cannot be established.</div>

**Raw artifact:** `bench/results/data-results.json`

Reproduce with:

```sh verify title="Evidence reproduction"
bun run --filter @sheetwrite/bench bench:data
```

## `bench/results/formula-results.json`

<div class="evidence-unavailable"><strong>Evidence unavailable.</strong> artifact has no protocol-bound commit and timestamp, so freshness cannot be established.</div>

**Raw artifact:** `bench/results/formula-results.json`

Reproduce with:

```sh verify title="Evidence reproduction"
bun run --filter @sheetwrite/bench bench:formula
```

## `test-results/delivery-size/size-report.json`

<div class="evidence-unavailable"><strong>Evidence unavailable.</strong> artifact has no protocol-bound commit and timestamp, so freshness cannot be established.</div>

**Raw artifact:** `test-results/delivery-size/size-report.json`

Reproduce with:

```sh verify title="Evidence reproduction"
bun run size:report
```
