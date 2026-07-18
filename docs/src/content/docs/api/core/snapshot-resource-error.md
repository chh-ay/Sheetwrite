---
title: "SnapshotResourceError | @sheetwrite/core"
description: "Stable resource failure raised by direct workbook construction paths."
---
<!-- api-export:@sheetwrite/core|.|SnapshotResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource failure raised by direct workbook construction paths.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L145</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof SnapshotResourceLimits, limit: number, actual: number, options?: ErrorOptions);
```

</details>

<details class="api-member" id="snapshot-resource-error-actual" data-pagefind-weight="1">
<summary><code>actual</code></summary>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "resource-limit";
```

</details>

<details class="api-member" id="snapshot-resource-error-limit" data-pagefind-weight="1">
<summary><code>limit</code></summary>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof SnapshotResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SnapshotResourceError extends RangeError {
  constructor(
    resource: keyof SnapshotResourceLimits,
    limit: number,
    actual: number,
    options?: ErrorOptions,
  );
  actual: number;
  code: "resource-limit";
  limit: number;
  resource: keyof SnapshotResourceLimits;
}
```

</details>
