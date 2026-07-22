---
title: "SnapshotValidationError | @sheetwrite/core"
description: "Path-qualified schema failure found while validating an untrusted snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Path-qualified schema failure found while validating an untrusted snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L235</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(errors: readonly DocumentValidationError[]);
```

</details>

<details class="api-member" id="snapshot-validation-error-errors" data-pagefind-weight="1">
<summary><code>errors</code></summary>

```ts generated
errors: readonly DocumentValidationError[];
```

</details>

<details class="api-member" id="snapshot-validation-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SnapshotValidationError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SnapshotValidationError extends SheetwriteError {
  constructor(errors: readonly DocumentValidationError[]);
  errors: readonly DocumentValidationError[];
  name: "SnapshotValidationError";
}
```

</details>
