---
title: "SyncVersionGapRequest | @sheetwrite/core"
description: "Contiguous-version recovery request produced when remote input skips ahead."
---
<!-- api-export:@sheetwrite/core|.|SyncVersionGapRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Contiguous-version recovery request produced when remote input skips ahead.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L86</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="sync-version-gap-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-version-gap-request-expected-version" data-pagefind-weight="1">
<summary><code>expectedVersion</code></summary>

```ts generated
expectedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-received-version" data-pagefind-weight="1">
<summary><code>receivedVersion</code></summary>

```ts generated
receivedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncVersionGapRequest {
  documentId: string;
  expectedVersion: number;
  receivedVersion: number;
  signal: AbortSignal;
}
```

</details>
