import type { Grid } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  assertUnmounted,
  editReadyGrid,
  initialData,
  passed,
  replacementData,
  workbook,
} from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("React Vite fixture is missing #app");
const host = target;
const root = createRoot(host);
let grid: Grid | null = null;
let readyCount = 0;

function App() {
  const [data, setData] = useState(initialData);
  return createElement(SheetwriteGrid, {
    ref: (value: Grid | null) => {
      grid = value;
    },
    workbook,
    data,
    wasmSource: wasmUrl,
    height: 240,
    onReady(event) {
      readyCount += 1;
      if (readyCount !== 1 && readyCount !== 2) throw new Error("Unexpected React generation");
      editReadyGrid(event, readyCount);
      if (readyCount === 1) {
        setData(replacementData);
        return;
      }
      queueMicrotask(() => {
        root.unmount();
        assertUnmounted(host, grid);
        passed("react");
      });
    },
  });
}

root.render(createElement(App));
