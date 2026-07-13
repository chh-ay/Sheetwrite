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

  it("falls back exactly once when a constructed worker fails asynchronously", async () => {
    const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    const transferDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
    );
    let instance: RuntimeFailingWorker | null = null;

    class RuntimeFailingWorker extends EventTarget {
      terminations = 0;

      constructor() {
        super();
        instance = this;
      }

      postMessage(): void {}

      terminate(): void {
        this.terminations++;
      }

      fail(error: Error): void {
        const event = new Event("error", { cancelable: true });
        Object.defineProperties(event, {
          error: { value: error },
          message: { value: error.message },
        });
        this.dispatchEvent(event);
      }
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: RuntimeFailingWorker,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => ({}),
    });

    try {
      const host = mountHost();
      const events: Array<GridEvents["renderer-fallback"]> = [];
      const grid = new GridImpl(host, {
        workbook: makeWorkbook(5),
        data: makeColumnarData(5),
        renderer: "worker",
        workerUrl: "/worker-that-fails-after-construction.js",
      });
      grid.on("renderer-fallback", (event) => events.push(event));

      expect(grid.rendererKind()).toBe("worker");
      expect(host.querySelectorAll("canvas")).toHaveLength(1);
      const worker = instance as RuntimeFailingWorker | null;
      if (!worker) throw new Error("Worker was not constructed");

      const failure = new Error("module load failed");
      worker.fail(failure);
      await Promise.resolve();

      expect(grid.rendererKind()).toBe("canvas");
      expect(events).toEqual([{ requested: "worker", error: failure }]);
      expect(host.querySelectorAll("canvas")).toHaveLength(1);
      expect(worker.terminations).toBe(1);

      worker.fail(new Error("duplicate failure"));
      await Promise.resolve();
      expect(events).toHaveLength(1);

      grid.destroy();
      expect(host.querySelectorAll("canvas")).toHaveLength(0);
    } finally {
      if (workerDescriptor) Object.defineProperty(globalThis, "Worker", workerDescriptor);
      else Reflect.deleteProperty(globalThis, "Worker");
      if (transferDescriptor) {
        Object.defineProperty(
          HTMLCanvasElement.prototype,
          "transferControlToOffscreen",
          transferDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen");
      }
    }
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
