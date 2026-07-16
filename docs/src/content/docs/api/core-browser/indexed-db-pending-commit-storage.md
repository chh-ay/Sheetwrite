---
title: "IndexedDbPendingCommitStorage | @sheetwrite/core/browser"
description: "Browser-only durable pending queue."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="class">class</span></div>

Browser-only durable pending queue. Import it from `@sheetwrite/core/browser`;
the package's root entrypoint never evaluates IndexedDB globals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L58</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(options?: IndexedDbPendingCommitStorageOptions);
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-close" data-pagefind-weight="1">
<summary><code>close</code></summary>

```ts generated
close: () => void;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: (documentId: string, signal?: AbortSignal) => Promise<readonly PendingCommit[]>;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-put" data-pagefind-weight="1">
<summary><code>put</code></summary>

```ts generated
put: (commit: PendingCommit, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-remove" data-pagefind-weight="1">
<summary><code>remove</code></summary>

```ts generated
remove: (documentId: string, clientMutationId: string, signal?: AbortSignal) => Promise<void>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IndexedDbPendingCommitStorage implements PendingCommitStorage {
  constructor(options?: IndexedDbPendingCommitStorageOptions);
  close: () => void;
  load: (
    documentId: string,
    signal?: AbortSignal,
  ) => Promise<readonly PendingCommit[]>;
  put: (commit: PendingCommit, signal?: AbortSignal) => Promise<void>;
  remove: (
    documentId: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
}
```

</details>
