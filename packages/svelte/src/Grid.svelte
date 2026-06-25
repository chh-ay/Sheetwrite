<script lang="ts">
import {
  type ChangeEvent,
  createGridController,
  type Grid,
  type GridController,
  type GridControllerHandlers,
  type GridOptions,
  type Selection,
} from "@sheetwrite/core";
import { untrack } from "svelte";

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
  /** Bound to the imperative core grid after creation (`bind:grid`). */
  grid?: Grid;
  /** Fired once with the grid after it is created. */
  onReady?: (grid: Grid) => void;
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
  grid = $bindable(),
  onReady,
}: Props = $props();

let host: HTMLDivElement;

// The controller owns the imperative core grid. Kept in reactive state so the
// theme effect re-targets the new grid after a workbook-driven recreation.
let controller: GridController | undefined = $state();

// Read live on every event, so swapped prop callbacks are honored without
// recreating the grid.
const handlers: GridControllerHandlers = {
  onChange: (event) => onChange?.(event),
  onSelectionChange: (selection) => onSelectionChange?.(selection),
  onReady: (created) => onReady?.(created),
};

// Owns the host div: creates the imperative core grid through the shared
// controller, forwards events, recreates it whenever the workbook identity
// changes, and tears it down on unmount. It renders no cells. Call
// `await initSheetwrite(wasmUrl)` once before mounting (WASM must be ready).
$effect(() => {
  // Track only the workbook identity; the remaining options are read untracked
  // so theme/data updates never rebuild the grid.
  const activeWorkbook = workbook;
  const active = untrack(() =>
    createGridController(
      host,
      { workbook: activeWorkbook, data, datasource, renderer, theme, readOnly, config },
      handlers,
    ),
  );
  controller = active;
  grid = active.grid;

  return () => {
    active.destroy();
    controller = undefined;
    grid = undefined;
  };
});

$effect(() => {
  if (theme) controller?.setTheme(theme);
});
</script>

<div bind:this={host}></div>
