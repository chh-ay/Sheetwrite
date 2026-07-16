---
title: "Sheetwrite | @sheetwrite/react"
description: "Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/react|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. It derives a single-sheet workbook from
`columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
use `SheetwriteGrid` when the host already owns a workbook or datasource.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L275</code></dd></div>
</dl>

## Declaration

```ts generated
function Sheetwrite<Row extends Record<string, CellScalar>>(
  props: SheetwriteProps<Row> & {
    ref?: ForwardedRef<Grid>;
  },
): ReactElement
```
