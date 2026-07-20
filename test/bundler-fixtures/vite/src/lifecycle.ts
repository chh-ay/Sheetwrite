import type { ColumnarData, Grid, Workbook } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";

export const workbook: Workbook = {
  activeSheet: "fixture",
  sheets: [
    {
      id: "fixture",
      name: "Fixture",
      rowCount: 2,
      columns: [{ key: "value", header: "Value", width: 120, type: "text" }],
    },
  ],
};
export const initialData: ColumnarData = {
  rowCount: 2,
  columns: { value: ["initial", "row 2"] },
};
export const replacementData: ColumnarData = {
  rowCount: 2,
  columns: { value: ["replacement", "row 2"] },
};

export function editReadyGrid(event: GridReadyEvent, expectedGeneration: 1 | 2): void {
  const reason = expectedGeneration === 1 ? "initial" : "input-reset";
  if (event.generation !== expectedGeneration || event.reason !== reason) {
    throw new Error(`Unexpected lifecycle generation ${event.generation}/${event.reason}`);
  }
  const value = `vite-edit-${expectedGeneration}`;
  const result = event.grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "fixture", row: 0, col: 0 },
        value: { kind: "literal", value },
      },
    ],
  });
  if (result.status !== "applied") throw new Error(`Vite fixture edit was ${result.status}`);
  if (event.grid.store.getCell({ sheet: "fixture", row: 0, col: 0 }).resolved !== value) {
    throw new Error("Vite fixture edit did not reach the Grid");
  }
}

export function passed(framework: "react" | "vue" | "svelte"): void {
  document.documentElement.dataset.sheetwriteLifecycle = "passed";
  document.body.textContent = `${framework} ready/edit/reset/unmount passed`;
}

export function assertUnmounted(target: HTMLElement, grid: Grid | null | undefined): void {
  if (grid != null) throw new Error("Vite fixture retained its Grid after unmount");
  if (target.childElementCount !== 0) throw new Error("Vite fixture retained mounted DOM");
}
