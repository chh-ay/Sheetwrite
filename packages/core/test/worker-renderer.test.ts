import { describe, expect, it, jest } from "bun:test";
import type { PanePaint, RenderLayout, Theme, VisibleWindowView } from "../src/types.js";
import { createWorkerMessageHandler } from "../src/worker.js";
import { WorkerRenderer } from "../src/worker-renderer.js";

let latestConstructedWorker: RecordingWorker | null = null;

class RecordingWorker extends EventTarget {
  readonly messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  terminations = 0;

  constructor() {
    super();
    latestConstructedWorker = this;
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  terminate(): void {
    this.terminations += 1;
  }
}

class StructuredCloneWorker extends EventTarget {
  readonly received: unknown[] = [];

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.received.push(structuredClone(message, { transfer: transfer ?? [] }));
  }

  terminate(): void {}
}

function latestWorker(): RecordingWorker {
  const worker = latestConstructedWorker;
  if (!worker) throw new Error("worker was not constructed");
  return worker;
}

const TEST_THEME: Theme = {
  font: "12px sans-serif",
  bg: "#fff",
  fg: "#111",
  gridLine: "#ddd",
  headerBg: "#eee",
  headerFg: "#222",
  selection: "#def",
  selectionBorder: "#08f",
  rowHeight: 20,
  headerHeight: 24,
  rowHeaderWidth: 40,
  searchMatch: "#ff0",
  searchActiveMatch: "#fa0",
  highlight: "#cfc",
};

interface SharedPaintPost {
  type: "paintPackedShared";
  shared: {
    buffer: SharedArrayBuffer;
    offsets: {
      valueKinds: number;
      numberValues: number;
      stringPoolIds: number;
      stringLocalIds: number;
      styleIds: number;
      stringPoolUpdateIds: number;
    };
    lengths: {
      valueKinds: number;
      numberValues: number;
      stringPoolIds: number;
      stringLocalIds: number;
      styleIds: number;
      stringPoolUpdateIds: number;
    };
  };
}

interface TransferablePackedArrays {
  valueKinds: Uint8Array;
  numberValues: Float64Array;
  stringPoolIds: Uint32Array;
  stringLocalIds: Int32Array;
  styleIds: Uint32Array;
  stringPoolUpdateIds?: Uint32Array;
}

interface GenericPaintPost {
  type: "paint";
  view: {
    sheet: unknown;
    styleIds: Uint32Array;
  };
}

interface PanePaintPost {
  type: "paintPanes";
  panes: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isTransferablePackedArrays(value: unknown): value is TransferablePackedArrays {
  return (
    isRecord(value) &&
    value.valueKinds instanceof Uint8Array &&
    value.numberValues instanceof Float64Array &&
    value.stringPoolIds instanceof Uint32Array &&
    value.stringLocalIds instanceof Int32Array &&
    value.styleIds instanceof Uint32Array &&
    (value.stringPoolUpdateIds === undefined || value.stringPoolUpdateIds instanceof Uint32Array)
  );
}

function isGenericPaintPost(value: unknown): value is GenericPaintPost {
  return (
    isRecord(value) &&
    value.type === "paint" &&
    isRecord(value.view) &&
    value.view.styleIds instanceof Uint32Array
  );
}

function isPanePaintPost(value: unknown): value is PanePaintPost {
  return isRecord(value) && value.type === "paintPanes" && Array.isArray(value.panes);
}

function firstPackedPane(value: unknown): TransferablePackedArrays {
  if (!isPanePaintPost(value)) throw new Error("expected pane paint message");
  const first = value.panes[0];
  if (!isRecord(first) || !isTransferablePackedArrays(first.packed)) {
    throw new Error("expected packed first pane");
  }
  return first.packed;
}

function isSharedPaintPost(value: unknown): value is SharedPaintPost {
  if (!isRecord(value) || value.type !== "paintPackedShared" || !isRecord(value.shared)) {
    return false;
  }
  const shared = value.shared;
  return (
    shared.buffer instanceof SharedArrayBuffer &&
    isRecord(shared.offsets) &&
    isRecord(shared.lengths)
  );
}

function makePackedView(): VisibleWindowView {
  return {
    sheet: "s1",
    rows: { start: 0, end: 1 },
    cols: [0, 1],
    values: ["alpha", 42],
    styleIds: new Uint32Array([0, 1]),
    styles: [{}, { bold: true }],
    valueKinds: new Uint8Array([2, 1]),
    numberValues: new Float64Array([0, 42]),
    stringPoolIds: new Uint32Array([7, 0xffffffff]),
    stringLocalIds: new Int32Array([-1, -1]),
    stringPoolUpdateIds: new Uint32Array([7]),
    stringPoolUpdateValues: ["alpha"],
    localStrings: [],
  };
}

describe("WorkerRenderer", () => {
  it("transfers a renderer-owned style id buffer when painting a generic view", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    const styleIds = new Uint32Array([0, 1, 0]);
    const view: VisibleWindowView = {
      sheet: "s1",
      rows: { start: 0, end: 1 },
      cols: [0, 1, 2],
      values: ["a", "b", "c"],
      styleIds,
      styles: [{}, { bold: true }],
    };

    renderer.paint(view);

    expect(worker.messages).toHaveLength(1);
    const posted = worker.messages[0]!;
    if (!isGenericPaintPost(posted.message)) throw new Error("expected generic paint message");
    const postedView = posted.message.view;
    expect(posted.message).toMatchObject({ type: "paint", view: { sheet: "s1" } });
    expect(postedView.styleIds).toEqual(styleIds);
    expect(postedView.styleIds).not.toBe(styleIds);
    expect(posted.transfer).toEqual([postedView.styleIds.buffer]);
  });

  it("keeps the packed transfer path by default", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    const view = makePackedView();
    renderer.paint(view);

    expect(worker.messages).toHaveLength(1);
    const posted = worker.messages[0]!;
    if (!isTransferablePackedArrays(posted.message)) {
      throw new Error("expected packed paint message");
    }
    const payload = posted.message;
    expect(posted.message).toMatchObject({ type: "paintPacked", sheet: "s1" });
    expect(posted.transfer).toEqual([
      payload.valueKinds.buffer,
      payload.numberValues.buffer,
      payload.stringPoolIds.buffer,
      payload.stringLocalIds.buffer,
      payload.styleIds.buffer,
      payload.stringPoolUpdateIds!.buffer,
    ]);
    expect(payload.valueKinds).not.toBe(view.valueKinds);
    expect(payload.numberValues).not.toBe(view.numberValues);
    expect(payload.stringPoolIds).not.toBe(view.stringPoolIds);
    expect(payload.stringLocalIds).not.toBe(view.stringLocalIds);
    expect(payload.styleIds).not.toBe(view.styleIds);
    expect(payload.stringPoolUpdateIds).not.toBe(view.stringPoolUpdateIds);
  });

  it("keeps cached packed view buffers intact across repeated paints", () => {
    const renderer = new WorkerRenderer();
    const worker = new StructuredCloneWorker();
    Reflect.set(renderer, "worker", worker);
    const view = makePackedView();

    renderer.paint(view);
    renderer.paint(view);

    expect(worker.received).toHaveLength(2);
    const second = worker.received[1];
    if (!isTransferablePackedArrays(second)) throw new Error("expected packed paint message");
    expect(second.valueKinds).toHaveLength(2);
    expect(second.numberValues).toHaveLength(2);
    expect(second.stringPoolIds).toHaveLength(2);
    expect(second.stringLocalIds).toHaveLength(2);
    expect(second.styleIds).toHaveLength(2);
    expect(view.valueKinds).toHaveLength(2);
    expect(view.numberValues).toHaveLength(2);
    expect(view.stringPoolIds).toHaveLength(2);
    expect(view.stringLocalIds).toHaveLength(2);
    expect(view.styleIds).toHaveLength(2);
  });

  it("keeps cached generic view buffers intact across repeated paints", () => {
    const renderer = new WorkerRenderer();
    const worker = new StructuredCloneWorker();
    Reflect.set(renderer, "worker", worker);
    const view: VisibleWindowView = {
      sheet: "s1",
      rows: { start: 0, end: 1 },
      cols: [0, 1],
      values: ["alpha", 42],
      styleIds: new Uint32Array([0, 1]),
      styles: [{}, { bold: true }],
    };

    renderer.paint(view);
    renderer.paint(view);

    const second = worker.received[1];
    if (!isGenericPaintPost(second)) throw new Error("expected generic paint message");
    expect(second.view.styleIds).toHaveLength(2);
    expect(view.styleIds).toHaveLength(2);
  });

  it("preserves resolved hyperlink and conditional styles through the Worker payload", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);
    const view = makePackedView();
    view.styles = [
      {},
      {
        color: "#0563C1",
        underline: true,
        backgroundColor: "#00FF00",
        bold: true,
      },
    ];

    renderer.paint(view);

    const posted = worker.messages[0]!.message as {
      styles: VisibleWindowView["styles"];
      styleIds: Uint32Array;
    };
    expect(posted.styles[1]).toEqual(view.styles[1]);
    expect(Array.from(posted.styleIds)).toEqual([0, 1]);
  });

  it("copies packed frames into a SharedArrayBuffer when opted in", () => {
    const renderer = new WorkerRenderer(undefined, { sharedMemory: true });
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    renderer.paint(makePackedView());

    expect(worker.messages).toHaveLength(1);
    const posted = worker.messages[0]!;
    expect(posted.transfer).toBeUndefined();
    expect(isSharedPaintPost(posted.message)).toBe(true);
    if (!isSharedPaintPost(posted.message)) throw new Error("expected shared paint message");

    const { buffer, offsets, lengths } = posted.message.shared;
    expect(Atomics.load(new Int32Array(buffer, 0, 2), 0)).toBe(1);
    expect(Array.from(new Uint8Array(buffer, offsets.valueKinds, lengths.valueKinds))).toEqual([
      2, 1,
    ]);
    expect(
      Array.from(new Float64Array(buffer, offsets.numberValues, lengths.numberValues)),
    ).toEqual([0, 42]);
    expect(
      Array.from(new Uint32Array(buffer, offsets.stringPoolIds, lengths.stringPoolIds)),
    ).toEqual([7, 0xffffffff]);
    expect(
      Array.from(new Int32Array(buffer, offsets.stringLocalIds, lengths.stringLocalIds)),
    ).toEqual([-1, -1]);
    expect(Array.from(new Uint32Array(buffer, offsets.styleIds, lengths.styleIds))).toEqual([0, 1]);
    expect(
      Array.from(new Uint32Array(buffer, offsets.stringPoolUpdateIds, lengths.stringPoolUpdateIds)),
    ).toEqual([7]);
  });

  it("falls back to transfers instead of overwriting busy shared regions", () => {
    const renderer = new WorkerRenderer(undefined, { sharedMemory: true });
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    renderer.paint(makePackedView());
    renderer.paint(makePackedView());
    renderer.paint(makePackedView());

    expect(worker.messages).toHaveLength(3);
    expect(isSharedPaintPost(worker.messages[0]!.message)).toBe(true);
    expect(isSharedPaintPost(worker.messages[1]!.message)).toBe(true);

    const fallback = worker.messages[2]!;
    expect(fallback.message).toMatchObject({ type: "paintPacked", sheet: "s1" });
    expect(fallback.transfer?.length).toBe(6);
  });
  it("serializes packed and generic frozen panes with the exact transferable buffers", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);
    const packed = makePackedView();
    const generic: VisibleWindowView = {
      sheet: "s1",
      rows: { start: 1, end: 2 },
      cols: [0],
      values: ["fallback"],
      styleIds: new Uint32Array([0]),
      styles: [{}],
    };
    const panes: PanePaint[] = [
      {
        view: packed,
        clip: { x: 0, y: 0, w: 100, h: 40 },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: new Float64Array([0]),
        rowHeights: new Float64Array([24]),
      },
      {
        view: generic,
        clip: { x: 100, y: 0, w: 200, h: 40 },
        scrollTop: 20,
        scrollLeft: 10,
      },
    ];

    renderer.paintPanes(panes, { x: 100, y: null });

    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]!.message).toMatchObject({
      type: "paintPanes",
      divider: { x: 100, y: null },
      panes: [
        {
          packed: { sheet: "s1" },
          view: undefined,
          clip: panes[0]!.clip,
          scrollTop: 0,
          scrollLeft: 0,
        },
        {
          packed: undefined,
          view: generic,
          clip: panes[1]!.clip,
          scrollTop: 20,
          scrollLeft: 10,
        },
      ],
    });
    const posted = worker.messages[0]!;
    const postedPacked = firstPackedPane(posted.message);
    expect(posted.transfer).toEqual([
      postedPacked.valueKinds.buffer,
      postedPacked.numberValues.buffer,
      postedPacked.stringPoolIds.buffer,
      postedPacked.stringLocalIds.buffer,
      postedPacked.styleIds.buffer,
      postedPacked.stringPoolUpdateIds!.buffer,
    ]);
    expect(postedPacked.valueKinds).not.toBe(packed.valueKinds);
    expect(postedPacked.styleIds).not.toBe(packed.styleIds);
  });

  it("keeps cached packed pane buffers intact across repeated paints", () => {
    const renderer = new WorkerRenderer();
    const worker = new StructuredCloneWorker();
    Reflect.set(renderer, "worker", worker);
    const view = makePackedView();
    const panes: PanePaint[] = [
      {
        view,
        clip: { x: 0, y: 0, w: 100, h: 40 },
        scrollTop: 0,
        scrollLeft: 0,
      },
    ];

    renderer.paintPanes(panes, { x: null, y: null });
    renderer.paintPanes(panes, { x: null, y: null });

    expect(worker.received).toHaveLength(2);
    const second = firstPackedPane(worker.received[1]);
    expect(second.valueKinds).toHaveLength(2);
    expect(second.numberValues).toHaveLength(2);
    expect(second.stringPoolIds).toHaveLength(2);
    expect(second.stringLocalIds).toHaveLength(2);
    expect(second.styleIds).toHaveLength(2);
    expect(second.stringPoolUpdateIds).toHaveLength(1);
    expect(view.valueKinds).toHaveLength(2);
    expect(view.numberValues).toHaveLength(2);
    expect(view.stringPoolIds).toHaveLength(2);
    expect(view.stringLocalIds).toHaveLength(2);
    expect(view.styleIds).toHaveLength(2);
    expect(view.stringPoolUpdateIds).toHaveLength(1);
  });

  it("reports initialization failure and one fatal context-loss outcome", () => {
    const nullContextAcknowledgements: unknown[] = [];
    const nullContextCanvas = new EventTarget();
    Object.defineProperties(nullContextCanvas, {
      width: { value: 0, writable: true },
      height: { value: 0, writable: true },
      getContext: { value: () => null },
    });
    createWorkerMessageHandler((message) => nullContextAcknowledgements.push(message))({
      type: "init",
      canvas: nullContextCanvas,
      theme: TEST_THEME,
    });
    expect(nullContextAcknowledgements).toEqual([
      {
        type: "fatal",
        reason: "Sheetwrite: Paint worker could not acquire a 2D context",
      },
    ]);

    const contextLossAcknowledgements: unknown[] = [];
    const contextLossCanvas = new EventTarget();
    Object.defineProperties(contextLossCanvas, {
      width: { value: 0, writable: true },
      height: { value: 0, writable: true },
      getContext: { value: () => ({}) },
    });
    createWorkerMessageHandler((message) => contextLossAcknowledgements.push(message))({
      type: "init",
      canvas: contextLossCanvas,
      theme: TEST_THEME,
    });
    contextLossCanvas.dispatchEvent(new Event("contextlost"));
    contextLossCanvas.dispatchEvent(new Event("contextlost"));
    contextLossCanvas.dispatchEvent(new Event("contextrestored"));
    expect(contextLossAcknowledgements).toEqual([
      { type: "ready" },
      { type: "fatal", reason: "Sheetwrite: Paint worker lost its 2D context" },
    ]);
  });

  it("round-trips sender lifecycle payloads through the worker handler before acknowledging", () => {
    jest.useFakeTimers();
    const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    const transferDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
    );
    const offscreen = new EventTarget();
    Object.defineProperties(offscreen, {
      width: { value: 0, writable: true },
      height: { value: 0, writable: true },
      getContext: { value: () => ({}) },
    });
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: RecordingWorker,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => offscreen,
    });

    const failures: unknown[] = [];
    const renderer = new WorkerRenderer("/worker.js", {}, (error) => failures.push(error));
    try {
      const host = document.createElement("div");
      const layout: RenderLayout = {
        columns: [],
        rowHeight: 20,
        headerHeight: 24,
        totalRows: 0,
      };
      const theme = TEST_THEME;

      latestConstructedWorker = null;
      renderer.mount(host, theme);
      const worker = latestWorker();
      const canvas = host.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("worker canvas was not mounted");

      renderer.setLayout(layout);
      renderer.setTheme(theme);
      renderer.setViewport({ width: 640, height: 480, scrollTop: 12, scrollLeft: 8 });
      renderer.paintPanes([], { x: null, y: null });
      expect(canvas.style.width).toBe("640px");
      expect(canvas.style.height).toBe("480px");

      const paintPayload = worker.messages.at(-1)?.message;
      if (!paintPayload) throw new Error("paint payload was not posted");
      const prematureAcknowledgements: unknown[] = [];
      createWorkerMessageHandler((message) => prematureAcknowledgements.push(message))(
        paintPayload,
      );
      expect(prematureAcknowledgements).toEqual([]);

      const acknowledgements: unknown[] = [];
      const handleWorkerMessage = createWorkerMessageHandler((message) => {
        acknowledgements.push(message);
        worker.emitMessage(message);
      });
      for (const { message } of worker.messages.slice(0, -1)) {
        handleWorkerMessage(message);
      }
      expect(acknowledgements).toEqual([{ type: "ready" }]);
      jest.advanceTimersByTime(30_000);
      expect(failures).toHaveLength(0);
      expect(canvas.dataset.workerFrame).toBe("0");

      handleWorkerMessage(paintPayload);
      expect(acknowledgements).toEqual([{ type: "ready" }, { type: "painted" }]);
      expect(canvas.dataset.workerFrame).toBe("1");

      renderer.destroy();
      handleWorkerMessage(worker.messages.at(-1)?.message);
      expect(acknowledgements).toEqual([{ type: "ready" }, { type: "painted" }]);
      expect(worker.terminations).toBe(1);
      expect(host.querySelector("canvas")).toBeNull();
    } finally {
      renderer.destroy();
      jest.useRealTimers();
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

  it("guards duplicate fatal signals and cancels readiness failure on destroy", () => {
    jest.useFakeTimers();
    const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    const transferDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
    );
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: RecordingWorker,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => new EventTarget(),
    });

    const failures: unknown[] = [];
    const renderer = new WorkerRenderer("/worker.js", {}, (error) => failures.push(error));
    try {
      latestConstructedWorker = null;
      renderer.mount(document.createElement("div"), TEST_THEME);
      const worker = latestWorker();
      worker.emitMessage({ type: "fatal", reason: "context unavailable" });
      worker.emitMessage({ type: "fatal", reason: "duplicate fatal" });
      worker.dispatchEvent(new Event("error", { cancelable: true }));
      jest.advanceTimersByTime(30_000);
      expect(failures).toHaveLength(1);
      expect(worker.terminations).toBe(1);

      const destroyedFailures: unknown[] = [];
      const destroyed = new WorkerRenderer("/worker.js", {}, (error) =>
        destroyedFailures.push(error),
      );
      latestConstructedWorker = null;
      destroyed.mount(document.createElement("div"), TEST_THEME);
      const destroyedWorker = latestWorker();
      destroyed.destroy();
      jest.advanceTimersByTime(30_000);
      expect(destroyedFailures).toHaveLength(0);
      expect(destroyedWorker.terminations).toBe(1);
    } finally {
      renderer.destroy();
      jest.useRealTimers();
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
