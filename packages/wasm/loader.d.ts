export * from "./pkg/sheetwrite_wasm.js";

/**
 * Initialize the WASM module. Idempotent; safe to await repeatedly.
 * When `source` is omitted the loader picks the right strategy for the runtime.
 */
export declare function load(
 source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>;
