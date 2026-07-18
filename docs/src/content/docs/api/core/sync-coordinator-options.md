---
title: "SyncCoordinatorOptions | @sheetwrite/core"
description: "Document, version, durability, and online options for synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Document, version, durability, and online options for synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L184</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-options-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-coordinator-options-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-options-create-mutation-id" data-pagefind-weight="1">
<summary><code>createMutationId</code></summary>

```ts generated
createMutationId?: () => string;
```

</details>

<details class="api-member" id="sync-coordinator-options-pending-storage" data-pagefind-weight="1">
<summary><code>pendingStorage</code></summary>

```ts generated
pendingStorage?: PendingCommitStorage;
```

</details>

<details class="api-member" id="sync-coordinator-options-initial-connection" data-pagefind-weight="1">
<summary><code>initialConnection</code></summary>

```ts generated
initialConnection?: "offline" | "online";
```

</details>

<details class="api-member" id="sync-coordinator-options-recover-version-gap" data-pagefind-weight="1">
<summary><code>recoverVersionGap</code> <span class="api-member-summary">Optional host recovery hook.</span></summary>

```ts generated
recoverVersionGap?: ( request: SyncVersionGapRequest, ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
```

<p class="api-member-doc">Optional host recovery hook. Return the missing ordered operations, or a
snapshot for the host to remount before calling `resumeAfterReload`.</p>
</details>

<details class="api-member" id="sync-coordinator-options-limits" data-pagefind-weight="1">
<summary><code>limits</code> <span class="api-member-summary">Overrides remote collaboration and durable local pending-queue ceilings.</span></summary>

```ts generated
limits?: Partial<SyncCoordinatorLimits>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  createMutationId?: () => string;
  pendingStorage?: PendingCommitStorage;
  initialConnection?: "offline" | "online";
  recoverVersionGap?: (
    request: SyncVersionGapRequest,
  ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
  limits?: Partial<SyncCoordinatorLimits>;
}
```

</details>
