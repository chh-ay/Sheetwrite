---
title: "SyncCoordinatorLimits | @sheetwrite/core"
description: "Resource ceilings applied independently to remote collaboration input and local durability."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings applied independently to remote collaboration input and local durability.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L105</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-limits-max-mutation-id-bytes" data-pagefind-weight="1">
<summary><code>maxMutationIdBytes</code> <span class="api-member-summary">UTF-8 bytes in a remote or pending mutation ID; defaults to 256.</span></summary>

```ts generated
maxMutationIdBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-operations-per-version" data-pagefind-weight="1">
<summary><code>maxOperationsPerVersion</code> <span class="api-member-summary">Operations accepted in one remote version; defaults to 10,000.</span></summary>

```ts generated
maxOperationsPerVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-version-payload-bytes" data-pagefind-weight="1">
<summary><code>maxVersionPayloadBytes</code> <span class="api-member-summary">Encoded operation bytes accepted in one remote version; defaults to 8 MiB.</span></summary>

```ts generated
maxVersionPayloadBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-future-version-distance" data-pagefind-weight="1">
<summary><code>maxFutureVersionDistance</code> <span class="api-member-summary">Version distance allowed ahead of the contiguous head; defaults to 1,024.</span></summary>

```ts generated
maxFutureVersionDistance: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-versions" data-pagefind-weight="1">
<summary><code>maxBufferedVersions</code> <span class="api-member-summary">Remote future versions retained in the gap buffer; defaults to 256.</span></summary>

```ts generated
maxBufferedVersions: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-operations" data-pagefind-weight="1">
<summary><code>maxBufferedOperations</code> <span class="api-member-summary">Aggregate operations retained in the gap buffer; defaults to 40,000.</span></summary>

```ts generated
maxBufferedOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-bytes" data-pagefind-weight="1">
<summary><code>maxBufferedBytes</code> <span class="api-member-summary">Aggregate encoded bytes retained in the gap buffer; defaults to 32 MiB.</span></summary>

```ts generated
maxBufferedBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-recent-acknowledgements" data-pagefind-weight="1">
<summary><code>maxRecentAcknowledgements</code> <span class="api-member-summary">Recently acknowledged mutation IDs retained for echo deduplication; defaults to 4,096.</span></summary>

```ts generated
maxRecentAcknowledgements: number;
```

<p class="api-member-doc">Recently acknowledged mutation IDs retained for echo deduplication;
defaults to 4,096. Once an ID expires, a stale operation carrying it is a
reload-requiring protocol violation and its operations are never reapplied.</p>
</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-commits" data-pagefind-weight="1">
<summary><code>maxPendingCommits</code> <span class="api-member-summary">Pending local commits, including synchronous reservations; defaults to 10,000.</span></summary>

```ts generated
maxPendingCommits: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-operations" data-pagefind-weight="1">
<summary><code>maxPendingOperations</code> <span class="api-member-summary">Aggregate DocumentOp count across pending commits; defaults to 100,000.</span></summary>

```ts generated
maxPendingOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-encoded-bytes" data-pagefind-weight="1">
<summary><code>maxPendingEncodedBytes</code> <span class="api-member-summary">Aggregate UTF-8 bytes across pending operation arrays; defaults to 128 MiB.</span></summary>

```ts generated
maxPendingEncodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncCoordinatorLimits {
  maxMutationIdBytes: number;
  maxOperationsPerVersion: number;
  maxVersionPayloadBytes: number;
  maxFutureVersionDistance: number;
  maxBufferedVersions: number;
  maxBufferedOperations: number;
  maxBufferedBytes: number;
  maxRecentAcknowledgements: number;
  maxPendingCommits: number;
  maxPendingOperations: number;
  maxPendingEncodedBytes: number;
}
```

</details>
