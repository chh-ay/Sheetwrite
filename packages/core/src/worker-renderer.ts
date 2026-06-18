import type { Renderer, RenderLayout, Theme, Viewport, VisibleWindowView } from "./types";

/**
 * OffscreenCanvas-in-Worker renderer: paint runs off the main thread, immune to
 * a contended main thread. Same `Renderer` interface as `CanvasRenderer`, so it
 * is a drop-in (`renderer: "worker"`). Custom cell renderers are not supported
 * here (functions can't be transferred to a worker).
 */
export class WorkerRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private worker: Worker | null = null;

  constructor(private readonly workerUrl?: string | URL) {}

  mount(host: HTMLElement, theme: Theme): void {
    // Construct the worker first: if it throws (bundling/security), the canvas
    // is never transferred and the grid falls back to the main-thread renderer.
    const url = this.workerUrl ?? new URL("./worker.js", import.meta.url);
    const worker = new Worker(url, { type: "module" });

    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    host.appendChild(canvas);

    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ type: "init", canvas: offscreen, theme }, [offscreen]);
    this.canvas = canvas;
    this.worker = worker;
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
    this.worker?.postMessage({ type: "paint", view });
  }

  destroy(): void {
    this.worker?.postMessage({ type: "destroy" });
    this.worker?.terminate();
    this.worker = null;
    this.canvas?.remove();
    this.canvas = null;
  }
}
