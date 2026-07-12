import "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import wasmUrl from "@sheetwrite/wasm/wasm?url";

const output = document.createElement("pre");
output.textContent = JSON.stringify({ wasmUrl, workerUrl });
document.body.append(output);
