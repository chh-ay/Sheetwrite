---
title: "SheetwriteError | @sheetwrite/core/adapter"
description: "Canonical envelope for thrown and callback-delivered Sheetwrite failures."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="class">class</span></div>

Canonical envelope for thrown and callback-delivered Sheetwrite failures.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L112</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: SheetwriteErrorCode, operation: SheetwriteErrorOperation, message: string, options?: SheetwriteErrorOptions);
```

</details>

<details class="api-member" id="sheetwrite-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "aborted" | "blocked" | "initialization-failed" | "initialization-required" | "datasource-request-failed" | "renderer-fallback" | "export-failed" | "xlsx-import-failed" | "optional-backend-unavailable" | "delimited-text-resource-limit" | "delimited-text-invalid-limit" | "xlsx-resource-limit" | "resource-limit" | "invalid-snapshot" | "not-found" | "commit-rejected" | "unavailable" | "quota" | "unsupported-schema" | "transaction" | "conflict" | "limit" | "invalid-limits" | "invalid-version" | "invalid-id" | "invalid-operations" | "operation-limit" | "payload-limit" | "response-id-mismatch" | "future-distance-limit" | "buffer-count-limit" | "buffer-operation-limit" | "buffer-byte-limit" | "pending-count-limit" | "pending-operation-limit" | "pending-byte-limit" | "late-echo" | "remote-operations-rejected" | "pending-capacity" | "presence-failed" | "revision-failed" | "comment-failed" | "sync-failed" | "sync-storage-failed" | "incomplete-data" | "xlsx-invalid-options";
```

</details>

<details class="api-member" id="sheetwrite-error-context" data-pagefind-weight="1">
<summary><code>context</code></summary>

```ts generated
context?: Readonly<Record<string, SheetwriteErrorContextValue>> | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheetwrite-error-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
operation: "initialize" | "create-grid" | "datasource-request" | "renderer-worker" | "export-xlsx" | "xlsx-import" | "xlsx-export" | "delimited-parse" | "delimited-import" | "delimited-encode" | "delimited-export" | "delimited-options" | "snapshot-validate" | "snapshot-allocate" | "persistence" | "pending-storage" | "synchronize" | "presence" | "revision" | "comments" | "query";
```

</details>

<details class="api-member" id="sheetwrite-error-retryable" data-pagefind-weight="1">
<summary><code>retryable</code></summary>

```ts generated
retryable?: boolean | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-to-json" data-pagefind-weight="1">
<summary><code>toJSON</code></summary>

```ts generated
toJSON: () => SheetwriteErrorEnvelope
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SheetwriteError extends Error implements SheetwriteErrorEnvelope {
  constructor(
    code: SheetwriteErrorCode,
    operation: SheetwriteErrorOperation,
    message: string,
    options?: SheetwriteErrorOptions,
  );
  code:
    | "aborted"
    | "blocked"
    | "initialization-failed"
    | "initialization-required"
    | "datasource-request-failed"
    | "renderer-fallback"
    | "export-failed"
    | "xlsx-import-failed"
    | "optional-backend-unavailable"
    | "delimited-text-resource-limit"
    | "delimited-text-invalid-limit"
    | "xlsx-resource-limit"
    | "resource-limit"
    | "invalid-snapshot"
    | "not-found"
    | "commit-rejected"
    | "unavailable"
    | "quota"
    | "unsupported-schema"
    | "transaction"
    | "conflict"
    | "limit"
    | "invalid-limits"
    | "invalid-version"
    | "invalid-id"
    | "invalid-operations"
    | "operation-limit"
    | "payload-limit"
    | "response-id-mismatch"
    | "future-distance-limit"
    | "buffer-count-limit"
    | "buffer-operation-limit"
    | "buffer-byte-limit"
    | "pending-count-limit"
    | "pending-operation-limit"
    | "pending-byte-limit"
    | "late-echo"
    | "remote-operations-rejected"
    | "pending-capacity"
    | "presence-failed"
    | "revision-failed"
    | "comment-failed"
    | "sync-failed"
    | "sync-storage-failed"
    | "incomplete-data"
    | "xlsx-invalid-options";
  context?: Readonly<Record<string, SheetwriteErrorContextValue>> | undefined;
  name: string;
  operation:
    | "initialize"
    | "create-grid"
    | "datasource-request"
    | "renderer-worker"
    | "export-xlsx"
    | "xlsx-import"
    | "xlsx-export"
    | "delimited-parse"
    | "delimited-import"
    | "delimited-encode"
    | "delimited-export"
    | "delimited-options"
    | "snapshot-validate"
    | "snapshot-allocate"
    | "persistence"
    | "pending-storage"
    | "synchronize"
    | "presence"
    | "revision"
    | "comments"
    | "query";
  retryable?: boolean | undefined;
  toJSON: () => SheetwriteErrorEnvelope;
}
```

</details>
