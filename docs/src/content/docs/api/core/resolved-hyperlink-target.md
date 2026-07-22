---
title: "ResolvedHyperlinkTarget | @sheetwrite/core"
description: "Host-safe target resolved immediately before hyperlink activation."
---
<!-- api-export:@sheetwrite/core|.|ResolvedHyperlinkTarget -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Host-safe target resolved immediately before hyperlink activation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/hyperlink.ts#L283</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ readonly kind: "external"; readonly href: string }
```

</div>
<div class="api-variant">

```ts generated
{ readonly kind: "internal"; readonly address: CellAddress }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ResolvedHyperlinkTarget =
  | {
      readonly kind: "external";
      readonly href: string;
    }
  | {
      readonly kind: "internal";
      readonly address: CellAddress;
    };
```

</details>
