---
title: "DataSource | @sheetwrite/core"
description: "Host callback that asynchronously loads cancellable row pages."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataSource -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host callback that asynchronously loads cancellable row pages.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L39</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="data-source-get-rows" data-pagefind-weight="1">
<summary><code>getRows</code></summary>
<pre><code>getRows(request: DataSourceRequest): Promise&lt;DataSourcePage&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface DataSource {
    getRows(request: DataSourceRequest): Promise<DataSourcePage>;
}
```

</details>
