import { initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { mount } from "svelte";
// Built WASM binary, served as a URL asset so the browser can fetch it.
import wasmUrl from "../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm?url";
import App from "./App.svelte";

// WASM must be ready before any grid is created (createGrid is synchronous).
await initSheetwrite(wasmUrl);

const target = document.getElementById("app");
if (!target) throw new Error("missing #app host element");

mount(App, { target });
