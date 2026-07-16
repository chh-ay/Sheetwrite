---
title: "rebaseDocumentOperations | @sheetwrite/core"
description: "Conservative server-ordered rebase for pending offline work."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|rebaseDocumentOperations -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

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
