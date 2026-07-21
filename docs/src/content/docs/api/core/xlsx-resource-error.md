---
title: "XlsxResourceError | @sheetwrite/core"
description: "Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data."
---
<!-- api-export:@sheetwrite/core|.|XlsxResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L279</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof XlsxResourceLimits, limit: number, actual: number, operation: "import" | "export");
```

</details>

<details class="api-member" id="xlsx-resource-error-actual" data-pagefind-weight="1">
<summary><code>actual</code></summary>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="xlsx-resource-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "XLSX_RESOURCE_LIMIT";
```

</details>

<details class="api-member" id="xlsx-resource-error-limit" data-pagefind-weight="1">
<summary><code>limit</code></summary>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="xlsx-resource-error-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
operation: "import" | "export";
```

</details>

<details class="api-member" id="xlsx-resource-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof XlsxResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class XlsxResourceError extends RangeError {
  constructor(
    resource: keyof XlsxResourceLimits,
    limit: number,
    actual: number,
    operation: "import" | "export",
  );
  actual: number;
  code: "XLSX_RESOURCE_LIMIT";
  limit: number;
  operation: "import" | "export";
  resource: keyof XlsxResourceLimits;
}
```

</details>
