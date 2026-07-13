import type {
  PanePaint,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types.js";

export interface WorkerRendererOptions {
  /**
   * Force the SharedArrayBuffer paint path. Browsers normally require
   * `crossOriginIsolated`; tests and hosts that already enforce COOP/COEP can
   * opt in explicitly. When false/unavailable, the renderer keeps the transfer
   * path byte-for-byte compatible.
   */
  sharedMemory?: boolean;
}

interface SharedPackedOffsets {
  valueKinds: number;
  numberValues: number;
  stringPoolIds: number;
  stringLocalIds: number;
  styleIds: number;
  stringPoolUpdateIds: number;
}

interface SharedPackedLengths {
  valueKinds: number;
  numberValues: number;
  stringPoolIds: number;
  stringLocalIds: number;
  styleIds: number;
  stringPoolUpdateIds: number;
}

interface SharedPackedLayout {
  totalBytes: number;
  offsets: SharedPackedOffsets;
  lengths: SharedPackedLengths;
}

interface SharedRegion {
  buffer: SharedArrayBuffer;
  header: Int32Array;
  byteLength: number;
  generation: number;
}

const SHARED_REGION_COUNT = 2;
const SHARED_HEADER_INTS = 2;
const SHARED_HEADER_BYTES = SHARED_HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const SHARED_STATE_SLOT = 0;
const SHARED_GENERATION_SLOT = 1;
const SHARED_FREE = 0;
const SHARED_BUSY = 1;

function align(offset: number, alignment: number): number {
  return (offset + alignment - 1) & ~(alignment - 1);
}

function sharedPackedLayout(cellCount: number, stringUpdateCount: number): SharedPackedLayout {
  let offset = SHARED_HEADER_BYTES;

  const valueKinds = offset;
  offset += cellCount * Uint8Array.BYTES_PER_ELEMENT;

  offset = align(offset, Float64Array.BYTES_PER_ELEMENT);
  const numberValues = offset;
  offset += cellCount * Float64Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const stringPoolIds = offset;
  offset += cellCount * Uint32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Int32Array.BYTES_PER_ELEMENT);
  const stringLocalIds = offset;
  offset += cellCount * Int32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const styleIds = offset;
  offset += cellCount * Uint32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const stringPoolUpdateIds = offset;
  offset += stringUpdateCount * Uint32Array.BYTES_PER_ELEMENT;

  return {
    totalBytes: offset,
    offsets: {
      valueKinds,
      numberValues,
      stringPoolIds,
      stringLocalIds,
      styleIds,
      stringPoolUpdateIds,
    },
    lengths: {
      valueKinds: cellCount,
      numberValues: cellCount,
      stringPoolIds: cellCount,
      stringLocalIds: cellCount,
      styleIds: cellCount,
      stringPoolUpdateIds: stringUpdateCount,
    },
  };
}

/**
 * OffscreenCanvas-in-Worker renderer: paint runs off the main thread, immune to
 * a contended main thread. Same `Renderer` interface as `CanvasRenderer`, so it
 * is a drop-in (`renderer: "worker"`). Custom cell renderers are not supported
 * here (functions can't be transferred to a worker).
 */
export class WorkerRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private worker: Worker | null = null;
  private sharedCursor = 0;
  private readonly sharedRegions: Array<SharedRegion | undefined> = new Array(SHARED_REGION_COUNT);
  private failed = false;
  private frameGeneration = 0;

  constructor(
    private readonly workerUrl?: string | URL,
    private readonly options: WorkerRendererOptions = {},
    private readonly onFailure?: (error: unknown) => void,
  ) {}

  mount(host: HTMLElement, theme: Theme): void {
    // Construct the worker first: if it throws (bundling/security), the canvas
    // is never transferred and the grid falls back to the main-thread renderer.
    const url = this.workerUrl ?? new URL("./worker.js", import.meta.url);
    const worker = new Worker(url, { type: "module" });
    this.worker = worker;
    worker.addEventListener("error", this.onWorkerError);
    worker.addEventListener("message", this.onWorkerMessage);

    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.dataset.workerFrame = "0";

    try {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: "init", canvas: offscreen, theme }, [offscreen]);
      host.appendChild(canvas);
      this.canvas = canvas;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  setLayout(layout: RenderLayout): void {
    this.worker?.postMessage({ type: "layout", layout });
  }

  setTheme(theme: Theme): void {
    this.worker?.postMessage({ type: "theme", theme });
  }

  setRenderers(): void {
    // Custom renderers are functions and cannot cross the worker boundary.
  }

  setViewport(viewport: Viewport): void {
    if (this.canvas) {
      this.canvas.style.width = `${viewport.width}px`;
      this.canvas.style.height = `${viewport.height}px`;
    }
    this.worker?.postMessage({ type: "viewport", viewport, dpr: globalThis.devicePixelRatio ?? 1 });
  }

  paint(view: VisibleWindowView): void {
    const {
      valueKinds,
      numberValues,
      stringPoolIds,
      stringLocalIds,
      stringPoolUpdateIds,
      stringPoolUpdateValues,
      localStrings,
    } = view;
    if (valueKinds && numberValues && stringPoolIds && stringLocalIds) {
      if (
        this.canUseSharedMemory() &&
        this.postSharedPackedView(
          view,
          valueKinds,
          numberValues,
          stringPoolIds,
          stringLocalIds,
          stringPoolUpdateIds,
          stringPoolUpdateValues,
          localStrings,
        )
      ) {
        return;
      }

      const transfers: Transferable[] = [
        valueKinds.buffer as ArrayBuffer,
        numberValues.buffer as ArrayBuffer,
        stringPoolIds.buffer as ArrayBuffer,
        stringLocalIds.buffer as ArrayBuffer,
        view.styleIds.buffer as ArrayBuffer,
      ];
      if (stringPoolUpdateIds) transfers.push(stringPoolUpdateIds.buffer as ArrayBuffer);
      this.worker?.postMessage(
        {
          type: "paintPacked",
          sheet: view.sheet,
          rows: view.rows,
          cols: view.cols,
          styles: view.styles,
          styleIds: view.styleIds,
          valueKinds,
          numberValues,
          stringPoolIds,
          stringLocalIds,
          stringPoolUpdateIds,
          stringPoolUpdateValues,
          localStrings,
        },
        transfers,
      );
      return;
    }

    // Custom Store implementations may not expose raw arrays; keep the
    // compatibility path, still transferring the fresh style-id buffer.
    this.worker?.postMessage({ type: "paint", view }, [view.styleIds.buffer]);
  }

  paintPanes(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void {
    const worker = this.worker;
    if (!worker) return;

    // Pane frames always use the transfer path: the SAB double-buffer protocol
    // hands one region per frame, not one per pane, and frozen frames are
    // bounded by the tiny frozen windows anyway.
    const transfers: Transferable[] = [];
    const payload = panes.map((pane) => {
      const { view } = pane;
      const { valueKinds, numberValues, stringPoolIds, stringLocalIds, stringPoolUpdateIds } = view;
      const packed =
        valueKinds && numberValues && stringPoolIds && stringLocalIds
          ? {
              sheet: view.sheet,
              rows: view.rows,
              cols: view.cols,
              styles: view.styles,
              styleIds: view.styleIds,
              valueKinds,
              numberValues,
              stringPoolIds,
              stringLocalIds,
              stringPoolUpdateIds,
              stringPoolUpdateValues: view.stringPoolUpdateValues,
              localStrings: view.localStrings,
            }
          : undefined;
      if (packed) {
        transfers.push(
          packed.valueKinds.buffer as ArrayBuffer,
          packed.numberValues.buffer as ArrayBuffer,
          packed.stringPoolIds.buffer as ArrayBuffer,
          packed.stringLocalIds.buffer as ArrayBuffer,
          packed.styleIds.buffer as ArrayBuffer,
        );
        if (stringPoolUpdateIds) transfers.push(stringPoolUpdateIds.buffer as ArrayBuffer);
      }

      return {
        packed,
        // Structured-clone fallback for custom stores without raw arrays.
        view: packed ? undefined : view,
        clip: pane.clip,
        scrollTop: pane.scrollTop,
        scrollLeft: pane.scrollLeft,
        rowTops: pane.rowTops,
        rowHeights: pane.rowHeights,
      };
    });

    worker.postMessage({ type: "paintPanes", panes: payload, divider }, transfers);
  }

  destroy(): void {
    const worker = this.worker;
    if (worker) {
      worker.removeEventListener("error", this.onWorkerError);
      worker.removeEventListener("message", this.onWorkerMessage);
      worker.postMessage({ type: "destroy" });
      worker.terminate();
    }
    this.worker = null;
    this.canvas?.remove();
    this.canvas = null;
    this.sharedRegions.fill(undefined);
  }

  private readonly onWorkerError = (event: ErrorEvent): void => {
    if (this.failed) return;
    this.failed = true;
    event.preventDefault();
    const error =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || "Sheetwrite: Worker renderer failed to load");
    const onFailure = this.onFailure;
    this.destroy();
    onFailure?.(error);
  };

  private readonly onWorkerMessage = (event: MessageEvent<unknown>): void => {
    if (
      event.data === null ||
      typeof event.data !== "object" ||
      !("type" in event.data) ||
      event.data.type !== "painted"
    ) {
      return;
    }
    this.frameGeneration++;
    if (this.canvas) this.canvas.dataset.workerFrame = String(this.frameGeneration);
  };

  private canUseSharedMemory(): boolean {
    return (
      typeof SharedArrayBuffer === "function" &&
      (this.options.sharedMemory === true || globalThis.crossOriginIsolated === true)
    );
  }

  private postSharedPackedView(
    view: VisibleWindowView,
    valueKinds: Uint8Array,
    numberValues: Float64Array,
    stringPoolIds: Uint32Array,
    stringLocalIds: Int32Array,
    stringPoolUpdateIds: Uint32Array | undefined,
    stringPoolUpdateValues: readonly string[] | undefined,
    localStrings: readonly string[] | undefined,
  ): boolean {
    const worker = this.worker;
    if (!worker) return false;

    const layout = sharedPackedLayout(valueKinds.length, stringPoolUpdateIds?.length ?? 0);
    for (let attempt = 0; attempt < SHARED_REGION_COUNT; attempt++) {
      const regionIndex = (this.sharedCursor + attempt) % SHARED_REGION_COUNT;
      const region = this.sharedRegion(regionIndex, layout.totalBytes);
      if (
        Atomics.compareExchange(region.header, SHARED_STATE_SLOT, SHARED_FREE, SHARED_BUSY) !==
        SHARED_FREE
      ) {
        continue;
      }

      region.generation = (region.generation + 1) | 0;
      if (region.generation === 0) region.generation = 1;
      Atomics.store(region.header, SHARED_GENERATION_SLOT, region.generation);
      this.copyPackedView(
        region.buffer,
        layout,
        valueKinds,
        numberValues,
        stringPoolIds,
        stringLocalIds,
        view.styleIds,
        stringPoolUpdateIds,
      );

      this.sharedCursor = (regionIndex + 1) % SHARED_REGION_COUNT;
      worker.postMessage({
        type: "paintPackedShared",
        sheet: view.sheet,
        rows: view.rows,
        cols: view.cols,
        styles: view.styles,
        stringPoolUpdateValues,
        localStrings,
        shared: {
          buffer: region.buffer,
          generation: region.generation,
          offsets: layout.offsets,
          lengths: layout.lengths,
        },
      });
      return true;
    }

    return false;
  }

  private sharedRegion(index: number, byteLength: number): SharedRegion {
    let region = this.sharedRegions[index];
    if (!region || region.byteLength < byteLength) {
      const buffer = new SharedArrayBuffer(byteLength);
      region = {
        buffer,
        header: new Int32Array(buffer, 0, SHARED_HEADER_INTS),
        byteLength,
        generation: 0,
      };
      this.sharedRegions[index] = region;
    }
    return region;
  }

  private copyPackedView(
    buffer: SharedArrayBuffer,
    layout: SharedPackedLayout,
    valueKinds: Uint8Array,
    numberValues: Float64Array,
    stringPoolIds: Uint32Array,
    stringLocalIds: Int32Array,
    styleIds: Uint32Array,
    stringPoolUpdateIds: Uint32Array | undefined,
  ): void {
    const { offsets, lengths } = layout;
    new Uint8Array(buffer, offsets.valueKinds, lengths.valueKinds).set(valueKinds);
    new Float64Array(buffer, offsets.numberValues, lengths.numberValues).set(numberValues);
    new Uint32Array(buffer, offsets.stringPoolIds, lengths.stringPoolIds).set(stringPoolIds);
    new Int32Array(buffer, offsets.stringLocalIds, lengths.stringLocalIds).set(stringLocalIds);
    new Uint32Array(buffer, offsets.styleIds, lengths.styleIds).set(styleIds);
    if (stringPoolUpdateIds && lengths.stringPoolUpdateIds > 0) {
      new Uint32Array(buffer, offsets.stringPoolUpdateIds, lengths.stringPoolUpdateIds).set(
        stringPoolUpdateIds,
      );
    }
  }
}
