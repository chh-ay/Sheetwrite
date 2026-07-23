---
title: "CellHyperlink | @sheetwrite/core"
description: "Bounded serializable hyperlink metadata applied to one cell or range."
---
<!-- api-export:@sheetwrite/core|.|CellHyperlink -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded serializable hyperlink metadata applied to one cell or range.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L56</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-hyperlink-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity used by operations, history, and collaboration rebase.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="cell-hyperlink-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="cell-hyperlink-target" data-pagefind-weight="1">
<summary><code>target</code></summary>

```ts generated
target: HyperlinkTarget;
```

</details>

<details class="api-member" id="cell-hyperlink-display" data-pagefind-weight="1">
<summary><code>display</code> <span class="api-member-summary">Optional accessible/OOXML display label; cell values remain authoritative.</span></summary>

```ts generated
display?: string;
```

</details>

<details class="api-member" id="cell-hyperlink-style" data-pagefind-weight="1">
<summary><code>style</code> <span class="api-member-summary">Optional override merged over the deterministic blue/underline link style.</span></summary>

```ts generated
style?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellHyperlink {
  id: string;
  range: Range;
  target: HyperlinkTarget;
  display?: string;
  style?: CellStyle;
}
```

</details>
