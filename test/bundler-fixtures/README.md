# Bundler fixtures

These fixtures install packed `@sheetwrite/core` and `@sheetwrite/wasm` tarballs, rather than workspace links, so package export maps are exercised exactly as they are by npm consumers. Run `bun run verify:bundlers` from the repository root before a release. The orchestrator stages publishable package contents, rewrites the unpublished `workspace:*` dependency in the staged core manifest, packs both packages with `bun pm pack`, then runs each fixture sequentially.

- **Vite** verifies `import wasmUrl from "@sheetwrite/wasm/wasm?url"` and `import workerUrl from "@sheetwrite/core/worker?worker&url"`. Both recipes emit production assets.
- **webpack 5** verifies `new URL("@sheetwrite/wasm/wasm", import.meta.url)` and `new Worker(new URL("@sheetwrite/core/worker", import.meta.url))`. Both bare package export specifiers are rewritten and emitted. The config ignores the guarded, browser-inaccessible dynamic `node:fs/promises` import in the core WASM loader; without that browser-safe exclusion, webpack fails while traversing the required `@sheetwrite/core` import with `UnhandledSchemeError: Reading from "node:fs/promises" is not handled by plugins (Unhandled scheme)`.
- **Next.js (webpack)** verifies the same WASM `new URL` recipe in a client component. It uses the same browser-only ignore for the guarded Node import. Worker emission is intentionally not covered by this fixture.

## Verified recipes

- **VERIFIED — Vite WASM `?url`:** `dist/assets/sheetwrite_wasm_bg-CQjOHlan.wasm`
- **VERIFIED — Vite worker `?worker&url`:** `dist/recipe-worker-WgsaYGM2.js` (the required core import also emits `dist/assets/worker-8xTgaCDv.js`)
- **VERIFIED — webpack WASM `new URL`:** `dist/assets/sheetwrite_wasm_bg-a6d405e7d78bad8cf7ce.wasm`
- **VERIFIED — webpack `new Worker(new URL(...))`:** `dist/worker-878-709bf0c55317a1eb3824.js`
- **VERIFIED — Next.js WASM `new URL`:** `.next/static/media/sheetwrite_wasm_bg.4bd0260b.wasm` (also present in `.next/server/chunks/static/media/`)

Nuxt and SvelteKit are skipped because their asset handling uses the same Vite-family pipeline already covered by the Vite fixture.

Each fixture can also be run independently with `npm run build` after the orchestrator has created `test/bundler-fixtures/.packed`. Its check prints the emitted WASM and, where applicable, worker paths and fails if an expected asset is absent.
