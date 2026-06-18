import type { DataSource, RowData, Workbook } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
// Built WASM binary, bundled as a file asset so the browser can fetch it.
import wasmUrl from "../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm" with { type: "file" };
import "@sheetwrite/core/styles.css";

const ROWS = 100_000;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: ROWS,
      columns: [
        { key: "id", header: "ID", width: 90, type: "number" },
        { key: "date", header: "Date", width: 120, type: "text" },
        { key: "customer", header: "Customer", width: 240, type: "text" },
        { key: "city", header: "City", width: 160, type: "text" },
        { key: "amount", header: "Amount", width: 140, type: "number" },
      ],
    },
  ],
};

// A mock server-paged datasource: rows are synthesized on demand for the
// requested window, exactly as a real API client would page them in.
const datasource: DataSource = {
  rowCount: () => ROWS,
  getRows: async (_sheet, start, end) => {
    const rows: RowData[] = [];
    for (let r = start; r < end; r++) {
      const day = new Date(Date.UTC(2020, 0, 1 + (r % 1000)));
      rows.push({
        id: r + 1,
        date: day.toISOString().slice(0, 10),
        customer: `Customer ${String(r + 1).padStart(6, "0")}`,
        city: CITIES[r % CITIES.length] ?? "",
        amount: Math.round((Math.sin(r) * 0.5 + 0.5) * 1_000_000) / 100,
      });
    }
    return rows;
  },
};

await initSheetwrite(wasmUrl);

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const useWorker = new URLSearchParams(location.search).get("renderer") === "worker";
const grid = createGrid(host, {
  workbook,
  datasource,
  renderer: useWorker ? "worker" : "canvas",
  config: { toolbar: true },
});
grid.on("selection", (e) => {
  if (e.selection) console.log("selection", e.selection);
});

// expose for manual poking in the console
(globalThis as unknown as { grid: typeof grid }).grid = grid;
