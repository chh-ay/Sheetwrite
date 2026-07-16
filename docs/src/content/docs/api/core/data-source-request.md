---
title: "DataSourceRequest | @sheetwrite/core"
description: "Cancellable sheet and row interval requested from a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourceRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cancellable sheet and row interval requested from a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="data-source-request-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="data-source-request-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-request-end" data-pagefind-weight="1">
<summary><code>end</code></summary>

```ts generated
end: number;
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
  sheet: SheetId;
  start: number;
  end: number;
  signal: AbortSignal;
  revision: number;
}
```

</details>
