export * from "./pkg/sheetwrite_wasm.js";

/** Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled `WebAssembly.Module`. */
export type { InitInput } from "./pkg/sheetwrite_wasm.js";

/** Result of module initialization: the instantiated exports plus the shared linear memory. */
export type { InitOutput } from "./pkg/sheetwrite_wasm.js";

/** Sources accepted by synchronous initialization: raw module bytes or a precompiled `WebAssembly.Module`. */
export type { SyncInitInput } from "./pkg/sheetwrite_wasm.js";

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
