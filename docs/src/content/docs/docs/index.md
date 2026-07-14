---
title: Build with Sheetwrite
description: Build, integrate, and operate Sheetwrite with task-focused guides, runnable examples, and generated API reference.
tableOfContents: false
---

<div class="sw-docs-hero">
  <div class="sw-docs-hero-copy">
    <p class="sw-docs-eyebrow">Canvas spreadsheet engine · Rust + WASM</p>
    <p class="sw-docs-lead">Ship spreadsheet-grade interaction without turning every cell into a DOM node. Start with the imperative core, or use thin React, Vue, and Svelte adapters that preserve the same Grid API.</p>
    <div class="sw-docs-actions">
      <a class="sw-docs-action sw-docs-action-primary" href="/docs/start/installation/">Install Sheetwrite</a>
      <a class="sw-docs-action" href="/docs/start/first-grid/">Build your first grid <span aria-hidden="true">→</span></a>
    </div>
  </div>
  <div class="sw-docs-code" aria-label="React quick start example">
    <div class="sw-docs-codebar"><span>React quick start</span><span>grid.tsx</span></div>
    <pre><code><span class="sw-code-keyword">import</span> { Sheetwrite } <span class="sw-code-keyword">from</span> <span class="sw-code-string">"@sheetwrite/react"</span>;
<span class="sw-code-keyword">import</span> <span class="sw-code-string">"@sheetwrite/react/styles.css"</span>;
<span class="sw-code-gap" aria-hidden="true"></span>
&lt;<span class="sw-code-type">Sheetwrite</span>
  columns={columns}
  defaultRows={rows}
  height={480}
/&gt;</code></pre>
  </div>
  <dl class="sw-docs-facts">
    <div><dt>Render model</dt><dd>One canvas</dd></div>
    <div><dt>Data engine</dt><dd>Columnar WASM</dd></div>
    <div><dt>Integration</dt><dd>Core + 3 adapters</dd></div>
  </dl>
</div>

## Choose a path

<nav class="sw-paths" aria-label="Documentation starting points">
  <a class="sw-path" href="/docs/start/first-grid/">
    <span class="sw-path-index">01</span>
    <span><strong>Start from a complete grid</strong><small>Initialize WASM, define a workbook, load typed columns, and observe committed changes.</small></span>
    <span class="sw-path-arrow" aria-hidden="true">↗</span>
  </a>
  <a class="sw-path" href="/docs/frameworks/lifecycle/">
    <span class="sw-path-index">02</span>
    <span><strong>Choose an integration</strong><small>Understand adapter lifecycle, readiness, controlled options, and teardown before choosing a framework.</small></span>
    <span class="sw-path-arrow" aria-hidden="true">↗</span>
  </a>
  <a class="sw-path" href="/docs/guides/data-operations/">
    <span class="sw-path-index">03</span>
    <span><strong>Build spreadsheet behavior</strong><small>Work through editing, formulas, sorting, filtering, grouping, import, and export.</small></span>
    <span class="sw-path-arrow" aria-hidden="true">↗</span>
  </a>
  <a class="sw-path" href="/docs/guides/persistence/">
    <span class="sw-path-index">04</span>
    <span><strong>Prepare for production</strong><small>Persist snapshots, sequence collaborative work, render in a worker, and plan accessibility.</small></span>
    <span class="sw-path-arrow" aria-hidden="true">↗</span>
  </a>
</nav>

## Run a real integration

<p class="sw-section-intro">Each example is a working product surface rather than an isolated snippet. Compare lifecycle, data volume, formula, and rendering behavior in the browser.</p>

<nav class="sw-example-links" aria-label="Runnable Sheetwrite examples">
  <a href="/vanilla/"><strong>Vanilla</strong><span>Workbook shell</span></a>
  <a href="/react/"><strong>React</strong><span>100k-row analytics</span></a>
  <a href="/vue/"><strong>Vue</strong><span>Streaming datasource</span></a>
  <a href="/svelte/"><strong>Svelte</strong><span>Formula workbook</span></a>
  <a href="/theming/"><strong>Theming</strong><span>Renderer laboratory</span></a>
</nav>

## Find a task

| Task | Canonical guide |
| --- | --- |
| Configure the grid and built-in controls | [Configuration](/docs/guides/configuration/) |
| Handle selection, editing, context menus, and keyboard input | [Interaction and editing](/docs/guides/interaction/) |
| Sort, filter, group, import, and export | [Data operations](/docs/guides/data-operations/) |
| Use formulas and named ranges | [Formulas](/docs/guides/formulas/) |
| Persist snapshots and pending work | [Persistence and recovery](/docs/guides/persistence/) |
| Sequence collaborative operations | [Collaboration and sync](/docs/guides/collaboration/) |
| Register the optional file backend | [XLSX and export](/docs/guides/xlsx-export/) |
| Render off the main thread | [Worker rendering](/docs/guides/worker-rendering/) |
| Theme canvas and widget chrome | [Styling and theming](/docs/guides/styling/) |
| Support keyboard and assistive technology | [Accessibility](/docs/guides/accessibility/) |

## Read the contracts

<ul class="sw-reference-list">
  <li><a href="/docs/reference/package-entry-points/"><strong>Package entry points</strong><span>Supported, internal, asset, and testing-only exports.</span></a></li>
  <li><a href="/docs/api/"><strong>Generated API reference</strong><span>Stable symbol anchors, signatures, source links, and export classification.</span></a></li>
  <li><a href="/docs/reference/events-errors/"><strong>Events and errors</strong><span>Event direction, readiness, fallback, validation, and incomplete data.</span></a></li>
  <li><a href="/docs/reference/document-operations/"><strong>Document operations</strong><span>Transactions, epochs, remote input, snapshots, and rebase.</span></a></li>
  <li><a href="/docs/reference/compatibility-limits/"><strong>Compatibility and limits</strong><span>Explicitly supported behavior without spreadsheet-suite parity claims.</span></a></li>
  <li><a href="/docs/guides/performance-resources/"><strong>Performance evidence</strong><span>Measurements whose protocol and freshness can be established.</span></a></li>
</ul>

## Public API policy

<div class="sw-policy">
  <p><strong>The export map is the contract.</strong> Supported declarations carry source JSDoc and generated coverage. Removed compatibility names and <code>@deprecated</code> symbols fail policy checks.</p>
  <p>Run <code>bun run api:check</code>, <code>bun run docs:generate</code>, and <code>bun run docs:check</code> when changing public behavior.</p>
</div>
