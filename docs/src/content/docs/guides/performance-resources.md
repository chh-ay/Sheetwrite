---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

## Data engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 19:14 UTC</dd></div>
<div><dt>Commit</dt><dd><code>a6c58917df64</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/data-results.json</code></dd></div>
</dl>

<figure class="bench-viz" data-pagefind-ignore>
<div class="bench-viz__scale"><span class="bench-viz__lead">1k rows</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>1506.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.35 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">529.6 ms</b><b class="bench-num" data-stat="p95">547.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>13.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.58%"></i><i class="bench-bar__fill" style="width:2.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:37.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.10 ms</b><b class="bench-num" data-stat="p95">0.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>90.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.14%"></i><i class="bench-bar__fill" style="width:0.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.87 ms</b><b class="bench-num" data-stat="p95">2.95 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:65.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">170.0 ms</b><b class="bench-num" data-stat="p95">259.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>1974.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.10 ms</b><b class="bench-num" data-stat="p95">0.13 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:89.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">202.9 ms</b><b class="bench-num" data-stat="p95">225.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>4696.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:90.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">101.1 ms</b><b class="bench-num" data-stat="p95">112.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>42.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:3.24%"></i><i class="bench-bar__fill" style="width:2.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.14 ms</b><b class="bench-num" data-stat="p95">0.16 ms</b></span></div>
</div>
<div class="bench-viz__scale"><span class="bench-viz__lead">10k rows</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>1657.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.44 ms</b><b class="bench-num" data-stat="p95">2.55 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:88.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4045.3 ms</b><b class="bench-num" data-stat="p95">4571.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>17.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.81%"></i><i class="bench-bar__fill" style="width:3.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:70.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.15 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>690.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.63 ms</b><b class="bench-num" data-stat="p95">2.24 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:64.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">433.6 ms</b><b class="bench-num" data-stat="p95">673.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>13116.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.17 ms</b><b class="bench-num" data-stat="p95">0.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:35.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2237.3 ms</b><b class="bench-num" data-stat="p95">6360.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>24273.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:57.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1023.6 ms</b><b class="bench-num" data-stat="p95">1766.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>203.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:84.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.03 ms</b><b class="bench-num" data-stat="p95">4.75 ms</b></span></div>
</div>
</figure>

Sheetwrite alone at scale (Handsontable cannot complete these sizes headlessly):

| Rows | Ingest | Window read | Edit | Sort | Filter | Aggregate |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100,000 | 27.0 ms | 0.01 ms | 0.72 ms | 1.85 ms | 0.34 ms | 0.19 ms |
| 500,000 | 133.6 ms | 0.01 ms | 0.82 ms | 10.6 ms | 1.62 ms | 1.00 ms |
| 1,000,000 | 289.8 ms | 0.01 ms | 0.75 ms | 23.1 ms | 3.33 ms | 1.93 ms |

Reproduce with:

```sh verify title="Data engine evidence"
bun run --filter @sheetwrite/bench bench:data
```

## Formula engine benchmark

## Delivery size

## Pending local evidence

These protocols have no validated artifact in this environment yet, so no numbers are published for them.

| Artifact | Status | Reproduce with |
| --- | --- | --- |
| `bench/results/render-scale.json` | controlled render results carry non-finite samples | `bun run --filter @sheetwrite/bench bench:render:scale` |
| `bench/results/formula-results.json` | artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established | `bun run --filter @sheetwrite/bench bench:formula` |
| `test-results/delivery-size/size-report.json` | artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established | `bun run size:report` |
