---
title: "PresenceCoordinator | @sheetwrite/core"
description: "Ephemeral presence lifecycle; it never calls a document mutation API."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Ephemeral presence lifecycle; it never calls a document mutation API.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L64</code></dd></div>
</dl>

## Members <span class="api-count">6</span>

<div class="api-member-list">

<details class="api-member" id="presence-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(grid: Grid, transport: PresenceTransport, options: PresenceCoordinatorOptions);
```

</details>

<details class="api-member" id="presence-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="presence-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: PresenceListener) => () => void;
```

</details>

<details class="api-member" id="presence-coordinator-prune-stale" data-pagefind-weight="1">
<summary><code>pruneStale</code></summary>

```ts generated
pruneStale: () => void;
```

</details>

<details class="api-member" id="presence-coordinator-publish-now" data-pagefind-weight="1">
<summary><code>publishNow</code></summary>

```ts generated
publishNow: () => Promise<void>;
```

</details>

<details class="api-member" id="presence-coordinator-remote-presence" data-pagefind-weight="1">
<summary><code>remotePresence</code></summary>

```ts generated
remotePresence: () => readonly PresenceMessage[]
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class PresenceCoordinator {
    constructor(grid: Grid, transport: PresenceTransport, options: PresenceCoordinatorOptions);
    destroy: () => void;
    on: (listener: PresenceListener) => () => void;
    pruneStale: () => void;
    publishNow: () => Promise<void>;
    remotePresence: () => readonly PresenceMessage[];
}
```

</details>
