---
title: "PresenceOverlay | @sheetwrite/core"
description: "Ephemeral collaborator selection rendered above the grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresenceOverlay -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

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
<pre><code>actorId: string;</code></pre>
</details>

<details class="api-member" id="presence-overlay-display-name" data-pagefind-weight="1">
<summary><code>displayName</code></summary>
<pre><code>displayName?: string;</code></pre>
</details>

<details class="api-member" id="presence-overlay-color" data-pagefind-weight="1">
<summary><code>color</code></summary>
<pre><code>color: string;</code></pre>
</details>

<details class="api-member" id="presence-overlay-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>
<pre><code>activeSheet: SheetId;</code></pre>
</details>

<details class="api-member" id="presence-overlay-ranges" data-pagefind-weight="1">
<summary><code>ranges</code></summary>
<pre><code>ranges: readonly Range[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PresenceOverlay {
    actorId: string;
    displayName?: string;
    color: string;
    activeSheet: SheetId;
    ranges: readonly Range[];
}
```

</details>
