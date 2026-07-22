---
title: "WorkbookTableNameValidationResult | @sheetwrite/core"
description: "Result of validating and NFC-normalizing a workbook table name."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableNameValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Result of validating and NFC-normalizing a workbook table name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L40</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ ok: true; name: string }
```

</div>
<div class="api-variant">

```ts generated
{ ok: false; code: WorkbookTableNameIssueCode }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type WorkbookTableNameValidationResult =
  | {
      ok: true;
      name: string;
    }
  | {
      ok: false;
      code: WorkbookTableNameIssueCode;
    };
```

</details>
