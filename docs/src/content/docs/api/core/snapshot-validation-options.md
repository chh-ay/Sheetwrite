---
title: "SnapshotValidationOptions | @sheetwrite/core"
description: "Validation and allocation policy for an untrusted workbook snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Validation and allocation policy for an untrusted workbook snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L139</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-options-storage" data-pagefind-weight="1">
<summary><code>storage</code></summary>

```ts generated
storage?: SnapshotStorageMode;
```

</details>

<details class="api-member" id="snapshot-validation-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code></summary>

```ts generated
resourceLimits?: Partial<SnapshotResourceLimits>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SnapshotValidationOptions {
  storage?: SnapshotStorageMode;
  resourceLimits?: Partial<SnapshotResourceLimits>;
}
```

</details>
