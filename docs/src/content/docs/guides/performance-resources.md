---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

<div class="evidence-available"><strong>Validated evidence.</strong> 44/44 engine/scenario/round runs completed with 0 failures; every correctness checkpoint passed.</div>

Both engines drive the same 100000-row workbook through identical scripted interactions in a controlled Chromium (149.0.7827.55) on 12th Gen Intel(R) Core(TM) i9-12900H. Captured 2026-07-13T20:03:25.716Z at `cacbb406bc64` (clean worktree); raw artifact `bench/results/render-results.json`.

| Interaction | Sheetwrite median | Handsontable median | Relative | Sheetwrite p95 | Handsontable p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `scroll-down.top-left` | 3.13 ms | 74.4 ms | **23.8× faster** | 3.58 ms | 80.7 ms |
| `scroll-down.middle` | 2.91 ms | 0.15 ms | 19.1× slower | 3.19 ms | 0.16 ms |
| `scroll-right.top-left` | 0.74 ms | 125.5 ms | **168.9× faster** | 0.88 ms | 130.1 ms |
| `edit-open.top-left` | 0.98 ms | 2.63 ms | **2.7× faster** | 1.18 ms | 3.22 ms |
| `edit-open.middle` | 1.31 ms | 2.59 ms | **2.0× faster** | 1.68 ms | 2.79 ms |
| `edit-open.bottom-right` | 0.78 ms | 4.06 ms | **5.2× faster** | 0.86 ms | 4.21 ms |
| `edit-commit.middle` | 1.43 ms | 63.0 ms | **44.2× faster** | 1.67 ms | 75.8 ms |
| `altering.insert-5-rows-top` | 5.37 ms | 178.0 ms | **33.2× faster** | 7.15 ms | 187.5 ms |
| `altering.remove-5-rows-top` | 4.71 ms | 237.8 ms | **50.4× faster** | 4.97 ms | 266.1 ms |
| `arrow-down.top-left` | 1.05 ms | 3.51 ms | **3.3× faster** | 1.11 ms | 3.55 ms |
| `arrow-right.middle` | 1.30 ms | 3.69 ms | **2.8× faster** | 1.37 ms | 3.91 ms |

Relative compares medians of the same scripted interaction; per-round samples, spread, and memory counters live in the raw artifact. Reproduce and validate with:

```sh verify title="Controlled render evidence"
bun run --filter @sheetwrite/bench bench:render:prepare
bun run --filter @sheetwrite/bench bench:render
bun run --filter @sheetwrite/bench bench:render:validate
```

## Pending local evidence

These protocols have no validated artifact in this environment yet, so no numbers are published for them.

| Artifact | Status | Reproduce with |
| --- | --- | --- |
| `bench/results/data-results.json` | artifact has no protocol-bound commit and timestamp, so freshness cannot be established | `bun run --filter @sheetwrite/bench bench:data` |
| `bench/results/formula-results.json` | artifact has no protocol-bound commit and timestamp, so freshness cannot be established | `bun run --filter @sheetwrite/bench bench:formula` |
| `test-results/delivery-size/size-report.json` | artifact has no protocol-bound commit and timestamp, so freshness cannot be established | `bun run size:report` |
