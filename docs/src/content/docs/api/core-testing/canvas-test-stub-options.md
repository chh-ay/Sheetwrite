---
title: "CanvasTestStubOptions | @sheetwrite/core/testing"
description: "Layout dimensions installed by installCanvasTestStubs in DOM test environments."
---
<!-- api-export:@sheetwrite/core|./testing|CanvasTestStubOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="interface">interface</span></div>

Layout dimensions installed by [`installCanvasTestStubs`](/docs/api/core-testing/install-canvas-test-stubs/) in DOM test environments.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L21</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="canvas-test-stub-options-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Stubbed clientWidth for every element (happy-dom/jsdom have no layout).</span></summary>

```ts generated
width?: number;
```

<p class="api-member-doc">Stubbed `clientWidth` for every element (happy-dom/jsdom have no layout). Default 800.</p>
</details>

<details class="api-member" id="canvas-test-stub-options-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Stubbed clientHeight for every element.</span></summary>

```ts generated
height?: number;
```

<p class="api-member-doc">Stubbed `clientHeight` for every element. Default 400.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CanvasTestStubOptions {
  width?: number;
  height?: number;
}
```

</details>
