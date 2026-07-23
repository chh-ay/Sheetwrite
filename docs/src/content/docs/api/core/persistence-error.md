---
title: "PersistenceError | @sheetwrite/core"
description: "Typed failure raised by persistence and synchronization flows."
---
<!-- api-export:@sheetwrite/core|.|PersistenceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed failure raised by persistence and synchronization flows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L34</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="persistence-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "PersistenceError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class PersistenceError extends SheetwriteError {
  constructor(
    code: PersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  name: "PersistenceError";
}
```

</details>
