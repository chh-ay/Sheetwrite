import { SheetwriteGrid } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
import { defineComponent, h, ref, shallowRef } from "vue";
import {
  INVALID_WASM_SOURCE,
  LIFECYCLE_DATA,
  LIFECYCLE_RESET_DATA,
  LIFECYCLE_WORKBOOK,
} from "./fixture.js";

export default defineComponent({
  name: "FrameworkLifecycleVueFixture",
  setup() {
    const wasmSource = shallowRef<Uint8Array | undefined>(INVALID_WASM_SOURCE);
    const data = shallowRef(LIFECYCLE_DATA);
    const mounted = ref(true);
    const status = ref<"loading" | "error" | "ready">("loading");
    const errors = ref(0);
    const ready = ref("");

    return () =>
      h("main", { "data-framework-lifecycle": "vue" }, [
        h(
          "button",
          {
            type: "button",
            "data-lifecycle-retry": "",
            onClick: () => {
              status.value = "loading";
              wasmSource.value = undefined;
            },
          },
          "Retry Vue",
        ),
        h(
          "button",
          {
            type: "button",
            "data-lifecycle-reset": "",
            onClick: () => {
              data.value = LIFECYCLE_RESET_DATA;
            },
          },
          "Reset Vue input",
        ),
        h(
          "button",
          {
            type: "button",
            "data-lifecycle-unmount": "",
            onClick: () => {
              mounted.value = false;
            },
          },
          "Unmount Vue",
        ),
        h("output", { "data-lifecycle-status": "" }, status.value),
        h("output", { "data-lifecycle-errors": "" }, String(errors.value)),
        h("output", { "data-lifecycle-ready": "" }, ready.value),
        mounted.value
          ? h(
              SheetwriteGrid,
              {
                workbook: LIFECYCLE_WORKBOOK,
                data: data.value,
                height: 320,
                wasmSource: wasmSource.value,
                onInitializationError: () => {
                  errors.value += 1;
                  status.value = "error";
                },
                onReady: ({ generation, reason }) => {
                  ready.value = `${generation}:${reason}`;
                  status.value = "ready";
                },
              },
              {
                fallback: () => h("span", { "data-lifecycle-fallback": "" }, "Vue fallback"),
              },
            )
          : null,
      ]);
  },
});
