---
title: "ConditionalFormatRule | @sheetwrite/core"
description: "Ordered condition and style applied to a cell range."
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatRule -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ordered condition and style applied to a cell range.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L77</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

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

<details class="api-member" id="conditional-format-rule-stop-if-true" data-pagefind-weight="1">
<summary><code>stopIfTrue</code> <span class="api-member-summary">Stop evaluating lower-precedence rules for a cell when this rule matches.</span></summary>

```ts generated
stopIfTrue?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ConditionalFormatRule {
  range: Range;
  when: ConditionalFormatPredicate;
  style: CellStyle;
  stopIfTrue?: boolean;
}
```

</details>
