---
title: "DataSourceRequest | @sheetwrite/core"
description: "Cancellable sheet and row interval requested from a DataSource."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataSourceRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Cancellable sheet and row interval requested from a DataSource.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="data-source-request-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>
<pre><code>sheet: SheetId;</code></pre>
</details>

<details class="api-member" id="data-source-request-start" data-pagefind-weight="1">
<summary><code>start</code></summary>
<pre><code>start: number;</code></pre>
</details>

<details class="api-member" id="data-source-request-end" data-pagefind-weight="1">
<summary><code>end</code></summary>
<pre><code>end: number;</code></pre>
</details>

<details class="api-member" id="data-source-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>
<pre><code>signal: AbortSignal;</code></pre>
</details>

<details class="api-member" id="data-source-request-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>
<pre><code>revision: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface DataSourceRequest {
    sheet: SheetId;
    start: number;
    end: number;
    signal: AbortSignal;
    revision: number;
}
```

</details>
