---
title: "CommentListResult | @sheetwrite/core"
description: "Versioned comment-thread listing returned by a host adapter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentListResult -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Versioned comment-thread listing returned by a host adapter.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L418</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="comment-list-result-version" data-pagefind-weight="1">
<summary><code>version</code></summary>
<pre><code>version: number;</code></pre>
</details>

<details class="api-member" id="comment-list-result-threads" data-pagefind-weight="1">
<summary><code>threads</code></summary>
<pre><code>threads: readonly CommentThread[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CommentListResult {
    version: number;
    threads: readonly CommentThread[];
}
```

</details>
