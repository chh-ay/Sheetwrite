import type { DataSource, RowData, Workbook } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { createRoot } from "react-dom/client";
import wasmUrl from "../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm" with { type: "file" };

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

createRoot(host).render(
  <SheetwriteGrid
    workbook={workbook}
    datasource={datasource}
    renderer="canvas"
    style={{ height: "100%" }}
    onChange={(e) => console.log("change", e.changes.length)}
  />,
);
