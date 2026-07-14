---
title: "RevisionAdapter | @sheetwrite/core"
description: "Host persistence contract for revision history and restore."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RevisionAdapter -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host persistence contract for revision history and restore.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L251</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="revision-adapter-list-revisions" data-pagefind-weight="1">
<summary><code>listRevisions</code></summary>
<pre><code>listRevisions(documentId: string, signal?: AbortSignal): Promise&lt;readonly RevisionSummary[]&gt;;</code></pre>
</details>

<details class="api-member" id="revision-adapter-load-revision" data-pagefind-weight="1">
<summary><code>loadRevision</code></summary>
<pre><code>loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise&lt;unknown&gt;;</code></pre>
</details>

<details class="api-member" id="revision-adapter-restore-revision" data-pagefind-weight="1">
<summary><code>restoreRevision</code></summary>
<pre><code>restoreRevision(request: RevisionRestoreRequest): Promise&lt;RevisionRestoreResponse&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface RevisionAdapter {
    listRevisions(documentId: string, signal?: AbortSignal): Promise<readonly RevisionSummary[]>;
    loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise<unknown>;
    restoreRevision(request: RevisionRestoreRequest): Promise<RevisionRestoreResponse>;
}
```

</details>
