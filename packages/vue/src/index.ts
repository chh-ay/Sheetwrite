import {
  type CellRenderer,
  type ChangeEvent,
  type ColumnarData,
  createGrid,
  type DataSource,
  type Grid,
  type GridOptions,
  type Theme,
  type Workbook,
} from "@sheetwrite/core";
import { defineComponent, h, onBeforeUnmount, onMounted, type PropType, ref, watch } from "vue";

/**
 * Thin Vue 3 wrapper: it owns a host `<div>`, creates the imperative core grid
 * on mount, forwards events as `change`/`selection` emits, and tears down on
 * unmount. It renders no cells. `class`/`style` fall through to the host div.
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
  },
  emits: ["change", "selection"],
  setup(props, { emit }) {
    const host = ref<HTMLDivElement | null>(null);
    // Non-reactive: the grid is an imperative handle, not view state.
    let grid: Grid | null = null;
    let offs: Array<() => void> = [];

    onMounted(() => {
      const el = host.value;
      if (!el) return;
      const options: GridOptions = {
        workbook: props.workbook,
        data: props.data,
        datasource: props.datasource,
        renderer: props.renderer,
        theme: props.theme,
        readOnly: props.readOnly,
        renderers: props.renderers,
        overscan: props.overscan,
      };
      grid = createGrid(el, options);
      offs = [
        grid.on("change", (e: ChangeEvent) => emit("change", e)),
        grid.on("selection", (e) => emit("selection", e.selection)),
      ];
    });

    onBeforeUnmount(() => {
      for (const off of offs) off();
      offs = [];
      grid?.destroy();
      grid = null;
    });

    watch(
      () => props.theme,
      (t) => {
        if (t) grid?.setTheme(t);
      },
    );

    return () => h("div", { ref: host });
  },
});
