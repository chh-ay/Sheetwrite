import type {
  CellRenderer,
  ChangeEvent,
  ColumnarData,
  DataSource,
  Grid,
  GridEvents,
  GridOptions,
  Selection,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import {
  createGridController,
  type GridController,
  type GridControllerHandlers,
} from "@sheetwrite/core/adapter";
import { defineComponent, h, onBeforeUnmount, onMounted, type PropType, ref, watch } from "vue";

export interface SheetwriteGridExpose {
  getGrid(): Grid | null;
}

/**
 * Thin Vue 3 wrapper: it owns a host `<div>`, drives the imperative core grid
 * through a {@link createGridController}, forwards every core event, replaces
 * the grid only when a construction-bound option changes, and tears down on
 * unmount. Theme, read-only, and UI configuration update the existing grid. It
 * renders no cells. `class`/`style` and ordinary attributes fall through to the
 * host div. Call `await initSheetwrite(wasmUrl)` once before mounting (WASM must
 * be ready).
 */
const SheetwriteGridComponent = defineComponent({
  name: "SheetwriteGrid",
  props: {
    workbook: { type: Object as PropType<Workbook>, required: true },
    data: { type: Object as PropType<ColumnarData>, default: undefined },
    datasource: { type: Object as PropType<DataSource>, default: undefined },
    renderer: { type: String as PropType<GridOptions["renderer"]>, default: undefined },
    workerUrl: {
      type: [String, URL] as unknown as PropType<GridOptions["workerUrl"]>,
      default: undefined,
    },
    theme: { type: Object as PropType<Partial<Theme>>, default: undefined },
    readOnly: { type: Boolean, default: undefined },
    renderers: { type: Object as PropType<Record<string, CellRenderer>>, default: undefined },
    overscan: { type: Number, default: undefined },
    minColumns: { type: Number, default: undefined },
    config: { type: Object as PropType<GridOptions["config"]>, default: undefined },
    onReady: { type: Function as PropType<(grid: Grid) => void>, default: undefined },
  },
  emits: {
    change: (_event: ChangeEvent) => true,
    selection: (_selection: Selection | null) => true,
    scroll: (_event: GridEvents["scroll"]) => true,
    "edit-begin": (_event: GridEvents["edit-begin"]) => true,
    "edit-commit": (_event: GridEvents["edit-commit"]) => true,
    search: (_result: GridEvents["search"]) => true,
    "active-sheet": (_event: GridEvents["active-sheet"]) => true,
  },
  setup(props, { emit, expose }) {
    const host = ref<HTMLDivElement | null>(null);

    // Non-reactive: the controller wraps an imperative handle, not view state.
    let controller: GridController | null = null;

    // Read live on every event. The emit callbacks are stable, and `onReady` is
    // read through `props` so a swapped handler is still picked up.
    const handlers: GridControllerHandlers = {
      onChange: (event) => emit("change", event),
      onSelectionChange: (selection) => emit("selection", selection),
      onScroll: (event) => emit("scroll", event),
      onEditBegin: (event) => emit("edit-begin", event),
      onEditCommit: (event) => emit("edit-commit", event),
      onSearch: (result) => emit("search", result),
      onActiveSheetChange: (event) => emit("active-sheet", event),
      onReady: (grid) => props.onReady?.(grid),
    };

    function currentOptions(): GridOptions {
      return {
        workbook: props.workbook,
        data: props.data,
        datasource: props.datasource,
        renderer: props.renderer,
        workerUrl: props.workerUrl,
        theme: props.theme,
        readOnly: props.readOnly,
        renderers: props.renderers,
        overscan: props.overscan,
        minColumns: props.minColumns,
        config: props.config,
      };
    }

    function mountGrid(): void {
      const el = host.value;
      if (!el) return;
      controller = createGridController(el, currentOptions(), handlers);
    }

    function teardownGrid(): void {
      controller?.destroy();
      controller = null;
    }

    onMounted(mountGrid);
    onBeforeUnmount(teardownGrid);

    // Recreate only when a construction-bound option changes. Theme,
    // read-only, config, and overscan are applied live below.
    watch(
      () => [
        props.workbook,
        props.data,
        props.datasource,
        props.renderer,
        props.workerUrl,
        props.renderers,
        props.minColumns,
      ],
      () => {
        teardownGrid();
        mountGrid();
      },
    );

    watch(
      () => props.readOnly,
      (readOnly) => controller?.setReadOnly(readOnly ?? false),
    );

    watch(
      () => props.config,
      (config) => controller?.setConfig(config),
    );

    watch(
      () => props.theme,
      (theme) => controller?.setTheme(theme),
    );

    watch(
      () => props.overscan,
      (overscan) => controller?.setOverscan(overscan),
    );

    expose({ getGrid: () => controller?.grid ?? null });

    return () => h("div", { ref: host });
  },
});
export const SheetwriteGrid = SheetwriteGridComponent as typeof SheetwriteGridComponent & {
  new (): InstanceType<typeof SheetwriteGridComponent> & SheetwriteGridExpose;
};
