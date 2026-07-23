---
title: "PresenceMessage | @sheetwrite/core"
description: "Ephemeral collaborator selection and activity update."
---
<!-- api-export:@sheetwrite/core|.|PresenceMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection and activity update.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="presence-message-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>

```ts generated
actor: PresenceActor;
```

</details>

<details class="api-member" id="presence-message-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>

```ts generated
activeSheet: string;
```

</details>

<details class="api-member" id="presence-message-selections" data-pagefind-weight="1">
<summary><code>selections</code></summary>

```ts generated
selections: readonly Range[];
```

</details>

<details class="api-member" id="presence-message-sent-at" data-pagefind-weight="1">
<summary><code>sentAt</code></summary>

```ts generated
sentAt: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceMessage {
  actor: PresenceActor;
  activeSheet: string;
  selections: readonly Range[];
  sentAt: number;
}
```

</details>
