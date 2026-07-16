---
title: "PresenceCoordinatorOptions | @sheetwrite/core"
description: "Identity, privacy, and timing options for presence coordination."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Identity, privacy, and timing options for presence coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L39</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="presence-coordinator-options-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>

```ts generated
actor: PresenceActor;
```

</details>

<details class="api-member" id="presence-coordinator-options-privacy" data-pagefind-weight="1">
<summary><code>privacy</code></summary>

```ts generated
privacy?: PresencePrivacyOptions;
```

</details>

<details class="api-member" id="presence-coordinator-options-heartbeat-ms" data-pagefind-weight="1">
<summary><code>heartbeatMs</code></summary>

```ts generated
heartbeatMs?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-timeout-ms" data-pagefind-weight="1">
<summary><code>timeoutMs</code></summary>

```ts generated
timeoutMs?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-max-actors" data-pagefind-weight="1">
<summary><code>maxActors</code></summary>

```ts generated
maxActors?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-max-ranges-per-actor" data-pagefind-weight="1">
<summary><code>maxRangesPerActor</code></summary>

```ts generated
maxRangesPerActor?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-now" data-pagefind-weight="1">
<summary><code>now</code></summary>

```ts generated
now?: () => number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceCoordinatorOptions {
  actor: PresenceActor;
  privacy?: PresencePrivacyOptions;
  heartbeatMs?: number;
  timeoutMs?: number;
  maxActors?: number;
  maxRangesPerActor?: number;
  now?: () => number;
}
```

</details>
