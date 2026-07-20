"use client";

import type { ColumnarData, Grid, Workbook } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useEffect, useRef, useState } from "react";

const workbook: Workbook = {
  activeSheet: "next",
  sheets: [
    {
      id: "next",
      name: "Next",
      rowCount: 2,
      columns: [{ key: "value", header: "Value", width: 120, type: "text" }],
    },
  ],
};
const initialData: ColumnarData = {
  rowCount: 2,
  columns: { value: ["initial", "row 2"] },
};
const replacementData: ColumnarData = {
  rowCount: 2,
  columns: { value: ["replacement", "row 2"] },
};

export default function Page() {
  const [data, setData] = useState(initialData);
  const [mounted, setMounted] = useState(true);
  const [status, setStatus] = useState("loading");
  const gridRef = useRef<Grid | null>(null);
  const readyCount = useRef(0);

  useEffect(() => {
    if (mounted) return;
    if (gridRef.current !== null) throw new Error("Next adapter retained its Grid after unmount");
    if (document.querySelector('[role="grid"]'))
      throw new Error("Next adapter retained mounted DOM");
    setStatus("next ready/edit/reset/unmount passed");
    document.documentElement.dataset.sheetwriteLifecycle = "passed";
  }, [mounted]);

  return (
    <>
      <output data-sheetwrite-status>{status}</output>
      {mounted ? (
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          data={data}
          height={240}
          onReady={(event) => {
            readyCount.current += 1;
            const generation = readyCount.current;
            const expectedReason = generation === 1 ? "initial" : "input-reset";
            if (
              (generation !== 1 && generation !== 2) ||
              event.generation !== generation ||
              event.reason !== expectedReason
            ) {
              throw new Error(`Unexpected Next generation ${event.generation}/${event.reason}`);
            }
            const value = `next-edit-${generation}`;
            const result = event.grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "next", row: 0, col: 0 },
                  value: { kind: "literal", value },
                },
              ],
            });
            if (
              result.status !== "applied" ||
              event.grid.store.getCell({ sheet: "next", row: 0, col: 0 }).resolved !== value
            ) {
              throw new Error("Next mounted adapter edit failed");
            }
            if (generation === 1) setData(replacementData);
            else setMounted(false);
          }}
        />
      ) : null}
    </>
  );
}
