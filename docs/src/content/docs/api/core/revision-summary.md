---
title: "RevisionSummary | @sheetwrite/core"
description: "Host-provided metadata describing a saved workbook revision."
---
<!-- api-export:@sheetwrite/core|.|RevisionSummary -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host-provided metadata describing a saved workbook revision.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L236</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="revision-summary-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="revision-summary-created-at" data-pagefind-weight="1">
<summary><code>createdAt</code></summary>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="revision-summary-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>

```ts generated
actor?: PresenceActor;
```

</details>

<details class="api-member" id="revision-summary-label" data-pagefind-weight="1">
<summary><code>label</code></summary>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionSummary {
  version: number;
  createdAt: string;
  actor?: PresenceActor;
  label?: string;
}
```

</details>
