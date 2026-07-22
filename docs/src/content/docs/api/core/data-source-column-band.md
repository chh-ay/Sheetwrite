---
title: "DataSourceColumnBand | @sheetwrite/core"
description: "One half-open run of workbook columns, in stable sheet order."
---
<!-- api-export:@sheetwrite/core|.|DataSourceColumnBand -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One half-open run of workbook columns, in stable sheet order.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-column-band-start" data-pagefind-weight="1">
<summary><code>start</code> <span class="api-member-summary">Zero-based workbook column index of the first key.</span></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-column-band-end" data-pagefind-weight="1">
<summary><code>end</code> <span class="api-member-summary">Exclusive workbook column index after the last key.</span></summary>

```ts generated
end: number;
```

</details>

<details class="api-member" id="data-source-column-band-keys" data-pagefind-weight="1">
<summary><code>keys</code> <span class="api-member-summary">Stable workbook column keys for every index in [start, end).</span></summary>

```ts generated
keys: readonly string[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceColumnBand {
  start: number;
  end: number;
  keys: readonly string[];
}
```

</details>
