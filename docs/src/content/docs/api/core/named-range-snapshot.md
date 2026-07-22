---
title: "NamedRangeSnapshot | @sheetwrite/core"
description: "Workbook-global or sheet-scoped named range used by formulas and persistence."
---
<!-- api-export:@sheetwrite/core|.|NamedRangeSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook-global or sheet-scoped named range used by formulas and persistence.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L93</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="named-range-snapshot-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="named-range-snapshot-scope" data-pagefind-weight="1">
<summary><code>scope</code> <span class="api-member-summary">Formula-context sheet whose local definition shadows the workbook definition.</span></summary>

```ts generated
scope?: SheetId;
```

</details>

<details class="api-member" id="named-range-snapshot-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface NamedRangeSnapshot {
  name: string;
  scope?: SheetId;
  range: Range;
}
```

</details>
