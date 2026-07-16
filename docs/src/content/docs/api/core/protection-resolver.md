---
title: "ProtectionResolver | @sheetwrite/core"
description: "Host-owned client UX permission callback for protected mutations."
---
<!-- api-export:@sheetwrite/core|.|ProtectionResolver -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Host-owned client UX permission callback for protected mutations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L168</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type ProtectionResolver = (
  request: ProtectionRequest,
) => "allow" | "deny";
```

</div>
