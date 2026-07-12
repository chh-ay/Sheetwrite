import { initSheetwrite } from "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import { Sheetwrite as ReactSheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import { Sheetwrite as SvelteSheetwrite } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
import { Sheetwrite as VueSheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";

await initSheetwrite();
const output = document.createElement("pre");
output.textContent = JSON.stringify({
  ready: true,
  workerUrl,
  adapters: [typeof ReactSheetwrite, typeof VueSheetwrite, typeof SvelteSheetwrite],
});
document.body.append(output);
