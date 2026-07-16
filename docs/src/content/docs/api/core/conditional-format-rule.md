---
title: "ConditionalFormatRule | @sheetwrite/core"
description: "Ordered condition and style applied to a cell range."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatRule -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Ordered condition and style applied to a cell range.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L58</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="conditional-format-rule-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="conditional-format-rule-when" data-pagefind-weight="1">
<summary><code>when</code></summary>

```ts generated
when: ConditionalFormatPredicate;
```

</details>

<details class="api-member" id="conditional-format-rule-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ConditionalFormatRule {
    range: Range;
    when: ConditionalFormatPredicate;
    style: CellStyle;
}
```

</details>
