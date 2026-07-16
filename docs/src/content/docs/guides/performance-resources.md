---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.

## Render benchmark: Sheetwrite vs Handsontable

<div class="evidence-available"><strong>Validated evidence.</strong> 1120/1180 engine/scenario/round runs completed across 4 workbook sizes; every completed run passed its correctness checkpoints; 60 runs did not finish and are shown as such.</div>

Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 19:08 UTC</dd></div>
<div><dt>Commit</dt><dd><code>a6c58917df64</code> clean worktree</dd></div>
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
<section class="bench-panel" data-size="1000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>22.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.45%"></i><i class="bench-bar__fill" style="width:4.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.28 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.5 ms</b><b class="bench-num" data-stat="p95">29.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.42%"></i><i class="bench-bar__fill" style="width:23.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.12 ms</b><b class="bench-num" data-stat="p95">1.18 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.40 ms</b><b class="bench-num" data-stat="p95">4.82 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>51.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.99%"></i><i class="bench-bar__fill" style="width:1.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.46 ms</b><b class="bench-num" data-stat="p95">0.50 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.9 ms</b><b class="bench-num" data-stat="p95">25.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>101.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.09%"></i><i class="bench-bar__fill" style="width:0.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.2 ms</b><b class="bench-num" data-stat="p95">27.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.28%"></i><i class="bench-bar__fill" style="width:38.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.52 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.19 ms</b><b class="bench-num" data-stat="p95">1.22 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.84%"></i><i class="bench-bar__fill" style="width:48.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.89%"></i><i class="bench-bar__fill" style="width:25.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.46 ms</b><b class="bench-num" data-stat="p95">0.49 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.73 ms</b><b class="bench-num" data-stat="p95">1.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>7.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:13.33%"></i><i class="bench-bar__fill" style="width:13.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.77 ms</b><b class="bench-num" data-stat="p95">0.79 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:99.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.91 ms</b><b class="bench-num" data-stat="p95">5.92 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>21.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.09%"></i><i class="bench-bar__fill" style="width:4.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.97 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.2 ms</b><b class="bench-num" data-stat="p95">21.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>22.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.43%"></i><i class="bench-bar__fill" style="width:4.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.93 ms</b><b class="bench-num" data-stat="p95">1.00 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.6 ms</b><b class="bench-num" data-stat="p95">22.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.16%"></i><i class="bench-bar__fill" style="width:37.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.52 ms</b><b class="bench-num" data-stat="p95">1.56 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.62%"></i><i class="bench-bar__fill" style="width:40.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 ms</b><b class="bench-num" data-stat="p95">1.47 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.80%"></i><i class="bench-bar__fill" style="width:20.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.77 ms</b><b class="bench-num" data-stat="p95">0.84 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.46 ms</b><b class="bench-num" data-stat="p95">3.68 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>14.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:7.91%"></i><i class="bench-bar__fill" style="width:6.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.85 ms</b><b class="bench-num" data-stat="p95">4.21 ms</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="1000" data-metric="memory">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>footprint · faded № = Δ</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:65.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 MB</b><b class="bench-num" data-stat="p95">2.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:65.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.5 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.0 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:68.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.4 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.4 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:70.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.2 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:54.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:42.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.7 MB</b><b class="bench-num" data-stat="p95">3.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:48.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.8 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.8 MB</b><b class="bench-num" data-stat="p95">1.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.5 MB</b><b class="bench-num" data-stat="p95">4.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.1 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">4.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:53.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.1 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.2 MB</b><b class="bench-num" data-stat="p95">3.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.6 MB</b><b class="bench-num" data-stat="p95">4.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.4 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.4 MB</b><b class="bench-num" data-stat="p95">4.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:51.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.4 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.3 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.3 MB</b><b class="bench-num" data-stat="p95">4.7 MB</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="10000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>27.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:3.73%"></i><i class="bench-bar__fill" style="width:3.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.24 ms</b><b class="bench-num" data-stat="p95">1.32 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">34.4 ms</b><b class="bench-num" data-stat="p95">35.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>6.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.48%"></i><i class="bench-bar__fill" style="width:15.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.11 ms</b><b class="bench-num" data-stat="p95">1.18 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.95 ms</b><b class="bench-num" data-stat="p95">7.19 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>65.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.54%"></i><i class="bench-bar__fill" style="width:1.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.47 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.8 ms</b><b class="bench-num" data-stat="p95">30.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>107.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.06%"></i><i class="bench-bar__fill" style="width:0.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.29 ms</b><b class="bench-num" data-stat="p95">0.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:99.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">30.9 ms</b><b class="bench-num" data-stat="p95">31.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.43%"></i><i class="bench-bar__fill" style="width:41.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.51 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.21 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.86%"></i><i class="bench-bar__fill" style="width:47.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.19 ms</b><b class="bench-num" data-stat="p95">1.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.54%"></i><i class="bench-bar__fill" style="width:25.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.49 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.74 ms</b><b class="bench-num" data-stat="p95">1.85 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>10.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.71%"></i><i class="bench-bar__fill" style="width:9.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.80 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.12 ms</b><b class="bench-num" data-stat="p95">8.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>26.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.08%"></i><i class="bench-bar__fill" style="width:3.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.07 ms</b><b class="bench-num" data-stat="p95">1.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.0 ms</b><b class="bench-num" data-stat="p95">29.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>28.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.27%"></i><i class="bench-bar__fill" style="width:3.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.98 ms</b><b class="bench-num" data-stat="p95">1.26 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.1 ms</b><b class="bench-num" data-stat="p95">29.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.43%"></i><i class="bench-bar__fill" style="width:39.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.63 ms</b><b class="bench-num" data-stat="p95">0.63 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:93.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.50 ms</b><b class="bench-num" data-stat="p95">1.60 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.60%"></i><i class="bench-bar__fill" style="width:37.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.61 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.46 ms</b><b class="bench-num" data-stat="p95">1.61 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.14%"></i><i class="bench-bar__fill" style="width:21.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.85 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.49 ms</b><b class="bench-num" data-stat="p95">3.67 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>14.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:7.47%"></i><i class="bench-bar__fill" style="width:6.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.97 ms</b><b class="bench-num" data-stat="p95">4.14 ms</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="10000" data-metric="memory">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>footprint · faded № = Δ</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:50.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:59.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.2 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.5 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.2 MB</b><b class="bench-num" data-stat="p95">3.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:74.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.3 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.5 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.5 MB</b><b class="bench-num" data-stat="p95">6.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:48.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.6 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.8 MB</b><b class="bench-num" data-stat="p95">3.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:50.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.6 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.0 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.7 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.1 MB</b><b class="bench-num" data-stat="p95">2.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.9 MB</b><b class="bench-num" data-stat="p95">6.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.1 MB</b><b class="bench-num" data-stat="p95">25.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.2 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">34.8 MB</b><b class="bench-num" data-stat="p95">1.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>3.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.4 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">37.6 MB</b><b class="bench-num" data-stat="p95">17.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.1 MB</b><b class="bench-num" data-stat="p95">5.8 MB</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="100000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>69.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.42%"></i><i class="bench-bar__fill" style="width:1.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.26 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">87.7 ms</b><b class="bench-num" data-stat="p95">92.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>28.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:3.66%"></i><i class="bench-bar__fill" style="width:3.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">32.0 ms</b><b class="bench-num" data-stat="p95">33.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>177.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.45 ms</b><b class="bench-num" data-stat="p95">0.47 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">78.9 ms</b><b class="bench-num" data-stat="p95">81.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>221.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.24 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:93.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">53.9 ms</b><b class="bench-num" data-stat="p95">57.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.76%"></i><i class="bench-bar__fill" style="width:43.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.22 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.65%"></i><i class="bench-bar__fill" style="width:35.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.64 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.55 ms</b><b class="bench-num" data-stat="p95">1.62 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>4.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:22.39%"></i><i class="bench-bar__fill" style="width:20.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.49 ms</b><b class="bench-num" data-stat="p95">0.53 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.31 ms</b><b class="bench-num" data-stat="p95">2.37 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>45.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.17%"></i><i class="bench-bar__fill" style="width:2.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.80 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">35.8 ms</b><b class="bench-num" data-stat="p95">36.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>41.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.62%"></i><i class="bench-bar__fill" style="width:2.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.50 ms</b><b class="bench-num" data-stat="p95">2.88 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">104.3 ms</b><b class="bench-num" data-stat="p95">109.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>39.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.59%"></i><i class="bench-bar__fill" style="width:2.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.59 ms</b><b class="bench-num" data-stat="p95">2.91 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:90.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">102.1 ms</b><b class="bench-num" data-stat="p95">112.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.32%"></i><i class="bench-bar__fill" style="width:38.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.63 ms</b><b class="bench-num" data-stat="p95">0.65 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:90.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.49 ms</b><b class="bench-num" data-stat="p95">1.65 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.35%"></i><i class="bench-bar__fill" style="width:29.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.61 ms</b><b class="bench-num" data-stat="p95">0.66 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.97 ms</b><b class="bench-num" data-stat="p95">2.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.34%"></i><i class="bench-bar__fill" style="width:21.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.80 ms</b><b class="bench-num" data-stat="p95">0.90 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.61 ms</b><b class="bench-num" data-stat="p95">3.72 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>24.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.08%"></i><i class="bench-bar__fill" style="width:3.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.29 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.03 ms</b><b class="bench-num" data-stat="p95">7.71 ms</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="100000" data-metric="memory">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>footprint · faded № = Δ</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">39.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.1 MB</b><b class="bench-num" data-stat="p95">2.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.7 MB</b><b class="bench-num" data-stat="p95">6.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.8 MB</b><b class="bench-num" data-stat="p95">6.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:53.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.8 MB</b><b class="bench-num" data-stat="p95">2.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">36.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">41.0 MB</b><b class="bench-num" data-stat="p95">3.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:43.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.9 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.5 MB</b><b class="bench-num" data-stat="p95">4.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">43.7 MB</b><b class="bench-num" data-stat="p95">10.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:46.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.1 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>2.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">55.9 MB</b><b class="bench-num" data-stat="p95">38.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">158.8 MB</b><b class="bench-num" data-stat="p95">117.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">64.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">170.9 MB</b><b class="bench-num" data-stat="p95">52.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>4.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">72.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.7 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">64.7 MB</b><b class="bench-num" data-stat="p95">20.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.6 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">59.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">61.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel" data-size="1000000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">relative time per row — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>541.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.29 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:91.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">700.7 ms</b><b class="bench-num" data-stat="p95">765.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>299.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.09 ms</b><b class="bench-num" data-stat="p95">1.44 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:92.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">326.8 ms</b><b class="bench-num" data-stat="p95">353.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1611.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.45 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">711.9 ms</b><b class="bench-num" data-stat="p95">747.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1338.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:90.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">361.2 ms</b><b class="bench-num" data-stat="p95">399.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.37%"></i><i class="bench-bar__fill" style="width:31.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.49 ms</b><b class="bench-num" data-stat="p95">0.64 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:86.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.33 ms</b><b class="bench-num" data-stat="p95">1.55 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>3.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.62%"></i><i class="bench-bar__fill" style="width:28.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.53 ms</b><b class="bench-num" data-stat="p95">0.71 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:96.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.78 ms</b><b class="bench-num" data-stat="p95">1.85 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>5.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.32%"></i><i class="bench-bar__fill" style="width:17.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.43 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.40 ms</b><b class="bench-num" data-stat="p95">2.45 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>473.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.70 ms</b><b class="bench-num" data-stat="p95">0.77 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:94.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">333.5 ms</b><b class="bench-num" data-stat="p95">352.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.2 ms</b><b class="bench-num" data-stat="p95">19.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 ms</b><b class="bench-num" data-stat="p95">19.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:79.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.72 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:83.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.81 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:69.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.72 ms</b><b class="bench-num" data-stat="p95">1.04 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:78.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.28 ms</b><b class="bench-num" data-stat="p95">0.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
</section>
<section class="bench-panel" data-size="1000000" data-metric="memory">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>footprint · faded № = Δ</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">155.9 MB</b><b class="bench-num" data-stat="p95">20.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">379.6 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">385.3 MB</b><b class="bench-num" data-stat="p95">5.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">109.0 MB</b><b class="bench-num" data-stat="p95">6.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">389.4 MB</b><b class="bench-num" data-stat="p95">4.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">109.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">395.9 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:42.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">244.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:44.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">107.4 MB</b><b class="bench-num" data-stat="p95">5.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">239.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">100.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">220.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">108.4 MB</b><b class="bench-num" data-stat="p95">6.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">220.5 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">166.9 MB</b><b class="bench-num" data-stat="p95">56.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">151.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">100.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.6 MB</b><b class="bench-num" data-stat="p95">3.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">112.5 MB</b><b class="bench-num" data-stat="p95">6.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
<div class="bench-viz__row" data-outcome="solo">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">123.9 MB</b><b class="bench-num" data-stat="p95">1.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable" data-crashed=""><span class="bench-bar__engine">Handsontable</span><span class="bench-crash">did not complete</span></div>
</div>
</section>
<figcaption>Each row is scaled to its slower (or heavier) engine, so bar lengths compare directly within a row. Bright numbers are the median run; faded numbers are the p95 run (speed) or the interaction's heap delta (memory). Rows marked as not completed are runs the engine could not finish - the recorded failure (crash, timeout, or failed correctness checkpoint) lives in the raw artifact.</figcaption>
</figure>

Reproduce and validate with:

```sh verify title="Controlled render evidence"
bun run --filter @sheetwrite/bench bench:render:prepare
bun run --filter @sheetwrite/bench bench:render:scale
```

## Data engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 19:14 UTC</dd></div>
<div><dt>Commit</dt><dd><code>a6c58917df64</code> clean worktree</dd></div>
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
<section class="bench-panel" data-size="1000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">relative time per operation — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
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
</section>
<section class="bench-panel" data-size="10000" data-metric="speed">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">relative time per operation — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
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
</section>
</figure>

Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:

<figure class="bench-viz" data-pagefind-ignore>
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">relative time — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.33%"></i><i class="bench-bar__fill" style="width:9.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.0 ms</b><b class="bench-num" data-stat="p95">32.9 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.27%"></i><i class="bench-bar__fill" style="width:46.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">133.6 ms</b><b class="bench-num" data-stat="p95">160.3 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:99.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">289.8 ms</b><b class="bench-num" data-stat="p95">290.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:57.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.42%"></i><i class="bench-bar__fill" style="width:57.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:92.12%"></i><i class="bench-bar__fill" style="width:69.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:43.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.72 ms</b><b class="bench-num" data-stat="p95">1.66 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.43%"></i><i class="bench-bar__fill" style="width:49.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.82 ms</b><b class="bench-num" data-stat="p95">1.22 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.42%"></i><i class="bench-bar__fill" style="width:45.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.75 ms</b><b class="bench-num" data-stat="p95">0.90 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.95%"></i><i class="bench-bar__fill" style="width:7.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.85 ms</b><b class="bench-num" data-stat="p95">2.12 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.53%"></i><i class="bench-bar__fill" style="width:44.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.6 ms</b><b class="bench-num" data-stat="p95">11.7 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.1 ms</b><b class="bench-num" data-stat="p95">23.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:10.36%"></i><i class="bench-bar__fill" style="width:8.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.34 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.55%"></i><i class="bench-bar__fill" style="width:39.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.62 ms</b><b class="bench-num" data-stat="p95">1.68 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:82.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.33 ms</b><b class="bench-num" data-stat="p95">4.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.80%"></i><i class="bench-bar__fill" style="width:7.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.19 ms</b><b class="bench-num" data-stat="p95">0.24 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.01%"></i><i class="bench-bar__fill" style="width:39.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.00 ms</b><b class="bench-num" data-stat="p95">2.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:77.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.93 ms</b><b class="bench-num" data-stat="p95">2.50 ms</b></span></div>
</div>
</figure>

Reproduce with:

```sh verify title="Data engine evidence"
bun run --filter @sheetwrite/bench bench:data
```

## Formula engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 26 recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 19:18 UTC</dd></div>
<div><dt>Commit</dt><dd><code>2f137b82a2f2</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/formula-results.json</code></dd></div>
</dl>

<figure class="bench-viz" data-pagefind-ignore>
<div class="bench-viz__scale"><span class="bench-viz__lead">workload</span><span class="bench-viz__axis-note">relative time — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>criteria-range-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.78 ms</b><b class="bench-num" data-stat="p95">4.91 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cross-sheet-range-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.32 ms</b><b class="bench-num" data-stat="p95">2.45 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cycles</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.50 ms</b><b class="bench-num" data-stat="p95">1.53 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>diamond-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.15 ms</b><b class="bench-num" data-stat="p95">0.18 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>distinct-range-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>error-propagation</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.79 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-first-recompute</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.91%"></i><i class="bench-bar__fill" style="width:0.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.57 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.48%"></i><i class="bench-bar__fill" style="width:4.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.37 ms</b><b class="bench-num" data-stat="p95">9.48 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:90.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">156.4 ms</b><b class="bench-num" data-stat="p95">173.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-parse-load</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.13%"></i><i class="bench-bar__fill" style="width:1.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.78 ms</b><b class="bench-num" data-stat="p95">3.76 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.63%"></i><i class="bench-bar__fill" style="width:10.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.38 ms</b><b class="bench-num" data-stat="p95">10.6 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:84.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">76.8 ms</b><b class="bench-num" data-stat="p95">91.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>linear-chain</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">8 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.24%"></i><i class="bench-bar__fill" style="width:9.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">16 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:19.12%"></i><i class="bench-bar__fill" style="width:16.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.72%"></i><i class="bench-bar__fill" style="width:29.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">64 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:89.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.13 ms</b><b class="bench-num" data-stat="p95">0.15 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>lookup-range-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.11 ms</b><b class="bench-num" data-stat="p95">5.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>removed-sheet-ref</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-0</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-1</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1 cell</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.00 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-1000</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.82 ms</b><b class="bench-num" data-stat="p95">1.00 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects-100000</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">117.3 ms</b><b class="bench-num" data-stat="p95">133.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>shared-range-edit</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.67 ms</b><b class="bench-num" data-stat="p95">5.69 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>topology-remove-add</code></div>
<div class="bench-bar bench-bar--solo" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.7 ms</b><b class="bench-num" data-stat="p95">13.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>wide-fan-out-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.78%"></i><i class="bench-bar__fill" style="width:0.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.79 ms</b><b class="bench-num" data-stat="p95">1.00 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:95.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">121.7 ms</b><b class="bench-num" data-stat="p95">127.3 ms</b></span></div>
</div>
</figure>

Reproduce with:

```sh verify title="Formula engine evidence"
bun run --filter @sheetwrite/bench bench:formula
```

## Delivery size

<div class="evidence-available"><strong>Validated evidence.</strong> Published package and bundler-output sizes, gated by absolute budgets in CI.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-07-16 19:18 UTC</dd></div>
<div><dt>Commit</dt><dd><code>e5435c92bd54</code> clean worktree</dd></div>
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
