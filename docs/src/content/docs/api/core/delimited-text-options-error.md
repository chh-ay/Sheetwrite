---
title: "DelimitedTextOptionsError | @sheetwrite/core"
description: "Stable invalid-option failure for a delimited-text resource ceiling."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextOptionsError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable invalid-option failure for a delimited-text resource ceiling.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/delimited-text.ts#L71</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-options-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof DelimitedTextResourceLimits, value: unknown);
```

</details>

<details class="api-member" id="delimited-text-options-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "DelimitedTextOptionsError";
```

</details>

<details class="api-member" id="delimited-text-options-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof DelimitedTextResourceLimits;
```

</details>

<details class="api-member" id="delimited-text-options-error-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: unknown
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class DelimitedTextOptionsError extends SheetwriteError {
  constructor(resource: keyof DelimitedTextResourceLimits, value: unknown);
  name: "DelimitedTextOptionsError";
  resource: keyof DelimitedTextResourceLimits;
  value: unknown;
}
```

</details>
