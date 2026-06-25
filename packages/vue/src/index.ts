import {
  type CellRenderer,
  type ColumnarData,
  createGridController,
  type DataSource,
  type Grid,
  type GridController,
  type GridControllerHandlers,
  type GridOptions,
  type Theme,
  type Workbook,
} from "@sheetwrite/core";
import { defineComponent, h, onBeforeUnmount, onMounted, type PropType, ref, watch } from "vue";

/**
 * Thin Vue 3 wrapper: it owns a host `<div>`, drives the imperative core grid
 * through a {@link createGridController}, forwards events as `change`/`selection`
 * emits, recreates the grid when the `workbook` identity changes, and tears down
 * on unmount. It renders no cells. `class`/`style` fall through to the host div.
 * Call `await initSheetwrite(wasmUrl)` once before mounting (WASM must be ready).
 */
export const SheetwriteGrid = defineComponent({
  name: "SheetwriteGrid",
  props: {
    workbook: { type: Object as PropType<Workbook>, required: true },
    data: { type: Object as PropType<ColumnarData>, default: undefined },
    datasource: { type: Object as PropType<DataSource>, default: undefined },
    renderer: { type: String as PropType<"canvas">, default: undefined },
    theme: { type: Object as PropType<Partial<Theme>>, default: undefined },
    readOnly: { type: Boolean, default: undefined },
    renderers: { type: Object as PropType<Record<string, CellRenderer>>, default: undefined },
    overscan: { type: Number, default: undefined },
    config: { type: Object as PropType<GridOptions["config"]>, default: undefined },
    onReady: { type: Function as PropType<(grid: Grid) => void>, default: undefined },
  },
  emits: ["change", "selection"],
  setup(props, { emit, expose }) {
    const host = ref<HTMLDivElement | null>(null);

    // Non-reactive: the controller wraps an imperative handle, not view state.
    let controller: GridController | null = null;

    // Read live on every event. The emit callbacks are stable, and `onReady` is
    // read through `props` so a swapped handler is still picked up.
    const handlers: GridControllerHandlers = {
      onChange: (event) => emit("change", event),
      onSelectionChange: (selection) => emit("selection", selection),
      onReady: (grid) => props.onReady?.(grid),
    };

    function currentOptions(): GridOptions {
      return {
        workbook: props.workbook,
        data: props.data,
        datasource: props.datasource,
        renderer: props.renderer,
        theme: props.theme,
        readOnly: props.readOnly,
        renderers: props.renderers,
        overscan: props.overscan,
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

    // Recreate the grid when the workbook identity changes (parity with the
    // other adapters); ordinary edits flow through `change`/`selection` instead.
    watch(
      () => props.workbook,
      () => {
        teardownGrid();
        mountGrid();
      },
    );

    watch(
      () => props.theme,
      (theme) => {
        if (theme) controller?.setTheme(theme);
      },
    );

    expose({ getGrid: () => controller?.grid ?? null });

    return () => h("div", { ref: host });
  },
});
