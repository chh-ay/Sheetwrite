---
title: "ProtectionRequest | @sheetwrite/core"
description: "Local operation and protected-range context supplied to the host policy."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ProtectionRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Local operation and protected-range context supplied to the host policy.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L161</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="protection-request-protected-range" data-pagefind-weight="1">
<summary><code>protectedRange</code></summary>
<pre><code>protectedRange: Readonly&lt;ProtectedRange&gt;;</code></pre>
</details>

<details class="api-member" id="protection-request-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>
<pre><code>operation: Readonly&lt;DocumentOp&gt;;</code></pre>
</details>

<details class="api-member" id="protection-request-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>
<pre><code>commitReason: CommitReason;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ProtectionRequest {
    protectedRange: Readonly<ProtectedRange>;
    operation: Readonly<DocumentOp>;
    commitReason: CommitReason;
}
```

</details>
