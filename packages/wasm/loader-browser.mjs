import { createLoader } from "./loader-state.mjs";
import init from "./pkg/sheetwrite_wasm.js";

export * from "./pkg/sheetwrite_wasm.js";

const loader = createLoader(async (source) => {
  if (source === undefined) {
    await init();
    return;
  }
  await init({ module_or_path: source });
});

export const { load, isLoaded } = loader;
