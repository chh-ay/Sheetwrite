---
title: "@sheetwrite/core/testing"
description: "API reference for @sheetwrite/core/testing."
---
<span class="api-status" data-status="test-only">test-only</span>

**Testing-only public entry point.** Import this entry point as `@sheetwrite/core/testing`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/testing.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>3</dd></div>
</dl>

Source entry: `packages/core/src/testing.ts`

## Exported symbols

### Functions <span class="api-count">1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-testing/install-canvas-test-stubs/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>installCanvasTestStubs</code></span><span class="api-symbol-card__desc">Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom) needs before createGrid can mount — without them the renderer throws &quot;Sheetwrite: 2D canvas context is unavailable&quot;.</span></a>
</div>

### Interfaces <span class="api-count">2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-testing/canvas-test-stub-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CanvasTestStubOptions</code></span><span class="api-symbol-card__desc">Layout dimensions installed by installCanvasTestStubs in DOM test environments.</span></a>
<a class="api-symbol-card" href="/docs/api/core-testing/recording-context2-d/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>RecordingContext2D</code></span><span class="api-symbol-card__desc">The stub 2D context the canvas test stubs install: every method is a no-op that counts its invocations in calls, so tests can assert paint activity (e.g.</span></a>
</div>
