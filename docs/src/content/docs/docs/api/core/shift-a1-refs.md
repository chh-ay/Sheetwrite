---
title: "shiftA1Refs | @sheetwrite/core"
description: "Shift relative A1 references in a formula by (dRow, dCol) — used when a formula is filled into other cells."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|shiftA1Refs -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Shift relative A1 references in a formula by (dRow, dCol) — used when a
formula is filled into other cells. Absolute parts ($A, A$1) stay fixed, and
tokens preceded by an alphanumeric (function names, identifiers) are skipped.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/a1.ts#L46</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(src: string, dRow: number, dCol: number): string => ;
```
