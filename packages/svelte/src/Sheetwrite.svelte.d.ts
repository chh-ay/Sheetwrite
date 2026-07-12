import type { CellScalar } from "@sheetwrite/core";
import type { Component } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";
declare const Sheetwrite: Component<SheetwriteProps<Record<string, CellScalar>>, {}, "grid">;
export default Sheetwrite;
