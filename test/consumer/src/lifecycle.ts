import type { ColumnarData, Grid, Workbook } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";

export const workbook: Workbook = {
  activeSheet: "packed",
  sheets: [
    {
      id: "packed",
      name: "Packed consumer",
      rowCount: 2,
      columns: [{ key: "value", header: "Value", width: 140, type: "text" }],
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

export function assertReadyAndEdit(event: GridReadyEvent, expectedGeneration: 1 | 2): void {
  const expectedReason = expectedGeneration === 1 ? "initial" : "input-reset";
  if (event.generation !== expectedGeneration || event.reason !== expectedReason) {
    throw new Error(
      `Unexpected generation ${event.generation}/${event.reason}; expected ${expectedGeneration}/${expectedReason}`,
    );
  }

  const value = `edited-${expectedGeneration}`;
  const result = event.grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "packed", row: 0, col: 0 },
        value: { kind: "literal", value },
      },
    ],
  });
  if (result.status !== "applied") {
    throw new Error(`Packed consumer edit was ${result.status}`);
  }
  if (event.grid.store.getCell({ sheet: "packed", row: 0, col: 0 }).resolved !== value) {
    throw new Error("Packed consumer edit did not reach the mounted Grid");
  }
}

export function markPassed(framework: "react" | "vue" | "svelte"): void {
  document.documentElement.dataset.sheetwriteLifecycle = "passed";
  const marker = document.createElement("div");
  marker.dataset.packedStatus = framework;
  marker.textContent = `${framework} ready/edit/reset/unmount passed`;
  document.body.append(marker);
}

export function assertUnmounted(target: HTMLElement, grid: Grid | null | undefined): void {
  if (grid != null) throw new Error("Packed adapter kept its Grid after unmount");
  if (target.childElementCount !== 0)
    throw new Error("Packed adapter left mounted DOM after unmount");
}
