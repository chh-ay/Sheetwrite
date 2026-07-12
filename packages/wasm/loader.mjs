// Environment-aware initializer for the Rust/WASM data engine.
//
// The crate is built once for the `web` target. In Node (tests, SSR) the binary
// is read from disk and instantiated synchronously; in the browser the default
// initializer fetches the co-located `.wasm`. All of that complexity is hidden
// here so the core package just does `await load()` and then uses the classes.

import init, { initSync } from "./pkg/sheetwrite_wasm.js";

export * from "./pkg/sheetwrite_wasm.js";

let ready = false;
/** @type {Promise<void> | null} in-flight initialization, shared by concurrent callers */
let inFlight = null;
/** @type {unknown} the source of the in-flight/completed init (first caller wins) */
let inFlightSource;

function isNode() {
  return (
    typeof process !== "undefined" && process.versions != null && process.versions.node != null
  );
}

/**
 * Initialize the WASM module. Idempotent and re-entrant:
 * - concurrent same-source callers share one in-flight initialization;
 * - a concurrent call with a DIFFERENT source rejects (loud config bug);
 * - a different-source call after success warns and keeps the first module;
 * - a rejected init clears the cache, so a corrected source can retry.
 *
 * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
 *   Optional explicit module source. When omitted the loader picks the right
 *   strategy for the current runtime.
 * @returns {Promise<void>}
 */
export async function load(source) {
  if (ready) {
    if (source !== undefined && source !== inFlightSource) {
      console.warn(
        "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
      );
    }
    return;
  }

  if (inFlight) {
    if (source !== undefined && source !== inFlightSource) {
      throw new Error(
        "Sheetwrite: concurrent load() with a different source while initialization is in flight",
      );
    }
    return inFlight;
  }

  inFlightSource = source;
  inFlight = (async () => {
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
  })();

  try {
    await inFlight;
    ready = true;
  } catch (error) {
    // A rejected init must be retryable with a corrected source.
    inFlight = null;
    inFlightSource = undefined;
    throw error;
  }
}

/**
 * Whether the WASM module has finished initializing.
 *
 * @returns {boolean}
 */
export function isLoaded() {
  return ready;
}
