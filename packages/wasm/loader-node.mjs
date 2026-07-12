import { readFile } from "node:fs/promises";
import { createLoader } from "./loader-state.mjs";
import init, { initSync } from "./pkg/sheetwrite_wasm.js";

export * from "./pkg/sheetwrite_wasm.js";

const loader = createLoader(async (source) => {
  if (source !== undefined) {
    await init({ module_or_path: source });
    return;
  }

  const url = new URL("./pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
  initSync({ module: await readFile(url) });
});

export const { load, isLoaded } = loader;
