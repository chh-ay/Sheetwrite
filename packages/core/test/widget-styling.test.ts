import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { GridConfig, Theme } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

// A full, deliberately un-themey palette. Passing every Theme field avoids
// Partial-merge ambiguity, and the distinctive hex values make the seeded
// custom properties (and their var() resolution) unmistakable regardless of
// stylesheet load order — opts.theme wins last over DEFAULT_THEME and CSS.
const THEME: Theme = {
  font: "20px monospace",
  bg: "#010203",
  fg: "#040506",
  gridLine: "#070809",
  headerBg: "#0a0b0c",
  headerFg: "#0d0e0f",
  selection: "#10111299",
  selectionBorder: "#141516",
  rowHeight: 28,
  headerHeight: 32,
  rowHeaderWidth: 48,
  searchMatch: "#171819",
  searchActiveMatch: "#1a1b1c",
  highlight: "#1d1e1f",
};

// ── happy-dom harness (copied from grid-interaction.test.ts:9-76) ────────────
// happy-dom has no 2D canvas context and no layout engine, so the grid needs a
// stubbed context and hard-coded element dimensions to construct and paint.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const originalRaf = globalThis.requestAnimationFrame;

// Grids/hosts and stylesheets created per test, torn down in afterEach so no
// listeners, DOM, or CSS leak across tests (full-suite isolation).
const mounted: Array<{ host: HTMLElement; grid: GridImpl }> = [];
const injectedStyles: HTMLStyleElement[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  const rec: Record<string, unknown> = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
  };
  for (const op of [
    "setTransform",
    "fillRect",
    "fillText",
    "beginPath",
    "rect",
    "clip",
    "save",
    "restore",
    "moveTo",
    "lineTo",
    "stroke",
  ]) {
    rec[op] = () => {};
  }
  const stub = (): CanvasRenderingContext2D => rec as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 400,
  });

  // Make scheduled renders run synchronously so a resize's repaint is observable
  // without racing a real animation-frame timer.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  for (const { host, grid } of mounted.splice(0)) {
    grid.destroy();
    host.remove();
  }
  for (const style of injectedStyles.splice(0)) style.remove();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
  if (origClientHeight)
    Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
  globalThis.requestAnimationFrame = originalRaf;
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

// `config: {}` is truthy with no flag disabled, so the grid mounts the default
// toolbar (buttons AND color inputs); the context menu and find bar are on by
// default. A caller-supplied store keeps this WASM-light.
function makeGrid(config: GridConfig = {}): { host: HTMLDivElement; grid: GridImpl } {
  const workbook = makeWorkbook();
  const store = new SheetwriteStore(workbook, makeColumnarData(50));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook, config, theme: THEME }, store);
  mounted.push({ host, grid });
  return { host, grid };
}

function injectStyle(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  injectedStyles.push(style);
  return style;
}

function mustFind<T extends Element = HTMLElement>(host: HTMLElement, selector: string): T {
  const node = host.querySelector(selector);
  if (!node) throw new Error(`expected ${selector} to be mounted`);
  return node as unknown as T;
}

describe("built-in widget styling", () => {
  // ── Seeding: theme → host-root custom properties ───────────────────────────
  // Contract: construction seeds every widget token on the shared host root
  // (the ancestor that parents each widget), verbatim from the resolved theme.
  // These are what styles.css reads via var(); if seeding drops or mismaps a
  // field the widgets silently lose their theme.
  it("seeds the widget custom properties onto the host root from the theme", () => {
    const { host } = makeGrid();
    const prop = (name: string): string => host.style.getPropertyValue(name);

    expect(prop("--sheetwrite-widget-bg")).toBe(THEME.bg);
    expect(prop("--sheetwrite-widget-fg")).toBe(THEME.fg);
    expect(prop("--sheetwrite-widget-border")).toBe(THEME.gridLine);
    expect(prop("--sheetwrite-widget-accent")).toBe(THEME.headerFg);
    expect(prop("--sheetwrite-widget-selection")).toBe(THEME.selection);
    expect(prop("--sheetwrite-toolbar-bg")).toBe(THEME.headerBg);
    expect(prop("--sheetwrite-toolbar-fg")).toBe(THEME.headerFg);
    expect(prop("--sheetwrite-menu-hover")).toBe(THEME.gridLine);
    expect(prop("--sheetwrite-widget-font")).toBe(THEME.font);
  });

  // ── Class structure + inline/CSS split ─────────────────────────────────────
  // Contract: the restyling hooks host CSS targets exist, and cosmetics left
  // the inline style (moved to styles.css) while only positioning/visibility
  // stay inline. A regression that hardcodes background/color inline again would
  // outrank author rules and break restyling — this pins the split.
  it("exposes the styling hooks and keeps only positioning inline on the find bar", () => {
    const { host } = makeGrid();

    const findEl = mustFind<HTMLElement>(host, ".sheetwrite-find");

    const iconBtn = mustFind(host, ".sheetwrite-find-prev");
    expect(iconBtn.classList.contains("sheetwrite-find-btn")).toBe(true);
    expect(iconBtn.classList.contains("sheetwrite-find-icon-btn")).toBe(true);

    const textBtn = mustFind(host, ".sheetwrite-find-replace");
    expect(textBtn.classList.contains("sheetwrite-find-btn")).toBe(true);
    expect(textBtn.classList.contains("sheetwrite-find-text-btn")).toBe(true);

    expect(host.querySelector(".sheetwrite-toolbar")).not.toBeNull();
    expect(host.querySelectorAll(".sheetwrite-tb-button").length).toBeGreaterThan(0);
    expect(host.querySelectorAll(".sheetwrite-tb-color").length).toBeGreaterThan(0);

    expect(host.querySelector(".sheetwrite-context-menu")).not.toBeNull();
    expect(host.querySelectorAll(".sheetwrite-context-menu-item").length).toBeGreaterThan(0);

    // Cosmetics moved to CSS; positioning/visibility stay inline (behavior).
    expect(findEl.style.background).toBe("");
    expect(findEl.style.color).toBe("");
    expect(findEl.style.border).toBe("");
    expect(findEl.style.position).toBe("absolute");
  });

  // ── Computed-style parity + host override (the core restyling proof) ───────
  // Contract: with the real stylesheet loaded the seeded tokens flow through
  // var() to the exact themed colors, AND a host rule setting the token on the
  // widget element wins over the ancestor-inherited value WITHOUT !important —
  // which is the whole point of seeding on the root, not the widget.
  it("resolves seeded vars to themed colors and lets a host rule override without !important", () => {
    injectStyle(readFileSync(new URL("../styles.css", import.meta.url), "utf8"));

    const { host } = makeGrid();

    // Ctrl+F on the host flips the find bar from display:none to display:flex.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));

    const findEl = mustFind<HTMLElement>(host, ".sheetwrite-find");
    const toolbarEl = mustFind<HTMLElement>(host, ".sheetwrite-toolbar");

    // Capability probe: does this happy-dom resolve var() in getComputedStyle?
    // If a future version regresses, we degrade to the seeding/structure proof
    // above rather than emit a false failure on an engine limitation.
    const probe = document.createElement("div");
    probe.className = "__probe";
    probe.style.setProperty("--x", "#020202");
    document.body.appendChild(probe);
    injectStyle(".__probe { background: var(--x); }");
    const varSupported = getComputedStyle(probe).background === "#020202";
    probe.remove();

    if (varSupported) {
      // Default parity: seeded tokens resolve through var() to the themed values.
      expect(getComputedStyle(findEl).background).toBe(THEME.bg);
      expect(getComputedStyle(toolbarEl).background).toBe(THEME.headerBg);

      // Host override wins without !important: a rule matching the widget
      // directly beats the value inherited from the ancestor host root.
      injectStyle(".sheetwrite-find { --sheetwrite-widget-bg: #abcabc; }");
      const overridden = getComputedStyle(findEl).background;
      expect(overridden).toBe("#abcabc");
      expect(overridden).not.toBe(THEME.bg);
    } else {
      // Fallback: the seeding + structure contract still holds.
      expect(host.style.getPropertyValue("--sheetwrite-widget-bg")).toBe(THEME.bg);
      expect(getComputedStyle(findEl).display).toBe("flex");
    }
  });
  it("renders icon strings as text and supports reusable SVG nodes and factories", () => {
    const shared = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    shared.setAttribute("data-icon", "shared");

    const { host } = makeGrid({
      toolbar: [
        { action: "bold", icon: '<img src=x onerror="alert(1)">' },
        { action: "italic", icon: shared },
        { action: "underline", icon: shared },
        {
          action: "strikethrough",
          icon: () => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("data-icon", "factory");
            return svg;
          },
        },
      ],
    });

    const raw = mustFind<HTMLButtonElement>(host, ".sheetwrite-tb-bold");
    expect(raw.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(raw.children).toHaveLength(0);

    const italic = mustFind<HTMLButtonElement>(host, ".sheetwrite-tb-italic");
    const underline = mustFind<HTMLButtonElement>(host, ".sheetwrite-tb-underline");
    expect(italic.querySelector("svg[data-icon=shared]")).not.toBeNull();
    expect(underline.querySelector("svg[data-icon=shared]")).not.toBeNull();
    expect(italic.firstElementChild).not.toBe(underline.firstElementChild);

    expect(
      host.querySelector(".sheetwrite-tb-strikethrough svg[data-icon=factory]"),
    ).not.toBeNull();
  });
});
