---
title: "CommentMutation | @sheetwrite/core"
description: "Serializable operation that creates or updates comment state."
---
<!-- api-export:@sheetwrite/core|.|CommentMutation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable operation that creates or updates comment state.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L428</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "create";
  threadId: string;
  messageId: string;
  anchor: CommentAnchor;
  body: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "reply";
  threadId: string;
  messageId: string;
  body: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ kind: "resolve"; threadId: string; resolved: boolean }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentMutation =
  | {
      kind: "create";
      threadId: string;
      messageId: string;
      anchor: CommentAnchor;
      body: string;
    }
  | {
      kind: "reply";
      threadId: string;
      messageId: string;
      body: string;
    }
  | {
      kind: "resolve";
      threadId: string;
      resolved: boolean;
    };
```

</details>
