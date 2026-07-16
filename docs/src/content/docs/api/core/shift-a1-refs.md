---
title: "shiftA1Refs | @sheetwrite/core"
description: "Shift relative A1 references in a formula by (dRow, dCol) — used when a formula is filled into other cells."
---
<!-- api-export:@sheetwrite/core|.|shiftA1Refs -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Shift relative A1 references in a formula by (dRow, dCol) — used when a
formula is filled into other cells. Absolute parts ($A, A$1) stay fixed, and
tokens preceded by an alphanumeric (function names, identifiers) are skipped.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/a1.ts#L46</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function shiftA1Refs(src: string, dRow: number, dCol: number): string
```

</div>
