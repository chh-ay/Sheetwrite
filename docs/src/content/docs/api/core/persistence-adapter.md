---
title: "PersistenceAdapter | @sheetwrite/core"
description: "Host load and commit contract for versioned workbook persistence."
---
<!-- api-export:@sheetwrite/core|.|PersistenceAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host load and commit contract for versioned workbook persistence.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L109</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-adapter-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
```

</details>

<details class="api-member" id="persistence-adapter-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PersistenceAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  commit(
    request: PersistenceCommitRequest,
  ): Promise<PersistenceCommitResponse>;
}
```

</details>
