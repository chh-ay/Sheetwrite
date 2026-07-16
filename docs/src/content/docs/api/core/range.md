---
title: "Range | @sheetwrite/core"
description: "Inclusive rectangular cell range on a stable sheet ID."
---
<!-- api-export:@sheetwrite/core|.|Range -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Inclusive rectangular cell range on a stable sheet ID.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="range-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="range-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
start: { row: number; col: number };
```

</details>

<details class="api-member" id="range-end" data-pagefind-weight="1">
<summary><code>end</code></summary>

```ts generated
end: { row: number; col: number };
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Range {
    sheet: SheetId;
    start: {
        row: number;
        col: number;
    };
    end: {
        row: number;
        col: number;
    };
}
```

</details>
