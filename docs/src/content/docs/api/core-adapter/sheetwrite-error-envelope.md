---
title: "SheetwriteErrorEnvelope | @sheetwrite/core/adapter"
description: "Structural form preserved across realms and JSON serialization."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteErrorEnvelope -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Structural form preserved across realms and JSON serialization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L95</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-error-envelope-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
readonly message: string;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
readonly code: SheetwriteErrorCode;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: SheetwriteErrorOperation;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-context" data-pagefind-weight="1">
<summary><code>context</code></summary>

```ts generated
readonly context?: SheetwriteErrorContext;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-retryable" data-pagefind-weight="1">
<summary><code>retryable</code></summary>

```ts generated
readonly retryable?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteErrorEnvelope {
  readonly name: string;
  readonly message: string;
  readonly code: SheetwriteErrorCode;
  readonly operation: SheetwriteErrorOperation;
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;
}
```

</details>
