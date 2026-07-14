import { afterEach, beforeAll, beforeEach } from "bun:test";
import type { Grid } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
// Bun resolves the public `svelte` entry to its server runtime outside a browser
// bundle, so this component test intentionally selects Svelte's client entry.
import { flushSync, mount, unmount } from "../../../node_modules/svelte/src/index-client.js";
import {
  type AdapterConformanceProps,
  type MountedAdapter,
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
