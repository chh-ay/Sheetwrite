import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridEvents } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("worker renderer fallback observability", () => {
  it("falls back to canvas observably when the worker cannot construct", async () => {
    const workbook = makeWorkbook(5);
    const events: Array<GridEvents["renderer-fallback"]> = [];

    // happy-dom offers no OffscreenCanvas worker path, so construction fails
    // and must fall back — loudly, not silently.
    const grid = new GridImpl(mountHost(), {
      workbook,
      data: makeColumnarData(5),
      renderer: "worker",
      workerUrl: "http://invalid.invalid/w.js",
    });
    grid.on("renderer-fallback", (event) => events.push(event));

    // The emit is deferred one microtask so post-construction subscribers see it.
    await Promise.resolve();

    expect(grid.rendererKind()).toBe("canvas");
    expect(events).toHaveLength(1);
    expect(events[0]!.requested).toBe("worker");
    expect(events[0]!.error).toBeDefined();

    grid.destroy();
  });

  it("reports canvas and emits nothing for the default renderer", async () => {
    const workbook = makeWorkbook(5);
    const events: unknown[] = [];

    const grid = new GridImpl(mountHost(), { workbook, data: makeColumnarData(5) });
    grid.on("renderer-fallback", (event) => events.push(event));

    await Promise.resolve();

    expect(grid.rendererKind()).toBe("canvas");
    expect(events).toHaveLength(0);

    grid.destroy();
  });
});
