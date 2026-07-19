---
title: "HighlightRange | @sheetwrite/core"
description: "A highlight target: a range plus an optional per-range color override."
---
<!-- api-export:@sheetwrite/core|.|HighlightRange -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A highlight target: a range plus an optional per-range color override.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L30</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="highlight-range-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">Overrides the call-level color / theme highlight for this range only.</span></summary>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="highlight-range-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="highlight-range-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
start: { row: number; col: number };
```

</details>

<details class="api-member" id="highlight-range-end" data-pagefind-weight="1">
<summary><code>end</code></summary>

```ts generated
end: { row: number; col: number };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HighlightRange {
  color?: string;
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
