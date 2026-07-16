---
title: "SyncCoordinator | @sheetwrite/core"
description: "Deterministic, transport-neutral optimistic sync."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Deterministic, transport-neutral optimistic sync. Local rendering is never
blocked: changes queue immediately, while hosts explicitly call `sendNext`
or `retry` to perform network work.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L102</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>18</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(grid: Grid, adapter: PersistenceAdapter, options: SyncCoordinatorOptions);
```

</details>

<details class="api-member" id="sync-coordinator-apply-versioned-operation" data-pagefind-weight="1">
<summary><code>applyVersionedOperation</code></summary>

```ts generated
applyVersionedOperation: (operation: VersionedOperation) => void;
```

</details>

<details class="api-member" id="sync-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="sync-coordinator-flush" data-pagefind-weight="1">
<summary><code>flush</code></summary>

```ts generated
flush: () => Promise<readonly PersistenceCommitResponse[]>;
```

</details>

<details class="api-member" id="sync-coordinator-handle-response" data-pagefind-weight="1">
<summary><code>handleResponse</code> <span class="api-member-summary">Public for transports that deliver responses independently of send promises.</span></summary>

```ts generated
handleResponse: (response: PersistenceCommitResponse, requestedMutationId?: string) => Promise<void>;
```

</details>

<details class="api-member" id="sync-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: SyncListener) => () => void;
```

</details>

<details class="api-member" id="sync-coordinator-pending-commits" data-pagefind-weight="1">
<summary><code>pendingCommits</code></summary>

```ts generated
pendingCommits: () => readonly SyncMutationRecord[];
```

</details>

<details class="api-member" id="sync-coordinator-pending-count" data-pagefind-weight="1">
<summary><code>pendingCount</code></summary>

```ts generated
pendingCount: number;
```

</details>

<details class="api-member" id="sync-coordinator-ready" data-pagefind-weight="1">
<summary><code>ready</code> <span class="api-member-summary">Resolves after durable work is restored and every startup commit is visible locally.</span></summary>

```ts generated
ready: () => Promise<void>;
```

</details>

<details class="api-member" id="sync-coordinator-resume-after-reload" data-pagefind-weight="1">
<summary><code>resumeAfterReload</code> <span class="api-member-summary">Resume only after the host remounted/reloaded document state and reapplied retained local operations.</span></summary>

```ts generated
resumeAfterReload: (snapshot: WorkbookSnapshot) => void;
```

<p class="api-member-doc">Resume only after the host remounted/reloaded document state and reapplied
retained local operations. No lossy structural merge is attempted here.</p>
</details>

<details class="api-member" id="sync-coordinator-retry" data-pagefind-weight="1">
<summary><code>retry</code> <span class="api-member-summary">Explicit retry; the original mutation ID and durable record are retained.</span></summary>

```ts generated
retry: (clientMutationId: string) => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-retry-persistence" data-pagefind-weight="1">
<summary><code>retryPersistence</code></summary>

```ts generated
retryPersistence: (clientMutationId: string) => Promise<boolean>;
```

</details>

<details class="api-member" id="sync-coordinator-send" data-pagefind-weight="1">
<summary><code>send</code></summary>

```ts generated
send: (clientMutationId: string) => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-send-next" data-pagefind-weight="1">
<summary><code>sendNext</code></summary>

```ts generated
sendNext: () => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-set-online" data-pagefind-weight="1">
<summary><code>setOnline</code> <span class="api-member-summary">Update connectivity. Reconnection drains durable work in order; going offline aborts in-flight requests so retries retain their mutation IDs.</span></summary>

```ts generated
setOnline: (online: boolean) => void;
```

</details>

<details class="api-member" id="sync-coordinator-state" data-pagefind-weight="1">
<summary><code>state</code></summary>

```ts generated
state: SyncStateSnapshot;
```

</details>

<details class="api-member" id="sync-coordinator-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>

```ts generated
subscribe: (source: RemoteOperationSource | AsyncIterable<VersionedOperation>) => () => void
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SyncCoordinator {
  constructor(
    grid: Grid,
    adapter: PersistenceAdapter,
    options: SyncCoordinatorOptions,
  );
  applyVersionedOperation: (operation: VersionedOperation) => void;
  destroy: () => void;
  flush: () => Promise<readonly PersistenceCommitResponse[]>;
  handleResponse: (
    response: PersistenceCommitResponse,
    requestedMutationId?: string,
  ) => Promise<void>;
  on: (listener: SyncListener) => () => void;
  pendingCommits: () => readonly SyncMutationRecord[];
  pendingCount: number;
  ready: () => Promise<void>;
  resumeAfterReload: (snapshot: WorkbookSnapshot) => void;
  retry: (
    clientMutationId: string,
  ) => Promise<PersistenceCommitResponse | null>;
  retryPersistence: (clientMutationId: string) => Promise<boolean>;
  send: (
    clientMutationId: string,
  ) => Promise<PersistenceCommitResponse | null>;
  sendNext: () => Promise<PersistenceCommitResponse | null>;
  serverVersion: number;
  setOnline: (online: boolean) => void;
  state: SyncStateSnapshot;
  subscribe: (
    source: RemoteOperationSource | AsyncIterable<VersionedOperation>,
  ) => () => void;
}
```

</details>
