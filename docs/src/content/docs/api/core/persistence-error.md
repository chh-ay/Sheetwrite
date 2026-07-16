---
title: "PersistenceError | @sheetwrite/core"
description: "Typed failure raised by persistence and synchronization flows."
---
<!-- api-export:@sheetwrite/core|.|PersistenceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed failure raised by persistence and synchronization flows.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L20</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="persistence-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: PersistenceErrorCode
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class PersistenceError extends Error {
    constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions);
    code: PersistenceErrorCode;
}
```

</details>
