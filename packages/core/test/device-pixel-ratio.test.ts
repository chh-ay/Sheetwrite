import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, Store, Workbook } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

class ResolutionQuery extends EventTarget {
  readonly media: string;
  matches = true;

  constructor(media: string) {
    super();
    this.media = media;
  }

  change(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }

  listenerCount = 0;

  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    if (args[0] === "change") this.listenerCount += 1;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
    if (args[0] === "change") this.listenerCount -= 1;
    super.removeEventListener(...args);
  }
}

function makeStore(workbook: Workbook): Store {
  return {
    getWorkbook: () => workbook,
    getCell: () => {
      throw new Error("getCell must not run during painting");
    },
    getFormula: () => null,
    getSpillAnchor: () => null,
    getRefTarget: () => null,
    recalculateVolatile: () => {},
    getVisibleWindow: (sheet, rows, cols) => {
      const size = Math.max(0, (rows.end - rows.start) * cols.length);
      const values: CellScalar[] = new Array(size).fill(null);
      return { sheet, rows, cols, values, styleIds: new Uint32Array(size), styles: [{}] };
    },
    ensureColumns: () => {},
    applyTransaction: () => ({ status: "noop", epoch: 0, reason: "empty" }),
    on: () => () => {},
    viewRowCount: (sheet) => workbook.sheets.find((entry) => entry.id === sheet)?.rowCount ?? 0,
  };
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

async function flushScheduledFrame(frames: Map<number, FrameRequestCallback>): Promise<void> {
  expect(frames.size).toBe(1);
  const entry = frames.entries().next().value;
  if (!entry) throw new Error("expected a scheduled animation frame");
  frames.delete(entry[0]);
  entry[1](0);
  await Promise.resolve();
}

describe("device-pixel-ratio lifecycle", () => {
  let restoreCanvas: () => void;
  let originalDpr: PropertyDescriptor | undefined;
  let originalMatchMedia: typeof globalThis.matchMedia | undefined;
  let originalClientWidth: PropertyDescriptor | undefined;
  let originalClientHeight: PropertyDescriptor | undefined;
  let originalRequestAnimationFrame: PropertyDescriptor | undefined;
  let originalCancelAnimationFrame: PropertyDescriptor | undefined;
  let scheduledFrames: Map<number, FrameRequestCallback>;
  let dpr: number;
  let queries: ResolutionQuery[];

  beforeEach(() => {
    restoreCanvas = installCanvasTestStubs();
    originalDpr = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
    originalMatchMedia = globalThis.matchMedia;
    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(
      globalThis,
      "requestAnimationFrame",
    );
    originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(
      globalThis,
      "cancelAnimationFrame",
    );
    dpr = 1;
    queries = [];
    scheduledFrames = new Map();
    let nextFrame = 1;

    Object.defineProperty(globalThis, "devicePixelRatio", {
      configurable: true,
      get: () => dpr,
    });
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      value: (media: string) => {
        const query = new ResolutionQuery(media);
        queries.push(query);
        return query as unknown as MediaQueryList;
      },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback): number => {
        const frame = nextFrame++;
        scheduledFrames.set(frame, callback);
        return frame;
      },
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: (frame: number): void => {
        scheduledFrames.delete(frame);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return (this as HTMLElement).classList.contains("sheetwrite-viewport") ? 800 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return (this as HTMLElement).classList.contains("sheetwrite-viewport") ? 372 : 0;
      },
    });
  });

  afterEach(() => {
    restoreCanvas();
    if (originalDpr) Object.defineProperty(globalThis, "devicePixelRatio", originalDpr);
    else Reflect.deleteProperty(globalThis, "devicePixelRatio");
    if (originalMatchMedia) {
      Object.defineProperty(globalThis, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    } else {
      Reflect.deleteProperty(globalThis, "matchMedia");
    }
    if (originalRequestAnimationFrame) {
      Object.defineProperty(globalThis, "requestAnimationFrame", originalRequestAnimationFrame);
    } else {
      Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    }
    if (originalCancelAnimationFrame) {
      Object.defineProperty(globalThis, "cancelAnimationFrame", originalCancelAnimationFrame);
    } else {
      Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
    }
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    } else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    } else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    document.body.replaceChildren();
  });

  it("rearms its resolution query, repaints, and detaches on destroy", async () => {
    const workbook = makeWorkbook(20);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, makeStore(workbook));
    const canvas = host.querySelector("canvas");

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(queries.map((query) => query.media)).toEqual(["(resolution: 1dppx)"]);
    expect(queries[0]?.listenerCount).toBe(1);
    expect(canvas?.width).toBe(800);

    dpr = 2;
    queries[0]?.change(false);

    expect(queries.map((query) => query.media)).toEqual([
      "(resolution: 1dppx)",
      "(resolution: 2dppx)",
    ]);
    expect(queries[0]?.listenerCount).toBe(0);
    expect(queries[1]?.listenerCount).toBe(1);
    expect(canvas?.width).toBe(800);
    await flushScheduledFrame(scheduledFrames);
    expect(canvas?.width).toBe(1_600);

    dpr = 1;
    queries[1]?.change(false);
    expect(queries.map((query) => query.media)).toEqual([
      "(resolution: 1dppx)",
      "(resolution: 2dppx)",
      "(resolution: 1dppx)",
    ]);
    expect(canvas?.width).toBe(1_600);
    await flushScheduledFrame(scheduledFrames);
    expect(canvas?.width).toBe(800);

    grid.destroy();
    expect(queries[2]?.listenerCount).toBe(0);

    dpr = 2;
    queries[2]?.change(false);
    expect(queries).toHaveLength(3);
    expect(scheduledFrames.size).toBe(0);

    for (let cycle = 0; cycle < 3; cycle++) {
      const cycleWorkbook = makeWorkbook(20);
      const cycleGrid = new GridImpl(
        mountHost(),
        { workbook: cycleWorkbook },
        makeStore(cycleWorkbook),
      );
      expect(queries.reduce((count, query) => count + query.listenerCount, 0)).toBe(1);
      cycleGrid.destroy();
      expect(queries.reduce((count, query) => count + query.listenerCount, 0)).toBe(0);
    }
  });

  it("posts the new DPR to the Worker viewport before repainting", async () => {
    const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    const transferDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
    );
    let instance: RecordingWorker | null = null;

    class RecordingWorker extends EventTarget {
      readonly messages: unknown[] = [];

      constructor() {
        super();
        instance = this;
      }

      postMessage(message: unknown): void {
        this.messages.push(message);
      }

      terminate(): void {}
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: RecordingWorker,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => ({}),
    });

    let grid: GridImpl | undefined;
    try {
      const workbook = makeWorkbook(20);
      grid = new GridImpl(
        mountHost(),
        { workbook, renderer: "worker", workerUrl: "/worker.js" },
        makeStore(workbook),
      );
      const worker = instance as RecordingWorker | null;
      if (!worker) throw new Error("expected the Worker renderer to construct a worker");
      const viewportDprs = (): number[] =>
        worker.messages.flatMap((message) =>
          message !== null &&
          typeof message === "object" &&
          "type" in message &&
          message.type === "viewport" &&
          "dpr" in message &&
          typeof message.dpr === "number"
            ? [message.dpr]
            : [],
        );

      expect(grid.rendererKind()).toBe("worker");
      expect(viewportDprs()).toEqual([1]);

      dpr = 2;
      queries[0]?.change(false);
      expect(viewportDprs()).toEqual([1]);
      await flushScheduledFrame(scheduledFrames);
      expect(viewportDprs()).toEqual([1, 2]);
    } finally {
      grid?.destroy();
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
});
