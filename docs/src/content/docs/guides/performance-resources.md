---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.

## Render benchmark: Sheetwrite vs Handsontable

<div class="evidence-available"><strong>Validated evidence.</strong> 1100/1120 engine/scenario/round runs completed across 4 workbook sizes; every completed run passed its correctness checkpoints; 20 runs did not finish and are shown as such.</div>

Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 21:59 UTC</dd></div>
<div><dt>Commit</dt><dd><code>47f164385fd9</code> clean worktree</dd></div>
<div><dt>Environment</dt><dd>Chromium 149.0.7827.55 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Protocol</dt><dd>10 rounds · raw artifact <code>bench/results/render-scale.json</code></dd></div>
</dl>

<figure class="bench-viz bench-widget" data-pagefind-ignore>
<input type="radio" name="bench-size" id="bench-size-1000">
<input type="radio" name="bench-size" id="bench-size-10000">
<input type="radio" name="bench-size" id="bench-size-100000">
<input type="radio" name="bench-size" id="bench-size-1000000">
<input type="radio" name="bench-metric" id="bench-metric-speed">
<input type="radio" name="bench-metric" id="bench-metric-memory">
<div class="bench-widget__tabs">
<div class="bench-tabs" aria-label="Workbook size">
<label for="bench-size-1000">1k rows</label>
<label for="bench-size-10000">10k rows</label>
<label for="bench-size-100000">100k rows</label>
<label for="bench-size-1000000">1M rows</label>
</div>
<div class="bench-tabs bench-tabs--metric" aria-label="Metric">
<label for="bench-metric-speed">Speed</label>
<label for="bench-metric-memory">Memory</label>
</div>
</div>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="speed" style="--bench-segs:3">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.1</span><span class="bench-ruler__tick" style="left:33.33%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>22.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:37.54%"></i><i class="bench-bar__fill" style="width:37.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.34 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.98%"></i><i class="bench-bar__fill" style="width:82.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.9 ms</b><b class="bench-num" data-stat="p95">30.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.52%"></i><i class="bench-bar__fill" style="width:35.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.89%"></i><i class="bench-bar__fill" style="width:54.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.39 ms</b><b class="bench-num" data-stat="p95">4.75 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>51.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.16%"></i><i class="bench-bar__fill" style="width:21.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.46 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.98%"></i><i class="bench-bar__fill" style="width:78.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.9 ms</b><b class="bench-num" data-stat="p95">25.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>96.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.28%"></i><i class="bench-bar__fill" style="width:13.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.83%"></i><i class="bench-bar__fill" style="width:80.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.4 ms</b><b class="bench-num" data-stat="p95">26.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.87%"></i><i class="bench-bar__fill" style="width:23.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.50 ms</b><b class="bench-num" data-stat="p95">0.52 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.61%"></i><i class="bench-bar__fill" style="width:35.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.17 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.84%"></i><i class="bench-bar__fill" style="width:25.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.23%"></i><i class="bench-bar__fill" style="width:34.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.11 ms</b><b class="bench-num" data-stat="p95">1.14 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.88%"></i><i class="bench-bar__fill" style="width:22.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.49 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.49%"></i><i class="bench-bar__fill" style="width:40.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.66 ms</b><b class="bench-num" data-stat="p95">1.76 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>7.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:29.85%"></i><i class="bench-bar__fill" style="width:29.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.75 ms</b><b class="bench-num" data-stat="p95">0.79 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.81%"></i><i class="bench-bar__fill" style="width:57.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.43 ms</b><b class="bench-num" data-stat="p95">5.81 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>21.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.88%"></i><i class="bench-bar__fill" style="width:32.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.11 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.71%"></i><i class="bench-bar__fill" style="width:77.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.1 ms</b><b class="bench-num" data-stat="p95">21.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>22.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.59%"></i><i class="bench-bar__fill" style="width:31.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.90 ms</b><b class="bench-num" data-stat="p95">1.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.03%"></i><i class="bench-bar__fill" style="width:76.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.2 ms</b><b class="bench-num" data-stat="p95">21.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.38%"></i><i class="bench-bar__fill" style="width:26.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.61 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:40.38%"></i><i class="bench-bar__fill" style="width:39.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.55 ms</b><b class="bench-num" data-stat="p95">1.63 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.74%"></i><i class="bench-bar__fill" style="width:26.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.61 ms</b><b class="bench-num" data-stat="p95">0.63 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.82%"></i><i class="bench-bar__fill" style="width:39.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.50 ms</b><b class="bench-num" data-stat="p95">1.57 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.72%"></i><i class="bench-bar__fill" style="width:28.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.73 ms</b><b class="bench-num" data-stat="p95">0.84 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.11%"></i><i class="bench-bar__fill" style="width:51.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.47 ms</b><b class="bench-num" data-stat="p95">3.66 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>15.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:15.22%"></i><i class="bench-bar__fill" style="width:13.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.29 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.10%"></i><i class="bench-bar__fill" style="width:52.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.87 ms</b><b class="bench-num" data-stat="p95">3.92 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">6.2 MB</span><span class="bench-ruler__tick" style="left:50.00%">12.4 MB</span><span class="bench-ruler__tick" style="left:75.00%">18.6 MB</span><span class="bench-ruler__tick" style="left:100.00%">24.8 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.4 MB</b><b class="bench-num" data-stat="p95">2.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.6 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:42.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.7 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.8 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.0 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.3 MB</b><b class="bench-num" data-stat="p95">1.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:44.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.0 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 MB</b><b class="bench-num" data-stat="p95">3.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.7 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:68.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.1 MB</b><b class="bench-num" data-stat="p95">5.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.5 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.6 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.3 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.8 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:72.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.1 MB</b><b class="bench-num" data-stat="p95">5.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.0 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:73.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.2 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:61.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.2 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:28.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.1 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.1 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>3.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.9 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.8 MB</b><b class="bench-num" data-stat="p95">10.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.9 MB</b><b class="bench-num" data-stat="p95">1.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:81.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.3 MB</b><b class="bench-num" data-stat="p95">6.2 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:3">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.1</span><span class="bench-ruler__tick" style="left:33.33%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>26.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.98%"></i><i class="bench-bar__fill" style="width:36.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.24 ms</b><b class="bench-num" data-stat="p95">1.29 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.31%"></i><i class="bench-bar__fill" style="width:84.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">33.2 ms</b><b class="bench-num" data-stat="p95">36.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>6.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.47%"></i><i class="bench-bar__fill" style="width:35.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.79%"></i><i class="bench-bar__fill" style="width:60.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.71 ms</b><b class="bench-num" data-stat="p95">7.14 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>60.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.99%"></i><i class="bench-bar__fill" style="width:21.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.46 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:81.89%"></i><i class="bench-bar__fill" style="width:80.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.9 ms</b><b class="bench-num" data-stat="p95">28.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>111.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.13%"></i><i class="bench-bar__fill" style="width:14.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.12%"></i><i class="bench-bar__fill" style="width:82.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.8 ms</b><b class="bench-num" data-stat="p95">31.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.32%"></i><i class="bench-bar__fill" style="width:23.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.49 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.39%"></i><i class="bench-bar__fill" style="width:35.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.16 ms</b><b class="bench-num" data-stat="p95">1.23 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.68%"></i><i class="bench-bar__fill" style="width:25.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.59 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.16%"></i><i class="bench-bar__fill" style="width:35.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.22 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.06%"></i><i class="bench-bar__fill" style="width:22.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.47 ms</b><b class="bench-num" data-stat="p95">0.49 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.60%"></i><i class="bench-bar__fill" style="width:41.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.79 ms</b><b class="bench-num" data-stat="p95">1.90 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>10.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:29.96%"></i><i class="bench-bar__fill" style="width:29.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.77 ms</b><b class="bench-num" data-stat="p95">0.79 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.77%"></i><i class="bench-bar__fill" style="width:63.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.28 ms</b><b class="bench-num" data-stat="p95">8.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>23.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.06%"></i><i class="bench-bar__fill" style="width:35.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.29%"></i><i class="bench-bar__fill" style="width:80.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.7 ms</b><b class="bench-num" data-stat="p95">29.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>29.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.18%"></i><i class="bench-bar__fill" style="width:33.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.99 ms</b><b class="bench-num" data-stat="p95">1.22 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.42%"></i><i class="bench-bar__fill" style="width:82.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.3 ms</b><b class="bench-num" data-stat="p95">29.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.16%"></i><i class="bench-bar__fill" style="width:25.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:40.58%"></i><i class="bench-bar__fill" style="width:39.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.49 ms</b><b class="bench-num" data-stat="p95">1.65 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.28%"></i><i class="bench-bar__fill" style="width:25.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:40.39%"></i><i class="bench-bar__fill" style="width:39.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.56 ms</b><b class="bench-num" data-stat="p95">1.63 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.82%"></i><i class="bench-bar__fill" style="width:28.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.74 ms</b><b class="bench-num" data-stat="p95">0.84 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.76%"></i><i class="bench-bar__fill" style="width:51.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.47 ms</b><b class="bench-num" data-stat="p95">3.57 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>13.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.04%"></i><i class="bench-bar__fill" style="width:15.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.29 ms</b><b class="bench-num" data-stat="p95">0.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.39%"></i><i class="bench-bar__fill" style="width:52.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.72 ms</b><b class="bench-num" data-stat="p95">4.00 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">10.0 MB</span><span class="bench-ruler__tick" style="left:50.00%">20.0 MB</span><span class="bench-ruler__tick" style="left:75.00%">30.0 MB</span><span class="bench-ruler__tick" style="left:100.00%">40.0 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:17.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.3 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.4 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 MB</b><b class="bench-num" data-stat="p95">2.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:28.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.4 MB</b><b class="bench-num" data-stat="p95">4.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.3 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.4 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:19.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.7 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.6 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:19.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.8 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.6 MB</b><b class="bench-num" data-stat="p95">7.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:95.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.1 MB</b><b class="bench-num" data-stat="p95">26.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>3.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.0 MB</b><b class="bench-num" data-stat="p95">2.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>3.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:20.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:61.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.4 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:54.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>3.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.7 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:74.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.7 MB</b><b class="bench-num" data-stat="p95">10.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>3.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:84.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">33.8 MB</b><b class="bench-num" data-stat="p95">6.5 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="speed" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.1</span><span class="bench-ruler__tick" style="left:25.00%">1</span><span class="bench-ruler__tick" style="left:50.00%">10</span><span class="bench-ruler__tick" style="left:75.00%">100</span><span class="bench-ruler__tick" style="left:100.00%">1000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>67.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:28.43%"></i><i class="bench-bar__fill" style="width:27.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.26 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.64%"></i><i class="bench-bar__fill" style="width:73.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">84.9 ms</b><b class="bench-num" data-stat="p95">88.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>26.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.90%"></i><i class="bench-bar__fill" style="width:26.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.15 ms</b><b class="bench-num" data-stat="p95">1.19 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.68%"></i><i class="bench-bar__fill" style="width:62.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">30.4 ms</b><b class="bench-num" data-stat="p95">32.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>173.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.49%"></i><i class="bench-bar__fill" style="width:16.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.46 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.67%"></i><i class="bench-bar__fill" style="width:72.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">75.9 ms</b><b class="bench-num" data-stat="p95">80.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>201.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.11%"></i><i class="bench-bar__fill" style="width:10.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.65%"></i><i class="bench-bar__fill" style="width:67.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">52.3 ms</b><b class="bench-num" data-stat="p95">55.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.01%"></i><i class="bench-bar__fill" style="width:17.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.51 ms</b><b class="bench-num" data-stat="p95">0.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.34%"></i><i class="bench-bar__fill" style="width:26.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.24 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.01%"></i><i class="bench-bar__fill" style="width:19.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.60 ms</b><b class="bench-num" data-stat="p95">0.63 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.45%"></i><i class="bench-bar__fill" style="width:30.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.59 ms</b><b class="bench-num" data-stat="p95">1.65 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>4.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.72%"></i><i class="bench-bar__fill" style="width:17.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.51 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.16%"></i><i class="bench-bar__fill" style="width:34.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.29 ms</b><b class="bench-num" data-stat="p95">2.32 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>45.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.55%"></i><i class="bench-bar__fill" style="width:22.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.76 ms</b><b class="bench-num" data-stat="p95">0.80 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.52%"></i><i class="bench-bar__fill" style="width:63.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">34.5 ms</b><b class="bench-num" data-stat="p95">38.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>44.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.41%"></i><i class="bench-bar__fill" style="width:34.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.46 ms</b><b class="bench-num" data-stat="p95">2.86 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.17%"></i><i class="bench-bar__fill" style="width:76.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">110.4 ms</b><b class="bench-num" data-stat="p95">111.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>42.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.74%"></i><i class="bench-bar__fill" style="width:35.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.58 ms</b><b class="bench-num" data-stat="p95">2.95 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.30%"></i><i class="bench-bar__fill" style="width:75.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">108.4 ms</b><b class="bench-num" data-stat="p95">112.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.39%"></i><i class="bench-bar__fill" style="width:20.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.64 ms</b><b class="bench-num" data-stat="p95">0.65 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.08%"></i><i class="bench-bar__fill" style="width:30.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.61 ms</b><b class="bench-num" data-stat="p95">1.75 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.71%"></i><i class="bench-bar__fill" style="width:19.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.62 ms</b><b class="bench-num" data-stat="p95">0.67 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.67%"></i><i class="bench-bar__fill" style="width:32.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.02 ms</b><b class="bench-num" data-stat="p95">2.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.68%"></i><i class="bench-bar__fill" style="width:22.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.89 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.74%"></i><i class="bench-bar__fill" style="width:38.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.36 ms</b><b class="bench-num" data-stat="p95">3.55 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>22.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.44%"></i><i class="bench-bar__fill" style="width:11.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.29 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.83%"></i><i class="bench-bar__fill" style="width:45.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.53 ms</b><b class="bench-num" data-stat="p95">6.81 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">48.1 MB</span><span class="bench-ruler__tick" style="left:50.00%">96.3 MB</span><span class="bench-ruler__tick" style="left:75.00%">144.4 MB</span><span class="bench-ruler__tick" style="left:100.00%">192.5 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:20.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.5 MB</b><b class="bench-num" data-stat="p95">2.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.2 MB</b><b class="bench-num" data-stat="p95">6.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">47.4 MB</b><b class="bench-num" data-stat="p95">6.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.1 MB</b><b class="bench-num" data-stat="p95">3.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">35.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">44.9 MB</b><b class="bench-num" data-stat="p95">8.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.0 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.9 MB</b><b class="bench-num" data-stat="p95">13.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.1 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">41.9 MB</b><b class="bench-num" data-stat="p95">10.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.7 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">46.5 MB</b><b class="bench-num" data-stat="p95">4.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>3.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">57.7 MB</b><b class="bench-num" data-stat="p95">41.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:89.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">171.4 MB</b><b class="bench-num" data-stat="p95">141.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>3.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">55.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">192.5 MB</b><b class="bench-num" data-stat="p95">45.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>4.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">73.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.3 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">64.0 MB</b><b class="bench-num" data-stat="p95">20.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>3.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.0 MB</b><b class="bench-num" data-stat="p95">1.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">66.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>3.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">68.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="speed" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.1</span><span class="bench-ruler__tick" style="left:25.00%">1</span><span class="bench-ruler__tick" style="left:50.00%">10</span><span class="bench-ruler__tick" style="left:75.00%">100</span><span class="bench-ruler__tick" style="left:100.00%">1000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>538.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:28.16%"></i><i class="bench-bar__fill" style="width:27.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.29 ms</b><b class="bench-num" data-stat="p95">1.34 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:96.56%"></i><i class="bench-bar__fill" style="width:96.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">696.0 ms</b><b class="bench-num" data-stat="p95">728.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>296.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:29.67%"></i><i class="bench-bar__fill" style="width:26.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.10 ms</b><b class="bench-num" data-stat="p95">1.54 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.40%"></i><i class="bench-bar__fill" style="width:87.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">326.6 ms</b><b class="bench-num" data-stat="p95">343.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1522.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.66%"></i><i class="bench-bar__fill" style="width:16.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.45 ms</b><b class="bench-num" data-stat="p95">0.46 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:96.21%"></i><i class="bench-bar__fill" style="width:95.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">686.0 ms</b><b class="bench-num" data-stat="p95">705.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1352.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.32%"></i><i class="bench-bar__fill" style="width:10.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:89.14%"></i><i class="bench-bar__fill" style="width:88.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">357.7 ms</b><b class="bench-num" data-stat="p95">367.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.87%"></i><i class="bench-bar__fill" style="width:17.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.52 ms</b><b class="bench-num" data-stat="p95">0.68 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:28.43%"></i><i class="bench-bar__fill" style="width:27.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.30 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>3.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.79%"></i><i class="bench-bar__fill" style="width:17.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.51 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.30%"></i><i class="bench-bar__fill" style="width:31.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.76 ms</b><b class="bench-num" data-stat="p95">1.79 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>5.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.98%"></i><i class="bench-bar__fill" style="width:16.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.70%"></i><i class="bench-bar__fill" style="width:34.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.33 ms</b><b class="bench-num" data-stat="p95">2.44 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>475.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.63%"></i><i class="bench-bar__fill" style="width:21.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.74 ms</b><b class="bench-num" data-stat="p95">0.97 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.94%"></i><i class="bench-bar__fill" style="width:88.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">352.1 ms</b><b class="bench-num" data-stat="p95">361.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.72%"></i><i class="bench-bar__fill" style="width:57.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 ms</b><b class="bench-num" data-stat="p95">20.4 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.03%"></i><i class="bench-bar__fill" style="width:57.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.6 ms</b><b class="bench-num" data-stat="p95">20.9 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.33%"></i><i class="bench-bar__fill" style="width:19.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.71 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.08%"></i><i class="bench-bar__fill" style="width:30.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.67 ms</b><b class="bench-num" data-stat="p95">1.75 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>4.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.00%"></i><i class="bench-bar__fill" style="width:19.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.76 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.42%"></i><i class="bench-bar__fill" style="width:34.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.35 ms</b><b class="bench-num" data-stat="p95">2.38 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.45%"></i><i class="bench-bar__fill" style="width:23.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.87 ms</b><b class="bench-num" data-stat="p95">1.25 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.59%"></i><i class="bench-bar__fill" style="width:39.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.69 ms</b><b class="bench-num" data-stat="p95">3.83 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>130.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.45%"></i><i class="bench-bar__fill" style="width:10.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.41%"></i><i class="bench-bar__fill" style="width:63.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">35.7 ms</b><b class="bench-num" data-stat="p95">37.7 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">167.3 MB</span><span class="bench-ruler__tick" style="left:50.00%">334.6 MB</span><span class="bench-ruler__tick" style="left:75.00%">501.9 MB</span><span class="bench-ruler__tick" style="left:100.00%">669.2 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">155.8 MB</b><b class="bench-num" data-stat="p95">20.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">379.6 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">101.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">385.3 MB</b><b class="bench-num" data-stat="p95">5.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">108.3 MB</b><b class="bench-num" data-stat="p95">6.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:58.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">389.4 MB</b><b class="bench-num" data-stat="p95">4.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">110.8 MB</b><b class="bench-num" data-stat="p95">3.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:59.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">395.8 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">102.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">246.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">107.9 MB</b><b class="bench-num" data-stat="p95">5.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">244.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">100.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">220.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">106.8 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">220.5 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">151.2 MB</b><b class="bench-num" data-stat="p95">46.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">151.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>5.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">107.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:94.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">633.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>6.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.1 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:96.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">647.5 MB</b><b class="bench-num" data-stat="p95">12.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>6.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">107.8 MB</b><b class="bench-num" data-stat="p95">6.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:96.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">644.9 MB</b><b class="bench-num" data-stat="p95">10.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>5.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:19.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">128.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">669.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<figcaption>Every bar in a panel shares the ruler's scale (speed is logarithmic - each tick is 10x), so lengths compare across rows as well as within them. Bright numbers are the median run; faded numbers are the p95 run (speed) or the interaction's heap delta (memory). Rows marked as not completed are runs the engine could not finish - the recorded failure (crash, timeout, or failed correctness checkpoint) lives in the raw artifact.</figcaption>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each scenario does</summary>
<div class="bench-method__body">
<p>Live grid in controlled headless Chromium. Ten counterbalanced rounds; all fourteen scenarios run warm per mount, and the fixture is rebuilt after any failure so crashes cannot leak state. Every scenario must prove its effect (scroll really moved, editor really opened, rows really changed) or it fails.</p>
<p>Bright = median round, faded = p95 round. <strong>Did not complete</strong> = recorded crash, timeout, or failed checkpoint - never a timing.</p>
<dl>
<div><dt><code>scroll-down.top-left</code></dt><dd>From the origin, jump-scroll 50 px down: a fresh row band enters the viewport and must paint.</dd></div>
<div><dt><code>scroll-down.middle</code></dt><dd>The same 50 px jump starting from the vertical middle of the scroll range.</dd></div>
<div><dt><code>scroll-smooth.same-window</code></dt><dd>Scroll 1 px without changing the visible row window: pure repaint cost, zero new data.</dd></div>
<div><dt><code>scroll-right.top-left</code></dt><dd>Jump-scroll 50 px right: a fresh column band paints.</dd></div>
<div><dt><code>edit-open.top-left</code></dt><dd>Select a cell near the origin and open its editor.</dd></div>
<div><dt><code>edit-open.middle</code></dt><dd>Open the editor on the center cell of the workbook.</dd></div>
<div><dt><code>edit-open.bottom-right</code></dt><dd>Open the editor on the last row and column - the far end of every index.</dd></div>
<div><dt><code>edit-commit.middle</code></dt><dd>Commit a typed value into the center cell and paint the result.</dd></div>
<div><dt><code>altering.insert-5-rows-top</code></dt><dd>Insert five rows at the top: every following row reindexes.</dd></div>
<div><dt><code>altering.remove-5-rows-top</code></dt><dd>Remove those five rows again - the inverse reindex.</dd></div>
<div><dt><code>arrow-down.top-left</code></dt><dd>Move the selection one cell down with the arrow key, including the selection overlay repaint.</dd></div>
<div><dt><code>arrow-right.middle</code></dt><dd>Arrow-key selection move at the workbook center.</dd></div>
<div><dt><code>formatted-paint.top-left</code></dt><dd>Repaint a viewport dense with per-cell formatting.</dd></div>
<div><dt><code>merge-heavy.paint</code></dt><dd>Repaint a viewport dense with merged ranges; Sheetwrite additionally proves it builds exactly one merge revision index.</dd></div>
</dl>
</div>
</details>

Reproduce and validate with:

```sh verify title="Controlled render evidence"
bun run --filter @sheetwrite/bench bench:render:prepare
bun run --filter @sheetwrite/bench bench:render:scale
```

## Data engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 22:05 UTC</dd></div>
<div><dt>Commit</dt><dd><code>6154cca220eb</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/data-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-widget bench-widget--data" data-pagefind-ignore>
<input type="radio" name="bench-data-size" id="bench-data-1000">
<input type="radio" name="bench-data-size" id="bench-data-10000">
<div class="bench-widget__tabs">
<div class="bench-tabs" aria-label="Workbook size">
<label for="bench-data-1000">1k rows</label>
<label for="bench-data-10000">10k rows</label>
</div>
</div>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>1556.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.60%"></i><i class="bench-bar__fill" style="width:41.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.31 ms</b><b class="bench-num" data-stat="p95">0.41 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.63%"></i><i class="bench-bar__fill" style="width:94.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">479.7 ms</b><b class="bench-num" data-stat="p95">546.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>13.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.09%"></i><i class="bench-bar__fill" style="width:12.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.42%"></i><i class="bench-bar__fill" style="width:31.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.08 ms</b><b class="bench-num" data-stat="p95">0.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>105.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.17%"></i><i class="bench-bar__fill" style="width:53.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.65 ms</b><b class="bench-num" data-stat="p95">2.34 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:89.72%"></i><i class="bench-bar__fill" style="width:87.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">173.9 ms</b><b class="bench-num" data-stat="p95">241.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>1762.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.38%"></i><i class="bench-bar__fill" style="width:33.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:89.60%"></i><i class="bench-bar__fill" style="width:88.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">192.9 ms</b><b class="bench-num" data-stat="p95">237.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>4708.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.38%"></i><i class="bench-bar__fill" style="width:21.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.89%"></i><i class="bench-bar__fill" style="width:83.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">98.1 ms</b><b class="bench-num" data-stat="p95">108.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>57.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.33%"></i><i class="bench-bar__fill" style="width:8.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.11%"></i><i class="bench-bar__fill" style="width:38.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.19 ms</b><b class="bench-num" data-stat="p95">0.34 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.01</span><span class="bench-ruler__tick" style="left:16.67%">0.1</span><span class="bench-ruler__tick" style="left:33.33%">1</span><span class="bench-ruler__tick" style="left:50.00%">10</span><span class="bench-ruler__tick" style="left:66.67%">100</span><span class="bench-ruler__tick" style="left:83.33%">1k</span><span class="bench-ruler__tick" style="left:100.00%">10000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>1709.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:40.26%"></i><i class="bench-bar__fill" style="width:39.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.37 ms</b><b class="bench-num" data-stat="p95">2.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:94.30%"></i><i class="bench-bar__fill" style="width:93.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4055.9 ms</b><b class="bench-num" data-stat="p95">4552.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>20.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:19.49%"></i><i class="bench-bar__fill" style="width:17.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.12 ms</b><b class="bench-num" data-stat="p95">0.15 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>662.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.14%"></i><i class="bench-bar__fill" style="width:30.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.70 ms</b><b class="bench-num" data-stat="p95">1.47 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.98%"></i><i class="bench-bar__fill" style="width:77.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">466.4 ms</b><b class="bench-num" data-stat="p95">548.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>9977.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.59%"></i><i class="bench-bar__fill" style="width:21.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.18 ms</b><b class="bench-num" data-stat="p95">0.20 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.56%"></i><i class="bench-bar__fill" style="width:87.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1815.0 ms</b><b class="bench-num" data-stat="p95">2713.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>20304.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.48%"></i><i class="bench-bar__fill" style="width:10.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.45%"></i><i class="bench-bar__fill" style="width:82.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">913.4 ms</b><b class="bench-num" data-stat="p95">2026.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>72.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.01%"></i><i class="bench-bar__fill" style="width:4.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.37%"></i><i class="bench-bar__fill" style="width:35.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.38 ms</b><b class="bench-num" data-stat="p95">2.01 ms</b></span></div>
</div>
</section>
</figure>

Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.02%"></i><i class="bench-bar__fill" style="width:73.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.6 ms</b><b class="bench-num" data-stat="p95">27.6 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.97%"></i><i class="bench-bar__fill" style="width:85.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">143.1 ms</b><b class="bench-num" data-stat="p95">143.9 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:91.75%"></i><i class="bench-bar__fill" style="width:91.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">313.7 ms</b><b class="bench-num" data-stat="p95">319.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.09%"></i><i class="bench-bar__fill" style="width:15.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.92%"></i><i class="bench-bar__fill" style="width:15.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.52%"></i><i class="bench-bar__fill" style="width:17.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.22%"></i><i class="bench-bar__fill" style="width:51.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.25 ms</b><b class="bench-num" data-stat="p95">2.36 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.86%"></i><i class="bench-bar__fill" style="width:47.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.85 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.43%"></i><i class="bench-bar__fill" style="width:47.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.74 ms</b><b class="bench-num" data-stat="p95">0.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.74%"></i><i class="bench-bar__fill" style="width:54.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.82 ms</b><b class="bench-num" data-stat="p95">1.92 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.02%"></i><i class="bench-bar__fill" style="width:66.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.97 ms</b><b class="bench-num" data-stat="p95">10.5 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.97%"></i><i class="bench-bar__fill" style="width:73.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.6 ms</b><b class="bench-num" data-stat="p95">27.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.52%"></i><i class="bench-bar__fill" style="width:41.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.32 ms</b><b class="bench-num" data-stat="p95">0.36 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.04%"></i><i class="bench-bar__fill" style="width:53.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.61 ms</b><b class="bench-num" data-stat="p95">1.75 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.50%"></i><i class="bench-bar__fill" style="width:59.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.65 ms</b><b class="bench-num" data-stat="p95">4.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:40.17%"></i><i class="bench-bar__fill" style="width:37.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.19 ms</b><b class="bench-num" data-stat="p95">0.26 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.84%"></i><i class="bench-bar__fill" style="width:50.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.06 ms</b><b class="bench-num" data-stat="p95">1.48 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.05%"></i><i class="bench-bar__fill" style="width:55.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.08 ms</b><b class="bench-num" data-stat="p95">2.31 ms</b></span></div>
</div>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each operation does</summary>
<div class="bench-method__body">
<p>Identical columnar datasets, per-operation warmup and iteration plans. Fresh instance per ingest; window reads rotate offsets to defeat caches; sort and filter reset between runs; Handsontable edits run with rendering suspended so only its data path is timed.</p>
<p>Memory = JS-heap delta around one ingest in an isolated subprocess, plus Sheetwrite's WASM linear-memory delta.</p>
<dl>
<div><dt><code>ingest</code></dt><dd>Load the full dataset into a fresh engine instance.</dd></div>
<div><dt><code>windowRead</code></dt><dd>Read a 50x5 cell window at a rotating offset that sweeps the whole sheet.</dd></div>
<div><dt><code>edit</code></dt><dd>1,000 single-cell edits.</dd></div>
<div><dt><code>sort</code></dt><dd>Sort by the numeric amount column.</dd></div>
<div><dt><code>filter</code></dt><dd>Substring filter over the city column.</dd></div>
<div><dt><code>aggregate</code></dt><dd>Numeric aggregation over the amount column.</dd></div>
</dl>
</div>
</details>

Reproduce with:

```sh verify title="Data engine evidence"
bun run --filter @sheetwrite/bench bench:data
```

## Formula engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 26 recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 22:06 UTC</dd></div>
<div><dt>Commit</dt><dd><code>c85226578c40</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/formula-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1000.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>criteria-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.51%"></i><i class="bench-bar__fill" style="width:61.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.76 ms</b><b class="bench-num" data-stat="p95">4.91 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cross-sheet-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.39%"></i><i class="bench-bar__fill" style="width:54.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.97 ms</b><b class="bench-num" data-stat="p95">2.11 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cycles</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.90%"></i><i class="bench-bar__fill" style="width:54.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.95 ms</b><b class="bench-num" data-stat="p95">3.42 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>diamond-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.01%"></i><i class="bench-bar__fill" style="width:34.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.12 ms</b><b class="bench-num" data-stat="p95">0.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>distinct-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.67%"></i><i class="bench-bar__fill" style="width:19.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>error-propagation</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.95%"></i><i class="bench-bar__fill" style="width:48.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.80 ms</b><b class="bench-num" data-stat="p95">0.86 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-first-recompute</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.97%"></i><i class="bench-bar__fill" style="width:55.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.21 ms</b><b class="bench-num" data-stat="p95">3.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.60%"></i><i class="bench-bar__fill" style="width:67.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.6 ms</b><b class="bench-num" data-stat="p95">11.4 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.96%"></i><i class="bench-bar__fill" style="width:86.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">160.7 ms</b><b class="bench-num" data-stat="p95">165.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-parse-load</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.48%"></i><i class="bench-bar__fill" style="width:57.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.89 ms</b><b class="bench-num" data-stat="p95">3.23 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.51%"></i><i class="bench-bar__fill" style="width:66.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 ms</b><b class="bench-num" data-stat="p95">12.9 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.68%"></i><i class="bench-bar__fill" style="width:82.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">91.9 ms</b><b class="bench-num" data-stat="p95">105.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>linear-chain</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">8 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.59%"></i><i class="bench-bar__fill" style="width:22.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">16 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.24%"></i><i class="bench-bar__fill" style="width:26.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.98%"></i><i class="bench-bar__fill" style="width:29.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.06 ms</b><b class="bench-num" data-stat="p95">0.07 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">64 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.34%"></i><i class="bench-bar__fill" style="width:33.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.11 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>lookup-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.33%"></i><i class="bench-bar__fill" style="width:61.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.18 ms</b><b class="bench-num" data-stat="p95">6.30 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>removed-sheet-ref</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.59%"></i><i class="bench-bar__fill" style="width:46.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.65 ms</b><b class="bench-num" data-stat="p95">0.95 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-0</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:7.50%"></i><i class="bench-bar__fill" style="width:7.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.00 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-1</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1 cell</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:10.69%"></i><i class="bench-bar__fill" style="width:9.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.00 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-1000</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.18%"></i><i class="bench-bar__fill" style="width:45.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-100000</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.48%"></i><i class="bench-bar__fill" style="width:84.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">109.8 ms</b><b class="bench-num" data-stat="p95">117.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>shared-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.22%"></i><i class="bench-bar__fill" style="width:58.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.10 ms</b><b class="bench-num" data-stat="p95">3.58 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>topology-remove-add</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.79%"></i><i class="bench-bar__fill" style="width:67.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.4 ms</b><b class="bench-num" data-stat="p95">11.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>wide-fan-out-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.65%"></i><i class="bench-bar__fill" style="width:47.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.95 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.43%"></i><i class="bench-bar__fill" style="width:84.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">114.5 ms</b><b class="bench-num" data-stat="p95">116.4 ms</b></span></div>
</div>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each workload does</summary>
<div class="bench-method__body">
<p>Each workload builds a fresh WASM cell-store of the named dependency shape and times the recalculation from one action - usually a single edit. Sizes are formula-cell counts; bright = median, faded = p95.</p>
<dl>
<div><dt><code>linear-chain</code></dt><dd>A chain A1 -> A2 -> ... -> AN; editing the head recomputes the full depth.</dd></div>
<div><dt><code>wide-fan-out-edit</code></dt><dd>One scalar feeds N dependent formulas; edit the scalar.</dd></div>
<div><dt><code>diamond-edit</code></dt><dd>Fan-out that reconverges (diamond graph); edit the apex.</dd></div>
<div><dt><code>shared-range-edit</code></dt><dd>N formulas aggregate one shared range; edit one cell inside it.</dd></div>
<div><dt><code>distinct-range-edit</code></dt><dd>Each formula owns its own range; one edit recomputes only its owner.</dd></div>
<div><dt><code>cross-sheet-range-edit</code></dt><dd>Summary-sheet formulas range over another sheet; edit the source.</dd></div>
<div><dt><code>scalar-edit-affects-0</code></dt><dd>1,000 formulas exist but the edit touches an unrelated cell: pure dependency-lookup cost.</dd></div>
<div><dt><code>scalar-edit-affects-1</code></dt><dd>One scalar edit invalidating exactly one dependent.</dd></div>
<div><dt><code>scalar-edit-affects-1000</code></dt><dd>One scalar edit invalidating 1,000 dependents.</dd></div>
<div><dt><code>scalar-edit-affects-100000</code></dt><dd>One scalar edit invalidating 100,000 dependents.</dd></div>
<div><dt><code>topology-remove-add</code></dt><dd>Remove and re-add rows so the dependency graph itself changes shape.</dd></div>
<div><dt><code>cycles</code></dt><dd>Introduce a reference cycle; detection and cycle-error propagation.</dd></div>
<div><dt><code>removed-sheet-ref</code></dt><dd>Formulas referencing a deleted sheet must all degrade to reference errors.</dd></div>
<div><dt><code>error-propagation</code></dt><dd>An error value (=1/0) flows through every dependent.</dd></div>
<div><dt><code>criteria-range-edit</code></dt><dd>Criteria-style aggregation (SUMIF shape) over 100k cells; edit inside the criteria range.</dd></div>
<div><dt><code>lookup-range-edit</code></dt><dd>Lookup-shape formulas over 100k cells; edit inside the looked-up range.</dd></div>
</dl>
</div>
</details>

Reproduce with:

```sh verify title="Formula engine evidence"
bun run --filter @sheetwrite/bench bench:formula
```

## Delivery size

<div class="evidence-available"><strong>Validated evidence.</strong> Package tarball and bundler-output sizes, gated by absolute budgets in CI.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 22:51 UTC</dd></div>
<div><dt>Commit</dt><dd><code>063394e823b0</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>test-results/delivery-size/size-report.json</code></dd></div>
</dl>

| Package | Tarball | Unpacked |
| --- | ---: | ---: |
| `@sheetwrite/core` | 332.2 KiB | 1747.0 KiB |
| `@sheetwrite/react` | 7.0 KiB | 21.9 KiB |
| `@sheetwrite/svelte` | 5.2 KiB | 14.3 KiB |
| `@sheetwrite/vue` | 8.6 KiB | 34.1 KiB |
| `@sheetwrite/wasm` | 172.4 KiB | 468.0 KiB |
| `@sheetwrite/xlsx` | 21.3 KiB | 93.0 KiB |

A minimal Vite app that renders a grid ships 78.9 KiB of gzipped JavaScript.

Reproduce with:

```sh verify title="Delivery size evidence"
bun run size:report
```
