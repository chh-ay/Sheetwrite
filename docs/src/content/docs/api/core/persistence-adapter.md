---
title: "PersistenceAdapter | @sheetwrite/core"
description: "Host load and commit contract for versioned workbook persistence."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PersistenceAdapter -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host load and commit contract for versioned workbook persistence.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L109</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-adapter-load" data-pagefind-weight="1">
<summary><code>load</code></summary>
<pre><code>load(documentId: string, signal?: AbortSignal): Promise&lt;WorkbookSnapshot&gt;;</code></pre>
</details>

<details class="api-member" id="persistence-adapter-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>
<pre><code>commit(request: PersistenceCommitRequest): Promise&lt;PersistenceCommitResponse&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PersistenceAdapter {
    load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
    commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse>;
}
```

</details>
