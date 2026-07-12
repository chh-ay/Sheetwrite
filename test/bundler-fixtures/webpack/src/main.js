import { initSheetwrite } from "@sheetwrite/core";

await initSheetwrite();
const worker = new Worker(new URL("@sheetwrite/core/worker", import.meta.url), { type: "module" });
console.log(worker);
