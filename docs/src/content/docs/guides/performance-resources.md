---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

## Data engine benchmark

## Formula engine benchmark

## Delivery size

## Pending local evidence

These protocols have no validated artifact in this environment yet, so no numbers are published for them.

| Artifact | Status | Reproduce with |
| --- | --- | --- |
| `bench/results/render-scale.json` | artifact is missing | `bun run --filter @sheetwrite/bench bench:render:scale` |
| `bench/results/data-results.json` | artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established | `bun run --filter @sheetwrite/bench bench:data` |
| `bench/results/formula-results.json` | artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established | `bun run --filter @sheetwrite/bench bench:formula` |
| `test-results/delivery-size/size-report.json` | artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established | `bun run size:report` |
