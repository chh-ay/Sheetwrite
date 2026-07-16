---
title: "installCanvasTestStubs | @sheetwrite/core/testing"
description: "Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom) needs before createGrid can mount — without them the renderer throws \"Sheetwrite: 2D canvas context is unavailable\"."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./testing|installCanvasTestStubs -->
[← @sheetwrite/core/testing](/docs/api/core-testing/)

<span class="api-status">function</span>

Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom)
needs before `createGrid` can mount — without them the renderer throws
`"Sheetwrite: 2D canvas context is unavailable"`. Returns a restore
function that undoes every patch.

The installed `getContext("2d")` returns a per-canvas
[`RecordingContext2D`](/docs/api/core-testing/recording-context2-d/); re-request it from a mounted canvas to assert
paint activity. Nothing is painted — assert grid STATE, not pixels.
Test-only: never import from production code.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L72</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(options?: CanvasTestStubOptions): () => void => ;
```
