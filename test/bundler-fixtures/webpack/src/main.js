import "@sheetwrite/core";

const wasmUrl = new URL("@sheetwrite/wasm/wasm", import.meta.url);
const worker = new Worker(new URL("@sheetwrite/core/worker", import.meta.url), { type: "module" });
console.log(wasmUrl.href, worker);
