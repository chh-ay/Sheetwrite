---
title: "RecordingContext2D | @sheetwrite/core/testing"
description: "The stub 2D context the canvas test stubs install: every method is a no-op that counts its invocations in calls, so tests can assert paint activity (e.g."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./testing|RecordingContext2D -->
[← @sheetwrite/core/testing](/docs/api/core-testing/)

<span class="api-status">interface</span>

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
<summary><code>calls</code></summary>
<pre><code>readonly calls: Record&lt;string, number&gt;;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-fill-style" data-pagefind-weight="1">
<summary><code>fillStyle</code></summary>
<pre><code>fillStyle: string;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-stroke-style" data-pagefind-weight="1">
<summary><code>strokeStyle</code></summary>
<pre><code>strokeStyle: string;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-font" data-pagefind-weight="1">
<summary><code>font</code></summary>
<pre><code>font: string;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-text-align" data-pagefind-weight="1">
<summary><code>textAlign</code></summary>
<pre><code>textAlign: string;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-text-baseline" data-pagefind-weight="1">
<summary><code>textBaseline</code></summary>
<pre><code>textBaseline: string;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-line-width" data-pagefind-weight="1">
<summary><code>lineWidth</code></summary>
<pre><code>lineWidth: number;</code></pre>
</details>

<details class="api-member" id="recording-context2-d-index" data-pagefind-weight="1">
<summary><code>index</code></summary>
<pre><code>[method: string]: unknown;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
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
