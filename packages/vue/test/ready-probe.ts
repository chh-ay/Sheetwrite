import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Grid, Workbook } from "@sheetwrite/core";
import type { SheetwriteGridExpose } from "../src/index.js";

GlobalRegistrator.register();
HTMLCanvasElement.prototype.getContext = (() =>
  new Proxy(
    { canvas: null, fillStyle: "", strokeStyle: "", font: "", lineWidth: 1 },
    { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
  )) as unknown as typeof HTMLCanvasElement.prototype.getContext;
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });

// Vue captures `document` at module evaluation, so this boundary probe must
// install happy-dom before intentionally loading the known client modules.
const { initSheetwrite } = await import("@sheetwrite/core");
const { createApp, defineComponent, h, nextTick, ref } = await import("vue");
const { SheetwriteGrid } = await import("../src/index.js");
await initSheetwrite();
const workbook: Workbook = {
  activeSheet: "sheet",
  sheets: [
    {
      id: "sheet",
      name: "Sheet",
      rowCount: 1,
      columns: [{ key: "name", header: "Name", width: 120, type: "text" }],
    },
  ],
};
const component = ref<SheetwriteGridExpose | null>(null);
let event: { grid: Grid; generation: number; reason: string } | null = null;
const Parent = defineComponent(
  () => () =>
    h(SheetwriteGrid, {
      ref: component,
      workbook,
      onReady: (value: { grid: Grid; generation: number; reason: string }) => {
        event = value;
      },
    }),
);
createApp(Parent).mount(document.createElement("div"));
await nextTick();
console.log(
  JSON.stringify({
    emitted: event !== null,
    publishedBeforeReady: event?.grid === component.value?.grid,
    generation: event?.generation,
    reason: event?.reason,
  }),
);
process.exit(0);
