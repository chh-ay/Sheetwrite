import type { EditRect } from "./editor.js";
import { prepareMergeIndex } from "./merge-index.js";
import type { SearchMatchSet } from "./search-controller.js";
import type { SelectionModel, SelRect } from "./selection.js";
import type { HighlightRange, PresenceOverlay, SheetId } from "./types/coordinates.js";
import type { Sheet } from "./types/document.js";
import type { Theme } from "./types/render.js";

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
  searchMatches: () => SearchMatchSet;
  searchActive: () => number;
  searchVersion: () => number;
  /**
   * Bumped whenever cell geometry moves under the overlay (column widths, row
   * heights, structural row/col edits). Without it a resize leaves selection,
   * search, and highlight rects at stale positions over the repainted canvas.
   */
  geometryVersion: () => number;
  /**
   * Frozen-pane geometry for freeze-aware rect mapping: `fr` pinned view rows
   * of total height `frozenH`; columns before `firstBodyCol` are pinned within
   * `frozenW`. All zeros when nothing is frozen.
   */
  freeze: () => { fr: number; frozenH: number; frozenW: number; firstBodyCol: number };
  /** Content zoom factor (column base widths scale by it). */
  zoom: () => number;
  scheduleRender: () => void;
}

/**
 * Owns Layer 2 DOM: selection rectangles, fill affordances, search matches, and
 * manual cell highlights painted over the renderer output.
 */
export class OverlayPainter {
  private readonly overlay: HTMLDivElement;
  private readonly deps: OverlayPainterDeps;
  private manualHighlights: { ranges: readonly HighlightRange[]; color: string } | null = null;
  private presenceOverlays: readonly PresenceOverlay[] = [];

  // ── Rect pool ──────────────────────────────────────────────────────────
  // Reusable rect divs. `cursor` resets to 0 at the top of every paint pass;
  // `acquireRect` hands out `pool[cursor++]`, creating and appending a fresh
  // div only when the pool runs short. Surplus divs are hidden with
  // `display:none`, never removed, so subsequent passes can reclaim them.
  private readonly pool: HTMLDivElement[] = [];
  private cursor = 0;

  // ── Per-pass context ───────────────────────────────────────────────────
  // Threaded into the `forEachRect` selection callback, which cannot take args.
  private paintContentTop = 0;
  private paintScrollLeft = 0;
  private paintClientW = 0;
  private paintClientH = 0;
  private paintTheme: Theme | null = null;
  private paintSheet: Sheet | null = null;

  private highlightVersion = 0;
  private presenceVersion = 0;

  // ── Cached paint signature ─────────────────────────────────────────────
  // `paint` skips when every field below is unchanged and the theme identity
  // still matches — the same skip semantics as the old join('|') signature.
  private lastPaintTheme: Theme | null = null;
  private lastContentTop = 0;
  private lastScrollLeft = 0;
  private lastClientW = 0;
  private lastClientH = 0;
  private lastActiveSheet: SheetId = "";
  private lastSelVersion = -1;
  private lastHighlightVersion = -1;
  private lastPresenceVersion = -1;
  private lastSearchVersion = -1;
  private lastGeometryVersion = -1;
  private lastSearchActive = -1;
  private lastEditing = false;
  private lastFillPresent = false;
  private lastFillR0 = 0;
  private lastFillC0 = 0;
  private lastFillR1 = 0;
  private lastFillC1 = 0;

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

  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void {
    this.manualHighlights =
      ranges && ranges.length > 0 ? { ranges, color: color ?? this.deps.theme().highlight } : null;
    this.highlightVersion += 1;
    this.deps.scheduleRender();
  }

  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void {
    this.presenceOverlays = overlays ? overlays.slice(0, 32) : [];
    this.presenceVersion += 1;
    this.deps.scheduleRender();
  }

  paint(contentTop: number, scrollLeft: number, clientW: number, clientH: number): void {
    const theme = this.deps.theme();
    if (this.samePaintState(contentTop, scrollLeft, clientW, clientH, theme)) return;

    const sheet = this.deps.sheet();
    this.cursor = 0;
    this.paintHighlights(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paintPresence(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paintNotes(sheet, contentTop, scrollLeft, clientW, clientH);

    const selection = this.deps.selection();
    if (!selection.isEmpty) {
      this.paintContentTop = contentTop;
      this.paintScrollLeft = scrollLeft;
      this.paintClientW = clientW;
      this.paintClientH = clientH;
      this.paintTheme = theme;
      this.paintSheet = sheet;
      selection.forEachRect(this.appendSelectionRect);
      this.paintTheme = null;
      this.paintSheet = null;

      this.paintFocus(theme, contentTop, scrollLeft, clientW, clientH);
      this.paintFillPreview(theme, sheet, contentTop, scrollLeft);
      this.paintFillHandle(theme, contentTop, scrollLeft);
    }

    this.hideSurplus();
  }

  destroy(): void {
    this.overlay.remove();
  }

  /**
   * True when the current paint inputs match the previous pass exactly. Reads
   * each dependency once and compares against cached fields; caches are updated
   * (and `false` returned) only when something differs, matching the old
   * signature-plus-theme-identity skip.
   */
  private samePaintState(
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
    theme: Theme,
  ): boolean {
    const selection = this.deps.selection();
    const fill = this.deps.fillTarget();
    const activeSheet = this.deps.activeSheet();
    const selVersion = selection.version;
    const searchVersion = this.deps.searchVersion();
    const geometryVersion = this.deps.geometryVersion();
    const searchActive = this.deps.searchActive();
    const editing = this.deps.isEditing();
    const fillPresent = fill !== null;
    const fillR0 = fill ? fill.r0 : 0;
    const fillC0 = fill ? fill.c0 : 0;
    const fillR1 = fill ? fill.r1 : 0;
    const fillC1 = fill ? fill.c1 : 0;

    if (
      theme === this.lastPaintTheme &&
      contentTop === this.lastContentTop &&
      scrollLeft === this.lastScrollLeft &&
      clientW === this.lastClientW &&
      clientH === this.lastClientH &&
      activeSheet === this.lastActiveSheet &&
      selVersion === this.lastSelVersion &&
      this.highlightVersion === this.lastHighlightVersion &&
      this.presenceVersion === this.lastPresenceVersion &&
      searchVersion === this.lastSearchVersion &&
      geometryVersion === this.lastGeometryVersion &&
      searchActive === this.lastSearchActive &&
      editing === this.lastEditing &&
      fillPresent === this.lastFillPresent &&
      fillR0 === this.lastFillR0 &&
      fillC0 === this.lastFillC0 &&
      fillR1 === this.lastFillR1 &&
      fillC1 === this.lastFillC1
    ) {
      return true;
    }

    this.lastPaintTheme = theme;
    this.lastContentTop = contentTop;
    this.lastScrollLeft = scrollLeft;
    this.lastClientW = clientW;
    this.lastClientH = clientH;
    this.lastActiveSheet = activeSheet;
    this.lastSelVersion = selVersion;
    this.lastHighlightVersion = this.highlightVersion;
    this.lastPresenceVersion = this.presenceVersion;
    this.lastSearchVersion = searchVersion;
    this.lastGeometryVersion = geometryVersion;
    this.lastSearchActive = searchActive;
    this.lastEditing = editing;
    this.lastFillPresent = fillPresent;
    this.lastFillR0 = fillR0;
    this.lastFillC0 = fillC0;
    this.lastFillR1 = fillR1;
    this.lastFillC1 = fillC1;
    return false;
  }

  private paintHighlights(
    theme: Theme,
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const activeSheet = this.deps.activeSheet();

    const manualHighlights = this.manualHighlights;
    if (manualHighlights) {
      for (const range of manualHighlights.ranges) {
        if (range.sheet !== activeSheet) continue;
        this.appendRange(
          Math.min(range.start.row, range.end.row),
          Math.min(range.start.col, range.end.col),
          Math.max(range.start.row, range.end.row),
          Math.max(range.start.col, range.end.col),
          range.color ?? manualHighlights.color,
          "transparent",
          theme,
          sheet,
          contentTop,
          scrollLeft,
          clientW,
          clientH,
        );
      }
    }

    const searchMatches = this.deps.searchMatches();
    const searchActive = this.deps.searchActive();
    if (searchMatches.sheet === activeSheet) {
      for (let i = 0; i < searchMatches.length; i++) {
        const row = searchMatches.rowAt(i);
        const viewRow = this.deps.toViewRow(row);
        if (viewRow === null) continue;

        const border = i === searchActive ? theme.searchActiveMatch : "transparent";
        this.appendRange(
          viewRow,
          searchMatches.colAt(i),
          viewRow,
          searchMatches.colAt(i),
          theme.searchMatch,
          border,
          theme,
          sheet,
          contentTop,
          scrollLeft,
          clientW,
          clientH,
        );
      }
    }
  }

  private appendRange(
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    fill: string,
    border: string,
    theme: Theme,
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    this.appendClampedRange(
      r0,
      c0,
      r1,
      c1,
      fill,
      border,
      theme,
      sheet,
      contentTop,
      scrollLeft,
      clientW,
      clientH,
    );
  }

  /**
   * Map a cell range to screen rects, splitting at the freeze boundaries: a
   * range spanning pinned and scrolling zones becomes up to four pieces, each
   * positioned with its zone's scroll offsets and clamped to its zone so
   * scrolled body content never bleeds into a pinned band.
   */
  private appendClampedRange(
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    fill: string,
    border: string,
    theme: Theme,
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const { fr, frozenH, frozenW, firstBodyCol } = this.deps.freeze();
    const g = theme.rowHeaderWidth;
    const hh = theme.headerHeight;

    const rowSegs: Array<{ r0: number; r1: number; frozen: boolean }> = [];
    if (fr > 0 && r0 < fr) rowSegs.push({ r0, r1: Math.min(r1, fr - 1), frozen: true });
    if (r1 >= fr) rowSegs.push({ r0: Math.max(r0, fr), r1, frozen: false });

    const hasFrozenCols = frozenW > 0;
    const colSegs: Array<{ c0: number; c1: number; frozen: boolean }> = [];
    if (hasFrozenCols && c0 < firstBodyCol) {
      colSegs.push({ c0, c1: Math.min(c1, firstBodyCol - 1), frozen: true });
    }
    if (!hasFrozenCols || c1 >= firstBodyCol) {
      colSegs.push({ c0: hasFrozenCols ? Math.max(c0, firstBodyCol) : c0, c1, frozen: false });
    }

    for (const rs of rowSegs) {
      const rowScroll = rs.frozen ? 0 : contentTop;
      const top = hh + this.deps.rowOffsetOf(rs.r0) - rowScroll;
      const bottom = hh + this.deps.rowOffsetOf(rs.r1 + 1) - rowScroll;
      // Pinned bands clamp hard on both edges; the body clamps only against
      // the band (the viewport edge is handled by overlay overflow).
      const clipTop = rs.frozen ? hh : hh + frozenH;
      const clipBottom = rs.frozen ? hh + frozenH : Number.POSITIVE_INFINITY;
      const cTop = Math.max(clipTop, top);
      const cBottom = Math.min(clipBottom, bottom);
      if (cBottom <= cTop || top >= clientH) continue;

      for (const cs of colSegs) {
        const colScroll = cs.frozen ? 0 : scrollLeft;
        const left = g + this.deps.colLeftOf(cs.c0) - colScroll;
        const right = g + this.colRight(cs.c1, sheet) - colScroll;
        const clipLeft = cs.frozen ? g : g + frozenW;
        const clipRight = cs.frozen ? g + frozenW : Number.POSITIVE_INFINITY;
        const cLeft = Math.max(clipLeft, left);
        const cRight = Math.min(clipRight, right);
        if (cRight <= cLeft || left >= clientW) continue;

        this.acquireRect(cLeft, cTop, cRight - cLeft, cBottom - cTop, fill, border);
      }
    }
  }

  private paintPresence(
    theme: Theme,
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    if (sheet.rowCount <= 0 || sheet.columns.length <= 0) return;
    const activeSheet = this.deps.activeSheet();
    const maxRow = sheet.rowCount - 1;
    const maxCol = sheet.columns.length - 1;

    for (const presence of this.presenceOverlays) {
      if (presence.activeSheet !== activeSheet) continue;
      for (const range of presence.ranges.slice(0, 8)) {
        if (range.sheet !== activeSheet) continue;
        const dataR0 = Math.max(0, Math.min(maxRow, Math.min(range.start.row, range.end.row)));
        const dataR1 = Math.max(0, Math.min(maxRow, Math.max(range.start.row, range.end.row)));
        const viewR0 = this.deps.toViewRow(dataR0);
        const viewR1 = this.deps.toViewRow(dataR1);
        if (viewR0 === null || viewR1 === null) continue;
        const c0 = Math.max(0, Math.min(maxCol, Math.min(range.start.col, range.end.col)));
        const c1 = Math.max(0, Math.min(maxCol, Math.max(range.start.col, range.end.col)));
        const before = this.cursor;
        this.appendClampedRange(
          Math.min(viewR0, viewR1),
          c0,
          Math.max(viewR0, viewR1),
          c1,
          "transparent",
          presence.color,
          theme,
          sheet,
          contentTop,
          scrollLeft,
          clientW,
          clientH,
        );
        for (let i = before; i < this.cursor; i++) {
          const rect = this.pool[i]!;
          rect.dataset.sheetwritePresence = presence.actorId;
          rect.style.outlineWidth = "2px";
          rect.title = presence.displayName ?? presence.actorId;
          if (i === before && presence.displayName) {
            rect.textContent = presence.displayName;
            rect.style.color = presence.color;
            rect.style.font = `600 11px ${theme.font}`;
            rect.style.lineHeight = "14px";
            rect.style.paddingLeft = "2px";
          }
        }
      }
    }
  }

  private paintNotes(
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    for (const note of sheet.notes ?? []) {
      const row = this.deps.toViewRow(note.addr.row);
      if (row === null) continue;
      const rect = this.deps.screenRect(row, note.addr.col, contentTop, scrollLeft);
      if (rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= clientW || rect.y >= clientH) {
        continue;
      }
      const size = Math.min(8, rect.w, rect.h);
      const indicator = this.acquireRect(
        rect.x + rect.w - size,
        rect.y,
        size,
        size,
        "#f59e0b",
        "transparent",
      );
      indicator.style.clipPath = "polygon(0 0, 100% 0, 100% 100%)";
    }
  }

  private readonly appendSelectionRect = (rect: SelRect): void => {
    const theme = this.paintTheme;
    const sheet = this.paintSheet;
    if (!theme || !sheet) return;

    let { r0, c0, r1, c1 } = rect;
    const merges = sheet.merges;
    if (merges) {
      const mergeIndex = prepareMergeIndex(merges);
      let expanded: boolean;
      do {
        expanded = false;
        for (const merge of mergeIndex.intersectingWindow(r0, r1 + 1, [c0, c1])) {
          if (merge.r1 < r0 || merge.r0 > r1 || merge.c1 < c0 || merge.c0 > c1) continue;
          const nextR0 = Math.min(r0, merge.r0);
          const nextC0 = Math.min(c0, merge.c0);
          const nextR1 = Math.max(r1, merge.r1);
          const nextC1 = Math.max(c1, merge.c1);
          if (nextR0 === r0 && nextC0 === c0 && nextR1 === r1 && nextC1 === c1) continue;
          r0 = nextR0;
          c0 = nextC0;
          r1 = nextR1;
          c1 = nextC1;
          expanded = true;
        }
      } while (expanded);
    }

    this.appendClampedRange(
      r0,
      c0,
      r1,
      c1,
      theme.selection,
      theme.selectionBorder,
      theme,
      sheet,
      this.paintContentTop,
      this.paintScrollLeft,
      this.paintClientW,
      this.paintClientH,
    );
  };

  private paintFocus(
    theme: Theme,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    const focus = this.deps.selection().focusCell;
    if (!focus || this.deps.isEditing()) return;

    const { fr, frozenH, frozenW, firstBodyCol } = this.deps.freeze();
    const r = this.deps.screenRect(focus.row, focus.col, contentTop, scrollLeft);
    // A body-zone focus cell scrolled under a pinned band is hidden, not
    // clamped onto the band.
    const clampTop = fr > 0 && focus.row >= fr ? theme.headerHeight + frozenH : theme.headerHeight;
    const clampLeft =
      frozenW > 0 && focus.col >= firstBodyCol
        ? theme.rowHeaderWidth + frozenW
        : theme.rowHeaderWidth;
    if (r.y + r.h <= clampTop || r.y >= clientH || r.x + r.w <= clampLeft || r.x >= clientW) {
      return;
    }

    const ring = this.acquireRect(
      Math.max(clampLeft, r.x),
      Math.max(clampTop, r.y),
      r.w - Math.max(0, clampLeft - r.x),
      r.h - Math.max(0, clampTop - r.y),
      "transparent",
      theme.selectionBorder,
    );
    ring.style.outlineWidth = "2px";
  }

  private paintFillPreview(
    theme: Theme,
    sheet: Sheet,
    contentTop: number,
    scrollLeft: number,
  ): void {
    const fillTarget = this.deps.fillTarget();
    if (!fillTarget) return;

    const before = this.cursor;
    this.appendClampedRange(
      fillTarget.r0,
      fillTarget.c0,
      fillTarget.r1,
      fillTarget.c1,
      "transparent",
      theme.selectionBorder,
      theme,
      sheet,
      contentTop,
      scrollLeft,
      this.paintClientW,
      this.paintClientH,
    );
    for (let i = before; i < this.cursor; i++) {
      const el = this.pool[i];
      if (el) el.style.outlineStyle = "dashed";
    }
  }

  private paintFillHandle(theme: Theme, contentTop: number, scrollLeft: number): void {
    const fillHandle = this.deps.fillHandleScreen(contentTop, scrollLeft);
    if (!fillHandle || this.deps.isEditing()) return;

    const sq = this.acquireRect(
      fillHandle.x - 3,
      fillHandle.y - 3,
      6,
      6,
      theme.selectionBorder,
      theme.selectionBorder,
    );
    sq.style.cursor = "crosshair";
  }

  private colRight(col: number, sheet: Sheet): number {
    // Column widths persist in base units; display geometry is zoomed.
    return this.deps.colLeftOf(col) + (sheet.columns[col]?.width ?? 0) * this.deps.zoom();
  }

  /**
   * Hand out the next pooled rect div, applying the mutable style fields. Static
   * setup (position, pointer-events, outline-offset, box-sizing) is written once
   * at creation. Outline width/style are rewritten to their defaults each time
   * so a div previously used as a focus ring (2px) or fill preview (dashed)
   * comes back clean; a hidden div is re-shown and any leftover cursor cleared.
   */
  private acquireRect(
    left: number,
    top: number,
    width: number,
    height: number,
    background: string,
    border: string,
  ): HTMLDivElement {
    let el = this.pool[this.cursor];
    if (!el) {
      el = document.createElement("div");
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.outlineOffset = "-1px";
      el.style.boxSizing = "border-box";
      this.pool[this.cursor] = el;
      this.overlay.appendChild(el);
    } else if (el.style.display === "none") {
      el.style.display = "";
    }
    this.cursor++;

    el.style.clipPath = "";
    el.textContent = "";
    el.removeAttribute("data-sheetwrite-presence");
    el.removeAttribute("title");
    el.style.color = "";
    el.style.font = "";
    el.style.lineHeight = "";
    el.style.paddingLeft = "";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.max(0, width)}px`;
    el.style.height = `${Math.max(0, height)}px`;
    el.style.background = background;
    el.style.outlineColor = border;
    el.style.outlineWidth = "1.5px";
    el.style.outlineStyle = "solid";
    if (el.style.cursor) el.style.cursor = "";
    return el;
  }

  /** Hide pool divs left over past `cursor` from earlier, busier passes. */
  private hideSurplus(): void {
    for (let i = this.cursor; i < this.pool.length; i++) {
      const el = this.pool[i]!;
      el.removeAttribute("data-sheetwrite-presence");
      el.removeAttribute("title");
      el.textContent = "";
      if (el.style.display !== "none") el.style.display = "none";
    }
  }
}
