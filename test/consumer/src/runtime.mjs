import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Xlsx from "@sheetwrite/core/xlsx";
import * as ReactAdapter from "@sheetwrite/react";
import * as VueAdapter from "@sheetwrite/vue";
import { load } from "@sheetwrite/wasm";

const entries = {
  "@sheetwrite/core": Core,
  "@sheetwrite/core/xlsx": Xlsx,
  "@sheetwrite/core/adapter": Adapter,
  "@sheetwrite/core/shell": Shell,
  "@sheetwrite/react": ReactAdapter,
  "@sheetwrite/vue": VueAdapter,
};

for (const [name, entry] of Object.entries(entries)) {
  if (Object.keys(entry).length === 0) {
    throw new Error(`${name} has no runtime exports`);
  }
}

await load();

const cssUrl = import.meta.resolve("@sheetwrite/core/styles.css");
const css = await readFile(fileURLToPath(cssUrl), "utf8");
if (!css.includes(".sheetwrite")) {
  throw new Error("The packed core stylesheet is missing Sheetwrite rules");
}

const shellCssUrl = import.meta.resolve("@sheetwrite/core/shell.css");
const shellCss = await readFile(fileURLToPath(shellCssUrl), "utf8");
if (!shellCss.includes(".sheetwrite-shell")) {
  throw new Error("The packed shell stylesheet is missing shell rules");
}

const wasmUrl = import.meta.resolve("@sheetwrite/wasm/wasm");
const wasm = await readFile(fileURLToPath(wasmUrl));
if (wasm.length < 8 || wasm.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("The packed WASM export is not a WebAssembly binary");
}

console.log("Packed runtime, CSS, and WASM checks passed");
