---
title: "DataSourceRequest | @sheetwrite/core"
description: "Cancellable sheet rectangle requested from a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourceRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cancellable sheet rectangle requested from a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L33</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="data-source-request-protocol" data-pagefind-weight="1">
<summary><code>protocol</code> <span class="api-member-summary">Paging contract version.</span></summary>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-request-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="data-source-request-start" data-pagefind-weight="1">
<summary><code>start</code> <span class="api-member-summary">Inclusive row index.</span></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-request-end" data-pagefind-weight="1">
<summary><code>end</code> <span class="api-member-summary">Exclusive row index.</span></summary>

```ts generated
end: number;
```

</details>

<details class="api-member" id="data-source-request-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Exact visible, frozen, or prefetched column runs required by the Grid.</span></summary>

```ts generated
columns: readonly DataSourceColumnBand[];
```

</details>

<details class="api-member" id="data-source-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal: AbortSignal;
```

</details>

<details class="api-member" id="data-source-request-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceRequest {
  protocol: 2;
  sheet: SheetId;
  start: number;
  end: number;
  columns: readonly DataSourceColumnBand[];
  signal: AbortSignal;
  revision: number;
}
```

</details>
