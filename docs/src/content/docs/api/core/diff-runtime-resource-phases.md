---
title: "diffRuntimeResourcePhases | @sheetwrite/core"
description: "Diff two validated phases of the same operation by exclusive resource owner."
---
<!-- api-export:@sheetwrite/core|.|diffRuntimeResourcePhases -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Diff two validated phases of the same operation by exclusive resource owner.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L379</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function diffRuntimeResourcePhases(
  before: RuntimeResourceSnapshot,
  after: RuntimeResourceSnapshot,
): RuntimeResourcePhaseDelta
```

</div>
