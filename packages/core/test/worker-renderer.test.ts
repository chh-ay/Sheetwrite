import { describe, expect, it } from "bun:test";
import type { VisibleWindowView } from "../src/types.js";
import { WorkerRenderer } from "../src/worker-renderer.js";

class RecordingWorker {
  readonly messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }
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
    expect(Reflect.set(renderer, "worker", worker)).toBe(true);

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
    expect(Reflect.set(renderer, "worker", worker)).toBe(true);

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
    expect(Reflect.set(renderer, "worker", worker)).toBe(true);

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
    expect(Reflect.set(renderer, "worker", worker)).toBe(true);

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
});
