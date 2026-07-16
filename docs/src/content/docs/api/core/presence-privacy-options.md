---
title: "PresencePrivacyOptions | @sheetwrite/core"
description: "Controls which ephemeral collaborator details may be transmitted."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresencePrivacyOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Controls which ephemeral collaborator details may be transmitted.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L31</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="presence-privacy-options-share-display-name" data-pagefind-weight="1">
<summary><code>shareDisplayName</code></summary>

```ts generated
shareDisplayName?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-share-selection" data-pagefind-weight="1">
<summary><code>shareSelection</code></summary>

```ts generated
shareSelection?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-receive-presence" data-pagefind-weight="1">
<summary><code>receivePresence</code></summary>

```ts generated
receivePresence?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-allow-actor" data-pagefind-weight="1">
<summary><code>allowActor</code></summary>

```ts generated
allowActor?: (actor: Readonly<PresenceActor>) => boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresencePrivacyOptions {
    shareDisplayName?: boolean;
    shareSelection?: boolean;
    receivePresence?: boolean;
    allowActor?: (actor: Readonly<PresenceActor>) => boolean;
}
```

</details>
