---
title: "PresenceTransport | @sheetwrite/core"
description: "Host transport contract for ephemeral presence messages."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresenceTransport -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host transport contract for ephemeral presence messages.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="presence-transport-publish" data-pagefind-weight="1">
<summary><code>publish</code></summary>
<pre><code>publish(message: PresenceMessage, signal?: AbortSignal): void | Promise&lt;void&gt;;</code></pre>
</details>

<details class="api-member" id="presence-transport-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>
<pre><code>subscribe( listener: (message: PresenceMessage) =&gt; void, signal?: AbortSignal, ): undefined | (() =&gt; void);</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PresenceTransport {
    publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
    subscribe(listener: (message: PresenceMessage) => void, signal?: AbortSignal): undefined | (() => void);
}
```

</details>
