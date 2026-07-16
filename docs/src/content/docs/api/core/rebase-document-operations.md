---
title: "rebaseDocumentOperations | @sheetwrite/core"
description: "Conservative server-ordered rebase for pending offline work."
---
<!-- api-export:@sheetwrite/core|.|rebaseDocumentOperations -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Conservative server-ordered rebase for pending offline work. Non-overlapping
literal edits are shifted across row/column insertion and deletion. Ambiguous
formula, overlapping, sheet-lifecycle, and move cases become explicit
conflicts instead of lossy guesses. This is the collaboration design gate;
no CRDT dependency is required for the supported cases.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L46</code></dd></div>
</dl>

## Signature

```ts generated
function rebaseDocumentOperations(localOperations: readonly DocumentOp[], remoteOperations: readonly DocumentOp[]): DocumentRebaseResult;
```
