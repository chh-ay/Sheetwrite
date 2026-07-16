---
title: "RevisionCoordinatorOptions | @sheetwrite/core"
description: "Document identity and version options for revision coordination."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinatorOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Document identity and version options for revision coordination.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L259</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="revision-coordinator-options-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="revision-coordinator-options-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="revision-coordinator-options-migrate-snapshot" data-pagefind-weight="1">
<summary><code>migrateSnapshot</code></summary>

```ts generated
migrateSnapshot?: (snapshot: unknown) => unknown;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionCoordinatorOptions {
    documentId: string;
    serverVersion: number;
    migrateSnapshot?: (snapshot: unknown) => unknown;
}
```

</details>
