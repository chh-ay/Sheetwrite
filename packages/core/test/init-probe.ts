// Init-semantics probe, run by init.test.ts in a FRESH bun process (loader
// state is module-global, so pre-init and failure-path assertions cannot run
// inside the shared `bun test` process where sibling suites already
// initialized WASM). Prints a JSON result object; the test asserts on it.
//
// Modes:
//   lifecycle — pre-init guards, concurrent init semantics, post-success calls
//   retry     — a failing first source rejects, then a corrected init succeeds
import { initSheetwrite, isSheetwriteReady, SheetwriteStore } from "../src/index.js";
import type { Workbook } from "../src/types.js";

const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    },
  ],
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function lifecycle(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  result.readyBefore = isSheetwriteReady();
  try {
    new SheetwriteStore(workbook);
    result.preInitStore = "constructed";
  } catch (error) {
    result.preInitStore = errorMessage(error);
  }

  // Fire everything before awaiting: while the first call's initialization is
  // in flight, a same-source call shares it (both fulfill) and a
  // different-source call rejects.
  const first = initSheetwrite();
  const sameSourceWhileInFlight = initSheetwrite();
  const second = initSheetwrite("https://example.invalid/x.wasm").then(
    () => "fulfilled",
    (error: unknown) => errorMessage(error),
  );
  await Promise.all([first, sameSourceWhileInFlight]);
  result.concurrentSameSource = "fulfilled";
  result.concurrentDifferentSource = await second;

  result.readyAfter = isSheetwriteReady();

  // Repeat calls after success stay no-op fulfillments.
  await Promise.all([initSheetwrite(), initSheetwrite()]);
  result.repeatFulfilled = true;

  // Different source AFTER success warns and keeps the first module.
  await initSheetwrite("https://example.invalid/late.wasm");
  result.postSuccessDifferentSource = "fulfilled";

  result.storeAfter = new SheetwriteStore(workbook) instanceof SheetwriteStore;
  return result;
}

async function retry(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  result.firstFailure = await initSheetwrite("https://example.invalid/broken.wasm").then(
    () => "fulfilled",
    (error: unknown) => `rejected: ${errorMessage(error)}`,
  );
  result.readyAfterFailure = isSheetwriteReady();

  // The rejected init cleared the in-flight cache: a corrected call succeeds.
  await initSheetwrite();
  result.readyAfterRetry = isSheetwriteReady();
  return result;
}

const mode = process.argv[2];
const result = mode === "retry" ? await retry() : await lifecycle();
console.log(JSON.stringify(result));
