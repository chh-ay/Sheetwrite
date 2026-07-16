import { initSheetwrite } from "@sheetwrite/core";

/** Initialize the re-entrant WASM engine before creating an imperative grid. */
export function ensureSheetwrite(): Promise<void> {
  return initSheetwrite();
}
