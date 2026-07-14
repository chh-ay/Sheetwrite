# Bundler fixtures

Run from the repository root:

```sh
bun run verify:bundlers
```

The orchestrator stages and packs publishable package contents, rewrites workspace dependency ranges, removes stale fixture installations, installs the fresh tarballs, and runs each real production build. Fixture manifests pin Vite 7.2.2, webpack 5.102.1, and Next.js 15.5.9.

Verified contracts:

- Vite builds separate core, React, Vue, Svelte, Worker, and lazy XLSX entries; initializes core with `await initSheetwrite()`; and emits the co-located WASM asset.
- Vite's emitted browser JavaScript is scanned and fails if it contains `node:fs`, `node:fs/promises`, or `fs/promises`.
- webpack 5 initializes with no explicit WASM URL and builds without `IgnorePlugin`.
- Next.js initializes from a client component and builds without `IgnorePlugin`.
- Browser fixtures continue to verify the worker asset recipes they exercise.
- Each build writes normalized, exact-once asset ownership to `test-results/delivery-size/bundlers/`; the delivery-size gate derives initial, Worker, XLSX, CSS, and WASM transfer metrics from those manifests rather than chunk names.
- Node/Bun lifecycle tests verify zero-argument Node initialization and explicit-source retry behavior.

The package export boundary selects `loader-browser.mjs` for browser-aware bundlers and `loader-node.mjs` for Node. `@sheetwrite/wasm/wasm` remains available for explicit asset-control fixtures, but it is not the ordinary startup path.

Fixture installs are deliberately fresh. Reusing `node_modules` with an unchanged local tarball filename can make npm retain stale package contents and produce a false browser-graph failure.
