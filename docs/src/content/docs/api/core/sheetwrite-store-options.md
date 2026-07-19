---
title: "SheetwriteStoreOptions | @sheetwrite/core"
description: "Storage layout plus snapshot and transaction resource ceilings for one store."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteStoreOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Storage layout plus snapshot and transaction resource ceilings for one store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store.ts#L55</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-store-options-snapshot-resource-limits" data-pagefind-weight="1">
<summary><code>snapshotResourceLimits</code> <span class="api-member-summary">Overrides canonical snapshot/workbook allocation ceilings before construction.</span></summary>

```ts generated
snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-store-options-transaction-resource-limits" data-pagefind-weight="1">
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every transaction.</span></summary>

```ts generated
transactionResourceLimits?: Partial<TransactionResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-store-options-storage" data-pagefind-weight="1">
<summary><code>storage</code></summary>

```ts generated
storage?: "dense" | "paged";
```

</details>

<details class="api-member" id="sheetwrite-store-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code></summary>

```ts generated
chunkRows?: number;
```

</details>

<details class="api-member" id="sheetwrite-store-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code></summary>

```ts generated
cacheBytes?: number;
```

</details>

<details class="api-member" id="sheetwrite-store-options-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code></summary>

```ts generated
protectionResolver?: ProtectionResolver;
```

</details>

<details class="api-member" id="sheetwrite-store-options-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code></summary>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteStoreOptions {
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
  storage?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
}
```

</details>
