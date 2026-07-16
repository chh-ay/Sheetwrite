import type { ColumnarData, Workbook } from "@sheetwrite/core";

export const LIFECYCLE_CELL = "Lifecycle Cell";

export const LIFECYCLE_WORKBOOK: Workbook = {
  activeSheet: "lifecycle",
  sheets: [
    {
      id: "lifecycle",
      name: "Lifecycle",
      rowCount: 3,
      columns: [{ key: "value", header: "Value", width: 180, type: "text" }],
    },
  ],
};

export const LIFECYCLE_DATA: ColumnarData = {
  rowCount: 3,
  columns: { value: [LIFECYCLE_CELL, "Retry ready", "Canvas painted"] },
};

export const INVALID_WASM_SOURCE = new Uint8Array([0]);
