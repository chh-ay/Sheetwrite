---
title: "SyncProtocolError | @sheetwrite/core"
description: "Typed rejection of malformed or resource-exhausting synchronization input."
---
<!-- api-export:@sheetwrite/core|.|SyncProtocolError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed rejection of malformed or resource-exhausting synchronization input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L172</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-protocol-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: SyncProtocolErrorCode, message: string);
```

</details>

<details class="api-member" id="sync-protocol-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: SyncProtocolErrorCode;
```

</details>

<details class="api-member" id="sync-protocol-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SyncProtocolError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SyncProtocolError extends Error {
  constructor(code: SyncProtocolErrorCode, message: string);
  code: SyncProtocolErrorCode;
  name: "SyncProtocolError";
}
```

</details>
