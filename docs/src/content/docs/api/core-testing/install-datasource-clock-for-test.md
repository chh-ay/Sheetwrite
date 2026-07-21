---
title: "installDatasourceClockForTest | @sheetwrite/core/testing"
description: "Installs a deterministic monotonic clock through the public testing entrypoint."
---
<!-- api-export:@sheetwrite/core|./testing|installDatasourceClockForTest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="function">function</span></div>

Installs a deterministic monotonic clock through the public testing entrypoint.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/datasource-controller.ts#L18</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function installDatasourceClockForTest(now: () => number): () => void
```

</div>
