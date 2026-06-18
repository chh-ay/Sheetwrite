// Environment-aware initializer for the Rust/WASM data engine.
//
// The crate is built once for the `web` target. In Node (tests, SSR) the binary
// is read from disk and instantiated synchronously; in the browser the default
// initializer fetches the co-located `.wasm`. All of that complexity is hidden
// here so the core package just does `await load()` and then uses the classes.

import init, { initSync } from "./pkg/sheetwrite_wasm.js";

export * from "./pkg/sheetwrite_wasm.js";

let ready = false;

function isNode() {
  return (
    typeof process !== "undefined" && process.versions != null && process.versions.node != null
  );
}

/**
 * Initialize the WASM module. Idempotent; safe to await repeatedly.
 *
 * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
 *   Optional explicit module source. When omitted the loader picks the right
 *   strategy for the current runtime.
 * @returns {Promise<void>}
 */
export async function load(source) {
  if (ready) return;
  if (source !== undefined) {
    await init({ module_or_path: source });
  } else if (isNode()) {
    // Dynamic: node:fs/promises is Node-only; a static import would break the browser bundle.
    const { readFile } = await import("node:fs/promises");
    const url = new URL("./pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
    initSync({ module: await readFile(url) });
  } else {
    await init();
  }
  ready = true;
}
