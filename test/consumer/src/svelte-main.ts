/// <reference types="vite/client" />
import { initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { mount } from "svelte";
import App from "./App.svelte";

// Build-only fixture entry: `vite build` resolves the `svelte` export
// condition, compiles the raw component source from the tarball, and links
// `@sheetwrite/core/adapter`. It is never executed.
await initSheetwrite(wasmUrl);
mount(App, { target: document.getElementById("app")! });
