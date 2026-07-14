---
title: "DataValidationRule | @sheetwrite/core"
description: "One stable, range-scoped data-entry rule."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataValidationRule -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One stable, range-scoped data-entry rule. Blank cells are allowed unless disabled.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L103</code></dd></div>
</dl>

## Members <span class="api-count">6</span>

<div class="api-member-list">

<details class="api-member" id="data-validation-rule-id" data-pagefind-weight="1">
<summary><code>id</code></summary>
<pre><code>id: string;</code></pre>
</details>

<details class="api-member" id="data-validation-rule-range" data-pagefind-weight="1">
<summary><code>range</code></summary>
<pre><code>range: Range;</code></pre>
</details>

<details class="api-member" id="data-validation-rule-condition" data-pagefind-weight="1">
<summary><code>condition</code></summary>
<pre><code>condition: DataValidationCondition;</code></pre>
</details>

<details class="api-member" id="data-validation-rule-policy" data-pagefind-weight="1">
<summary><code>policy</code></summary>
<pre><code>policy: ValidationPolicy;</code></pre>
</details>

<details class="api-member" id="data-validation-rule-allow-blank" data-pagefind-weight="1">
<summary><code>allowBlank</code></summary>
<pre><code>allowBlank?: boolean;</code></pre>
</details>

<details class="api-member" id="data-validation-rule-help-text" data-pagefind-weight="1">
<summary><code>helpText</code></summary>
<pre><code>helpText?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface DataValidationRule {
    id: string;
    range: Range;
    condition: DataValidationCondition;
    policy: ValidationPolicy;
    allowBlank?: boolean;
    helpText?: string;
}
```

</details>
