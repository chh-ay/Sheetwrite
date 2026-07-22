---
title: "DataSourceCapabilities | @sheetwrite/core"
description: "Declares whether a source can load only the requested column runs."
---
<!-- api-export:@sheetwrite/core|.|DataSourceCapabilities -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Declares whether a source can load only the requested column runs.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L60</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="data-source-capabilities-protocol" data-pagefind-weight="1">
<summary><code>protocol</code></summary>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-capabilities-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns: "windowed" | "full-width";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceCapabilities {
  protocol: 2;
  columns: "windowed" | "full-width";
}
```

</details>
