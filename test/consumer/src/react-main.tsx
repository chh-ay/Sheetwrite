import { SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import type { Grid } from "@sheetwrite/core";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  assertReadyAndEdit,
  assertUnmounted,
  initialData,
  markPassed,
  replacementData,
  workbook,
} from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("Packed React consumer is missing #app");
const host = target;

const root = createRoot(host);
let publishedGrid: Grid | null = null;
let readyCount = 0;

function App() {
  const [data, setData] = useState(initialData);
  return (
    <SheetwriteGrid
      ref={(grid) => {
        publishedGrid = grid;
      }}
      workbook={workbook}
      data={data}
      wasmSource={wasmUrl}
      height={240}
      onReady={(event) => {
        readyCount += 1;
        if (readyCount !== 1 && readyCount !== 2) {
          throw new Error(`Packed React consumer published ${readyCount} generations`);
        }
        assertReadyAndEdit(event, readyCount);
        if (readyCount === 1) {
          setData(replacementData);
          return;
        }
        queueMicrotask(() => {
          root.unmount();
          assertUnmounted(host, publishedGrid);
          markPassed("react");
        });
      }}
    />
  );
}

root.render(<App />);
