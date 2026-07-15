import type { CellScalar } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";
/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns reset and
 * teardown through the component lifecycle. Bind `grid` to access the live `Grid`; use
 * `SheetwriteGrid` when the host already owns a workbook or datasource.
 */
declare const Sheetwrite: Component<SheetwriteProps<Record<string, CellScalar>>, {}, "grid">;
export default Sheetwrite;
