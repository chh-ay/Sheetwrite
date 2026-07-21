---
title: "GridCommandStateChangeEvent | @sheetwrite/core"
description: "Complete command-state snapshot emitted whenever availability or activity can change."
---
<!-- api-export:@sheetwrite/core|.|GridCommandStateChangeEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Complete command-state snapshot emitted whenever availability or activity can change.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L143</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="grid-command-state-change-event-states" data-pagefind-weight="1">
<summary><code>states</code></summary>

```ts generated
readonly states: Readonly<Record<GridCommandName, GridCommandState>>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridCommandStateChangeEvent {
  readonly states: Readonly<Record<GridCommandName, GridCommandState>>;
}
```

</details>
