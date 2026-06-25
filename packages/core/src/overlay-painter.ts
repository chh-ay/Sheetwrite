import type { EditRect } from "./editor";
import type { SelectionModel, SelRect } from "./selection";
import type { CellAddress, Range, Sheet, SheetId, Theme } from "./types";

export interface OverlayPainterDeps {
  theme: () => Theme;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  selection: () => SelectionModel;
  rowOffsetOf: (row: number) => number;
  colLeftOf: (col: number) => number;
  screenRect: (row: number, col: number, contentTop: number, scrollLeft: number) => EditRect;
  toViewRow: (dataRow: number) => number | null;
  isEditing: () => boolean;
  fillTarget: () => SelRect | null;
  fillHandleScreen: (contentTop: number, scrollLeft: number) => { x: number; y: number } | null;
  searchMatches: () => CellAddress[];
  searchActive: () => number;
  scheduleRender: () => void;
}

/**
 * Owns Layer 2 DOM: selection rectangles, fill affordances, search matches, and
 * manual cell highlights painted over the renderer output.
 */
export class OverlayPainter {
  private readonly overlay: HTMLDivElement;
  private readonly deps: OverlayPainterDeps;
  private manualHighlights: { ranges: Range[]; color: string } | null = null;
  private paintContentTop = 0;
  private paintScrollLeft = 0;
  private paintClientW = 0;
  private paintClientH = 0;
  private paintTheme: Theme | null = null;

  constructor(parent: HTMLElement, deps: OverlayPainterDeps) {
    this.deps = deps;

    const overlay = document.createElement("div");
    overlay.className = "sheetwrite-overlay";
    overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    parent.appendChild(overlay);
    this.overlay = overlay;
  }

  get element(): HTMLDivElement {
    return this.overlay;
  }

  highlightCells(ranges: Range[] | null, color?: string): void {
    this.manualHighlights =
      ranges && ranges.length > 0 ? { ranges, color: color ?? this.deps.theme().highlight } : null;
    this.deps.scheduleRender();
  }

  paint(contentTop: number, scrollLeft: number, clientW: number, clientH: number): void {
    this.overlay.replaceChildren();
    this.paintHighlights(contentTop, scrollLeft, clientW, clientH);

    const selection = this.deps.selection();
    if (selection.isEmpty) return;

    this.paintContentTop = contentTop;
    this.paintScrollLeft = scrollLeft;
    this.paintClientW = clientW;
    this.paintClientH = clientH;
    this.paintTheme = this.deps.theme();
    selection.forEachRect(this.appendSelectionRect);

    this.paintFocus(contentTop, scrollLeft, clientW, clientH);
    this.paintFillPreview(contentTop, scrollLeft);
    this.paintFillHandle(contentTop, scrollLeft);
    this.paintTheme = null;
  }

  destroy(): void {
    this.overlay.remove();
  }

  private paintHighlights(
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const manualHighlights = this.manualHighlights;
    if (manualHighlights) {
      for (const range of manualHighlights.ranges) {
        if (range.sheet !== this.deps.activeSheet()) continue;
        this.appendRange(
          Math.min(range.start.row, range.end.row),
          Math.min(range.start.col, range.end.col),
          Math.max(range.start.row, range.end.row),
          Math.max(range.start.col, range.end.col),
          manualHighlights.color,
          "transparent",
          contentTop,
          scrollLeft,
          clientW,
          clientH,
        );
      }
    }

    const searchMatches = this.deps.searchMatches();
    const searchActive = this.deps.searchActive();
    const activeSheet = this.deps.activeSheet();
    const theme = this.deps.theme();
    for (let i = 0; i < searchMatches.length; i++) {
      const m = searchMatches[i]!;
      if (m.sheet !== activeSheet) continue;

      const viewRow = this.deps.toViewRow(m.row);
      if (viewRow === null) continue;

      const border = i === searchActive ? theme.searchActiveMatch : "transparent";
      this.appendRange(
        viewRow,
        m.col,
        viewRow,
        m.col,
        theme.searchMatch,
        border,
        contentTop,
        scrollLeft,
        clientW,
        clientH,
      );
    }
  }

  private appendRange(
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    fill: string,
    border: string,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const theme = this.deps.theme();
    const left = this.deps.colLeftOf(c0) - scrollLeft + theme.rowHeaderWidth;
    const right = this.colRight(c1) - scrollLeft + theme.rowHeaderWidth;
    const top = theme.headerHeight + this.deps.rowOffsetOf(r0) - contentTop;
    const bottom = theme.headerHeight + this.deps.rowOffsetOf(r1 + 1) - contentTop;
    const clippedTop = Math.max(theme.headerHeight, top);
    if (bottom <= theme.headerHeight || top >= clientH || right <= 0 || left >= clientW) return;
    this.overlay.appendChild(
      rectDiv(left, clippedTop, right - left, bottom - clippedTop, fill, border),
    );
  }

  private readonly appendSelectionRect = (rect: SelRect): void => {
    const theme = this.paintTheme;
    if (!theme) return;

    const left = this.deps.colLeftOf(rect.c0) - this.paintScrollLeft + theme.rowHeaderWidth;
    const right = this.colRight(rect.c1) - this.paintScrollLeft + theme.rowHeaderWidth;
    const top = theme.headerHeight + this.deps.rowOffsetOf(rect.r0) - this.paintContentTop;
    const bottom = theme.headerHeight + this.deps.rowOffsetOf(rect.r1 + 1) - this.paintContentTop;
    const clippedTop = Math.max(theme.headerHeight, top);
    if (
      bottom <= theme.headerHeight ||
      top >= this.paintClientH ||
      right <= 0 ||
      left >= this.paintClientW
    ) {
      return;
    }

    this.overlay.appendChild(
      rectDiv(
        left,
        clippedTop,
        right - left,
        bottom - clippedTop,
        theme.selection,
        theme.selectionBorder,
      ),
    );
  };

  private paintFocus(
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const focus = this.deps.selection().focusCell;
    if (!focus || this.deps.isEditing()) return;

    const theme = this.deps.theme();
    const r = this.deps.screenRect(focus.row, focus.col, contentTop, scrollLeft);
    if (r.y + r.h <= theme.headerHeight || r.y >= clientH || r.x + r.w <= 0 || r.x >= clientW) {
      return;
    }

    const ring = rectDiv(
      r.x,
      Math.max(theme.headerHeight, r.y),
      r.w,
      r.h,
      "transparent",
      theme.selectionBorder,
    );
    ring.style.outlineWidth = "2px";
    this.overlay.appendChild(ring);
  }

  private paintFillPreview(contentTop: number, scrollLeft: number): void {
    const fillTarget = this.deps.fillTarget();
    if (!fillTarget) return;

    const theme = this.deps.theme();
    const fLeft = this.deps.colLeftOf(fillTarget.c0) - scrollLeft + theme.rowHeaderWidth;
    const fRight = this.colRight(fillTarget.c1) - scrollLeft + theme.rowHeaderWidth;
    const fTop = theme.headerHeight + this.deps.rowOffsetOf(fillTarget.r0) - contentTop;
    const fBottom = theme.headerHeight + this.deps.rowOffsetOf(fillTarget.r1 + 1) - contentTop;
    const preview = rectDiv(
      fLeft,
      Math.max(theme.headerHeight, fTop),
      fRight - fLeft,
      fBottom - Math.max(theme.headerHeight, fTop),
      "transparent",
      theme.selectionBorder,
    );
    preview.style.outlineStyle = "dashed";
    this.overlay.appendChild(preview);
  }

  private paintFillHandle(contentTop: number, scrollLeft: number): void {
    const fillHandle = this.deps.fillHandleScreen(contentTop, scrollLeft);
    if (!fillHandle || this.deps.isEditing()) return;

    const theme = this.deps.theme();
    const sq = rectDiv(
      fillHandle.x - 3,
      fillHandle.y - 3,
      6,
      6,
      theme.selectionBorder,
      theme.selectionBorder,
    );
    sq.style.cursor = "crosshair";
    this.overlay.appendChild(sq);
  }

  private colRight(col: number): number {
    return this.deps.colLeftOf(col) + (this.deps.sheet().columns[col]?.width ?? 0);
  }
}

function rectDiv(
  left: number,
  top: number,
  width: number,
  height: number,
  background: string,
  border: string,
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${Math.max(
    0,
    width,
  )}px;height:${Math.max(
    0,
    height,
  )}px;background:${background};outline:1.5px solid ${border};outline-offset:-1px;box-sizing:border-box;`;
  return el;
}
