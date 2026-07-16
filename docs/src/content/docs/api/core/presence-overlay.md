---
title: "PresenceOverlay | @sheetwrite/core"
description: "Ephemeral collaborator selection rendered above the grid."
---
<!-- api-export:@sheetwrite/core|.|PresenceOverlay -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection rendered above the grid. Presence never
enters document operations, snapshots, dirty state, or undo history.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L39</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="presence-overlay-actor-id" data-pagefind-weight="1">
<summary><code>actorId</code></summary>

```ts generated
actorId: string;
```

</details>

<details class="api-member" id="presence-overlay-display-name" data-pagefind-weight="1">
<summary><code>displayName</code></summary>

```ts generated
displayName?: string;
```

</details>

<details class="api-member" id="presence-overlay-color" data-pagefind-weight="1">
<summary><code>color</code></summary>

```ts generated
color: string;
```

</details>

<details class="api-member" id="presence-overlay-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>

```ts generated
activeSheet: SheetId;
```

</details>

<details class="api-member" id="presence-overlay-ranges" data-pagefind-weight="1">
<summary><code>ranges</code></summary>

```ts generated
ranges: readonly Range[];
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceOverlay {
    actorId: string;
    displayName?: string;
    color: string;
    activeSheet: SheetId;
    ranges: readonly Range[];
}
```

</details>
