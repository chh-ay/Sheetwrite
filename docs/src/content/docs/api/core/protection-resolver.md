---
title: "ProtectionResolver | @sheetwrite/core"
description: "Host-owned client UX permission callback for protected mutations."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ProtectionResolver -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Host-owned client UX permission callback for protected mutations.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L168</code></dd></div>
</dl>

## Signature

```ts generated
export type ProtectionResolver = (request: ProtectionRequest) => "allow" | "deny";
```
