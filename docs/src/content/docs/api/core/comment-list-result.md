---
title: "CommentListResult | @sheetwrite/core"
description: "Versioned comment-thread listing returned by a host adapter."
---
<!-- api-export:@sheetwrite/core|.|CommentListResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Versioned comment-thread listing returned by a host adapter.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L418</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="comment-list-result-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="comment-list-result-threads" data-pagefind-weight="1">
<summary><code>threads</code></summary>

```ts generated
threads: readonly CommentThread[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentListResult {
  version: number;
  threads: readonly CommentThread[];
}
```

</details>
