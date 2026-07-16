---
title: "RevisionCoordinator | @sheetwrite/core"
description: "Coordinates listing and restoring host-owned workbook revisions."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Coordinates listing and restoring host-owned workbook revisions.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L274</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="revision-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
```

</details>

<details class="api-member" id="revision-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="revision-coordinator-list" data-pagefind-weight="1">
<summary><code>list</code></summary>

```ts generated
list: () => Promise<readonly RevisionSummary[]>;
```

</details>

<details class="api-member" id="revision-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: RevisionListener) => () => void;
```

</details>

<details class="api-member" id="revision-coordinator-preview" data-pagefind-weight="1">
<summary><code>preview</code></summary>

```ts generated
preview: (host: HTMLElement, version: number, options?: SnapshotGridOptions) => Promise<Grid>;
```

</details>

<details class="api-member" id="revision-coordinator-restore" data-pagefind-weight="1">
<summary><code>restore</code></summary>

```ts generated
restore: (targetVersion: number, clientMutationId: string) => Promise<RevisionRestoreResponse>;
```

</details>

<details class="api-member" id="revision-coordinator-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class RevisionCoordinator {
  constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
  destroy: () => void;
  list: () => Promise<readonly RevisionSummary[]>;
  on: (listener: RevisionListener) => () => void;
  preview: (
    host: HTMLElement,
    version: number,
    options?: SnapshotGridOptions,
  ) => Promise<Grid>;
  restore: (
    targetVersion: number,
    clientMutationId: string,
  ) => Promise<RevisionRestoreResponse>;
  serverVersion: number;
}
```

</details>
