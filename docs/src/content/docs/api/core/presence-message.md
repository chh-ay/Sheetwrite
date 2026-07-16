---
title: "PresenceMessage | @sheetwrite/core"
description: "Ephemeral collaborator selection and activity update."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresenceMessage -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Ephemeral collaborator selection and activity update.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L14</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="presence-message-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>
<pre><code>actor: PresenceActor;</code></pre>
</details>

<details class="api-member" id="presence-message-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>
<pre><code>activeSheet: string;</code></pre>
</details>

<details class="api-member" id="presence-message-selections" data-pagefind-weight="1">
<summary><code>selections</code></summary>
<pre><code>selections: readonly Range[];</code></pre>
</details>

<details class="api-member" id="presence-message-sent-at" data-pagefind-weight="1">
<summary><code>sentAt</code></summary>
<pre><code>sentAt: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PresenceMessage {
    actor: PresenceActor;
    activeSheet: string;
    selections: readonly Range[];
    sentAt: number;
}
```

</details>
