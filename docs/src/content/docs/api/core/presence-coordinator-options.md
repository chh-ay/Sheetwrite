---
title: "PresenceCoordinatorOptions | @sheetwrite/core"
description: "Identity, privacy, and timing options for presence coordination."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Identity, privacy, and timing options for presence coordination.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L39</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="presence-coordinator-options-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>
<pre><code>actor: PresenceActor;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-privacy" data-pagefind-weight="1">
<summary><code>privacy</code></summary>
<pre><code>privacy?: PresencePrivacyOptions;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-heartbeat-ms" data-pagefind-weight="1">
<summary><code>heartbeatMs</code></summary>
<pre><code>heartbeatMs?: number;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-timeout-ms" data-pagefind-weight="1">
<summary><code>timeoutMs</code></summary>
<pre><code>timeoutMs?: number;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-max-actors" data-pagefind-weight="1">
<summary><code>maxActors</code></summary>
<pre><code>maxActors?: number;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-max-ranges-per-actor" data-pagefind-weight="1">
<summary><code>maxRangesPerActor</code></summary>
<pre><code>maxRangesPerActor?: number;</code></pre>
</details>

<details class="api-member" id="presence-coordinator-options-now" data-pagefind-weight="1">
<summary><code>now</code></summary>
<pre><code>now?: () =&gt; number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
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
