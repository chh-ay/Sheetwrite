import {
  type CellEditor,
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/test/semantic-grid")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: SemanticGridFixture,
});

interface EditorStats {
  mounts: number;
  aborts: number;
  destroys: number;
}

interface SemanticGridFixtureApi {
  begin(row: number, col: number): void;
  select(rowStart: number, rowEnd: number, col: number): void;
  toggleBold(): void;
  setReadOnly(value: boolean): void;
  reset(): void;
  destroy(): void;
  stats(): EditorStats;
}

declare global {
  interface Window {
    __sheetwriteSemanticGridFixture?: SemanticGridFixtureApi;
  }
}

function workbook(): Workbook {
  return {
    activeSheet: "people",
    sheets: [
      {
        id: "people",
        name: "People",
        rowCount: 2,
        columns: [
          { key: "name", header: "Customer name", width: 180, type: "text" },
          {
            key: "status",
            header: "Account status",
            width: 160,
            type: "text",
            editor: "status",
          },
        ],
      },
    ],
  };
}

function data(): ColumnarData {
  return {
    rowCount: 2,
    columns: { name: ["Alice", "Bob"], status: ["Prospect", "Active"] },
  };
}

function statusEditor(stats: EditorStats): CellEditor {
  return {
    mount(host, context) {
      stats.mounts += 1;
      context.signal.addEventListener("abort", () => {
        stats.aborts += 1;
      });
      const input = document.createElement("input");
      input.value = context.text;
      host.appendChild(input);
      return {
        update(next) {
          input.setAttribute("aria-label", next.label);
        },
        reposition(rect) {
          input.style.width = `${rect.width}px`;
        },
        async commit() {
          await Promise.resolve();
          return input.value;
        },
        cancel() {},
        destroy() {
          stats.destroys += 1;
          input.remove();
        },
      };
    },
  };
}

function SemanticGridFixture() {
  const hostRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let grid: Grid | null = null;
    const stats: EditorStats = { mounts: 0, aborts: 0, destroys: 0 };
    const mount = (): void => {
      grid = createGrid(host, {
        workbook: workbook(),
        data: data(),
        presentation: "data-grid",
        editors: { status: statusEditor(stats) },
        config: { find: false, contextMenu: false },
      });
    };

    void initSheetwrite().then(
      () => {
        if (disposed) return;
        mount();
        window.__sheetwriteSemanticGridFixture = {
          begin(row, col) {
            grid?.beginEdit(row, col);
          },
          select(rowStart, rowEnd, col) {
            grid?.setSelection({
              kind: "range",
              range: {
                sheet: "people",
                start: { row: rowStart, col },
                end: { row: rowEnd, col },
              },
            });
          },
          toggleBold() {
            grid?.actions.toggleBold();
          },
          setReadOnly(value) {
            grid?.setReadOnly(value);
          },
          reset() {
            grid?.destroy();
            grid = null;
            mount();
          },
          destroy() {
            grid?.destroy();
            grid = null;
          },
          stats: () => ({ ...stats }),
        };
        setStatus("ready");
      },
      () => {
        if (!disposed) setStatus("error");
      },
    );

    return () => {
      disposed = true;
      window.__sheetwriteSemanticGridFixture = undefined;
      grid?.destroy();
    };
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <output data-status={status} id="semantic-grid-status">
        {status}
      </output>
      <section
        aria-label="Semantic data grid browser fixture"
        ref={hostRef}
        style={{ height: 260, marginTop: 8, width: 520 }}
      />
    </main>
  );
}
