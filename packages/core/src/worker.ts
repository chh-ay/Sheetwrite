// OffscreenCanvas paint worker (M5). Receives the transferred canvas + frames
// from the main thread and paints off-thread via the shared `paintFrame`, so a
// busy main thread can't stall scrolling. Custom (function) cell renderers do
// not cross the worker boundary, so the registry here is always empty.
import { paintFrame } from "./canvas-paint";
import type { CellRenderer, RenderLayout, Theme, Viewport, VisibleWindowView } from "./types";

type WorkerMessage =
  | { type: "init"; canvas: OffscreenCanvas; theme: Theme }
  | { type: "layout"; layout: RenderLayout }
  | { type: "theme"; theme: Theme }
  | { type: "viewport"; viewport: Viewport; dpr: number }
  | { type: "paint"; view: VisibleWindowView }
  | { type: "destroy" };

const NO_RENDERERS: ReadonlyMap<string, CellRenderer> = new Map();

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let layout: RenderLayout | null = null;
let theme: Theme | null = null;
let viewport: Viewport = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
let dpr = 1;

addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as WorkerMessage;
  switch (msg.type) {
    case "init":
      ctx = msg.canvas.getContext("2d");
      theme = msg.theme;
      break;
    case "layout":
      layout = msg.layout;
      break;
    case "theme":
      theme = msg.theme;
      break;
    case "viewport":
      viewport = msg.viewport;
      dpr = msg.dpr;
      if (ctx) {
        ctx.canvas.width = Math.max(1, Math.round(viewport.width * dpr));
        ctx.canvas.height = Math.max(1, Math.round(viewport.height * dpr));
      }
      break;
    case "paint":
      if (ctx && layout && theme) {
        paintFrame(ctx, msg.view, layout, theme, viewport, dpr, NO_RENDERERS);
      }
      break;
    case "destroy":
      ctx = null;
      break;
  }
});
