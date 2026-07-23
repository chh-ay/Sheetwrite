---
title: "ResourceOwnerBytes | @sheetwrite/core"
description: "Retained logical payload and allocated capacity attributed to one exclusive owner."
---
<!-- api-export:@sheetwrite/core|.|ResourceOwnerBytes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Retained logical payload and allocated capacity attributed to one exclusive owner.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L21</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="resource-owner-bytes-owner" data-pagefind-weight="1">
<summary><code>owner</code></summary>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="resource-owner-bytes-logical-bytes" data-pagefind-weight="1">
<summary><code>logicalBytes</code> <span class="api-member-summary">Bytes containing live logical payload.</span></summary>

```ts generated
readonly logicalBytes: number;
```

<p class="api-member-doc">Bytes containing live logical payload. Never includes runtime observations.</p>
</details>

<details class="api-member" id="resource-owner-bytes-allocated-bytes" data-pagefind-weight="1">
<summary><code>allocatedBytes</code> <span class="api-member-summary">Container capacity owned exclusively by this owner.</span></summary>

```ts generated
readonly allocatedBytes: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-entries" data-pagefind-weight="1">
<summary><code>entries</code></summary>

```ts generated
readonly entries: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-measurement" data-pagefind-weight="1">
<summary><code>measurement</code></summary>

```ts generated
readonly measurement: | "exact-capacity" | "hash-capacity-v1" | "typed-array-byte-length" | "utf16-upper-bound" | "entry-count-only";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ResourceOwnerBytes {
  readonly owner: string;
  readonly logicalBytes: number;
  readonly allocatedBytes: number;
  readonly entries: number;
  readonly measurement:
    | "exact-capacity"
    | "hash-capacity-v1"
    | "typed-array-byte-length"
    | "utf16-upper-bound"
    | "entry-count-only";
}
```

</details>
