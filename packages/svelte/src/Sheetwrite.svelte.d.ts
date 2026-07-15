import type { CellScalar } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";
/** Convenience component for local object rows. Bind `grid` to access the live `Grid`. */
declare const Sheetwrite: Component<SheetwriteProps<Record<string, CellScalar>>, {}, "grid">;
export default Sheetwrite;
