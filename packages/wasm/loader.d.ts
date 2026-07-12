export * from "./pkg/sheetwrite_wasm.js";

/**
 * Initialize the WASM module. Idempotent and re-entrant: concurrent
 * same-source callers share one in-flight init; a concurrent different-source
 * call rejects; a different-source call after success warns and no-ops; a
 * rejected init is retryable. When `source` is omitted the loader picks the
 * right strategy for the runtime.
 */
export declare function load(
 source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>;

/** Whether the WASM module has finished initializing. */
export declare function isLoaded(): boolean;
