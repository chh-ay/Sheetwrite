---
title: "CommentCoordinator | @sheetwrite/core"
description: "Transport/auth-neutral comment state with server-owned author and timestamp fields."
---
<!-- api-export:@sheetwrite/core|.|CommentCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Transport/auth-neutral comment state with server-owned author and timestamp fields.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L458</code></dd></div>
</dl>

## Members <span class="api-count">10</span>

<div class="api-member-list">

<details class="api-member" id="comment-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);
```

</details>

<details class="api-member" id="comment-coordinator-comment-threads" data-pagefind-weight="1">
<summary><code>commentThreads</code></summary>

```ts generated
commentThreads: () => readonly CommentThread[];
```

</details>

<details class="api-member" id="comment-coordinator-create" data-pagefind-weight="1">
<summary><code>create</code></summary>

```ts generated
create: (threadId: string, messageId: string, anchor: CommentAnchor, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="comment-coordinator-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: () => Promise<readonly CommentThread[]>;
```

</details>

<details class="api-member" id="comment-coordinator-mutate" data-pagefind-weight="1">
<summary><code>mutate</code></summary>

```ts generated
mutate: (mutation: CommentMutation, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: CommentListener) => () => void;
```

</details>

<details class="api-member" id="comment-coordinator-reply" data-pagefind-weight="1">
<summary><code>reply</code></summary>

```ts generated
reply: (threadId: string, messageId: string, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-resolve" data-pagefind-weight="1">
<summary><code>resolve</code></summary>

```ts generated
resolve: (threadId: string, resolved: boolean, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class CommentCoordinator {
    constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);
    commentThreads: () => readonly CommentThread[];
    create: (threadId: string, messageId: string, anchor: CommentAnchor, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
    destroy: () => void;
    load: () => Promise<readonly CommentThread[]>;
    mutate: (mutation: CommentMutation, clientMutationId: string) => Promise<CommentMutationResponse>;
    on: (listener: CommentListener) => () => void;
    reply: (threadId: string, messageId: string, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
    resolve: (threadId: string, resolved: boolean, clientMutationId: string) => Promise<CommentMutationResponse>;
    serverVersion: number;
}
```

</details>
