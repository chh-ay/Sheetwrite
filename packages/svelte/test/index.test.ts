import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";
import type { Grid } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
// Bun resolves the public `svelte` entry to its server runtime outside a browser
// bundle, so this component test intentionally selects Svelte's client entry.
import { flushSync, mount, unmount } from "../../../node_modules/svelte/src/index-client.js";
import {
  type AdapterConformanceProps,
  type MountedAdapter,
  makeConformanceData,
  makeConformanceWorkbook,
  runSharedAdapterLifecycleContract,
} from "../../../test/adapter-lifecycle-contract.js";
import SvelteLifecycleHarness from "./LifecycleHarness.svelte";

interface SvelteLifecycleHarnessApi {
  update(props: AdapterConformanceProps): void;
  getGrid(): Grid | undefined;
  getPublishedAtReady(): Array<Grid | null | undefined>;
}

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  document.body.replaceChildren();
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

async function mountConformanceGrid(props: AdapterConformanceProps): Promise<MountedAdapter> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const component = mount(SvelteLifecycleHarness, {
    target: host,
    props: { initialProps: props },
  }) as SvelteLifecycleHarnessApi;
  flushSync();
  await Promise.resolve();
  flushSync();

  return {
    host,
    publishedAtReady: component.getPublishedAtReady(),
    getPublishedGrid: () => component.getGrid(),
    render: async (nextProps) => {
      component.update(nextProps);
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

runSharedAdapterLifecycleContract("Svelte", mountConformanceGrid);

it("does not report an ordinary onReady throw as an initialization failure", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const readyFailure = new Error("consumer onReady failed");
  const initializationErrors: unknown[] = [];
  const component = mount(SvelteLifecycleHarness, {
    target: host,
    props: {
      initialProps: {
        workbook: makeConformanceWorkbook(),
        data: makeConformanceData(),
        fallbackLabel: "callback fallback",
        onReady: () => {
          throw readyFailure;
        },
        onInitializationError: (error) => initializationErrors.push(error),
      },
    },
  }) as SvelteLifecycleHarnessApi;

  expect(() => flushSync()).toThrow(readyFailure);
  await Promise.resolve();
  expect(initializationErrors).toEqual([]);
  expect(component.getGrid()).toBeDefined();
  await unmount(component);
  flushSync();
});
