import { initSheetwrite } from "@sheetwrite/core";
// The built WASM binary as a Vite URL asset — the sanctioned non-root import.
import wasmUrl from "@sheetwrite/wasm/wasm?url";

let ready: Promise<void> | null = null;

/**
 * Initialize the WASM engine exactly once for the whole site; every island and
 * page awaits this before creating a grid. Safe to call from any framework.
 */
export function ensureSheetwrite(): Promise<void> {
  if (!ready) ready = initSheetwrite(wasmUrl);
  return ready;
}
