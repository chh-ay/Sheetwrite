---
title: "HyperlinkTarget | @sheetwrite/core"
description: "Browser-safe external target or stable workbook-internal range target."
---
<!-- api-export:@sheetwrite/core|.|HyperlinkTarget -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Browser-safe external target or stable workbook-internal range target.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L51</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ kind: "external"; url: string }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "internal"; range: Range }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type HyperlinkTarget =
  | {
      kind: "external";
      url: string;
    }
  | {
      kind: "internal";
      range: Range;
    };
```

</details>
