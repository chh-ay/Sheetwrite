import type { Grid } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";
import { SheetwriteGrid, type SheetwriteGridExpose } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { createApp, defineComponent, h, ref, type VNodeRef } from "vue";
import {
  assertReadyAndEdit,
  assertUnmounted,
  initialData,
  markPassed,
  replacementData,
  workbook,
} from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("Packed Vue consumer is missing #app");
const host = target;

let publishedGrid: Grid | null = null;
let readyCount = 0;
const publishGrid: VNodeRef = (instance) => {
  publishedGrid =
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
        onReady: (event: GridReadyEvent) => {
          readyCount += 1;
          if (readyCount !== 1 && readyCount !== 2) {
            throw new Error(`Packed Vue consumer published ${readyCount} generations`);
          }
          assertReadyAndEdit(event, readyCount);
          if (readyCount === 1) {
            data.value = replacementData;
            return;
          }
          queueMicrotask(() => {
            app.unmount();
            assertUnmounted(host, publishedGrid);
            markPassed("vue");
          });
        },
      });
  },
});

const app = createApp(App);
app.mount(host);
