---
title: "MemoryPersistenceAdapter | @sheetwrite/core"
description: "Executable database-neutral reference adapter for tests, demos, and local workflows."
---
<!-- api-export:@sheetwrite/core|.|MemoryPersistenceAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Executable database-neutral reference adapter for tests, demos, and local workflows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L59</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="memory-persistence-adapter-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(...snapshots: readonly WorkbookSnapshot[]);
```

</details>

<details class="api-member" id="memory-persistence-adapter-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit: (request: PersistenceCommitRequest) => Promise<PersistenceCommitResponse>;
```

</details>

<details class="api-member" id="memory-persistence-adapter-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: (documentId: string, signal?: AbortSignal) => Promise<WorkbookSnapshot>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class MemoryPersistenceAdapter implements PersistenceAdapter {
  constructor(...snapshots: readonly WorkbookSnapshot[]);
  commit: (
    request: PersistenceCommitRequest,
  ) => Promise<PersistenceCommitResponse>;
  load: (
    documentId: string,
    signal?: AbortSignal,
  ) => Promise<WorkbookSnapshot>;
}
```

</details>
