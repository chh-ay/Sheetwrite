<script lang="ts">
import type {
  ChangeEvent,
  Grid,
  GridEvents,
  GridOptions,
  Selection,
} from "@sheetwrite/core";
import { createGridController } from "@sheetwrite/core/adapter";
import type { GridController, GridControllerHandlers } from "@sheetwrite/core/adapter";
import { untrack } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
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

let {
  workbook,
  data,
  datasource,
  renderer = "canvas",
  workerUrl,
  theme,
  readOnly,
  renderers,
  overscan,
  minColumns,
  config,
  onChange,
  onSelectionChange,
  onScroll,
  onEditBegin,
  onEditCommit,
  onSearch,
  onActiveSheetChange,
  grid = $bindable(),
  onReady,
  ...hostAttributes
}: Props = $props();

let host: HTMLDivElement;

// The controller owns the imperative core grid. Kept in reactive state so
// live-option effects re-target a replacement grid.
let controller: GridController | undefined = $state();

// Read live on every event, so swapped prop callbacks are honored without
// recreating the grid.
const handlers: GridControllerHandlers = {
  onChange: (event) => onChange?.(event),
  onSelectionChange: (selection) => onSelectionChange?.(selection),
  onScroll: (event) => onScroll?.(event),
  onEditBegin: (event) => onEditBegin?.(event),
  onEditCommit: (event) => onEditCommit?.(event),
  onSearch: (result) => onSearch?.(result),
  onActiveSheetChange: (event) => onActiveSheetChange?.(event),
  onReady: (created) => onReady?.(created),
};

// Owns the host div: creates the imperative core grid through the shared
// controller, forwards every core event, replaces it only when a
// construction-bound option changes, and tears it down on unmount. Theme,
// read-only, config, overscan, minColumns, callbacks, and host attributes update live. It renders no
// cells. Call `await initSheetwrite(wasmUrl)` once before mounting.
$effect(() => {
  // Track construction-bound option identities. Live options are read
  // untracked and applied by the effects below.
  const activeWorkbook = workbook;
  const activeData = data;
  const activeDatasource = datasource;
  const activeRenderer = renderer;
  const activeWorkerUrl = workerUrl;
  const activeRenderers = renderers;
  const activeOverscan = untrack(() => overscan);
  const activeMinColumns = untrack(() => minColumns);
  const activeReadOnly = untrack(() => readOnly);
  const activeConfig = untrack(() => config);
  const activeTheme = untrack(() => theme);
  // `createGridController` runs synchronously and calls `onReady`, which may
  // read or write arbitrary consumer state; the bindable `grid` write also
  // round-trips through the parent's setter. Both must stay OUT of this
  // effect's dependency set or the effect re-triggers itself (Svelte
  // effect_update_depth_exceeded).
  const active = untrack(() =>
    createGridController(
      host,
      {
        workbook: activeWorkbook,
        data: activeData,
        datasource: activeDatasource,
        renderer: activeRenderer,
        workerUrl: activeWorkerUrl,
        theme: activeTheme,
        readOnly: activeReadOnly,
        renderers: activeRenderers,
        overscan: activeOverscan,
        minColumns: activeMinColumns,
        config: activeConfig,
      },
      handlers,
    ),
  );
  untrack(() => {
    controller = active;
    grid = active.grid;
  });

  return () => {
    active.destroy();
    controller = undefined;
    grid = undefined;
  };
});

$effect(() => {
  controller?.setReadOnly(readOnly ?? false);
});

$effect(() => {
  controller?.setConfig(config);
});

$effect(() => {
  controller?.setTheme(theme);
});

$effect(() => {
  controller?.setOverscan(overscan);
});

$effect(() => {
  controller?.setMinColumns(minColumns);
});
</script>

<div bind:this={host} {...hostAttributes}></div>
