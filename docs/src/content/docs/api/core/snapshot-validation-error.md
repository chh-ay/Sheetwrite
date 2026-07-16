---
title: "SnapshotValidationError | @sheetwrite/core"
description: "Path-qualified schema failure found while validating an untrusted snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Path-qualified schema failure found while validating an untrusted snapshot.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L27</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(errors: readonly DocumentValidationError[]);
```

</details>

<details class="api-member" id="snapshot-validation-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "invalid-snapshot";
```

</details>

<details class="api-member" id="snapshot-validation-error-errors" data-pagefind-weight="1">
<summary><code>errors</code></summary>

```ts generated
errors: readonly DocumentValidationError[]
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class SnapshotValidationError extends Error {
  constructor(errors: readonly DocumentValidationError[]);
  code: "invalid-snapshot";
  errors: readonly DocumentValidationError[];
}
```

</details>
