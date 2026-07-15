export type { CellScalar, Grid } from "@sheetwrite/core";
export type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";
export type { SheetwriteGridProps } from "./Grid.svelte";
export { default as SheetwriteGrid } from "./Grid.svelte";
export type { SheetwriteProps } from "./Sheetwrite.svelte";
/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns reset and
 * teardown through the component lifecycle. Bind `grid` to access the live `Grid`; use
 * `SheetwriteGrid` when the host already owns a workbook or datasource.
 */
export { default as Sheetwrite } from "./Sheetwrite.svelte";
