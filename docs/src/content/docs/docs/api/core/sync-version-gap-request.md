---
title: "SyncVersionGapRequest | @sheetwrite/core"
description: "Contiguous-version recovery request produced when remote input skips ahead."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncVersionGapRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Contiguous-version recovery request produced when remote input skips ahead.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L41</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="sync-version-gap-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>
<pre><code>documentId: string;</code></pre>
</details>

<details class="api-member" id="sync-version-gap-request-expected-version" data-pagefind-weight="1">
<summary><code>expectedVersion</code></summary>
<pre><code>expectedVersion: number;</code></pre>
</details>

<details class="api-member" id="sync-version-gap-request-received-version" data-pagefind-weight="1">
<summary><code>receivedVersion</code></summary>
<pre><code>receivedVersion: number;</code></pre>
</details>

<details class="api-member" id="sync-version-gap-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>
<pre><code>signal: AbortSignal;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SyncVersionGapRequest {
    documentId: string;
    expectedVersion: number;
    receivedVersion: number;
    signal: AbortSignal;
}
```

</details>
