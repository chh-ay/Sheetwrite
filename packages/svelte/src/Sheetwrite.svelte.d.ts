import type { CellScalar } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";
/** Simple framework component that owns initialization and Grid lifetime. */
declare const Sheetwrite: Component<SheetwriteProps<Record<string, CellScalar>>, {}, "grid">;
export default Sheetwrite;
