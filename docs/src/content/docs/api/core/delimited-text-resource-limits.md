---
title: "DelimitedTextResourceLimits | @sheetwrite/core"
description: "Resource ceilings shared by synchronous CSV and TSV parsing and encoding."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings shared by synchronous CSV and TSV parsing and encoding.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/delimited-text.ts#L3</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-resource-limits-max-input-bytes" data-pagefind-weight="1">
<summary><code>maxInputBytes</code> <span class="api-member-summary">Input string size in UTF-8 bytes; defaults to 32 MiB.</span></summary>

```ts generated
maxInputBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-output-bytes" data-pagefind-weight="1">
<summary><code>maxOutputBytes</code> <span class="api-member-summary">Output string size in UTF-8 bytes, including a BOM; defaults to 64 MiB.</span></summary>

```ts generated
maxOutputBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-rows" data-pagefind-weight="1">
<summary><code>maxRows</code> <span class="api-member-summary">Syntactically present records; defaults to 1,000,000.</span></summary>

```ts generated
maxRows: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-columns" data-pagefind-weight="1">
<summary><code>maxColumns</code> <span class="api-member-summary">Fields in any one record; defaults to 16,384.</span></summary>

```ts generated
maxColumns: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code> <span class="api-member-summary">Aggregate fields across all records; defaults to 1,000,000.</span></summary>

```ts generated
maxCells: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-field-bytes" data-pagefind-weight="1">
<summary><code>maxFieldBytes</code> <span class="api-member-summary">Decoded UTF-8 bytes in one field; defaults to 1 MiB.</span></summary>

```ts generated
maxFieldBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-writer-window-rows" data-pagefind-weight="1">
<summary><code>maxWriterWindowRows</code> <span class="api-member-summary">Rows fetched by an export writer in one packed store read; defaults to 4,096.</span></summary>

```ts generated
maxWriterWindowRows: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DelimitedTextResourceLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCells: number;
  maxFieldBytes: number;
  maxWriterWindowRows: number;
}
```

</details>
