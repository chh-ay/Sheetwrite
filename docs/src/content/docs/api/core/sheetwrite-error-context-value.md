---
title: "SheetwriteErrorContextValue | @sheetwrite/core"
description: "JSON-safe values accepted in a public failure context."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorContextValue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

JSON-safe values accepted in a public failure context.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L83</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
null
```

</div>
<div class="api-variant">

```ts generated
string
```

</div>
<div class="api-variant">

```ts generated
number
```

</div>
<div class="api-variant">

```ts generated
boolean
```

</div>
<div class="api-variant">

```ts generated
readonly SheetwriteErrorContextValue[]
```

</div>
<div class="api-variant">

```ts generated
{ readonly [key: string]: SheetwriteErrorContextValue }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SheetwriteErrorContextValue =
  | null
  | string
  | number
  | boolean
  | readonly SheetwriteErrorContextValue[]
  | {
      readonly [key: string]: SheetwriteErrorContextValue;
    };
```

</details>
