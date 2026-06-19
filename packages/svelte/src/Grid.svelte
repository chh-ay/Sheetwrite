<script lang="ts">
import {
  type ChangeEvent,
  createGrid,
  type Grid,
  type GridOptions,
  type Selection,
} from "@sheetwrite/core";
import { onMount } from "svelte";

interface Props {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  datasource?: GridOptions["datasource"];
  renderer?: GridOptions["renderer"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  config?: GridOptions["config"];
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

let {
  workbook,
  data,
  datasource,
  renderer = "canvas",
  theme,
  readOnly,
  config,
  onChange,
  onSelectionChange,
}: Props = $props();

let host: HTMLDivElement;
let grid: Grid | undefined;

// Owns the host div: creates the imperative core grid on mount, forwards
// events, and tears it down on unmount. It renders no cells. Call
// `await initSheetwrite(wasmUrl)` once before mounting (WASM must be ready).
onMount(() => {
  grid = createGrid(host, { workbook, data, datasource, renderer, theme, readOnly, config });
  const offs = [
    grid.on("change", (e) => onChange?.(e)),
    grid.on("selection", (e) => onSelectionChange?.(e.selection)),
  ];
  return () => {
    for (const off of offs) off();
    grid?.destroy();
    grid = undefined;
  };
});

$effect(() => {
  if (theme) grid?.setTheme(theme);
});
</script>

<div bind:this={host}></div>
