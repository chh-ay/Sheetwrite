import { fromXlsxWorkbook, toXlsxWorkbook, type WorkbookSnapshot } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/test/xlsx")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: XlsxFixture,
});

const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "calc" },
  sheets: [
    {
      id: "input",
      name: "Input",
      order: 0,
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 21 } }],
        },
      ],
    },
    {
      id: "calc",
      name: "Calc",
      order: 1,
      rowCount: 1,
      columns: [{ key: "result", header: "Result", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "formula", src: "=Input!A1*2" } }],
        },
      ],
    },
  ],
};

function XlsxFixture() {
  const [result, setResult] = useState<{ status: "running" | "ready" | "error"; text: string }>({
    status: "running",
    text: "running",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bytes = await toXlsxWorkbook(snapshot);
        const imported = await fromXlsxWorkbook(bytes);
        const formula = imported.sheets[1]?.cells[0]?.cells[0]?.value;
        if (
          imported.sheets.length !== 2 ||
          formula?.kind !== "formula" ||
          formula.src !== "=Input!A1*2"
        ) {
          throw new Error("Workbook XLSX round-trip changed browser-visible semantics");
        }
        if (!cancelled) {
          setResult({
            status: "ready",
            text: JSON.stringify({ bytes: bytes.byteLength, formula: formula.src }),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            status: "error",
            text: error instanceof Error ? (error.stack ?? error.message) : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="sw-test-fixture">
      <pre id="result" data-status={result.status}>
        {result.text}
      </pre>
    </main>
  );
}
