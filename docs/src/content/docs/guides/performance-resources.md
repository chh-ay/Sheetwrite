---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

<div class="evidence-available"><strong>Validated evidence.</strong> 280/280 engine/scenario/round runs completed with 0 failures; every correctness checkpoint passed.</div>

Both engines drive the same 100000-row workbook through identical scripted interactions in a controlled Chromium (149.0.7827.55) on 12th Gen Intel(R) Core(TM) i9-12900H. Captured 2026-07-16T17:57:28.919Z at `a1567880e5be` (clean worktree); raw artifact `bench/results/render-results.json`.

<figure class="bench-viz">
<div class="bench-viz__scale" aria-hidden="true"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis"><i style="left:0.00%">0.1</i><i style="left:32.13%">1</i><i style="left:64.27%">10</i><i style="left:96.40%">100 ms</i></span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>61.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:39.46%"></i><i class="bench-bar__fill" style="width:38.04%"></i></span><span class="bench-bar__value">1.53 ms<small>p95 1.69 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:96.38%"></i><i class="bench-bar__fill" style="width:95.45%"></i></span><span class="bench-bar__value">93.4 ms<small>p95 99.8 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>24.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:38.03%"></i><i class="bench-bar__fill" style="width:36.86%"></i></span><span class="bench-bar__value">1.40 ms<small>p95 1.53 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:81.99%"></i><i class="bench-bar__fill" style="width:81.57%"></i></span><span class="bench-bar__value">34.6 ms<small>p95 35.6 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>164.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:23.83%"></i><i class="bench-bar__fill" style="width:23.19%"></i></span><span class="bench-bar__value">0.53 ms<small>p95 0.55 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:94.84%"></i><i class="bench-bar__fill" style="width:94.41%"></i></span><span class="bench-bar__value">86.7 ms<small>p95 89.4 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>195.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:16.35%"></i><i class="bench-bar__fill" style="width:16.08%"></i></span><span class="bench-bar__value">0.32 ms<small>p95 0.32 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:90.03%"></i><i class="bench-bar__fill" style="width:89.67%"></i></span><span class="bench-bar__value">61.8 ms<small>p95 63.3 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:30.23%"></i><i class="bench-bar__fill" style="width:25.43%"></i></span><span class="bench-bar__value">0.62 ms<small>p95 0.87 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:37.95%"></i><i class="bench-bar__fill" style="width:36.46%"></i></span><span class="bench-bar__value">1.36 ms<small>p95 1.52 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:28.72%"></i><i class="bench-bar__fill" style="width:27.42%"></i></span><span class="bench-bar__value">0.71 ms<small>p95 0.78 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:42.21%"></i><i class="bench-bar__fill" style="width:41.60%"></i></span><span class="bench-bar__value">1.97 ms<small>p95 2.06 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>4.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:24.82%"></i><i class="bench-bar__fill" style="width:23.91%"></i></span><span class="bench-bar__value">0.55 ms<small>p95 0.59 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:46.56%"></i><i class="bench-bar__fill" style="width:46.02%"></i></span><span class="bench-bar__value">2.71 ms<small>p95 2.81 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>42.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:32.16%"></i><i class="bench-bar__fill" style="width:31.23%"></i></span><span class="bench-bar__value">0.94 ms<small>p95 1.00 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:84.30%"></i><i class="bench-bar__fill" style="width:83.59%"></i></span><span class="bench-bar__value">39.9 ms<small>p95 42.0 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>38.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:49.65%"></i><i class="bench-bar__fill" style="width:47.49%"></i></span><span class="bench-bar__value">3.01 ms<small>p95 3.51 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.30%"></i></span><span class="bench-bar__value">114.6 ms<small>p95 129.4 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>43.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:46.87%"></i><i class="bench-bar__fill" style="width:46.49%"></i></span><span class="bench-bar__value">2.80 ms<small>p95 2.87 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:99.72%"></i><i class="bench-bar__fill" style="width:99.19%"></i></span><span class="bench-bar__value">122.1 ms<small>p95 126.9 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:28.57%"></i><i class="bench-bar__fill" style="width:27.25%"></i></span><span class="bench-bar__value">0.70 ms<small>p95 0.77 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:41.36%"></i><i class="bench-bar__fill" style="width:40.60%"></i></span><span class="bench-bar__value">1.83 ms<small>p95 1.94 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:28.31%"></i><i class="bench-bar__fill" style="width:27.82%"></i></span><span class="bench-bar__value">0.73 ms<small>p95 0.76 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:44.84%"></i><i class="bench-bar__fill" style="width:44.52%"></i></span><span class="bench-bar__value">2.43 ms<small>p95 2.49 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:31.65%"></i><i class="bench-bar__fill" style="width:30.47%"></i></span><span class="bench-bar__value">0.89 ms<small>p95 0.97 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:52.33%"></i><i class="bench-bar__fill" style="width:51.22%"></i></span><span class="bench-bar__value">3.93 ms<small>p95 4.25 ms</small></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>22.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:18.50%"></i><i class="bench-bar__fill" style="width:16.85%"></i></span><span class="bench-bar__value">0.33 ms<small>p95 0.38 ms</small></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:32.13%"></i><i class="bench-bar__tick" style="left:64.27%"></i><i class="bench-bar__tick" style="left:96.40%"></i><i class="bench-bar__spread" style="width:61.73%"></i><i class="bench-bar__fill" style="width:60.06%"></i></span><span class="bench-bar__value">7.40 ms<small>p95 8.34 ms</small></span></div>
</div>
<figcaption>Bars are per-interaction time on a logarithmic axis — every tick is one 10× step, shorter is faster. The solid fill is the median run; the faded tail reaches the slowest 1-in-20 run (p95). Full samples and memory counters live in the raw artifact.</figcaption>
</figure>

Per-round samples, spread, and memory counters live in the raw artifact. Reproduce and validate with:

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
