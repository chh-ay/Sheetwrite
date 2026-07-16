---
title: "RecordingContext2D | @sheetwrite/core/testing"
description: "The stub 2D context the canvas test stubs install: every method is a no-op that counts its invocations in calls, so tests can assert paint activity (e.g."
---
<!-- api-export:@sheetwrite/core|./testing|RecordingContext2D -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="interface">interface</span></div>

The stub 2D context the canvas test stubs install: every method is a no-op
that counts its invocations in `calls`, so tests can assert paint activity
(e.g. `ctx.calls.fillText > 0`) without a real canvas.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count">8</span>

<div class="api-member-list">

<details class="api-member" id="recording-context2-d-calls" data-pagefind-weight="1">
<summary><code>calls</code> <span class="api-member-summary">Per-method invocation counts, keyed by the 2D-context method name.</span></summary>

```ts generated
readonly calls: Record<string, number>;
```

</details>

<details class="api-member" id="recording-context2-d-fill-style" data-pagefind-weight="1">
<summary><code>fillStyle</code></summary>

```ts generated
fillStyle: string;
```

</details>

<details class="api-member" id="recording-context2-d-stroke-style" data-pagefind-weight="1">
<summary><code>strokeStyle</code></summary>

```ts generated
strokeStyle: string;
```

</details>

<details class="api-member" id="recording-context2-d-font" data-pagefind-weight="1">
<summary><code>font</code></summary>

```ts generated
font: string;
```

</details>

<details class="api-member" id="recording-context2-d-text-align" data-pagefind-weight="1">
<summary><code>textAlign</code></summary>

```ts generated
textAlign: string;
```

</details>

<details class="api-member" id="recording-context2-d-text-baseline" data-pagefind-weight="1">
<summary><code>textBaseline</code></summary>

```ts generated
textBaseline: string;
```

</details>

<details class="api-member" id="recording-context2-d-line-width" data-pagefind-weight="1">
<summary><code>lineWidth</code></summary>

```ts generated
lineWidth: number;
```

</details>

<details class="api-member" id="recording-context2-d-index" data-pagefind-weight="1">
<summary><code>index</code></summary>

```ts generated
[method: string]: unknown;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RecordingContext2D {
  readonly calls: Record<string, number>;
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  [method: string]: unknown;
}
```

</details>
