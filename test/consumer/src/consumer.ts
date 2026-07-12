import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Worker from "@sheetwrite/core/worker";
import * as Xlsx from "@sheetwrite/core/xlsx";
import * as ReactAdapter from "@sheetwrite/react";
import * as SvelteAdapter from "@sheetwrite/svelte";
import * as VueAdapter from "@sheetwrite/vue";
import * as Wasm from "@sheetwrite/wasm";

const publicEntries: readonly Record<string, unknown>[] = [
  Core,
  Adapter,
  Shell,
  Worker,
  Xlsx,
  ReactAdapter,
  SvelteAdapter,
  VueAdapter,
  Wasm,
];

if (publicEntries.some((entry) => Object.keys(entry).length === 0)) {
  throw new Error("A public package entry has no declarations");
}
