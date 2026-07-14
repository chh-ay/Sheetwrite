import workerUrl from "@sheetwrite/core/worker?worker&url";

const output = document.createElement("output");
output.textContent = workerUrl;
document.body.append(output);
