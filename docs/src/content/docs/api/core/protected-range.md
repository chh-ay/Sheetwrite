---
title: "ProtectedRange | @sheetwrite/core"
description: "Serializable client UX policy."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ProtectedRange -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Serializable client UX policy. A host resolver decides whether a local mutation may proceed.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L119</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="protected-range-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="protected-range-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="protected-range-label" data-pagefind-weight="1">
<summary><code>label</code></summary>

```ts generated
label?: string;
```

</details>

<details class="api-member" id="protected-range-permission-key" data-pagefind-weight="1">
<summary><code>permissionKey</code></summary>

```ts generated
permissionKey?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ProtectedRange {
    id: string;
    range: Range;
    label?: string;
    permissionKey?: string;
}
```

</details>
