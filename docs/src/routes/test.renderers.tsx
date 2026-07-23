import {
  type CellPaintContext,
  type CellRenderer,
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/test/renderers")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: RendererFixture,
});

interface LifecycleStats {
  mounts: number;
  updates: number;
  destroys: number;
  live: number;
  generation: number;
  activations: number;
}

interface RendererFixtureApi {
  stats(): LifecycleStats & { nodes: number };
  scroll(top: number, left: number): void;
  edit(value: string): void;
  select(row: number, col: number): void;
  selection(): unknown;
  editTall(value: string, color: string): void;
  styleCollision(): void;
  replace(): void;
  zoom(value: number): void;
  resize(width: number, height: number): void;
  reset(): void;
  destroy(): void;
}

declare global {
  interface Window {
    __sheetwriteRendererFixture?: RendererFixtureApi;
  }
}

const columns = Array.from({ length: 14 }, (_, col) => ({
  key: `c${col}`,
  header: `C${col}`,
  width: 100,
  type: "text" as const,
  renderer: "dom",
  cellStyle: col === 1 ? { backgroundColor: "#ffffff" } : undefined,
}));

function workbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount: 120,
        columns: columns.map((column) => ({ ...column })),
        frozenRows: 1,
        frozenCols: 1,
        merges: [
          { r0: 2, c0: 1, r1: 3, c1: 2 },
          { r0: 20, c0: 1, r1: 70, c1: 2 },
        ],
      },
    ],
  };
}

function data(): ColumnarData {
  const values: Record<string, string[]> = {};
  for (let col = 0; col < columns.length; col++) {
    values[`c${col}`] = Array.from({ length: 120 }, (_, row) => `r${row}c${col}`);
  }
  return { rowCount: 120, columns: values };
}

function renderer(prefix: string, stats: LifecycleStats): CellRenderer {
  const sync = (element: HTMLElement, context: CellPaintContext): void => {
    element.textContent = `${prefix}:${String(context.value ?? "")}`;
    element.dataset.width = String(context.w);
    element.dataset.height = String(context.h);
    element.dataset.color = context.style.color ?? "";
  };
  return {
    dom(context) {
      stats.mounts += 1;
      stats.live += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.style.pointerEvents = "auto";
      button.setAttribute("aria-label", `Rendered ${String(context.value ?? "empty")}`);
      button.addEventListener("click", () => {
        stats.activations += 1;
      });
      sync(button, context);
      return button;
    },
    update(element, context) {
      stats.updates += 1;
      sync(element, context);
    },
    destroy() {
      stats.destroys += 1;
      stats.live -= 1;
    },
  };
}

function RendererFixture() {
  const hostRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let grid: Grid | null = null;
    const stats: LifecycleStats = {
      mounts: 0,
      updates: 0,
      destroys: 0,
      live: 0,
      generation: 0,
      activations: 0,
    };
    let activeRenderer = renderer("first", stats);

    const mount = (): void => {
      grid = createGrid(host, {
        workbook: workbook(),
        data: data(),
        renderers: { dom: activeRenderer },
        overscan: 1,
        config: { toolbar: false, contextMenu: false, find: false },
      });
      stats.generation += 1;
      host.dataset.generation = String(stats.generation);
    };

    void initSheetwrite().then(
      () => {
        if (disposed) return;
        mount();
        window.__sheetwriteRendererFixture = {
          stats: () => ({
            ...stats,
            nodes: host.querySelectorAll(".sheetwrite-dom-cell").length,
          }),
          scroll(top, left) {
            const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
            if (!scroller || !grid) throw new Error("renderer fixture is not mounted");
            scroller.scrollTop = top;
            scroller.scrollLeft = left;
            scroller.dispatchEvent(new Event("scroll"));
            grid.refresh();
          },
          select(row, col) {
            if (!grid) throw new Error("renderer fixture is not mounted");
            grid.setSelection({ kind: "cell", addr: { sheet: "s1", row, col } });
          },
          selection() {
            if (!grid) throw new Error("renderer fixture is not mounted");
            return grid.getSelection();
          },
          editTall(value, color) {
            if (!grid) throw new Error("renderer fixture is not mounted");
            grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "s1", row: 20, col: 1 },
                  value: { kind: "literal", value },
                  style: { color },
                },
              ],
            });
          },
          styleCollision() {
            if (!grid) throw new Error("renderer fixture is not mounted");
            grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "s1", row: 0, col: 1 },
                  value: { kind: "literal", value: "frozen-style" },
                  style: { color: "#aa0000" },
                },
                {
                  op: "set",
                  addr: { sheet: "s1", row: 1, col: 1 },
                  value: { kind: "literal", value: "body-style" },
                  style: { color: "#0000aa" },
                },
              ],
            });
          },
          edit(value) {
            if (!grid) throw new Error("renderer fixture is not mounted");
            grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "s1", row: 2, col: 1 },
                  value: { kind: "literal", value },
                },
              ],
            });
          },
          replace() {
            if (!grid) throw new Error("renderer fixture is not mounted");
            activeRenderer = renderer("second", stats);
            grid.defineCellRenderer("dom", activeRenderer);
          },
          zoom(value) {
            if (!grid) throw new Error("renderer fixture is not mounted");
            grid.setZoom(value);
          },
          resize(width, height) {
            host.style.width = `${width}px`;
            host.style.height = `${height}px`;
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
        };
        setStatus("ready");
      },
      () => {
        if (!disposed) setStatus("error");
      },
    );

    return () => {
      disposed = true;
      window.__sheetwriteRendererFixture = undefined;
      grid?.destroy();
    };
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <output data-status={status} id="renderer-status">
        {status}
      </output>
      <section
        aria-label="DOM renderer browser fixture"
        ref={hostRef}
        style={{ height: 280, marginTop: 8, width: 560 }}
      />
    </main>
  );
}
