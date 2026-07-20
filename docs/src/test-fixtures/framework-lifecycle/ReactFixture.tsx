import { SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import { useState } from "react";
import {
  INVALID_WASM_SOURCE,
  LIFECYCLE_DATA,
  LIFECYCLE_RESET_DATA,
  LIFECYCLE_WORKBOOK,
} from "./fixture.js";

export default function ReactFixture() {
  const [wasmSource, setWasmSource] = useState<Uint8Array | undefined>(INVALID_WASM_SOURCE);
  const [data, setData] = useState(LIFECYCLE_DATA);
  const [mounted, setMounted] = useState(true);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errors, setErrors] = useState(0);
  const [ready, setReady] = useState("");

  return (
    <main data-framework-lifecycle="react">
      <button
        type="button"
        data-lifecycle-retry
        onClick={() => {
          setStatus("loading");
          setWasmSource(undefined);
        }}
      >
        Retry React
      </button>
      <button type="button" data-lifecycle-reset onClick={() => setData(LIFECYCLE_RESET_DATA)}>
        Reset React input
      </button>
      <button type="button" data-lifecycle-unmount onClick={() => setMounted(false)}>
        Unmount React
      </button>
      <output data-lifecycle-status>{status}</output>
      <output data-lifecycle-errors>{errors}</output>
      <output data-lifecycle-ready>{ready}</output>
      {mounted ? (
        <SheetwriteGrid
          workbook={LIFECYCLE_WORKBOOK}
          data={data}
          height={320}
          wasmSource={wasmSource}
          fallback={<span data-lifecycle-fallback>React fallback</span>}
          onInitializationError={() => {
            setErrors((count) => count + 1);
            setStatus("error");
          }}
          onReady={({ generation, reason }) => {
            setReady(`${generation}:${reason}`);
            setStatus("ready");
          }}
        />
      ) : null}
    </main>
  );
}
