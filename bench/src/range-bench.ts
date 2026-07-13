import { readFileSync } from "node:fs";
import type { Column, DocumentOp, Range, Workbook } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import { initSync } from "@sheetwrite/wasm";
import { COLUMNS, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import { summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const SHEET = "range-bench";
const ROW_COUNTS = [100_000, 1_000_000] as const;
const ITERATIONS = 3;

interface Result {
  rows: number;
  workload: string;
  medianMs: number;
  p95Ms: number;
  heapDeltaBytes: number;
  wasmDeltaBytes: number;
  documentBytes: number;
  historyBytes: number;
}

function workbook(rowCount: number): Workbook {
  const columns: Column[] = COLUMNS.map((column) => ({ ...column }));
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Range Bench", rowCount, columns }],
  };
}

function measure(operation: () => void): { medianMs: number; p95Ms: number } {
  operation();
  const samples: number[] = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  const stat = summarize(samples);
  return { medianMs: stat.median, p95Ms: stat.p95 };
}

function jsonBytes(operation: DocumentOp): number {
  return new TextEncoder().encode(JSON.stringify(operation)).byteLength;
}

function profile(
  rows: number,
  workload: string,
  wasmMemory: WebAssembly.Memory,
  operation: () => void,
  documentBytes: number,
  historyBytes: number,
): Result {
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const wasmBefore = wasmMemory.buffer.byteLength;
  const timing = measure(operation);
  Bun.gc(true);
  return {
    rows,
    workload,
    ...timing,
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    wasmDeltaBytes: wasmMemory.buffer.byteLength - wasmBefore,
    documentBytes,
    historyBytes,
  };
}

function runSize(rows: number, wasmMemory: WebAssembly.Memory): Result[] {
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  const resumeDirtyTracking = store.suspendDirtyTracking();
  const results: Result[] = [];
  const wholeColumn: Range = {
    sheet: SHEET,
    start: { row: 0, col: 0 },
    end: { row: rows - 1, col: 0 },
  };
  const style: DocumentOp = { op: "setRangeStyle", range: wholeColumn, style: { bold: true } };
  const resetStyle: DocumentOp = { op: "setRangeStyle", range: wholeColumn, style: null };
  results.push(
    profile(
      rows,
      "style populated column",
      wasmMemory,
      () => {
        store.applyTransaction({ patches: [style] });
        store.applyTransaction({ patches: [resetStyle] });
      },
      jsonBytes(style),
      0,
    ),
  );

  const clearSnapshot = store.captureRangeHistory(wholeColumn)!;
  const clear: DocumentOp = {
    op: "clearRange",
    range: wholeColumn,
    contents: true,
    style: false,
  };
  const restoreClear = clearSnapshot.toDocumentOp(wholeColumn);
  results.push(
    profile(
      rows,
      "clear populated column",
      wasmMemory,
      () => {
        store.applyTransaction({ patches: [clear] });
        store.applyTransaction({ patches: [restoreClear] });
      },
      jsonBytes(clear),
      clearSnapshot.byteLength,
    ),
  );
  clearSnapshot.dispose();

  const pasteCells = 100_000;
  const pasteValues = Array.from({ length: pasteCells }, (_, index) => index + 0.5);
  const pasteRange: Range = {
    sheet: SHEET,
    start: { row: 0, col: 1 },
    end: { row: pasteCells - 1, col: 1 },
  };
  const paste: DocumentOp = {
    op: "setBlock",
    range: pasteRange,
    block: { rowCount: pasteCells, colCount: 1, values: pasteValues },
  };
  const clearPaste: DocumentOp = { op: "clearRange", range: pasteRange };
  results.push(
    profile(
      rows,
      "paste 100K-cell block",
      wasmMemory,
      () => {
        store.applyTransaction({ patches: [paste] });
        store.applyTransaction({ patches: [clearPaste] });
      },
      jsonBytes(paste),
      0,
    ),
  );

  const removeColumn: DocumentOp = { op: "removeColumns", sheet: SHEET, at: 0, count: 1 };
  results.push(
    profile(
      rows,
      "remove and undo populated column",
      wasmMemory,
      () => {
        const snapshot = store.captureRangeHistory(wholeColumn)!;
        store.applyTransaction({ patches: [removeColumn] });
        store.applyTransaction({
          patches: [
            { op: "addColumns", sheet: SHEET, at: 0, columns: [{ ...COLUMNS[0]! }] },
            snapshot.toDocumentOp(wholeColumn),
          ],
        });
        snapshot.dispose();
      },
      jsonBytes(removeColumn),
      rows * 13,
    ),
  );

  const removedRows = Math.min(10_000, rows);
  const rowRange: Range = {
    sheet: SHEET,
    start: { row: 0, col: 0 },
    end: { row: removedRows - 1, col: COLUMNS.length - 1 },
  };
  const removeRows: DocumentOp = { op: "removeRows", sheet: SHEET, at: 0, count: removedRows };
  results.push(
    profile(
      rows,
      "remove and undo 10K rows",
      wasmMemory,
      () => {
        const snapshot = store.captureRangeHistory(rowRange)!;
        store.applyTransaction({ patches: [removeRows] });
        store.applyTransaction({
          patches: [
            { op: "addRows", sheet: SHEET, at: 0, count: removedRows },
            snapshot.toDocumentOp(rowRange),
          ],
        });
        snapshot.dispose();
      },
      jsonBytes(removeRows),
      removedRows * COLUMNS.length * 13,
    ),
  );

  resumeDirtyTracking();
  store.dispose();
  return results;
}

const bytes = readFileSync(WASM_PATH);
await initSheetwrite(bytes);
const wasm = initSync({ module: bytes });
const results = ROW_COUNTS.flatMap((rows) => runSize(rows, wasm.memory));
console.log(
  "| rows | workload | median ms | p95 ms | JS heap Δ | WASM Δ | document bytes | history bytes |",
);
console.log("|---:|:--|---:|---:|---:|---:|---:|---:|");
for (const result of results) {
  console.log(
    `| ${result.rows.toLocaleString()} | ${result.workload} | ${result.medianMs.toFixed(2)} | ${result.p95Ms.toFixed(2)} | ${result.heapDeltaBytes} | ${result.wasmDeltaBytes} | ${result.documentBytes} | ${result.historyBytes} |`,
  );
}
console.log(JSON.stringify(results));
