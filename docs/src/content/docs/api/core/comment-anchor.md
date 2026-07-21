---
title: "CommentAnchor | @sheetwrite/core"
description: "Document location to which a comment thread is attached."
---
<!-- api-export:@sheetwrite/core|.|CommentAnchor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Document location to which a comment thread is attached.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L373</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "cell";
  address: { sheet: string; row: number; col: number };
}
```

</div>
<div class="api-variant">

```ts generated
{ kind: "range"; range: Range }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentAnchor =
  | {
      kind: "cell";
      address: {
        sheet: string;
        row: number;
        col: number;
      };
    }
  | {
      kind: "range";
      range: Range;
    };
```

</details>
