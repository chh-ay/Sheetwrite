---
title: "DelimitedTextResourceError | @sheetwrite/core"
description: "Stable resource-limit failure raised before the next oversized parse or encode allocation."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource-limit failure raised before the next oversized parse or encode allocation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/delimited-text.ts#L51</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof DelimitedTextResourceLimits, limit: number, actual: number, operation: DelimitedTextOperation);
```

</details>

<details class="api-member" id="delimited-text-resource-error-actual" data-pagefind-weight="1">
<summary><code>actual</code></summary>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="delimited-text-resource-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "DELIMITED_TEXT_RESOURCE_LIMIT";
```

</details>

<details class="api-member" id="delimited-text-resource-error-limit" data-pagefind-weight="1">
<summary><code>limit</code></summary>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="delimited-text-resource-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "DelimitedTextResourceError";
```

</details>

<details class="api-member" id="delimited-text-resource-error-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
operation: DelimitedTextOperation;
```

</details>

<details class="api-member" id="delimited-text-resource-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof DelimitedTextResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class DelimitedTextResourceError extends RangeError {
  constructor(
    resource: keyof DelimitedTextResourceLimits,
    limit: number,
    actual: number,
    operation: DelimitedTextOperation,
  );
  actual: number;
  code: "DELIMITED_TEXT_RESOURCE_LIMIT";
  limit: number;
  name: "DelimitedTextResourceError";
  operation: DelimitedTextOperation;
  resource: keyof DelimitedTextResourceLimits;
}
```

</details>
