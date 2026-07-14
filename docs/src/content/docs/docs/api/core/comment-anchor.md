---
title: "CommentAnchor | @sheetwrite/core"
description: "Document location to which a comment thread is attached."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentAnchor -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Document location to which a comment thread is attached.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L360</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;cell&quot;; address: { sheet: string; row: number; col: number } }</code></div>
<div class="api-variant"><code>{ kind: &quot;range&quot;; range: Range }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type CommentAnchor = {
    kind: "cell";
    address: {
        sheet: string;
        row: number;
        col: number;
    };
} | {
    kind: "range";
    range: Range;
};
```

</details>
