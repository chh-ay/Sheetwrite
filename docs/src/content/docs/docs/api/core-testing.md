---
title: "@sheetwrite/core/testing"
description: "API reference for @sheetwrite/core/testing."
tableOfContents: false
---
<span class="api-status">test-only</span>

**Testing-only public entry point.** Import this entry point as `@sheetwrite/core/testing`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/testing.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>3</dd></div>
</dl>

Source entry: `packages/core/src/testing.ts`

## Exported symbols

### Functions <span class="api-count">1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-testing/install-canvas-test-stubs/"><code>installCanvasTestStubs</code><span>Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom) needs before createGrid can mount — without them the renderer throws &quot;Sheetwrite: 2D canvas context is unavailable&quot;.</span></a>
</div>

### Interfaces <span class="api-count">2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-testing/canvas-test-stub-options/"><code>CanvasTestStubOptions</code><span>Layout dimensions installed by installCanvasTestStubs in DOM test environments.</span></a>
<a class="api-symbol-card" href="/docs/api/core-testing/recording-context2-d/"><code>RecordingContext2D</code><span>The stub 2D context the canvas test stubs install: every method is a no-op that counts its invocations in calls, so tests can assert paint activity (e.g.</span></a>
</div>
