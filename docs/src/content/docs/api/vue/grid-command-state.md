---
title: "GridCommandState | @sheetwrite/vue"
description: "Observable availability and selection-derived activity for one command."
---
<!-- api-export:@sheetwrite/vue|.|GridCommandState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Observable availability and selection-derived activity for one command.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L71</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="grid-command-state-disabled" data-pagefind-weight="1">
<summary><code>disabled</code></summary>

```ts generated
readonly disabled: boolean;
```

</details>

<details class="api-member" id="grid-command-state-activity" data-pagefind-weight="1">
<summary><code>activity</code></summary>

```ts generated
readonly activity: "inactive" | "active" | "mixed";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridCommandState {
  readonly disabled: boolean;
  readonly activity: "inactive" | "active" | "mixed";
}
```

</details>
