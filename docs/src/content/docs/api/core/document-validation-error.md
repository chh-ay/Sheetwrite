---
title: "DocumentValidationError | @sheetwrite/core"
description: "Path-qualified validation failure for a document operation."
---
<!-- api-export:@sheetwrite/core|.|DocumentValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Path-qualified validation failure for a document operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L182</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="document-validation-error-path" data-pagefind-weight="1">
<summary><code>path</code></summary>

```ts generated
path: string;
```

</details>

<details class="api-member" id="document-validation-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: | "unsupported-schema" | "invalid-value" | "duplicate-id" | "missing-reference" | "out-of-bounds" | "overlapping-merge" | "non-serializable" | "resource-limit";
```

</details>

<details class="api-member" id="document-validation-error-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DocumentValidationError {
  path: string;
  code:
    | "unsupported-schema"
    | "invalid-value"
    | "duplicate-id"
    | "missing-reference"
    | "out-of-bounds"
    | "overlapping-merge"
    | "non-serializable"
    | "resource-limit";
  message: string;
}
```

</details>
