---
title: "DataSource | @sheetwrite/core"
description: "Host callback that asynchronously loads cancellable rectangular pages."
---
<!-- api-export:@sheetwrite/core|.|DataSource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host callback that asynchronously loads cancellable rectangular pages.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L66</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="data-source-capabilities" data-pagefind-weight="1">
<summary><code>capabilities</code></summary>

```ts generated
readonly capabilities: DataSourceCapabilities;
```

</details>

<details class="api-member" id="data-source-get-rows" data-pagefind-weight="1">
<summary><code>getRows</code> <span class="api-member-summary">Loads the requested rows and columns; implementations should stop work when its signal aborts.</span></summary>

```ts generated
getRows(request: DataSourceRequest): Promise<DataSourcePage>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSource {
  readonly capabilities: DataSourceCapabilities;
  getRows(request: DataSourceRequest): Promise<DataSourcePage>;
}
```

</details>
