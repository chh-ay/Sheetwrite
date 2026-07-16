---
title: "SyncConnectionState | @sheetwrite/core"
description: "Host-controlled online state reported by synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncConnectionState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Host-controlled online state reported by synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L20</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncConnectionState =
  "offline" | "connecting" | "online" | "error" | "destroyed";
```

</div>
