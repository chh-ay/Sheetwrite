# Sheetwrite vs Handsontable — performance benchmarks

A rigorous, reproducible comparison between **Sheetwrite** (`@sheetwrite/core` — a
canvas-rendered grid over a Rust→WASM columnar store) and **Handsontable**
(`handsontable`, the popular JS data grid) across the operations that decide how
a grid feels at scale: load, read, edit, sort, filter, aggregate, scroll, and
navigate.

Two benchmarks, run independently:

| Benchmark | Where | What it answers |
|---|---|---|
| **Data layer** (`bun run bench:data`) | headless (Bun) | How fast is each engine's *data* model — ingest, windowed read, edit, sort, filter, aggregate — and how much memory does Sheetwrite's columnar store use? |
| **Render** (`bun run bench:render`) | real browser | How does each engine *render and respond* at 100k–1M rows — initial paint, sustained scroll, edit latency, row altering, keyboard navigation? |

The split is deliberate and honest: Handsontable is a DOM grid and **cannot
virtualize without a browser layout engine**. Headless (happy-dom) it renders
*every* row — a single 100k construct measured ~26 s, materializing ~131k
`<tr>`s — so the at-scale, apples-to-apples comparison must happen in a real
browser. The data-layer bench therefore runs Handsontable only where it
completes headlessly (1k/10k) and pushes Sheetwrite to 1M to show its scaling;
the browser bench carries the at-scale head-to-head.

─────────────────────────────────────────────────────────────────────────────

## Methodology

### Dataset (`src/dataset.ts`)

A single **seeded, deterministic** generator (`mulberry32(seed)`) produces
`N` rows × 5 columns — `id` (number), `date` (text), `customer` (text), `city`
(text), `amount` (number). A given `(rows, seed)` always yields byte-identical
content, so every workload runs over the *same* data on both engines and results
reproduce across machines and runs. Only the in-memory representation differs:
Sheetwrite ingests a **columnar** shape (a typed array per column — the layout
its WASM store consumes); Handsontable ingests the same logical rows as a
**row-major array-of-arrays**.

### Statistics (`src/stats.ts`)

Every workload is **warmed up** (untimed iterations to reach JIT/allocator/cache
steady state), then a larger set of **timed iterations** is collected and reduced
to **median + p95** (nearest-rank) rather than a mean — a single GC pause or
scheduler hiccup cannot dominate the headline number. Cheap operations sample
hundreds of times; expensive ones (1M-row ingest) fewer. Iteration counts are
encoded in `plan()` (data bench) and per scenario (render bench).

### What's measured, and why

| Workload | Why it matters | Sheetwrite path | Handsontable path |
|---|---|---|---|
| Ingest | first-load cost | `new SheetwriteStore(workbook, columnar)` | `new Handsontable(el, { data, … })` |
| Window read | the per-frame render read | `store.getVisibleWindow(50×5)` | `hot.getData(r1,c1,r2,c2)` over the same range |
| Edit ×1000 | interactive typing | 1000 `applyTransaction` set patches | 1000 `setDataAtCell` (in `suspendRender`/`resumeRender`) |
| Sort | column sort | `store.sortBy(amount)` (WASM) | `columnSorting` plugin |
| Filter | text filter | `store.filterBy(city, "Tokyo")` (WASM) | `filters` plugin (`contains`) |
| Aggregate | column math | `store.aggregate(amount, "sum")` (WASM) | plain-JS sum over `getSourceDataAtCol` |

Both engines agree on the data (e.g. the `city = "Tokyo"` filter selects 146 of
1000 rows, and `sum(amount)` matches to the cent on both), confirming the
workloads are equivalent.

### Formula-engine protocol

`bun run --filter '@sheetwrite/bench' bench:formula` measures deterministic
formula topologies from `src/formula-dataset.ts`; the reduced CI check is
`bench:formula:smoke`. Every fixture runs one untimed correctness pass before
sampling, validates representative results/errors after every timed iteration,
and preserves all five raw samples plus median/p95 in
`results/formula-results.json`. Formula memory is the exact WASM linear-memory
delta from isolated 1K/10K/100K-formula subprocesses.

The suite covers independent parse/load and first recompute, safe-depth linear
chains, 100K fan-out, diamonds, shared/distinct ranges, cross-sheet ranges,
scalar edits affecting 0/1/1K/100K formulas, topology removal/addition, cycles,
removed-sheet `#REF!`, and error propagation. Gates are deliberately broad:
100K parse/load and recompute p95 must stay below 5 seconds and 100K formulas
below 256 MiB; timer-floor workloads are recorded but never ratio-gated.

Latest checked capture: `bench:formula:smoke` at
`2026-07-13T08:56:07Z`, core commit `844da4e`, Bun 1.3.14, linux/x64,
12th Gen Intel Core i9-12900H (14 cores / 20 logical CPUs). Times are local-run
regression evidence, not cross-machine latency guarantees:

| 100K-formula workload | median ms | p95 ms |
| --- | ---: | ---: |
| parse/load | 75.58 | 87.92 |
| first recompute | 172.71 | 227.22 |
| fan-out edit | 136.17 | 146.28 |
| scalar edit affecting 100K | 114.65 | 123.81 |
| criteria range edit | 5.59 | 5.75 |
| lookup range edit | 6.18 | 6.71 |

Isolated WASM growth was 0.88 MiB (1K), 7.31 MiB (10K), and 62.00 MiB
(100K). The capture passed the declared gates. Raw samples, means, deviations,
and gate metadata remain in `results/formula-results.json`; the generated
`results/formula-results.md` is the matching human-readable report.

### Honest asymmetries (declared, not hidden)

- **Sheetwrite** keeps all cell data in **WASM linear memory** (a Rust columnar
  store) and, headless, does **no painting**. Its JS-side retained state is
  `O(columns + unique styles + active view)`, never `O(cells)`.
- **Handsontable** keeps data in **JS arrays coupled to a DOM view**. Its edit
  loop is bracketed by `suspendRender`/`resumeRender` to isolate the data path
  (it otherwise repaints on every edit), and it has **no native column
  aggregate**, so the sum is computed in idiomatic plain JS over its source
  array. Both facts are reported in the results.
- **Memory** is sampled in **isolated subprocesses** so each figure reflects a
  clean process. For Sheetwrite the meaningful figure is the **WASM
  `memory.buffer` byteLength delta** (exact); Bun's `process.heapUsed` conflates
  the WASM `ArrayBuffer` with the JS heap and is *not* used. Handsontable's
  representative memory is captured in the browser bench — its headless heap is
  dominated by the non-virtualized all-rows DOM and is not comparable.

### Render bench scenarios — adapted from Handsontable's own suite

The browser bench mirrors the four scenarios in Handsontable's official
performance suite, [`handsontable/performance-lab`](https://github.com/handsontable/performance-lab)
(`master`), running each on **both** grids with perf-lab's protocol (warm up,
then repeat each block `SAMPLE_SIZE = 100` times — see
[`lib/config.js`](https://github.com/handsontable/performance-lab/blob/master/lib/config.js)):

| Adapted spec | What we mirror |
|---|---|
| [`test/spec/view-scrolling.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/view-scrolling.spec.js) | scroll the master viewport by `SCROLL_STEP = 50px` repeatedly (down from top-left, down from middle, right from top-left); per-step ms + frames over the 60fps budget |
| [`test/spec/editing.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/editing.spec.js) | select + scroll a cell into view at top-left / middle / bottom-right, then open the editor (edit-open latency) and commit (edit-commit latency) |
| [`test/spec/altering.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/altering.spec.js) | insert / remove 5 rows at the top |
| [`test/spec/arrow-keys-navigation.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/arrow-keys-navigation.spec.js) | move the selection one cell (arrow-down from top-left, arrow-right from middle) |

Sheetwrite's viewport is driven via its `.sheetwrite-scroller` element and its
keyboard path (`Enter` → editor, arrows → navigation, `applyTransaction` with
`addRows`/`removeRows` → altering); Handsontable via its `.ht_master .wtHolder`,
`getActiveEditor()`, `alter()`, and selection API. Each grid gets the same
seeded dataset, the same columns, the same 1000×600 stage, and virtualization on.

### Current benchmark scope and missing coverage

The render benchmark mounts Sheetwrite through `@sheetwrite/core`'s direct
`createGrid(...)` path. That is the right engine baseline: it measures the
canvas renderer, store reads, editing path, row altering, and keyboard navigation
without framework noise.

It does **not** currently measure framework adapter overhead. React, Vue, and
Svelte wrappers do not render cells — cells are still painted by canvas — so the
expected overhead is around mount/unmount, event forwarding, parent re-renders,
and app-side `onGridChange` work rather than per-cell rendering. A separate adapter
benchmark should cover:

- vanilla `createGrid` vs. React, Vue, and Svelte `<SheetwriteGrid>` mount time;
- first paint after framework mount;
- parent re-render with a stable `workbook` identity;
- `onGridChange` callback latency with and without app state updates;
- unmount/remount cost.

The current benchmark also excludes validation-enabled edit workloads,
network/API submission, durable retry, and conflict-resolution UX. Core
validation can be benchmarked separately; transport and conflict policy belong
in an application benchmark.

### How to run

```sh
# Headless data-layer benchmark — prints a Markdown report and writes
# results/data-results.{md,json}
bun run bench:data

# Browser render benchmark — serves the page; open it and press Run, or
# drive it with URL params (one grid + size per load):
bun run bench:render
#   → http://localhost:<port>/src/render-bench.html?grid=sheetwrite&rows=100000&samples=100&auto=1
#   → http://localhost:<port>/src/render-bench.html?grid=handsontable&rows=100000&samples=100&auto=1
```

The render page prints results in-page and exposes a typed
`window.__benchResults` (and `window.__benchDone`) so an operator or driver can
read them after load.

─────────────────────────────────────────────────────────────────────────────

## Results — data layer (fresh generated capture)

Captured by `bun run bench:data` on 2026-07-13 at 22:47 UTC+07, core commit
`844da4e`, Bun 1.3.14, linux/x64, 12th Gen Intel Core i9-12900H (14 cores /
20 logical CPUs). The run uses the seeded dataset and warmed median/p95 protocol
above. Absolute times and ratios are runner-specific.

The command generates both authoritative views from the same in-memory result:

- [`results/data-results.md`](./results/data-results.md) — all tables, including
  both-engine 1K/10K comparisons, 1K→1M scaling, derived ratios, and caveats;
- [`results/data-results.json`](./results/data-results.json) — raw statistics,
  iteration counts, memory bytes, environment, and workload metadata.

Do not copy the generated tables back into this file: one generated report avoids
stale ratios after a rerun. In this capture, Sheetwrite's 1M-row medians were
283 ms ingest, 0.011 ms for a 50×5 window, 23.45 ms sort, 3.38 ms filter, and
1.80 ms aggregate. Exact isolated WASM growth was 207.13 MiB (217 bytes/row)
for the five-column dataset. See the generated report for p95 values,
Handsontable comparisons, asymmetry notes, and smaller sizes.

### Memory — 1M-row paged datasource store (exact, isolated processes)

`bun run --filter '@sheetwrite/bench' bench:paged` spawns a clean process for
each scenario and records both WASM linear-memory growth and live chunk bytes in
`results/paged-results.json`. The five numeric columns isolate cell storage from
string-pool growth.

| scenario | WASM delta | live chunk bytes | chunks | loaded cells | dirty cells |
|---|---:|---:|---:|---:|---:|
| empty datasource | 0.06 MiB | 0.00 MiB | 0 | 0 | 0 |
| +15 virtual padding columns | 0.06 MiB | 0.00 MiB | 0 | 0 | 0 |
| 30-row viewport | 0.31 MiB | 0.26 MiB | 5 | 150 | 0 |
| sequential scroll through 1% | 0.81 MiB | 0.78 MiB | 15 | 50,000 | 0 |
| sequential scroll through 10% | 6.56 MiB | 6.47 MiB | 125 | 500,000 | 0 |
| sequential scroll through 100% | 32.19 MiB | 31.99 MiB | 618 | 2,513,728 | 0 |
| 100 edits in unloaded chunks | 5.25 MiB | 5.18 MiB | 100 | 100 | 100 |

The empty store and virtual padding allocate no chunks. A complete sequential
scan stays at the configured 32 MiB clean-chunk budget; dirty chunks remain
resident until acknowledgement and may exceed that budget by design. Repeated
12-run samples captured on the same runner measured 1M-row construction at
0.072 ms median (1.44 ms p95), first-page load at 0.813 ms (4.53 ms p95), and a
distant-page load at 0.756 ms (2.17 ms p95).

### Notes & caveats

- Handsontable edits are wrapped in `suspendRender`/`resumeRender` to isolate the
  data path; in interactive use it also repaints per edit.
- Handsontable has no native column aggregate; its sum is plain JS over
  `getSourceDataAtCol`.
- Handsontable headless ceiling: one 100k construct ≈ 26 s (renders ~131k
  `<tr>`s); it cannot virtualize without browser layout, hence 100k–1M live in
  the browser bench.
- Sheetwrite memory is the exact WASM `memory.buffer` byteLength delta. Bun's
  `process.heapUsed` conflates the WASM `ArrayBuffer` with the JS heap, so it is
  not used. Handsontable's headless heap is dominated by the non-virtualized
  all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not a
  comparable figure — see the browser bench.

─────────────────────────────────────────────────────────────────────────────

## Results — render (fresh browser capture)

Captured from `bun run bench:render` on 2026-07-13 at 15:50–15:53 UTC, core
commit `844da4e`, Chrome 140 headless, 1100×760 viewport, on the linux/x64
i9-12900H host above. Chromium's reported user agent was Windows because the
automation browser applies a compatibility user agent. Values are median (p95)
milliseconds over 100 samples; lower is better. These are one-run,
runner-specific characterization numbers.

| scenario | Sheetwrite 100k | HOT 100k | Sheetwrite 1M | HOT 1M |
|---|---:|---:|---:|---:|
| initial render / mount (ms) | 129 | 1128 | 531 | **crashed** |
| scroll-down top-left (per 50px step) | 4.50 (7.41) | 0.40 (65.49) | 2.20 (3.30) | — |
| scroll-down top-left, dropped frames /100 | 0 | 29 | 0 | — |
| scroll-down middle | 5.95 (7.82) | 0.30 (73.28) | 2.10 (2.90) | — |
| scroll-down middle, dropped frames /100 | 1 | 26 | 0 | — |
| edit-open (middle) | 2.90 (3.81) | 3.90 (5.71) | 0.85 (1.10) | — |
| edit-commit (middle) | 3.10 (3.91) | 165.40 (197.96) | 1.00 (1.70) | — |
| insert 5 rows (top) | 6.70 (9.46) | 124.55 (284.71) | 20.90 (25.92) | — |
| remove 5 rows (top) | 6.60 (10.34) | 125.00 (143.12) | 21.35 (37.97) | — |
| arrow-down (top-left) | 3.85 (6.22) | 18.55 (43.42) | 1.70 (2.40) | — |
| arrow-right (middle) | 2.15 (3.30) | 1.40 (2.60) | 0.70 (1.30) | — |
| JS heap after mount (MiB) | 50.56 | 115.71 | 314.99 | — |

Handsontable at 1M rows failed during construction with
`Maximum call stack size exceeded` and produced no scenario data. At 100K,
Handsontable's median vertical scroll callback was shorter, but its 65–73 ms
p95 and 26–29 dropped frames expose the tail cost; Sheetwrite's p95 stayed below
8 ms with zero or one dropped frame. Handsontable also had the lower
arrow-right median (1.40 vs 2.15 ms). Sheetwrite's measured advantages in this
capture were mount, edit commit, row altering, arrow-down, tail scroll latency,
and the completed 1M run. No claim extends beyond these scenarios.

Capture procedure (per `(grid, rows)`):

```
serve  bun run bench:render            # → http://localhost:3000/
open   /?grid=<sheetwrite|handsontable>&rows=<100000|500000|1000000>&samples=100&auto=1
wait   until window.__benchDone === true
read   window.__benchResults           # typed BenchResults; also logged as "[render-bench] {…}"
```

─────────────────────────────────────────────────────────────────────────────

## Interpretation boundaries

- The generated data report computes every comparison from one capture. Rerun
  it before quoting a ratio; do not mix numbers from different machines or
  commits.
- The headless ingest paths are intentionally asymmetric: Sheetwrite constructs
  its store without rendering, while Handsontable construction includes its
  happy-dom view. Browser render results are the at-scale UI comparison.
- The browser table is a single local capture, not a product-wide or
  cross-device guarantee. Median, p95, dropped frames, viewport, sample count,
  runtime, host, and failure state are part of the result.
- Sheetwrite's observed window-read scaling follows its bulk visible-window
  API. That architectural fact does not imply every operation is constant-time:
  ingest, sort, filter, formulas, structural edits, and memory still scale with
  affected data.
- Google Sheets is not benchmarked here. Hosted service, network, account,
  browser, and product behavior prevent a controlled library comparison, so no
  relative performance claim is made.

─────────────────────────────────────────────────────────────────────────────

## Files

```
bench/
  package.json            # data, paged, range, formula, render, and check scripts
  src/
    dataset.ts            # seeded deterministic comparison data
    formula-dataset.ts    # deterministic formula topologies
    stats.ts              # warm-up, timed sampling, median/p95 helpers
    dom-setup.ts           # happy-dom bootstrap for headless Handsontable
    range-bench.ts        # large-range mutation and query timing
    data-bench.ts          # headless data-layer comparison
    paged-bench.ts         # isolated allocation-lazy storage probes
    formula-bench.ts       # correctness-gated formula timing/memory suite
    render-bench.ts        # real-browser render scenarios and result contract
    render-bench.html      # render benchmark page shell
    check.ts               # regression checks against captured results
  results/
    data-results.{md,json} # generated by bench:data
    formula-results.{md,json} # generated by bench:formula[:smoke]
    paged-results.json     # generated by bench:paged
```
