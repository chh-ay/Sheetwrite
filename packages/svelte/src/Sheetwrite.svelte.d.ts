import type { CellScalar } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";
/** Owns a sheet derived from `columns` and `defaultRows`. Bind `grid` for imperative access; it clears on reset or unmount. */
declare const Sheetwrite: Component<SheetwriteProps<Record<string, CellScalar>>, {}, "grid">;
export default Sheetwrite;
