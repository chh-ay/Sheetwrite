---
title: "RevisionCoordinatorOptions | @sheetwrite/core"
description: "Document identity and version options for revision coordination."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Document identity and version options for revision coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L259</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  migrateSnapshot?: (snapshot: unknown) => unknown;
}
```

</details>
