---
title: "HighlightRange | @sheetwrite/core"
description: "A highlight target: a range plus an optional per-range color override."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|HighlightRange -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

A highlight target: a range plus an optional per-range color override.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L30</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="highlight-range-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">Overrides the call-level color / theme highlight for this range only.</span></summary>

```ts generated
color?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HighlightRange extends Range {
    color?: string;
}
```

</details>
