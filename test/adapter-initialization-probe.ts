import assert from "node:assert/strict";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from "vue";
// Bun resolves the public `svelte` entry to its server runtime outside a browser
// bundle, so this lifecycle boundary intentionally selects Svelte's client entry.
import { flushSync, mount, unmount } from "../node_modules/svelte/src/index-client.js";
import type { GridReadyEvent } from "../packages/core/src/adapter.js";
import type { Grid } from "../packages/core/src/index.js";
import { installCanvasTestStubs } from "../packages/core/src/testing.js";
import { SheetwriteGrid as ReactSheetwriteGrid } from "../packages/react/src/index.js";
import SvelteLifecycleHarness from "../packages/svelte/test/LifecycleHarness.svelte";
import {
  type SheetwriteGridExpose,
  SheetwriteGrid as VueSheetwriteGrid,
} from "../packages/vue/src/index.js";
import { makeConformanceWorkbook } from "./adapter-lifecycle-contract.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type InitializationSource = Uint8Array | Promise<ArrayBuffer> | undefined;
type InitializationErrorHandler = (error: unknown) => void;

interface InitializationDriver {
  host: HTMLElement;
  ready: GridReadyEvent[];
  publishedAtReady: Array<Grid | null | undefined>;
  getPublishedGrid(): Grid | null | undefined;
  update(source: InitializationSource, handler: InitializationErrorHandler): Promise<void>;
  unmount(): Promise<void>;
}

const workbook = makeConformanceWorkbook();

async function mountReact(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const grid = createRef<Grid>();
  const ready: GridReadyEvent[] = [];
  const publishedAtReady: Array<Grid | null | undefined> = [];

  const render = async (
    nextSource: InitializationSource,
    nextHandler: InitializationErrorHandler,
  ): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(ReactSheetwriteGrid, {
          ref: grid,
          workbook,
          wasmSource: nextSource,
          onInitializationError: nextHandler,
          onReady: (event: GridReadyEvent) => {
            publishedAtReady.push(grid.current);
            ready.push(event);
          },
          fallback: createElement("span", { "data-lifecycle-fallback": "" }, "loading"),
        }),
      );
    });
  };

  await render(source, handler);
  return {
    host,
    ready,
    publishedAtReady,
    getPublishedGrid: () => grid.current,
    update: render,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

async function mountVue(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const grid = ref<SheetwriteGridExpose | null>(null);
  const wasmSource = shallowRef<InitializationSource>(source);
  const initializationError = shallowRef(handler);
  const ready: GridReadyEvent[] = [];
  const publishedAtReady: Array<Grid | null | undefined> = [];
  const Parent = defineComponent({
    setup() {
      return () =>
        h(
          VueSheetwriteGrid,
          {
            ref: grid,
            workbook,
            wasmSource: wasmSource.value,
            onInitializationError: initializationError.value,
            onReady: (event: GridReadyEvent) => {
              publishedAtReady.push(grid.value?.grid);
              ready.push(event);
            },
          },
          {
            fallback: () => h("span", { "data-lifecycle-fallback": "" }, "loading"),
          },
        );
    },
  });
  const app = createApp(Parent);
  app.mount(host);
  await nextTick();

  return {
    host,
    ready,
    publishedAtReady,
    getPublishedGrid: () => grid.value?.grid,
    update: async (nextSource, nextHandler) => {
      wasmSource.value = nextSource;
      initializationError.value = nextHandler;
      await nextTick();
    },
    unmount: async () => {
      app.unmount();
      await nextTick();
    },
  };
}

interface SvelteLifecycleHarnessApi {
  update(props: SvelteInitializationProps): void;
  getGrid(): Grid | undefined;
  getPublishedAtReady(): Array<Grid | null | undefined>;
}

interface SvelteInitializationProps {
  workbook: typeof workbook;
  wasmSource: InitializationSource;
  fallbackLabel: string;
  onInitializationError: InitializationErrorHandler;
  onReady(event: GridReadyEvent): void;
}

async function mountSvelte(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const ready: GridReadyEvent[] = [];
  const initialProps: SvelteInitializationProps = {
    workbook,
    wasmSource: source,
    fallbackLabel: "loading",
    onInitializationError: handler,
    onReady: (event) => {
      ready.push(event);
    },
  };
  const component = mount(SvelteLifecycleHarness, {
    target: host,
    props: { initialProps },
  }) as SvelteLifecycleHarnessApi;
  flushSync();
  await Promise.resolve();
  flushSync();

  return {
    host,
    ready,
    publishedAtReady: component.getPublishedAtReady(),
    getPublishedGrid: () => component.getGrid(),
    update: async (nextSource, nextHandler) => {
      component.update({
        ...initialProps,
        wasmSource: nextSource,
        onInitializationError: nextHandler,
      });
      flushSync();
      await Promise.resolve();
      flushSync();
    },
    unmount: async () => {
      await unmount(component);
      flushSync();
    },
  };
}

const adapter = process.argv[process.argv.length - 1];
assert.ok(adapter === "react" || adapter === "vue" || adapter === "svelte", "adapter required");
const mountAdapter = adapter === "react" ? mountReact : adapter === "vue" ? mountVue : mountSvelte;

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(5);
  }
  throw new Error(message);
}

const restoreCanvas = installCanvasTestStubs();
// wasm-bindgen awaits module inputs before instantiation. A deferred buffer is
// used only at this test seam to make stale asynchronous work deterministic.

try {
  const staleSource = Promise.withResolvers<ArrayBuffer>();
  let staleErrors = 0;
  const stale = await mountAdapter(staleSource.promise, () => {
    staleErrors += 1;
  });
  assert.ok(stale.host.querySelector("[data-lifecycle-fallback]"));
  await stale.unmount();
  staleSource.resolve(new Uint8Array([0]).buffer);
  await Bun.sleep(20);
  assert.equal(stale.ready.length, 0);
  assert.equal(staleErrors, 0);
  assert.equal(stale.getPublishedGrid() ?? null, null);

  let currentErrors = 0;
  const replacement = await mountAdapter(new Uint8Array([0]), () => {
    currentErrors += 1;
  });
  assert.ok(replacement.host.querySelector("[data-lifecycle-fallback]"));
  await waitFor(() => currentErrors === 1, "true initialization failure was not reported once");

  const sourceA = Promise.withResolvers<ArrayBuffer>();
  await replacement.update(sourceA.promise, () => {
    currentErrors += 1;
  });
  await replacement.update(new Uint8Array([1]), () => {
    currentErrors += 1;
  });
  await waitFor(() => currentErrors === 2, "conflicting source rejection was not reported once");

  const wasm = await Bun.file(
    new URL("../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
  ).arrayBuffer();
  if (adapter === "react") {
    await act(async () => {
      sourceA.resolve(wasm);
      await Promise.resolve();
    });
    await waitFor(
      () => replacement.ready.length === 1,
      "successful first source did not make the current component ready",
    );
  } else {
    sourceA.resolve(wasm);
    await waitFor(
      () => replacement.ready.length === 1,
      "successful first source did not make the current component ready",
    );
  }
  assert.equal(replacement.publishedAtReady[0], replacement.ready[0]!.grid);
  assert.equal(replacement.getPublishedGrid(), replacement.ready[0]!.grid);
  assert.deepEqual(
    {
      generation: replacement.ready[0]!.generation,
      reason: replacement.ready[0]!.reason,
    },
    { generation: 1, reason: "initial" },
  );
  assert.equal(replacement.host.querySelectorAll('[role="grid"]').length, 1);
  assert.equal(replacement.host.querySelector("[data-lifecycle-fallback]"), null);

  const liveGrid = replacement.ready[0]!.grid;
  const selectedAddress = { sheet: "lifecycle", row: 1, col: 0 };
  const selection = { kind: "cell" as const, addr: selectedAddress };
  liveGrid.setSelection(selection);
  liveGrid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: selectedAddress,
        value: { kind: "literal", value: "preserved edit" },
      },
    ],
  });
  await replacement.update(new Uint8Array([2]), () => {
    currentErrors += 1;
  });
  await Bun.sleep(10);
  assert.equal(replacement.getPublishedGrid(), liveGrid);
  assert.deepEqual(liveGrid.getSelection(), selection);
  assert.equal(liveGrid.store.getCell(selectedAddress).resolved, "preserved edit");
  assert.equal(replacement.ready.length, 1);
  assert.equal(currentErrors, 2);
  const sameGrid = replacement.getPublishedGrid() === liveGrid;
  const selectionPreserved = JSON.stringify(liveGrid.getSelection()) === JSON.stringify(selection);
  const editPreserved = liveGrid.store.getCell(selectedAddress).resolved === "preserved edit";
  await replacement.unmount();
  assert.equal(replacement.getPublishedGrid() ?? null, null);

  console.log(
    JSON.stringify({
      adapter,
      staleReady: stale.ready.length,
      staleErrors,
      currentErrors,
      generation: replacement.ready[0]!.generation,
      reason: replacement.ready[0]!.reason,
      readyCount: replacement.ready.length,
      publishedBeforeReady: replacement.publishedAtReady[0] === replacement.ready[0]!.grid,
      sameGrid,
      selectionPreserved,
      editPreserved,
    }),
  );
} finally {
  restoreCanvas();
}
