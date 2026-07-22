---
title: "resolveHyperlinkTarget | @sheetwrite/core"
description: "Revalidate at the final activation boundary; hosts never receive an unsafe URL."
---
<!-- api-export:@sheetwrite/core|.|resolveHyperlinkTarget -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Revalidate at the final activation boundary; hosts never receive an unsafe URL.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/hyperlink.ts#L288</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function resolveHyperlinkTarget(
  workbook: Workbook,
  target: HyperlinkTarget,
): ResolvedHyperlinkTarget
```

</div>
