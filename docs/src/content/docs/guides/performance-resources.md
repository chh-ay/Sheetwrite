---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

<div class="evidence-available"><strong>Validated evidence.</strong> 44/44 engine/scenario/round runs completed with 0 failures; every correctness checkpoint passed.</div>

Both engines drive the same 100000-row workbook through identical scripted interactions in a controlled Chromium (149.0.7827.55) on 12th Gen Intel(R) Core(TM) i9-12900H. Captured 2026-07-13T20:03:25.716Z at `cacbb406bc64` (clean worktree); raw artifact `bench/results/render-results.json`.

<figure class="bench-viz">
<div class="bench-viz__scale" aria-hidden="true"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis"><i style="left:0.00%">0.1</i><i style="left:29.20%">1</i><i style="left:58.39%">10</i><i style="left:87.59%">100 ms</i></span><span class="bench-viz__cols">median time</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>23.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:43.68%"></i></span><span class="bench-bar__value">3.13 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:83.85%"></i></span><span class="bench-bar__value">74.4 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>19.1×</strong> slower</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:42.74%"></i></span><span class="bench-bar__value">2.91 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:5.37%"></i></span><span class="bench-bar__value">0.15 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>168.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:25.43%"></i></span><span class="bench-bar__value">0.74 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:90.47%"></i></span><span class="bench-bar__value">125.5 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:28.99%"></i></span><span class="bench-bar__value">0.98 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:41.46%"></i></span><span class="bench-bar__value">2.63 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:32.66%"></i></span><span class="bench-bar__value">1.31 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:41.29%"></i></span><span class="bench-bar__value">2.59 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>5.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:26.12%"></i></span><span class="bench-bar__value">0.78 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:46.95%"></i></span><span class="bench-bar__value">4.06 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>44.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:33.69%"></i></span><span class="bench-bar__value">1.43 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:81.74%"></i></span><span class="bench-bar__value">63.0 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>33.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:50.51%"></i></span><span class="bench-bar__value">5.37 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:94.90%"></i></span><span class="bench-bar__value">178.0 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>50.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:48.86%"></i></span><span class="bench-bar__value">4.71 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:98.58%"></i></span><span class="bench-bar__value">237.8 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>3.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:29.82%"></i></span><span class="bench-bar__value">1.05 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:45.12%"></i></span><span class="bench-bar__value">3.51 ms</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:32.55%"></i></span><span class="bench-bar__value">1.30 ms</span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__tick" style="left:29.20%"></i><i class="bench-bar__tick" style="left:58.39%"></i><i class="bench-bar__tick" style="left:87.59%"></i><i class="bench-bar__fill" style="width:45.76%"></i></span><span class="bench-bar__value">3.69 ms</span></div>
</div>
<figcaption>Bars are the median time per interaction on a logarithmic axis — every tick is one 10× step, shorter is faster. Percentiles, spread, and memory counters live in the raw artifact.</figcaption>
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
