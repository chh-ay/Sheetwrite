---
title: "RevisionRestoreRequest | @sheetwrite/core"
description: "Versioned restore request submitted to a revision adapter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RevisionRestoreRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Versioned restore request submitted to a revision adapter.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L231</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="revision-restore-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="revision-restore-request-target-version" data-pagefind-weight="1">
<summary><code>targetVersion</code></summary>

```ts generated
targetVersion: number;
```

</details>

<details class="api-member" id="revision-restore-request-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="revision-restore-request-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="revision-restore-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionRestoreRequest {
    documentId: string;
    targetVersion: number;
    baseVersion: number;
    clientMutationId: string;
    signal?: AbortSignal;
}
```

</details>
