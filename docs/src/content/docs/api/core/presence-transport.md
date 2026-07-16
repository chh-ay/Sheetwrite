---
title: "PresenceTransport | @sheetwrite/core"
description: "Host transport contract for ephemeral presence messages."
---
<!-- api-export:@sheetwrite/core|.|PresenceTransport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host transport contract for ephemeral presence messages.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="presence-transport-publish" data-pagefind-weight="1">
<summary><code>publish</code></summary>

```ts generated
publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
```

</details>

<details class="api-member" id="presence-transport-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>

```ts generated
subscribe( listener: (message: PresenceMessage) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceTransport {
    publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
    subscribe(listener: (message: PresenceMessage) => void, signal?: AbortSignal): undefined | (() => void);
}
```

</details>
