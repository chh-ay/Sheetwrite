// Theme, cell-renderer, layout, viewport, and backend contracts.
// No runtime values live here.

import type { CellScalar, CellStyle, Column } from "./cell.js";
import type { VisibleWindowView } from "./store.js";

/** Resolved canvas colors, typography, and geometry used for painting. */
export interface Theme {
  /** Canvas font shorthand used for unstyled cells. */
  font: string;
  /** CSS color painted behind body cells. */
  bg: string;
  /** CSS color used for unstyled cell text. */
  fg: string;
  /** CSS color used for cell grid lines. */
  gridLine: string;
  /** CSS color painted behind column and row headers. */
  headerBg: string;
  /** CSS color used for column letters and row numbers. */
  headerFg: string;
  /** CSS color painted over the selected region. */
  selection: string;
  /** CSS color used for the active selection outline. */
  selectionBorder: string;
  /** Default data-row height in unzoomed CSS pixels. */
  rowHeight: number;
  /** Column-header height in unzoomed CSS pixels. */
  headerHeight: number;
  /** Width of the left row-number gutter (0 hides it). */
  rowHeaderWidth: number;
  /** Fill behind a search match. */
  searchMatch: string;
  /** Fill/outline for the active (current) search match. */
  searchActiveMatch: string;
  /** Fill for cells highlighted via Grid.highlightCells. */
  highlight: string;
}

/** Read-only cell value and screen geometry supplied to a custom renderer. */
export interface CellPaintContext {
  value: CellScalar;
  x: number;
  y: number;
  w: number;
  h: number;
  theme: Theme;
  style: CellStyle;
}

/** Custom cell renderer hooks for the main-thread canvas or retained DOM overlay. */
export interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  /** Creates a fresh, detached element uniquely owned by one retained DOM cell. */
  dom?(c: CellPaintContext): HTMLElement;
  /** Updates a retained element after its value, style, theme, or geometry changes. */
  update?(element: HTMLElement, c: CellPaintContext): void;
  /** Runs immediately before a retained element is removed or replaced. */
  destroy?(element: HTMLElement): void;
}

export interface RenderLayout {
  columns: readonly Column[];
  rowHeight: number;
  headerHeight: number;
  /** Grid zoom used to scale base-unit per-cell typography exactly once. */
  zoom?: number;
  totalRows: number;
  /** Merged cell regions in display-row space (empty under sort/filter). */
  merges?: ReadonlyArray<{ r0: number; c0: number; r1: number; c1: number }>;
  /** Columns whose registered renderer owns cell content in the DOM overlay. */
  domRendererColumns?: Uint8Array;
}

export interface Viewport {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
  /** Content/layout/theme revision; unchanged for pure scroll. */
  contentRevision?: number;
  /**
   * Per-row geometry for the rows currently painted, aligned to the window's
   * row range (index 0 is the window's first row). Tops are in content space
   * (sheet coordinates, before subtracting `scrollTop`); heights are per row.
   * Present when row heights are non-uniform; when omitted the renderer falls
   * back to the uniform `Theme.rowHeight`.
   */
  rowTops?: Float64Array;
  rowHeights?: Float64Array;
}

/** One frozen-pane paint: a window plus the clip rect and scroll offsets it paints with. */
export interface PanePaint {
  view: VisibleWindowView;
  /** Viewport-space clip rectangle for this pane. */
  clip: { x: number; y: number; w: number; h: number };
  /** Vertical scroll offset this pane paints with (0 for pinned rows). */
  scrollTop: number;
  /** Horizontal scroll offset this pane paints with (0 for pinned columns). */
  scrollLeft: number;
  /** Per-pane row geometry (window-aligned), like Viewport.rowTops/rowHeights. */
  rowTops?: Float64Array;
  rowHeights?: Float64Array;
}

export interface Renderer {
  mount(host: HTMLElement, theme: Theme): void;
  setLayout(layout: RenderLayout): void;
  setViewport(viewport: Viewport): void;
  /** Paint a window. The renderer never touches the store. */
  paint(view: VisibleWindowView): void;
  /**
   * Paint one frame as clipped frozen panes (corner/top/left/body). Present on
   * the built-in renderers; the grid falls back to `paint` when absent or when
   * nothing is frozen. `divider` marks the freeze boundary lines to draw.
   */
  paintPanes?(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void;
  setTheme(theme: Theme): void;
  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void;
  destroy(): void;
}
