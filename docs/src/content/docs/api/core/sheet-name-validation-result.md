---
title: "SheetNameValidationResult | @sheetwrite/core"
description: "Successful canonical name or an actionable validation failure."
---
<!-- api-export:@sheetwrite/core|.|SheetNameValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful canonical name or an actionable validation failure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sheet-name.ts#L18</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly ok: true;
  readonly name: string;
  readonly key: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly ok: false;
  readonly code: SheetNameIssueCode;
  readonly name: string;
  readonly key: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SheetNameValidationResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly key: string;
    }
  | {
      readonly ok: false;
      readonly code: SheetNameIssueCode;
      readonly name: string;
      readonly key: string;
    };
```

</details>
