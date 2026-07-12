import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import type { GridEvents } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

// happy-dom has no 2D canvas or layout; stub both exactly like grid.test.ts.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  const noop = (): void => {};
  const recording = new Proxy(
    { canvas: null, fillStyle: "", strokeStyle: "", font: "", lineWidth: 1 },
    {
      get(target, prop) {
        if (prop in target) return Reflect.get(target, prop);
        return noop;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value);
        return true;
      },
    },
  );
  const stub = (): CanvasRenderingContext2D => recording as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 400,
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
  if (origClientHeight)
    Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
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
