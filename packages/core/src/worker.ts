// OffscreenCanvas paint worker (M5). Receives the transferred canvas + frames
// from the main thread and paints off-thread via the shared `paintFrame`, so a
// busy main thread can't stall scrolling. Custom (function) cell renderers do
// not cross the worker boundary, so the registry here is always empty.
import { blitVerticalScroll, paintFrame, paintFreezeDivider } from "./canvas-paint.js";
import type {
  CellRenderer,
  CellScalar,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types.js";

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

const stringCache = new Map<number, string>();

/**
 * Hard cap on the pool-id→string cache, mirroring `SheetwriteStore`. A full-sheet
 * sweep would otherwise grow it to O(distinct strings), duplicating the WASM
 * string pool on the JS heap. At the cap we drop it wholesale and re-warm from
 * this frame's `stringPoolUpdate*` payload — cheap and self-healing.
 */
const STRING_CACHE_CAP = 65_536;

let valuesScratch: CellScalar[] = [];

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let layout: RenderLayout | null = null;
let theme: Theme | null = null;
let viewport: Viewport = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
let dpr = 1;
let lastViewport: Viewport | null = null;
let lastDpr = 1;

function unpackPackedView(msg: PackedPaintData): VisibleWindowView {
  const updateIds = msg.stringPoolUpdateIds;
  const updateValues = msg.stringPoolUpdateValues;

  // Cap the pool-id→string cache before this frame's updates are folded in; the
  // just-swept window re-warms from the update payload below.
  if (stringCache.size >= STRING_CACHE_CAP) stringCache.clear();
  if (updateIds && updateValues) {
    for (let i = 0; i < updateIds.length; i++) {
      stringCache.set(updateIds[i] ?? NO_STRING, updateValues[i] ?? "");
    }
  }

  if (valuesScratch.length !== msg.valueKinds.length)
    valuesScratch = new Array(msg.valueKinds.length);
  const localStrings = msg.localStrings ?? [];
  for (let i = 0; i < msg.valueKinds.length; i++) {
    if (msg.valueKinds[i] === KIND_NUMBER) {
      valuesScratch[i] = msg.numberValues[i] ?? null;
    } else if (msg.valueKinds[i] === KIND_STRING) {
      const poolId = msg.stringPoolIds[i] ?? NO_STRING;
      if (poolId !== NO_STRING) {
        valuesScratch[i] = stringCache.get(poolId) ?? null;
      } else {
        const localId = msg.stringLocalIds[i] ?? -1;
        valuesScratch[i] = localId >= 0 ? (localStrings[localId] ?? null) : null;
      }
    } else {
      valuesScratch[i] = null;
    }
  }

  return {
    sheet: msg.sheet,
    rows: msg.rows,
    cols: msg.cols,
    values: valuesScratch,
    styleIds: msg.styleIds,
    styles: msg.styles,
  };
}

function unpackSharedPackedView(msg: SharedPackedMessage): VisibleWindowView {
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
  return unpackPackedView(packed);
}

function releaseSharedPackedView(msg: SharedPackedMessage): void {
  Atomics.store(new Int32Array(msg.shared.buffer, 0, 2), 0, 0);
}

function paintView(view: VisibleWindowView): boolean {
  if (!ctx || !canvas || !layout || !theme) return false;
  const damage = blitVerticalScroll(ctx, canvas, theme, lastViewport, viewport, dpr, lastDpr);
  paintFrame(ctx, view, layout, theme, viewport, dpr, NO_RENDERERS, damage);
  lastViewport = { ...viewport };
  lastDpr = dpr;
  return true;
}

/** Paint one frame as clipped frozen panes; pane frames never blit. */
function paintPanesFrame(msg: PanesMessage): boolean {
  if (!ctx || !canvas || !layout || !theme) return false;
  lastViewport = null;

  for (const pane of msg.panes) {
    const view = pane.packed ? unpackPackedView(pane.packed) : pane.view;
    if (!view) continue;
    const paneViewport: Viewport = {
      scrollTop: pane.scrollTop,
      scrollLeft: pane.scrollLeft,
      width: viewport.width,
      height: viewport.height,
      rowTops: pane.rowTops,
      rowHeights: pane.rowHeights,
    };
    paintFrame(ctx, view, layout, theme, paneViewport, dpr, NO_RENDERERS, undefined, pane.clip);
  }

  paintFreezeDivider(ctx, theme, viewport, dpr, msg.divider);
  return true;
}

function acknowledgeFrame(painted: boolean): void {
  if (painted) postMessage({ type: "painted" });
}

addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as WorkerMessage;
  switch (msg.type) {
    case "init":
      canvas = msg.canvas;
      ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      theme = msg.theme;
      lastViewport = null;
      break;
    case "layout":
      layout = msg.layout;
      lastViewport = null;
      break;
    case "theme":
      theme = msg.theme;
      lastViewport = null;
      break;
    case "viewport":
      viewport = msg.viewport;
      dpr = msg.dpr;
      if (canvas) {
        const w = Math.max(1, Math.round(viewport.width * dpr));
        const h = Math.max(1, Math.round(viewport.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          lastViewport = null;
        }
      }
      break;
    case "paint":
      acknowledgeFrame(paintView(msg.view));
      break;
    case "paintPacked":
      acknowledgeFrame(paintView(unpackPackedView(msg)));
      break;
    case "paintPanes":
      acknowledgeFrame(paintPanesFrame(msg));
      break;
    case "paintPackedShared": {
      let painted = false;
      try {
        painted = paintView(unpackSharedPackedView(msg));
      } finally {
        releaseSharedPackedView(msg);
      }
      acknowledgeFrame(painted);
      break;
    }
    case "destroy":
      ctx = null;
      canvas = null;
      lastViewport = null;
      break;
  }
});
