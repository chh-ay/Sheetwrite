import {
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

declare global {
  interface Window {
    __sheetwriteFirstPaint?: {
      grid: Grid;
      readyMs: number;
      surface: readonly ["createGrid", "initSheetwrite"];
    };
  }
}

const workbook: Workbook = {
  activeSheet: "first-paint",
  sheets: [
    {
      id: "first-paint",
      name: "First paint",
      rowCount: 3,
      columns: [
        { key: "name", header: "Name", width: 160, type: "text" },
        { key: "amount", header: "Amount", width: 120, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 3,
  columns: {
    name: ["Alpha", "Beta", "Gamma"],
    amount: new Float64Array([1, 2, 3]),
  },
};

await initSheetwrite();
const host = document.createElement("div");
host.dataset.sheetwriteFirstPaintHost = "";
host.style.cssText = "width:640px;height:320px";
document.body.append(host);
const grid = createGrid(host, {
  data,
  workbook,
  config: { contextMenu: false, find: false, toolbar: false },
});
await new Promise<void>((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
);
window.__sheetwriteFirstPaint = {
  grid,
  readyMs: performance.now(),
  surface: ["createGrid", "initSheetwrite"],
};
