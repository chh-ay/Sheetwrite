---
title: "SyncCoordinatorLimits | @sheetwrite/core"
description: "Resource ceilings applied independently to remote collaboration input and local durability."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings applied independently to remote collaboration input and local durability.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L104</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-limits-max-mutation-id-bytes" data-pagefind-weight="1">
<summary><code>maxMutationIdBytes</code> <span class="api-member-summary">Maximum UTF-8 bytes in a remote or pending client mutation ID.</span></summary>

```ts generated
maxMutationIdBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-operations-per-version" data-pagefind-weight="1">
<summary><code>maxOperationsPerVersion</code> <span class="api-member-summary">Maximum operations accepted in one hostile remote version.</span></summary>

```ts generated
maxOperationsPerVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-version-payload-bytes" data-pagefind-weight="1">
<summary><code>maxVersionPayloadBytes</code> <span class="api-member-summary">Maximum encoded operation bytes accepted in one hostile remote version.</span></summary>

```ts generated
maxVersionPayloadBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-future-version-distance" data-pagefind-weight="1">
<summary><code>maxFutureVersionDistance</code> <span class="api-member-summary">Maximum allowed version distance ahead of the contiguous remote head.</span></summary>

```ts generated
maxFutureVersionDistance: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-versions" data-pagefind-weight="1">
<summary><code>maxBufferedVersions</code> <span class="api-member-summary">Maximum remote future versions retained in the gap buffer.</span></summary>

```ts generated
maxBufferedVersions: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-operations" data-pagefind-weight="1">
<summary><code>maxBufferedOperations</code> <span class="api-member-summary">Maximum aggregate operations retained in the remote gap buffer.</span></summary>

```ts generated
maxBufferedOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-bytes" data-pagefind-weight="1">
<summary><code>maxBufferedBytes</code> <span class="api-member-summary">Maximum aggregate encoded bytes retained in the remote gap buffer.</span></summary>

```ts generated
maxBufferedBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-recent-acknowledgements" data-pagefind-weight="1">
<summary><code>maxRecentAcknowledgements</code> <span class="api-member-summary">Recently acknowledged mutation IDs retained for echo deduplication.</span></summary>

```ts generated
maxRecentAcknowledgements: number;
```

<p class="api-member-doc">Recently acknowledged mutation IDs retained for echo deduplication. Once
an ID expires, a stale operation carrying it is treated as a protocol
violation that requires reload; its operations are never reapplied.</p>
</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-commits" data-pagefind-weight="1">
<summary><code>maxPendingCommits</code> <span class="api-member-summary">Maximum number of pending local commits, including synchronous reservations.</span></summary>

```ts generated
maxPendingCommits: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-operations" data-pagefind-weight="1">
<summary><code>maxPendingOperations</code> <span class="api-member-summary">Maximum aggregate DocumentOp count across pending local commits.</span></summary>

```ts generated
maxPendingOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-encoded-bytes" data-pagefind-weight="1">
<summary><code>maxPendingEncodedBytes</code> <span class="api-member-summary">Maximum aggregate UTF-8 bytes across JSON-encoded pending operation arrays.</span></summary>

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
