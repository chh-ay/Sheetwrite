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
  protectionResolver,
  mutationPolicy,
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

const UNSET_WASM_SOURCE = Symbol("unset-wasm-source");
let previousOptions: GridOptions | null = null;
let lastRequestedOptions: GridOptions | null = null;
let previousWasmSource: Props["wasmSource"] | typeof UNSET_WASM_SOURCE = UNSET_WASM_SOURCE;
let initializationToken = 0;
let disposed = false;

function teardownGrid(): void {
  const active = untrack(() => controller);
  grid = undefined;
  controller = undefined;
  active?.destroy();
}

function publishReadyGrid(): void {
  if (disposed || untrack(() => controller) || !lastRequestedOptions) return;
  const options = lastRequestedOptions;
  const reason: GridReadyReason =
    generation === 0
      ? "initial"
      : (previousOptions && getGridResetReason(previousOptions, options)) ?? "input-reset";
  const active = untrack(() => createGridController(host, options, handlers));
  controller = active;
  grid = active.grid;
  previousOptions = options;
  generation += 1;
  loading = false;
  untrack(() => onReady?.({ grid: active.grid, generation, reason }));
}

$effect(() => {
  const resetInputs = {
    workbook,
    data,
    datasource,
    datasourceStorage,
    renderer,
    workerUrl,
    protectionResolver,
    mutationPolicy,
    renderers,
    wasmSource,
  };
  const currentOptions = (): GridOptions =>
    untrack(() => ({
      workbook: resetInputs.workbook,
      data: resetInputs.data,
      datasource: resetInputs.datasource,
      datasourceStorage: resetInputs.datasourceStorage,
      renderer: resetInputs.renderer,
      workerUrl: resetInputs.workerUrl,
      protectionResolver: resetInputs.protectionResolver,
      mutationPolicy: resetInputs.mutationPolicy,
      renderers: resetInputs.renderers,
      theme,
      readOnly,
      overscan,
      minColumns,
      config,
    }));
  const requestedOptions = currentOptions();
  const activeController = untrack(() => controller);
  const wasmChanged =
    previousWasmSource === UNSET_WASM_SOURCE || previousWasmSource !== resetInputs.wasmSource;
  const resetReason =
    lastRequestedOptions && getGridResetReason(lastRequestedOptions, requestedOptions);
  const sourceOnlyChange = wasmChanged && resetReason === null && activeController !== undefined;
  const needsNewGeneration =
    lastRequestedOptions === null ||
    resetReason !== null ||
    (wasmChanged && (!isSheetwriteReady() || activeController === undefined));

  previousWasmSource = resetInputs.wasmSource;
  lastRequestedOptions = requestedOptions;
  const token = ++initializationToken;
  if (sourceOnlyChange) {
    void initSheetwrite(resetInputs.wasmSource).catch((error: unknown) => {
      if (!disposed && token === initializationToken) {
        untrack(() => onInitializationError?.(error));
      }
    });
    return;
  }
  if (!needsNewGeneration) return;

  teardownGrid();
  loading = !isSheetwriteReady();

  void (async () => {
    const alreadyReady = isSheetwriteReady();
    try {
      const initialization = initSheetwrite(resetInputs.wasmSource);
      if (alreadyReady) publishReadyGrid();
      await initialization;
      if (!alreadyReady && !disposed && isSheetwriteReady()) publishReadyGrid();
    } catch (error) {
      if (disposed || token !== initializationToken) return;
      loading = true;
      untrack(() => onInitializationError?.(error));
    }
  })();
});

$effect(() => {
  return () => {
    disposed = true;
    initializationToken += 1;
    teardownGrid();
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
