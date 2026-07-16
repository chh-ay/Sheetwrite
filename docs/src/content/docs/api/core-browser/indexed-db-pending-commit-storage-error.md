---
title: "IndexedDbPendingCommitStorageError | @sheetwrite/core/browser"
description: "Typed IndexedDB failure raised by durable pending-commit storage."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageError -->
[← @sheetwrite/core/browser](/docs/api/core-browser/)

<span class="api-status">class</span>

Typed IndexedDB failure raised by durable pending-commit storage.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L19</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: IndexedDbPendingCommitStorageErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: IndexedDbPendingCommitStorageErrorCode
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class IndexedDbPendingCommitStorageError extends Error {
    constructor(code: IndexedDbPendingCommitStorageErrorCode, message: string, options?: ErrorOptions);
    code: IndexedDbPendingCommitStorageErrorCode;
}
```

</details>
