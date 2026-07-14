---
title: "SyncCoordinator | @sheetwrite/core"
description: "Deterministic, transport-neutral optimistic sync."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinator -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">class</span>

Deterministic, transport-neutral optimistic sync. Local rendering is never
blocked: changes queue immediately, while hosts explicitly call `sendNext`
or `retry` to perform network work.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L102</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
class SyncCoordinator {
}
```

</details>
