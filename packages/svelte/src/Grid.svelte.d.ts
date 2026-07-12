// Ambient declaration so `tsc` can resolve `./Grid.svelte` from index.ts when
// typechecking this package in isolation. Consumers' Svelte tooling resolves
// the real `.svelte` source directly (the package ships SOURCE, not a build).
import type { ChangeEvent, Grid, GridEvents, GridOptions, Selection } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

export interface SheetwriteGridProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  datasource?: GridOptions["datasource"];
  renderer?: GridOptions["renderer"];
  workerUrl?: GridOptions["workerUrl"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  renderers?: GridOptions["renderers"];
  overscan?: GridOptions["overscan"];
  minColumns?: GridOptions["minColumns"];
  config?: GridOptions["config"];
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onScroll?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  /** Bound to the imperative core grid after creation (`bind:grid`). */
  grid?: Grid;
  /** Fired once with the grid after it is created. */
  onReady?: (grid: Grid) => void;
}

declare const SheetwriteGrid: Component<SheetwriteGridProps, {}, "grid">;
export default SheetwriteGrid;
