"use client";

import {
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import { useEffect, useRef } from "react";

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

export default function Page() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) throw new Error("First-paint fixture host is unavailable");
    let cancelled = false;
    let grid: Grid | undefined;
    void (async () => {
      await initSheetwrite();
      if (cancelled) return;
      grid = createGrid(host, {
        data,
        workbook,
        config: { contextMenu: false, find: false, toolbar: false },
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (cancelled) return;
      window.__sheetwriteFirstPaint = {
        grid,
        readyMs: performance.now(),
        surface: ["createGrid", "initSheetwrite"],
      };
    })();
    return () => {
      cancelled = true;
      grid?.destroy();
      delete window.__sheetwriteFirstPaint;
    };
  }, []);
  return <div data-sheetwrite-first-paint-host ref={hostRef} style={{ height: 320, width: 640 }} />;
}
