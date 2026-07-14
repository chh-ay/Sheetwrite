import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/shell.css";
import "@sheetwrite/core/styles.css";

await initSheetwrite();
const host = document.createElement("div");
document.body.append(host);
createGrid(host, { data: {} as never, workbook: {} as never });
