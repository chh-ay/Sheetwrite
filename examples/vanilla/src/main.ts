import type { DataSource, RowData, Workbook } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
// Built WASM binary, bundled as a file asset so the browser can fetch it.
import wasmUrl from "../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm" with { type: "file" };
import "@sheetwrite/core/styles.css";

const DATA_ROWS = 100_000;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];

// The column chrome shows spreadsheet letters (A, B, C, …). Named field headers
// live in the first row — styled by the consumer, exactly as in a real sheet.
const FIELD_HEADERS = ["ID", "Date", "Customer", "City", "Amount"];

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: DATA_ROWS + 1,
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

let headerScheduled = false;

// A mock server-paged datasource: rows are synthesized on demand for the
// requested window, exactly as a real API client would page them in. Row 0 is
// reserved for the field-name header (data records start at row 1).
const datasource: DataSource = {
  rowCount: () => DATA_ROWS + 1,
  getRows: async (_sheet, start, end) => {
    const rows: RowData[] = [];
    for (let r = start; r < end; r++) {
      if (r === 0) {
        rows.push({ id: 0, date: "", customer: "", city: "", amount: 0 });
        continue;
      }
      const i = r - 1;
      const day = new Date(Date.UTC(2020, 0, 1 + (i % 1000)));
      rows.push({
        id: i + 1,
        date: day.toISOString().slice(0, 10),
        customer: `Customer ${String(i + 1).padStart(6, "0")}`,
        city: CITIES[i % CITIES.length] ?? "",
        amount: Math.round((Math.sin(i) * 0.5 + 0.5) * 1_000_000) / 100,
      });
    }

    // Row 0 is loaded exactly once; assert the styled header over it after the
    // initial load settles so it is not clobbered by the bulk row write.
    if (start === 0 && !headerScheduled) {
      headerScheduled = true;
      setTimeout(applyFieldHeader, 0);
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

function applyFieldHeader(): void {
  grid.store.applyTransaction({
    patches: FIELD_HEADERS.map((label, col) => ({
      op: "set",
      addr: { sheet: "sales", row: 0, col },
      value: { kind: "literal", value: label },
      style: { bold: true, align: "center", backgroundColor: "#eef1f5" },
    })),
  });
}

grid.on("selection", (e) => {
  if (e.selection) console.log("selection", e.selection);
});

// expose for manual poking in the console
(globalThis as unknown as { grid: typeof grid }).grid = grid;
