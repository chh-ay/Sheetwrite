import type { Grid } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";
import { SheetwriteGrid, type SheetwriteGridExpose } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { createApp, defineComponent, h, ref, type VNodeRef } from "vue";
import {
  assertUnmounted,
  editReadyGrid,
  initialData,
  passed,
  replacementData,
  workbook,
} from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("Vue Vite fixture is missing #app");
const host = target;
let grid: Grid | null = null;
let readyCount = 0;
const publishGrid: VNodeRef = (instance) => {
  grid =
    instance !== null && !(instance instanceof Element)
      ? ((instance as unknown as SheetwriteGridExpose).grid ?? null)
      : null;
};
const App = defineComponent({
  setup() {
    const data = ref(initialData);
    return () =>
      h(SheetwriteGrid, {
        ref: publishGrid,
        workbook,
        data: data.value,
        wasmSource: wasmUrl,
        height: 240,
        onReady(event: GridReadyEvent) {
          readyCount += 1;
          if (readyCount !== 1 && readyCount !== 2) throw new Error("Unexpected Vue generation");
          editReadyGrid(event, readyCount);
          if (readyCount === 1) {
            data.value = replacementData;
            return;
          }
          queueMicrotask(() => {
            app.unmount();
            assertUnmounted(host, grid);
            passed("vue");
          });
        },
      });
  },
});

const app = createApp(App);
app.mount(host);
