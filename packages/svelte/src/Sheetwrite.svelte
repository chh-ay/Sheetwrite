<script lang="ts" generics="Row extends Record<string, CellScalar>">
import type { CellScalar } from "@sheetwrite/core";
import { createSimpleGridInput } from "@sheetwrite/core/adapter";
import GridComponent from "./Grid.svelte";
import type { SheetwriteProps } from "./props.js";

type Props = SheetwriteProps<Row>;

let { columns, defaultRows, sheetName, grid = $bindable(), ...props }: Props = $props();
let input = $derived(createSimpleGridInput({ columns, defaultRows, sheetName }));

$effect(() => {
  if (
    (props.height === undefined && !props.fill) ||
    (props.height !== undefined && props.fill)
  ) {
    throw new Error("Sheetwrite: provide exactly one of height or fill");
  }
});
</script>

<GridComponent {...props} {...input} bind:grid />
