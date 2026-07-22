---
title: "XlsxWorkbookWarning | @sheetwrite/core"
description: "Structured fidelity warning emitted during XLSX conversion."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookWarning -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Structured fidelity warning emitted during XLSX conversion.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L388</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-warning-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: | "boolean-literal" | "rich-text" | "hyperlink" | "unsupported-cell-value" | "unsupported-feature" | "external-relationship" | "external-formula" | "format-loss" | "validation-loss" | "invalid-metadata";
```

</details>

<details class="api-member" id="xlsx-workbook-warning-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-cell" data-pagefind-weight="1">
<summary><code>cell</code></summary>

```ts generated
cell?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-part" data-pagefind-weight="1">
<summary><code>part</code></summary>

```ts generated
part?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature"
    | "external-relationship"
    | "external-formula"
    | "format-loss"
    | "validation-loss"
    | "invalid-metadata";
  message: string;
  sheet?: string;
  cell?: string;
  part?: string;
}
```

</details>
