// OffscreenCanvas paint worker (M5). Receives the transferred canvas + frames
// from the main thread and paints off-thread via the shared `paintFrame`, so a
// busy main thread can't stall scrolling. Custom (function) cell renderers do
// not cross the worker boundary, so the registry here is always empty.
import { blitVerticalScroll, paintFrame, paintFreezeDivider } from "./canvas-paint.js";
import type { CellScalar } from "./types/cell.js";
import type { CellRenderer, RenderLayout, Theme, Viewport } from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

/** Packed window payload (data fields shared by single-frame and pane paints). */
interface PackedPaintData {
  sheet: string;
  rows: { start: number; end: number };
  cols: readonly number[];
  styles: VisibleWindowView["styles"];
  styleIds: Uint32Array;
  valueKinds: Uint8Array;
  numberValues: Float64Array;
  stringPoolIds: Uint32Array;
  stringLocalIds: Int32Array;
  stringPoolUpdateIds?: Uint32Array;
  stringPoolUpdateValues?: readonly string[];
  localStrings?: readonly string[];
}

interface PackedPaintMessage extends PackedPaintData {
  type: "paintPacked";
}

interface WorkerPane {
  packed?: PackedPaintData;
  view?: VisibleWindowView;
  clip: { x: number; y: number; w: number; h: number };
  scrollTop: number;
  scrollLeft: number;
  rowTops?: Float64Array;
  rowHeights?: Float64Array;
}

interface PanesMessage {
  type: "paintPanes";
  panes: WorkerPane[];
  divider: { x: number | null; y: number | null };
}

interface SharedPackedMessage {
  type: "paintPackedShared";
  sheet: string;
  rows: { start: number; end: number };
  cols: readonly number[];
  styles: VisibleWindowView["styles"];
  stringPoolUpdateValues?: readonly string[];
  localStrings?: readonly string[];
  shared: {
    buffer: SharedArrayBuffer;
    generation: number;
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

type WorkerMessage =
  | { type: "init"; canvas: OffscreenCanvas; theme: Theme }
  | { type: "layout"; layout: RenderLayout }
  | { type: "theme"; theme: Theme }
  | { type: "viewport"; viewport: Viewport; dpr: number }
  | { type: "paint"; view: VisibleWindowView }
  | PackedPaintMessage
  | SharedPackedMessage
  | PanesMessage
  | { type: "destroy" };

const NO_RENDERERS: ReadonlyMap<string, CellRenderer> = new Map();
const KIND_NUMBER = 1;
const KIND_STRING = 2;
const NO_STRING = 0xffffffff;

/**
 * Hard cap on the pool-id→string cache, mirroring `SheetwriteStore`. A full-sheet
 * sweep would otherwise grow it to O(distinct strings), duplicating the WASM
 * string pool on the JS heap. At the cap we drop it wholesale and re-warm from
 * this frame's `stringPoolUpdate*` payload — cheap and self-healing.
 */
const STRING_CACHE_CAP = 65_536;

interface WorkerRuntimeState {
  stringCache: Map<number, string>;
  valuesScratch: CellScalar[];
  canvas: OffscreenCanvas | null;
  ctx: OffscreenCanvasRenderingContext2D | null;
  layout: RenderLayout | null;
  theme: Theme | null;
  viewport: Viewport;
  dpr: number;
  lastViewport: Viewport | null;
  lastDpr: number;
}

function unpackPackedView(msg: PackedPaintData, state: WorkerRuntimeState): VisibleWindowView {
  const updateIds = msg.stringPoolUpdateIds;
  const updateValues = msg.stringPoolUpdateValues;

  // Cap the pool-id→string cache before this frame's updates are folded in; the
  // just-swept window re-warms from the update payload below.
  if (state.stringCache.size >= STRING_CACHE_CAP) state.stringCache.clear();
  if (updateIds && updateValues) {
    for (let i = 0; i < updateIds.length; i++) {
      state.stringCache.set(updateIds[i] ?? NO_STRING, updateValues[i] ?? "");
    }
  }

  if (state.valuesScratch.length !== msg.valueKinds.length) {
    state.valuesScratch = new Array(msg.valueKinds.length);
  }
  const localStrings = msg.localStrings ?? [];
  for (let i = 0; i < msg.valueKinds.length; i++) {
    if (msg.valueKinds[i] === KIND_NUMBER) {
      state.valuesScratch[i] = msg.numberValues[i] ?? null;
    } else if (msg.valueKinds[i] === KIND_STRING) {
      const poolId = msg.stringPoolIds[i] ?? NO_STRING;
      if (poolId !== NO_STRING) {
        state.valuesScratch[i] = state.stringCache.get(poolId) ?? null;
      } else {
        const localId = msg.stringLocalIds[i] ?? -1;
        state.valuesScratch[i] = localId >= 0 ? (localStrings[localId] ?? null) : null;
      }
    } else {
      state.valuesScratch[i] = null;
    }
  }

  return {
    sheet: msg.sheet,
    rows: msg.rows,
    cols: msg.cols,
    values: state.valuesScratch,
    styleIds: msg.styleIds,
    styles: msg.styles,
  };
}

function unpackSharedPackedView(
  msg: SharedPackedMessage,
  state: WorkerRuntimeState,
): VisibleWindowView {
  const { buffer, offsets, lengths } = msg.shared;
  const packed: PackedPaintMessage = {
    type: "paintPacked",
    sheet: msg.sheet,
    rows: msg.rows,
    cols: msg.cols,
    styles: msg.styles,
    styleIds: new Uint32Array(buffer, offsets.styleIds, lengths.styleIds),
    valueKinds: new Uint8Array(buffer, offsets.valueKinds, lengths.valueKinds),
    numberValues: new Float64Array(buffer, offsets.numberValues, lengths.numberValues),
    stringPoolIds: new Uint32Array(buffer, offsets.stringPoolIds, lengths.stringPoolIds),
    stringLocalIds: new Int32Array(buffer, offsets.stringLocalIds, lengths.stringLocalIds),
    stringPoolUpdateIds:
      lengths.stringPoolUpdateIds > 0
        ? new Uint32Array(buffer, offsets.stringPoolUpdateIds, lengths.stringPoolUpdateIds)
        : undefined,
    stringPoolUpdateValues: msg.stringPoolUpdateValues,
    localStrings: msg.localStrings,
  };
  return unpackPackedView(packed, state);
}

function releaseSharedPackedView(msg: SharedPackedMessage): void {
  Atomics.store(new Int32Array(msg.shared.buffer, 0, 2), 0, 0);
}

function paintView(state: WorkerRuntimeState, view: VisibleWindowView): boolean {
  if (!state.ctx || !state.canvas || !state.layout || !state.theme) return false;
  const damage = blitVerticalScroll(
    state.ctx,
    state.canvas,
    state.theme,
    state.lastViewport,
    state.viewport,
    state.dpr,
    state.lastDpr,
  );
  paintFrame(
    state.ctx,
    view,
    state.layout,
    state.theme,
    state.viewport,
    state.dpr,
    NO_RENDERERS,
    damage,
  );
  state.lastViewport = { ...state.viewport };
  state.lastDpr = state.dpr;
  return true;
}

/** Paint one frame as clipped frozen panes; pane frames never blit. */
function paintPanesFrame(state: WorkerRuntimeState, msg: PanesMessage): boolean {
  if (!state.ctx || !state.canvas || !state.layout || !state.theme) return false;
  state.lastViewport = null;

  for (const pane of msg.panes) {
    const view = pane.packed ? unpackPackedView(pane.packed, state) : pane.view;
    if (!view) continue;
    const paneViewport: Viewport = {
      scrollTop: pane.scrollTop,
      scrollLeft: pane.scrollLeft,
      width: state.viewport.width,
      height: state.viewport.height,
      rowTops: pane.rowTops,
      rowHeights: pane.rowHeights,
    };
    paintFrame(
      state.ctx,
      view,
      state.layout,
      state.theme,
      paneViewport,
      state.dpr,
      NO_RENDERERS,
      undefined,
      pane.clip,
    );
  }

  paintFreezeDivider(state.ctx, state.theme, state.viewport, state.dpr, msg.divider);
  return true;
}

/** Acknowledgement posted back to the sender after a frame actually painted. */
export type WorkerAcknowledgement = { type: "painted" };

/**
 * Build the worker-side protocol handler. Keeping the mutable render state
 * inside the returned closure lets tests exercise the real message contract
 * without booting a browser Worker.
 */
export function createWorkerMessageHandler(
  postAcknowledgement: (message: WorkerAcknowledgement) => void,
): (message: unknown) => void {
  const state: WorkerRuntimeState = {
    stringCache: new Map(),
    valuesScratch: [],
    canvas: null,
    ctx: null,
    layout: null,
    theme: null,
    viewport: { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 },
    dpr: 1,
    lastViewport: null,
    lastDpr: 1,
  };
  const acknowledgeFrame = (painted: boolean): void => {
    if (painted) postAcknowledgement({ type: "painted" });
  };

  return (input: unknown): void => {
    if (input === null || typeof input !== "object" || !("type" in input)) return;
    const msg = input as WorkerMessage;
    switch (msg.type) {
      case "init":
        state.canvas = msg.canvas;
        state.ctx = state.canvas.getContext("2d", { alpha: false, desynchronized: true });
        state.theme = msg.theme;
        state.lastViewport = null;
        break;
      case "layout":
        state.layout = msg.layout;
        state.lastViewport = null;
        break;
      case "theme":
        state.theme = msg.theme;
        state.lastViewport = null;
        break;
      case "viewport":
        state.viewport = msg.viewport;
        state.dpr = msg.dpr;
        if (state.canvas) {
          const w = Math.max(1, Math.round(state.viewport.width * state.dpr));
          const h = Math.max(1, Math.round(state.viewport.height * state.dpr));
          if (state.canvas.width !== w || state.canvas.height !== h) {
            state.canvas.width = w;
            state.canvas.height = h;
            state.lastViewport = null;
          }
        }
        break;
      case "paint":
        acknowledgeFrame(paintView(state, msg.view));
        break;
      case "paintPacked":
        acknowledgeFrame(paintView(state, unpackPackedView(msg, state)));
        break;
      case "paintPanes":
        acknowledgeFrame(paintPanesFrame(state, msg));
        break;
      case "paintPackedShared": {
        let painted = false;
        try {
          painted = paintView(state, unpackSharedPackedView(msg, state));
        } finally {
          releaseSharedPackedView(msg);
        }
        acknowledgeFrame(painted);
        break;
      }
      case "destroy":
        state.ctx = null;
        state.canvas = null;
        state.lastViewport = null;
        break;
    }
  };
}

const handleWorkerMessage = createWorkerMessageHandler((message) => postMessage(message));
addEventListener("message", (event: MessageEvent) => {
  handleWorkerMessage(event.data);
});
