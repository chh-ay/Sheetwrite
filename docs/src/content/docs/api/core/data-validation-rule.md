---
title: "DataValidationRule | @sheetwrite/core"
description: "One stable, range-scoped data-entry rule."
---
<!-- api-export:@sheetwrite/core|.|DataValidationRule -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One stable, range-scoped data-entry rule. Blank cells are allowed unless disabled.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L176</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="data-validation-rule-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="data-validation-rule-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="data-validation-rule-condition" data-pagefind-weight="1">
<summary><code>condition</code></summary>

```ts generated
condition: DataValidationCondition;
```

</details>

<details class="api-member" id="data-validation-rule-policy" data-pagefind-weight="1">
<summary><code>policy</code></summary>

```ts generated
policy: ValidationPolicy;
```

</details>

<details class="api-member" id="data-validation-rule-allow-blank" data-pagefind-weight="1">
<summary><code>allowBlank</code></summary>

```ts generated
allowBlank?: boolean;
```

</details>

<details class="api-member" id="data-validation-rule-help-text" data-pagefind-weight="1">
<summary><code>helpText</code></summary>

```ts generated
helpText?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
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
