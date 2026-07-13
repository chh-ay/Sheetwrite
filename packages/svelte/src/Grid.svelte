<script lang="ts">
import { initSheetwrite, isSheetwriteReady, type GridOptions } from "@sheetwrite/core";
import {
  createGridController,
  getGridResetReason,
  gridSizeStyle,
} from "@sheetwrite/core/adapter";
import type { GridController, GridReadyReason } from "@sheetwrite/core/adapter";
import { untrack } from "svelte";
import type { SheetwriteGridProps as Props } from "./props.js";


let {
  workbook,
  data,
  datasource,
  datasourceStorage,
  renderer = "canvas",
  workerUrl,
  theme,
  readOnly,
  renderers,
  overscan,
  minColumns,
  config,
  wasmSource,
  height,
  fill,
  fallback,
  onGridChange,
  onSelectionChange,
  onViewportChange,
  onEditBegin,
  onEditCommit,
  onSearch,
  onActiveSheetChange,
  onReady,
  onInitializationError,
  grid = $bindable(),
  ...hostAttributes
}: Props = $props();

let host: HTMLDivElement;
let controller: GridController | undefined = $state();
let loading = $state(!isSheetwriteReady());
let generation = 0;

const handlers = {
  onGridChange: (event: Parameters<NonNullable<typeof onGridChange>>[0]) => onGridChange?.(event),
  onSelectionChange: (event: Parameters<NonNullable<typeof onSelectionChange>>[0]) =>
    onSelectionChange?.(event),
  onViewportChange: (event: Parameters<NonNullable<typeof onViewportChange>>[0]) =>
    onViewportChange?.(event),
  onEditBegin: (event: Parameters<NonNullable<typeof onEditBegin>>[0]) => onEditBegin?.(event),
  onEditCommit: (event: Parameters<NonNullable<typeof onEditCommit>>[0]) => onEditCommit?.(event),
  onSearch: (event: Parameters<NonNullable<typeof onSearch>>[0]) => onSearch?.(event),
  onActiveSheetChange: (event: Parameters<NonNullable<typeof onActiveSheetChange>>[0]) =>
    onActiveSheetChange?.(event),
};

let previousOptions: GridOptions | null = null;

$effect(() => {
  const resetInputs = {
    workbook,
    data,
    datasource,
    datasourceStorage,
    renderer,
    workerUrl,
    renderers,
    wasmSource,
  };
  let current = true;
  let active: GridController | undefined;
  loading = !isSheetwriteReady();

  void (async () => {
    try {
      if (!isSheetwriteReady()) await initSheetwrite(resetInputs.wasmSource);
      if (!current) return;
      const options: GridOptions = {
        workbook: resetInputs.workbook,
        data: resetInputs.data,
        datasource: resetInputs.datasource,
        datasourceStorage: resetInputs.datasourceStorage,
        renderer: resetInputs.renderer,
        workerUrl: resetInputs.workerUrl,
        renderers: resetInputs.renderers,
        theme,
        readOnly,
        overscan,
        minColumns,
        config,
      };
      active = untrack(() => createGridController(host, options, handlers));
      const reason: GridReadyReason =
        generation === 0
          ? "initial"
          : (previousOptions && getGridResetReason(previousOptions, options)) ?? "input-reset";
      previousOptions = options;
      generation += 1;
      untrack(() => {
        controller = active;
        grid = active?.grid;
        loading = false;
        if (active) onReady?.({ grid: active.grid, generation, reason });
      });
    } catch (error) {
      if (!current) return;
      loading = true;
      onInitializationError?.(error);
    }
  })();

  return () => {
    current = false;
    grid = undefined;
    controller = undefined;
    active?.destroy();
  };
});

$effect(() => controller?.setReadOnly(readOnly ?? false));
$effect(() => controller?.setConfig(config));
$effect(() => controller?.setTheme(theme));
$effect(() => controller?.setOverscan(overscan));
$effect(() => controller?.setMinColumns(minColumns));

let sizing = $derived(gridSizeStyle({ height, fill }));
</script>

<div
  {...hostAttributes}
  bind:this={host}
  class={["sheetwrite", hostAttributes.class]}
  style:width={sizing.width}
  style:height={sizing.height}
  style:min-height={sizing.minHeight}
>
  {#if loading && fallback}{@render fallback()}{/if}
</div>
