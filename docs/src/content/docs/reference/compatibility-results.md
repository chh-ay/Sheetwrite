---
title: "Detailed compatibility results"
description: "Checked formula, workbook, clipboard, and XLSX examples with exact sources and limits."
---

# Detailed compatibility results

This page is generated from checked examples and evidence records. It states only what each named result proves; it is not a percentage or a blanket Excel, Google Sheets, LibreOffice, or OpenFormula compatibility claim.

Result labels distinguish **evaluated** formulas or structures, **preserved** source or metadata, deliberately **flattened** interchange, explicit **warning** boundaries, and **unsupported** behavior.

<section class="compat-results" aria-label="Checked compatibility results">
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Portable arithmetic, comparison, concatenation, and percent operators</span>
<span class="compat-result__meta">
<code>formula</code>
<code>shared</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Formula source is preserved and evaluated when every token is in the portable subset.</dd></div>
<div><dt>Export</dt><dd>Canonical formula source is emitted to XLSX without cached-value fabrication.</dd></div>
<div><dt>Known boundary</dt><dd>This is a declared portable subset, not every Excel, Sheets, or OpenFormula coercion edge.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=formula.portable-operators">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Bounded dynamic arrays and spill ranges</span>
<span class="compat-result__meta">
<code>formula</code>
<code>shared</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Recognized formulas evaluate; unknown dynamic-array syntax remains preserved source with an explicit formula error.</dd></div>
<div><dt>Export</dt><dd>Anchor formula source is exported; derived spill cells are not serialized as invented formulas.</dd></div>
<div><dt>Known boundary</dt><dd>No implicit-intersection operator, spill-reference # syntax, multi-key SORT, higher-order LAMBDA array functions, or general Excel/Sheets dynamic-array family is claimed.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=formula.dynamic-arrays">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Bounded lexical and lazy LET bindings</span>
<span class="compat-result__meta">
<code>formula</code>
<code>excel</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Recognized LET source evaluates within the bounded lexical subset; invalid names, arity, or resource expansion return explicit formula errors.</dd></div>
<div><dt>Export</dt><dd>The exact formula source is preserved and emitted without a fabricated cached result.</dd></div>
<div><dt>Known boundary</dt><dd>At most 126 bindings and 16,384 expanded AST nodes are admitted; LET does not define or execute reusable functions.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=formula.let">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">LAMBDA and reusable named functions</span>
<span class="compat-result__meta">
<code>formula</code>
<code>excel</code>
<span data-status="unsupported">unsupported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>unsupported</dd></div>
<div><dt>Import</dt><dd>Source is preserved; evaluation returns an explicit unsupported-name error.</dd></div>
<div><dt>Export</dt><dd>Preserved source may be emitted, without a fabricated cached result.</dd></div>
<div><dt>Known boundary</dt><dd>LET is supported separately; no approximation, reusable named-function runtime, or JavaScript execution fallback is provided.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=formula.let-lambda">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Quoted cross-sheet references through stable worksheet identity</span>
<span class="compat-result__meta">
<code>reference</code>
<code>shared</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Native same-workbook references map to stable worksheet IDs.</dd></div>
<div><dt>Export</dt><dd>References are rendered using the current canonical sheet name and quoting rules.</dd></div>
<div><dt>Known boundary</dt><dd>External workbook links and 3-D references are unsupported.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=reference.cross-sheet-stable-id">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Create, rename, reorder, hide, unhide, remove, and active fallback</span>
<span class="compat-result__meta">
<code>worksheet</code>
<code>shared</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Valid names and visibility are retained; invalid all-hidden workbooks fail or select a visible fallback as specified.</dd></div>
<div><dt>Export</dt><dd>Current Grid active state and ordinary visibility are emitted without mutating shared navigation history.</dd></div>
<div><dt>Known boundary</dt><dd>veryHidden is host-managed and cannot be revealed through the stock tab strip.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=worksheet.lifecycle">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">veryHidden worksheet preservation</span>
<span class="compat-result__meta">
<code>worksheet</code>
<code>excel</code>
<span data-status="roundtrip-only">roundtrip-only</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>preserved</dd></div>
<div><dt>Import</dt><dd>The visibility token is retained as host-only state.</dd></div>
<div><dt>Export</dt><dd>The token is emitted when retained by the canonical workbook.</dd></div>
<div><dt>Known boundary</dt><dd>Stock worksheet tabs intentionally do not expose or unhide it.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=worksheet.very-hidden">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Independent XLSX strings, numbers, dates, and whitespace</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>openformula</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Expected cells import with zero warnings.</dd></div>
<div><dt>Export</dt><dd>Equivalent Sheetwrite scalar cells export through the optional XLSX package.</dd></div>
<div><dt>Known boundary</dt><dd>Evidence covers this file and version, not all LibreOffice documents.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=xlsx.basic-values">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Styles, merges, validation, notes, panes, names, and hidden sheets</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>openformula</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>Supported native parts become workbook data; unsupported parts emit structured warnings.</dd></div>
<div><dt>Export</dt><dd>Canonical supported parts export; unknown OOXML parts are not promised lossless preservation.</dd></div>
<div><dt>Known boundary</dt><dd>Hidden worksheet visibility produces the recorded unsupported-feature warning for the legacy fixture path.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=xlsx.rich-workbook">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">ECMA-376 shared formula master and translated slaves</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>excel</code>
<span data-status="supported">supported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>evaluated</dd></div>
<div><dt>Import</dt><dd>Master/slave records import as three exact formula sources.</dd></div>
<div><dt>Export</dt><dd>Equivalent formulas export semantically, not byte-for-byte or record-for-record.</dd></div>
<div><dt>Known boundary</dt><dd>Export writes canonical ordinary formulas rather than promising the producer's shared-record packing.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=xlsx.shared-formulas">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Native data-validation subset</span>
<span class="compat-result__meta">
<code>validation</code>
<code>excel</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>Supported rules import; unsupported rules do not masquerade as supported validation.</dd></div>
<div><dt>Export</dt><dd>Supported canonical rules emit native validation records.</dd></div>
<div><dt>Known boundary</dt><dd>Unsupported operators or extension forms are dropped with exact structured warnings.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=validation.native-subset">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Native workbook tables and structured references</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>excel</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>The bounded native table subset imports with stable identities; unsupported table features emit exact warnings.</dd></div>
<div><dt>Export</dt><dd>Canonical supported tables emit native worksheet relationships and table parts without fabricating unsupported features.</dd></div>
<div><dt>Known boundary</dt><dd>Auto-filter state, sort state, calculated columns, totals functions, query tables, external data, and extensions remain explicit unsupported metadata.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=table.native-subset">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Host-safe external and internal hyperlinks</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>excel</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>Safe external and internal targets import without fetching; unsafe or malformed targets never enter the snapshot.</dd></div>
<div><dt>Export</dt><dd>Safe external targets emit OPC relationships and internal targets emit stable worksheet locations.</dd></div>
<div><dt>Known boundary</dt><dd>Activation remains host-owned; unsafe schemes, malformed ranges, package traversal, and over-limit metadata fail closed or emit exact warnings.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=hyperlink.safe-subset">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Bounded native conditional formatting</span>
<span class="compat-result__meta">
<code>style</code>
<code>excel</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>Supported rules import in priority order; unsupported and over-limit rules emit exact warnings.</dd></div>
<div><dt>Export</dt><dd>Supported rules emit native differential styles and conditional-format records.</dd></div>
<div><dt>Known boundary</dt><dd>Color scales, data bars, icon sets, extended conditional formatting, and other undeclared rule kinds are not approximated.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=conditional-format.native-subset">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Charts, macros, pivots, slicers, Power Query, and external data</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>excel</code>
<span data-status="unsupported">unsupported</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>unsupported</dd></div>
<div><dt>Import</dt><dd>Known parts emit exact unsupported-feature warnings; unsafe packages fail closed.</dd></div>
<div><dt>Export</dt><dd>Sheetwrite does not fabricate these application parts.</dd></div>
<div><dt>Known boundary</dt><dd>These application features are not imported into a parallel object model and are not claimed to round-trip losslessly.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=xlsx.advanced-unsupported">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">CSV/TSV and browser clipboard interchange</span>
<span class="compat-result__meta">
<code>clipboard</code>
<code>shared</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>flattened</dd></div>
<div><dt>Import</dt><dd>Bounded delimited text becomes typed columnar data; over-limit input fails explicitly.</dd></div>
<div><dt>Export</dt><dd>Leading formula-like text is neutralized and only the selected/active rectangular data is emitted.</dd></div>
<div><dt>Known boundary</dt><dd>CSV/TSV cannot represent workbook structure, formulas with cached semantics, or rich OOXML features.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=clipboard.delimited">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Recorded Microsoft Excel-produced test files</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>excel</code>
<span data-status="partial">partial</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>When separately supplied bytes match their recorded hashes, the scheduled check compares exact expected results and warnings. No result exists in the default checkout.</dd></div>
<div><dt>Export</dt><dd>No Excel resave claim is made without separately captured producer evidence.</dd></div>
<div><dt>Known boundary</dt><dd>The workbook bytes and reviewed results are not checked in; missing files cannot support a blanket Excel claim.</dd></div>
<div><dt>Evidence</dt><dd>1 checked evidence record</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=producer.microsoft-excel">Open the checked interactive result</a>
</div>
</details>
<details class="compat-result">
<summary class="compat-result__summary">
<span class="compat-result__title">Recorded public Google Sheets export</span>
<span class="compat-result__meta">
<code>xlsx-import</code>
<code>google-sheets</code>
<span data-status="warning">warning</span>
</span>
<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="compat-result__body">
<dl>
<div><dt>Result</dt><dd>warning</dd></div>
<div><dt>Import</dt><dd>Separately supplied bytes may verify only the declared export when the file hash matches; missing bytes display unavailable status.</dd></div>
<div><dt>Export</dt><dd>No Google Sheets import or resave behavior is claimed.</dd></div>
<div><dt>Known boundary</dt><dd>The local checkout contains metadata only; most Google Sheets workbook behaviors remain explicitly unverified.</dd></div>
<div><dt>Evidence</dt><dd>2 checked evidence records</dd></div>
</dl>
<a href="/showcases/interoperability/?compatibility=producer.google-sheets">Open the checked interactive result</a>
</div>
</details>
</section>

## Warning boundaries

| Feature | Warning code | Meaning |
| --- | --- | --- |
| Styles, merges, validation, notes, panes, names, and hidden sheets | `unsupported-feature` | A LibreOffice-produced workbook with a recorded file hash imports the declared rich subset and exact warning boundary. |
| Native data-validation subset | `unsupported-validation` | Declared comparison and list validations round-trip through the canonical validation model. |
| Native workbook tables and structured references | `unsupported-feature` | Stable table and column identities, body/header/totals/current-row structured references, structural rewrites, and the declared ECMA-376 table subset are implemented. |
| Host-safe external and internal hyperlinks | `hyperlink` | Absolute HTTPS/mailto targets and stable same-workbook sheet/range targets round-trip with bounded display and style metadata. |
| Bounded native conditional formatting | `format-loss` | Ordered formula, comparison, contains-text, and blank predicates evaluate dependency-scoped styles with stop-if-true precedence and a 32-rule sheet limit. |
| Charts, macros, pivots, slicers, Power Query, and external data | `unsupported-feature` | Known undeclared OOXML application parts are detected rather than evaluated. |
| Recorded Microsoft Excel-produced test files | `unverified-producer-evidence` | Five producer, version, source, and file-hash records are scheduled against the optional XLSX reader. |
| Recorded public Google Sheets export | `unverified-producer-evidence` | One non-redistributed public export has a recorded URL, producer, file hash, expected subset, and warning boundary. |

<details>
<summary>Technical evidence file details and checksums</summary>

<div class="compat-evidence-files">
<article class="compat-evidence-file">
<header>
<code>formula-engine-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original parser, evaluator, dependency, and spill vectors maintained in this repository.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>operators; quoted references; FILTER/SORT/UNIQUE spills; explicit errors</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>formula-document-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original document, clipboard, history, snapshot, and spill lifecycle vectors.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>spill ownership; copy; history; snapshot; dependency invalidation</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>worksheet-lifecycle-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original stable-ID worksheet lifecycle and active-session export vectors.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>rename; reorder; visibility; active fallback; undo; rebase</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>worksheet-xlsx-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original in-memory OOXML packages authored from ECMA-376 worksheet structures.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>canonical names; quoted references; visibility; activeTab; visible-sheet invariant</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>libreoffice-positive</code>
<span>independent-xlsx</span>
</header>
<p>LibreOffice 26.2.4.2 build 64a984c51f4702dbd3710b13428c673a2f1292e7</p>
<dl>
<div><dt>Source</dt><dd>Headless LibreOffice conversion; command and source checksum are recorded in fixtures/manifest.json.</dd></div>
<div><dt>SHA-256</dt><dd><code>cb7cba1a9a804d7115f69da5730a3186b8ea343eb959eb1e8c3e7b95d9ec3a65</code></dd></div>
<div><dt>Checked result</dt><dd>strings; numbers; date-formatted numbers; whitespace; multiple rows</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>libreoffice-rich</code>
<span>independent-xlsx</span>
</header>
<p>LibreOffice 26.2.4.2 build 64a984c51f4702dbd3710b13428c673a2f1292e7</p>
<dl>
<div><dt>Source</dt><dd>Produced independently through LibreOffice UNO; generator checksum is recorded in fixtures/manifest.json.</dd></div>
<div><dt>SHA-256</dt><dd><code>75fb643cafcbe660caaff5062423403a592fc483d3dedf8e76ad9b3a006883c2</code></dd></div>
<div><dt>Checked result</dt><dd>formulas; styles; merges; validation; notes; freeze panes; named range</dd></div>
<div><dt>Warnings</dt><dd>unsupported-feature: hidden worksheet visibility</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>ecma-shared-formula</code>
<span>spec-xlsx</span>
</header>
<p>Hand-authored ECMA-376 package fflate 0.8.3</p>
<dl>
<div><dt>Source</dt><dd>Implementation-neutral shared-formula master/slave XML; generator checksum is recorded in fixtures/manifest.json.</dd></div>
<div><dt>SHA-256</dt><dd><code>330da901b938e598948c13e8f1e0530b4691a67c4c23c4841c866d9bd74468a5</code></dd></div>
<div><dt>Checked result</dt><dd>shared formula master; two translated slaves</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>xlsx-conformance-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Retyped implementation-neutral OOXML vectors; no upstream workbook bytes are redistributed.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>formats; merges; validation warnings; notes; views; defined names</dd></div>
<div><dt>Warnings</dt><dd>exact structured unsupported-feature warnings</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>workbook-table-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original minimal OOXML table packages with ECMA-376 clause URLs and archive checksums; no producer test suite is copied.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>stable table and column IDs; structured references; native table parts; unsupported table metadata warnings</dd></div>
<div><dt>Warnings</dt><dd>exact unsupported table feature warnings</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>hyperlink-conditional-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original minimal OPC/SpreadsheetML vectors with ECMA-376 clause URLs and archive checksums.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>HTTPS and mailto links; stable internal links; bounded conditional formats; round-trip style and stop precedence</dd></div>
<div><dt>Warnings</dt><dd>unsafe hyperlink and unsupported conditional-format warnings</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>external-producer-manifest</code>
<span>manifest</span>
</header>
<p>Apache POI test fixtures and public Google Sheets export POI commit 913c78891bd0cd20945b050c63abfb8c66c88009</p>
<dl>
<div><dt>Source</dt><dd>Pinned producer/version/checksum records; byte execution is scheduled or supplied through SHEETWRITE_EXTERNAL_XLSX_DIR.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>five Excel-family records; one Google Sheets record; explicit unverified features</dd></div>
<div><dt>Warnings</dt><dd>producer claims remain partial until checksum-locked bytes execute</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>clipboard-vectors</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Original clipboard and delimited-text security/round-trip vectors.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>plain text; HTML; formulas; refs; styles; injection neutralization</dd></div>
<div><dt>Warnings</dt><dd>none</dd></div>
</dl>
</article>
<article class="compat-evidence-file">
<header>
<code>interop-browser-contract</code>
<span>original-test</span>
</header>
<p>Sheetwrite v0.3 protocol 3</p>
<dl>
<div><dt>Source</dt><dd>Real-browser contract over the optional XLSX package and public Grid APIs.</dd></div>
<div><dt>SHA-256</dt><dd><code>source-controlled test or manifest</code></dd></div>
<div><dt>Checked result</dt><dd>fixture import; round trip; warnings; limits; package isolation</dd></div>
<div><dt>Warnings</dt><dd>unsupported behavior remains visible</dd></div>
</dl>
</article>
</div>

</details>

## Exact sources

- Portable arithmetic, comparison, concatenation, and percent operators: [spec/source](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html)
- Bounded dynamic arrays and spill ranges: [spec/source](https://support.microsoft.com/en-us/office/dynamic-array-formulas-and-spilled-array-behavior-205c6b06-03ba-4151-89a1-87a7eb36e531)
- Bounded lexical and lazy LET bindings: [spec/source](https://support.microsoft.com/en-us/office/let-function-34842dd8-b92b-4d3f-b325-b8b8f9908999)
- LAMBDA and reusable named functions: [spec/source](https://support.microsoft.com/en-us/office/lambda-function-bd212d27-1cd1-4321-a34a-ccbf254b8b67)
- Quoted cross-sheet references through stable worksheet identity: [spec/source](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/)
- Create, rename, reorder, hide, unhide, remove, and active fallback: [spec/source](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/)
- veryHidden worksheet preservation: [spec/source](https://learn.microsoft.com/en-us/office/vba/api/excel.xlsheetvisibility)
- Independent XLSX strings, numbers, dates, and whitespace: [checked source file](https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/test/fixtures/manifest.json)
- Styles, merges, validation, notes, panes, names, and hidden sheets: [checked source file](https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/test/fixtures/manifest.json)
- ECMA-376 shared formula master and translated slaves: [spec/source](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/)
- Native data-validation subset: [spec/source](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/)
- Native workbook tables and structured references: [spec/source](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- Host-safe external and internal hyperlinks: [spec/source](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- Bounded native conditional formatting: [spec/source](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- Charts, macros, pivots, slicers, Power Query, and external data: [spec/source](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- CSV/TSV and browser clipboard interchange: [spec/source](https://www.rfc-editor.org/rfc/rfc4180)
- Recorded Microsoft Excel-produced test files: [checked source file](https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/test/fixtures/external-corpus.json)
- Recorded public Google Sheets export: [checked source file](https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/test/fixtures/external-corpus.json)
