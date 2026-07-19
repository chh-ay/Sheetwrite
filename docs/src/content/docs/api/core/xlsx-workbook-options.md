---
title: "XlsxWorkbookOptions | @sheetwrite/core"
description: "Shared options passed to every registered table and workbook XLSX backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Shared options passed to every registered table and workbook XLSX backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L357</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-options-signal" data-pagefind-weight="1">
<summary><code>signal</code> <span class="api-member-summary">Abort before or between bounded codec operations.</span></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="xlsx-workbook-options-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code> <span class="api-member-summary">Maximum logical cells processed.</span></summary>

```ts generated
maxCells?: number;
```

<p class="api-member-doc">Maximum logical cells processed. Defaults to 1,000,000.</p>
</details>

<details class="api-member" id="xlsx-workbook-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code> <span class="api-member-summary">Overrides for all other XLSX resource dimensions.</span></summary>

```ts generated
resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
```

</details>

<details class="api-member" id="xlsx-workbook-options-on-warning" data-pagefind-weight="1">
<summary><code>onWarning</code></summary>

```ts generated
onWarning?: (warning: XlsxWorkbookWarning) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookOptions {
  signal?: AbortSignal;
  maxCells?: number;
  resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
}
```

</details>
