// Ambient declaration so `tsc` can resolve `./Grid.svelte` from index.ts when
// typechecking this package in isolation. Consumers' Svelte tooling resolves
// the real `.svelte` source directly (the package ships SOURCE, not a build).
import type { ChangeEvent, GridOptions, Selection } from "@sheetwrite/core";
import type { Component } from "svelte";

export interface SheetwriteGridProps {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  datasource?: GridOptions["datasource"];
  renderer?: GridOptions["renderer"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

declare const SheetwriteGrid: Component<SheetwriteGridProps>;
export default SheetwriteGrid;
