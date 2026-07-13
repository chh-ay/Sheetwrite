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

Three sequential full runs on Bun 1.3.14 linux/x64 reproduced the 100K headline
medians: parse/load 71.6–73.8 ms, first recompute 151–156 ms, fan-out edit
107–119 ms, and scalar edit affecting 100K formulas 107–116 ms. Isolated memory
was identical on all runs: 0.88 MiB (1K), 7.13 MiB (10K), and 59.56 MiB (100K).
No focused optimization was justified; the observed large workloads scale
linearly and remain well inside the declared gates.

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
and app-side `onChange` work rather than per-cell rendering. A separate adapter
benchmark should cover:

- vanilla `createGrid` vs. React, Vue, and Svelte `<SheetwriteGrid>` mount time;
- first paint after framework mount;
- parent re-render with a stable `workbook` identity;
- `change` event callback latency with and without app state updates;
- unmount/remount cost.

The current benchmark also excludes network/API submission, validation,
optimistic retry/rollback, and conflict-resolution policy. Those are host-app
concerns and should be measured in an application benchmark when they matter.

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

## Results — data layer (real, captured)

Bun 1.3.14 · linux/x64 · 12th Gen Intel Core i9-12900H · seeded dataset ·
median (p95) ms · **lower is better**. Reproduce with `bun run bench:data`.

### Head-to-head, both engines (1k / 10k — Handsontable's headless ceiling)

**Ingest N rows**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 1.24 (1.93) | 546 (624) | **441× faster** |
| 10,000 | 11.10 (13.25) | 4424 (4652) | **399× faster** |

**Read 50×5 window**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.033 (0.052) | 0.065 (0.100) | **2.0× faster** |
| 10,000 | 0.025 (0.039) | 0.080 (0.108) | **3.1× faster** |

**1000 single-cell edits**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 10.27 (17.77) | 72.83 (106) | **7.1× faster** |
| 10,000 | 8.62 (15.26) | 374 (379) | **43× faster** |

**Sort by amount (numeric)**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.123 (0.126) | 197 (224) | **1604× faster** |
| 10,000 | 1.33 (1.48) | 1923 (2141) | **1445× faster** |

**Filter city contains "Tokyo"**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.139 (0.164) | 92.24 (98.20) | **662× faster** |
| 10,000 | 0.660 (0.723) | 686 (731) | **1038× faster** |

**Sum amount (aggregate)**

| rows | Sheetwrite | Handsontable | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.007 (0.010) | 0.186 (0.317) | **28× faster** |
| 10,000 | 0.018 (0.032) | 1.15 (1.93) | **65× faster** |

### Sheetwrite data-engine scaling (1k → 1M)

Handsontable is omitted at 100k–1M (headless render-all is infeasible — see the
browser bench). Median (p95) ms.

| rows | Ingest | Window read | 1000 edits | Sort | Filter | Aggregate |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1.24 (1.93) | 0.033 (0.052) | 10.27 (17.77) | 0.123 (0.126) | 0.139 (0.164) | 0.007 (0.010) |
| 10,000 | 11.10 (13.25) | 0.025 (0.039) | 8.62 (15.26) | 1.33 (1.48) | 0.660 (0.723) | 0.018 (0.032) |
| 100,000 | 105 (112) | 0.022 (0.037) | 26.74 (32.27) | 16.16 (18.50) | 4.49 (4.79) | 0.187 (0.235) |
| 500,000 | 553 (578) | 0.023 (0.040) | 103 (107) | 97.81 (105) | 22.71 (22.88) | 0.941 (1.07) |
| 1,000,000 | 1298 (1322) | 0.026 (0.039) | 198 (200) | 214 (236) | 44.46 (47.38) | 1.91 (2.45) |

Reads stay flat (~0.02–0.03 ms) regardless of row count — Sheetwrite reads only
the visible window from WASM. Sort/filter/aggregate scale linearly and stay
interactive even at 1M (sort 214 ms, filter 44 ms, aggregate 1.9 ms).

### Memory — Sheetwrite columnar footprint (exact, isolated process)

The whole columnar store (all five columns) lives in WASM; JS-side retained
state is `O(columns + unique styles + active view)`, never `O(cells)`.

| rows | Sheetwrite data (WASM columnar store) | bytes/row |
|---:|---:|---:|
| 1,000 | 0.44 MiB | 459 B |
| 10,000 | 3.19 MiB | 334 B |
| 100,000 | 33.50 MiB | 351 B |
| 500,000 | 160.00 MiB | 336 B |
| 1,000,000 | 319.56 MiB | 335 B |

1M rows × 5 columns (including a unique string per row in `customer`) fit in
~320 MiB of WASM — a flat ~335 bytes/row.

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
12-run timing samples measured 1M-row construction at 0.04 ms median, first-page
load at 0.33 ms, and a distant-page load at 0.30 ms.

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

## Results — render (browser)

Real numbers, captured by running `bun run bench:render` in headless Chromium
(Chrome/140, 1100×760 viewport), median (p95) ms over `samples = 100` unless
noted — **lower is better**. Reproduce per `(grid, rows)` with the procedure below.

| scenario | Sheetwrite 100k | HOT 100k | Sheetwrite 1M | HOT 1M |
|---|---:|---:|---:|---:|
| initial render / mount (ms) | 142 | 470 | 2538 | **crashed** |
| scroll-down top-left (per 50px step) | 1.7 (2.1) | 0.2 (32.0) | 1.5 (1.8) | — |
| scroll-down top-left, dropped frames /100 | **0** | **29** | **0** | — |
| scroll-down middle | 1.5 (2.2) | 0.2 (33.9) | 1.6 (2.7) | — |
| edit-open (middle) | 0.40 (0.50) | 1.50 (1.80) | 0.50 (0.60) | — |
| edit-commit (middle) | 1.6 (1.8) | 61.3 (68.8) | 1.8 (2.7) | — |
| insert 5 rows (top) | 5.4 (8.1) | 119 (133) | 43.9 (49.3) | — |
| remove 5 rows (top) | 5.8 (8.2) | 124 (144) | 43.0 (49.1) | — |
| arrow-down (top-left) | 1.4 (2.0) | 3.0 (40.0) | 1.4 (1.8) | — |
| arrow-right (middle) | 0.20 (0.30) | 1.40 (1.50) | 0.10 (0.30) | — |
| JS heap after mount (MiB) | 74.6 | 112.8 | 541.0 | — |

**Handsontable could not run at 1,000,000 rows** — it threw `Maximum call stack
size exceeded` during construction and never produced results. Sheetwrite mounts
1M rows in ~2.5 s and then scrolls, edits, and navigates as fast as it does at
100k.

What the numbers say:

- **Scroll smoothness is the headline.** Sheetwrite holds ~1.5–1.7 ms per 50px
  step with **0 dropped frames** at *both* 100k and 1M. Handsontable's median step
  is low (~0.2 ms) but its p95 is ~32 ms with **~29 dropped frames per 100** at
  100k — visible jank under sustained scroll, where Sheetwrite stays glassy.
- **Edit-commit, altering, and mount are categorically faster** on Sheetwrite at
  100k: edit-commit 1.6 ms vs 61 ms (~38×), insert-5-rows 5.4 ms vs 119 ms (~22×),
  mount 142 ms vs 470 ms (~3.3×).
- **Constant at scale.** 100k → 1M leaves Sheetwrite's scroll/edit/navigation
  essentially unchanged (only mount and altering grow); the DOM grid cannot make
  the trip at all.
- **Where HOT is competitive:** its *median* single scroll step and edit-open are
  low (incremental DOM); the cost surfaces in tail latency, dropped frames,
  edit-commit, altering, and the hard 1M ceiling.

Capture procedure (per `(grid, rows)`):

```
serve  bun run bench:render            # → http://localhost:3000/
open   /?grid=<sheetwrite|handsontable>&rows=<100000|500000|1000000>&samples=100&auto=1
wait   until window.__benchDone === true
read   window.__benchResults           # typed BenchResults; also logged as "[render-bench] {…}"
```

─────────────────────────────────────────────────────────────────────────────

## Versus Google Sheets — what's comparable, and what isn't

Handsontable is an installable library, so the numbers above are a controlled,
reproducible head-to-head (identical seeded data, programmatic workloads, one
machine). **Google Sheets is a different kind of artifact** — a hosted, auth-gated
web app, DOM-rendered and network-backed — so it is **not** run as a live
head-to-head here. Driving a signed-in Sheets session to 1M rows would be neither
reproducible nor appropriate, and any number from it would conflate Google's
servers, the network, and the browser. **This section is documented context, not a
measurement** (unlike the Handsontable tables, which are measured).

Google Sheets' publicly documented envelope:

- A spreadsheet is capped at **10,000,000 cells** and **18,278 columns**; large or
  formula-heavy sheets slow well before that cap.
- It is **network-backed** — data load and edits round-trip to Google's servers
  (and sync for collaboration), so latency and offline behavior hinge on the
  connection, not just the device.
- Rendering is **DOM-based with virtualization** — the same family as Handsontable,
  subject to the same per-rendered-cell DOM cost the render bench above quantifies.

How that frames Sheetwrite:

- Sheetwrite is **fully local**: a Rust/WASM columnar store plus a `<canvas>`
  viewport — no server, no network in the hot path. The measured figures (1M rows
  ingested in ~2.5 s, ~1.5 ms scroll steps with zero dropped frames, ~320 MiB of
  WASM) are device-only and offline.
- Google Sheets' **10M-cell** ceiling is roughly **1M rows × 10 columns**;
  Sheetwrite handled **1M rows × 5 columns (5M cells)** here on a laptop with room
  to spare, and its window-read cost is flat regardless of row count.
- Honest framing: Google Sheets is a far broader **product** (real-time
  collaboration, hundreds of functions, charts, pivot tables, a whole app
  platform). Sheetwrite is an **embeddable grid engine**. Where they overlap —
  rendering and operating on a large local dataset in the browser — Sheetwrite's
  canvas + WASM architecture is built to stay fluid at sizes where a DOM/network
  spreadsheet gets sluggish.

To compare against Sheets yourself, the render-bench protocol (programmatic scroll
+ per-frame timing) can be pointed at a Sheets tab by hand; it is deliberately
left out of the automated suite for the reasons above.

─────────────────────────────────────────────────────────────────────────────

## Why Sheetwrite

Grounded in the architecture **and** the numbers above — including where
Handsontable holds its own.

**1. The data engine is in Rust/WASM, columnar, and off the JS heap.**
Ingest, sort, filter, and aggregate run in compiled Rust over typed columns, not
interpreted JS over row objects. The data-layer results are not incremental —
they are categorical: sort is **~1500× faster**, filter **~700–1000× faster**,
ingest **~400×**, at the 1k/10k sizes where Handsontable can even be measured
headlessly. And it keeps scaling: at **1M rows** Sheetwrite still sorts in
214 ms, filters in 44 ms, and sums in under 2 ms.

**2. Reads are windowed and O(viewport), not O(rows).**
`getVisibleWindow` pulls only the visible cells from WASM in one call. Window-read
time is essentially **constant (~0.02–0.03 ms) from 1k to 1M rows** — the render
hot path does not get slower as the dataset grows. This is the foundation of
true virtualization.

**3. Canvas virtualization scales to 100k+ rows; the DOM does not.**
Sheetwrite paints a `<canvas>` viewport regardless of dataset size. Handsontable
virtualizes in a real browser, but it is fundamentally tied to a DOM/JS-array
layer — which is exactly why it **cannot run headless at scale** (it renders
every row without a layout engine; 100k ≈ 26 s, ~131k `<tr>`s). The browser
render bench is built to quantify the at-scale difference in initial paint and
sustained scroll smoothness.

**4. Memory is compact and predictable.**
1M rows × 5 columns occupy ~**320 MiB of WASM** (~335 bytes/row, flat), with
negligible JS-heap overhead because cells never become JS objects. A DOM grid
pays per-rendered-cell DOM cost and holds its data on the JS heap.

**5. Bundle considerations.**
Sheetwrite ships a small WASM binary (the built `sheetwrite_wasm_bg.wasm` is
~194 KB as bundled here) plus the core JS. The performance comes from
architecture, not from shipping a large runtime.

### Where Handsontable is competitive — stated plainly

- **Windowed reads** are close at small sizes (Sheetwrite ~1.5–3× faster at
  1k/10k, not orders of magnitude) — both read a small range cheaply.
- **Aggregate at 1k** is a tight JS loop for Handsontable (~0.19 ms); Sheetwrite
  wins (~28×) but both are sub-millisecond and imperceptible at that size.
- **Feature breadth.** Handsontable is a mature product with a large plugin
  ecosystem (dropdown menus, comments, merged cells, nested headers, many cell
  types). This benchmark measures *performance of core data + render
  operations*, not feature surface.
- **Editing UX & ecosystem maturity.** Handsontable's interactive editing,
  validation, and framework wrappers are battle-tested across many apps.

The case for Sheetwrite is unambiguous where it counts for large datasets: the
data engine and the render path are categorically faster and use far less
memory, and that advantage **widens** as row counts grow toward 1M. For grids
that must stay fluid over very large datasets, that architecture — a WASM
columnar store with canvas virtualization — is the deciding factor.

─────────────────────────────────────────────────────────────────────────────

## Files

```
bench/
  package.json            # @sheetwrite/bench — scripts: bench:data, bench:render
  src/
    dataset.ts            # seeded, deterministic synthetic data (shared)
    stats.ts              # warm-up + timed sampling, median/p95 helpers
    dom-setup.ts          # happy-dom bootstrap for headless Handsontable
    data-bench.ts         # headless data-layer benchmark  (bench:data)
    render-bench.ts       # browser render benchmark         (bench:render)
    render-bench.html     # render bench page shell
  results/
    data-results.md       # captured headless report (regenerated by bench:data)
    data-results.json     # machine-readable results
```
