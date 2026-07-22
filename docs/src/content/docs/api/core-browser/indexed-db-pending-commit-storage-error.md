---
title: "IndexedDbPendingCommitStorageError | @sheetwrite/core/browser"
description: "Typed IndexedDB failure raised by durable pending-commit storage."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="class">class</span></div>

Typed IndexedDB failure raised by durable pending-commit storage.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: IndexedDbPendingCommitStorageErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "IndexedDbPendingCommitStorageError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IndexedDbPendingCommitStorageError extends SheetwriteError {
  constructor(
    code: IndexedDbPendingCommitStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  name: "IndexedDbPendingCommitStorageError";
}
```

</details>
