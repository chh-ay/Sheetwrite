import { describe, expect, it } from "bun:test";
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

function latestWorker(): RecordingWorker {
  const worker = latestConstructedWorker;
  if (!worker) throw new Error("worker was not constructed");
  return worker;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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
  it("transfers the visible-window style id buffer when painting a generic view", () => {
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
    expect(posted.message).toEqual({ type: "paint", view });
    expect(posted.transfer).toEqual([styleIds.buffer]);
  });

  it("keeps the packed transfer path by default", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    const view = makePackedView();
    renderer.paint(view);

    expect(worker.messages).toHaveLength(1);
    const posted = worker.messages[0]!;
    expect(posted.message).toMatchObject({ type: "paintPacked", sheet: "s1" });
    expect(posted.transfer).toEqual([
      view.valueKinds!.buffer,
      view.numberValues!.buffer,
      view.stringPoolIds!.buffer,
      view.stringLocalIds!.buffer,
      view.styleIds.buffer,
      view.stringPoolUpdateIds!.buffer,
    ]);
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
    expect(worker.messages[0]!.transfer).toEqual([
      packed.valueKinds!.buffer,
      packed.numberValues!.buffer,
      packed.stringPoolIds!.buffer,
      packed.stringLocalIds!.buffer,
      packed.styleIds.buffer,
      packed.stringPoolUpdateIds!.buffer,
    ]);
  });

  it("round-trips sender lifecycle payloads through the worker handler before acknowledging", () => {
    const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    const transferDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
    );
    const offscreen = {
      width: 0,
      height: 0,
      getContext: () => ({}),
    } as unknown as OffscreenCanvas;
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: RecordingWorker,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => offscreen,
    });

    const renderer = new WorkerRenderer("/worker.js");
    try {
      const host = document.createElement("div");
      const layout: RenderLayout = {
        columns: [],
        rowHeight: 20,
        headerHeight: 24,
        totalRows: 0,
      };
      const theme: Theme = {
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
      expect(acknowledgements).toEqual([]);
      expect(canvas.dataset.workerFrame).toBe("0");

      handleWorkerMessage(paintPayload);
      expect(acknowledgements).toEqual([{ type: "painted" }]);
      expect(canvas.dataset.workerFrame).toBe("1");

      renderer.destroy();
      handleWorkerMessage(worker.messages.at(-1)?.message);
      expect(acknowledgements).toEqual([{ type: "painted" }]);
      expect(worker.terminations).toBe(1);
      expect(host.querySelector("canvas")).toBeNull();
    } finally {
      renderer.destroy();
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
