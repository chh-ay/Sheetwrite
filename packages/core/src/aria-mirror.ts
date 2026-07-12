import { colToA1 } from "./a1.js";
import type { CellRef } from "./selection.js";
import type { VisibleWindowView } from "./types.js";

let ariaSeq = 0;

export interface AriaMirrorDeps {
  host: HTMLElement;
  scroller: HTMLElement;
  overlay: HTMLElement;
  viewport: HTMLElement;
  rowCount: number;
  colCount: number;
  readOnly: boolean;
  focusCell: () => CellRef | null;
}

/**
 * Keeps a compact, screen-reader-visible mirror of the rendered window while the
 * canvas and overlay remain hidden from assistive technology.
 */
export class AriaMirror {
  private readonly host: HTMLElement;
  private readonly aria: HTMLDivElement;
  private readonly focusCell: () => CellRef | null;
  private key = "";
  private version = 0;

  /** Last `aria-activedescendant` written to the host; avoids redundant writes. */
  private lastFocusId: string | null = null;

  // ── Retained node references ─────────────────────────────────────────────
  // Shape of the last rebuild plus the live nodes it produced. When a fresh
  // window has the same nRows × nCols we patch these in place; a differing
  // node count forces a full rebuild.
  private lastNRows = -1;
  private lastNCols = -1;
  private headerCells: HTMLDivElement[] = [];
  private rowEls: HTMLDivElement[] = [];
  private cellEls: HTMLDivElement[] = [];

  constructor(deps: AriaMirrorDeps) {
    this.host = deps.host;
    this.focusCell = deps.focusCell;

    const aria = document.createElement("div");
    aria.className = "sheetwrite-aria";
    aria.id = `sheetwrite-grid-${++ariaSeq}`;
    aria.setAttribute("role", "rowgroup");
    aria.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";
    deps.host.appendChild(aria);
    this.aria = aria;

    deps.host.setAttribute("role", "grid");
    deps.host.setAttribute("aria-multiselectable", "true");
    deps.host.setAttribute("aria-rowcount", String(deps.rowCount + 1));
    deps.host.setAttribute("aria-colcount", String(deps.colCount));
    if (deps.readOnly) deps.host.setAttribute("aria-readonly", "true");
    if (!deps.host.hasAttribute("aria-label"))
      deps.host.setAttribute("aria-label", "Spreadsheet grid");
    deps.scroller.setAttribute("aria-hidden", "true");
    deps.overlay.setAttribute("aria-hidden", "true");
    deps.viewport.querySelector("canvas")?.setAttribute("aria-hidden", "true");
  }

  bumpVersion(): void {
    this.version++;
  }

  setColumnCount(count: number): void {
    this.host.setAttribute("aria-colcount", String(count));
    this.bumpVersion();
  }

  update(view: VisibleWindowView): void {
    const focus = this.focusCell();
    const focusId = focus ? `${this.aria.id}-${focus.row}-${focus.col}` : "";
    const key = `${view.rows.start}:${view.rows.end}:${view.cols.length}:${focusId}:${this.version}`;
    if (key === this.key) {
      this.writeActiveDescendant(focusId);
      return;
    }
    this.key = key;

    const nCols = view.cols.length;
    const nRows = view.rows.end - view.rows.start;

    // Same node count → reuse the existing tree and rewrite only what moved.
    if (nRows === this.lastNRows && nCols === this.lastNCols) {
      this.patchInPlace(view, focus, nRows, nCols);
    } else {
      this.rebuild(view, focus, nRows, nCols);
      this.lastNRows = nRows;
      this.lastNCols = nCols;
    }

    this.writeActiveDescendant(focusId);
  }

  private writeActiveDescendant(focusId: string): void {
    if (focusId === this.lastFocusId) return;
    this.host.setAttribute("aria-activedescendant", focusId);
    this.lastFocusId = focusId;
  }

  /** Full teardown: build a fresh header + data grid and cache its nodes. */
  private rebuild(
    view: VisibleWindowView,
    focus: CellRef | null,
    nRows: number,
    nCols: number,
  ): void {
    const frag = document.createDocumentFragment();

    this.headerCells = [];
    this.rowEls = [];
    this.cellEls = [];

    const headRow = document.createElement("div");
    headRow.setAttribute("role", "row");
    headRow.setAttribute("aria-rowindex", "1");
    for (let cj = 0; cj < nCols; cj++) {
      const cell = document.createElement("div");
      cell.setAttribute("role", "columnheader");
      cell.setAttribute("aria-colindex", String(cj + 1));
      cell.textContent = colToA1(view.cols[cj]!);
      headRow.appendChild(cell);
      this.headerCells.push(cell);
    }
    frag.appendChild(headRow);

    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const rowEl = document.createElement("div");
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-rowindex", String(row + 2));
      for (let cj = 0; cj < nCols; cj++) {
        const col = view.cols[cj]!;
        const cell = document.createElement("div");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(cj + 1));
        cell.id = `${this.aria.id}-${row}-${col}`;
        const v = view.values[ri * nCols + cj] ?? null;
        if (v !== null) cell.textContent = String(v);
        if (focus && focus.row === row && focus.col === col) {
          cell.setAttribute("aria-selected", "true");
        }
        rowEl.appendChild(cell);
        this.cellEls.push(cell);
      }
      frag.appendChild(rowEl);
      this.rowEls.push(rowEl);
    }

    this.aria.replaceChildren(frag);
  }

  /**
   * Same shape, shifted window: rewrite header labels, per-row `aria-rowindex`,
   * and each gridcell's id / text / `aria-selected` on the retained nodes. Ids,
   * roles, and `aria-colindex` (position-based) stay stable across the reuse.
   */
  private patchInPlace(
    view: VisibleWindowView,
    focus: CellRef | null,
    nRows: number,
    nCols: number,
  ): void {
    for (let cj = 0; cj < nCols; cj++) {
      this.headerCells[cj]!.textContent = colToA1(view.cols[cj]!);
    }

    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      this.rowEls[ri]!.setAttribute("aria-rowindex", String(row + 2));
      for (let cj = 0; cj < nCols; cj++) {
        const col = view.cols[cj]!;
        const cell = this.cellEls[ri * nCols + cj]!;
        cell.id = `${this.aria.id}-${row}-${col}`;
        const v = view.values[ri * nCols + cj] ?? null;
        cell.textContent = v !== null ? String(v) : "";
        if (focus && focus.row === row && focus.col === col) {
          cell.setAttribute("aria-selected", "true");
        } else if (cell.hasAttribute("aria-selected")) {
          cell.removeAttribute("aria-selected");
        }
      }
    }
  }

  destroy(): void {
    this.aria.remove();
    for (const attr of [
      "role",
      "aria-multiselectable",
      "aria-rowcount",
      "aria-colcount",
      "aria-readonly",
      "aria-activedescendant",
    ]) {
      this.host.removeAttribute(attr);
    }
  }

  get element(): HTMLDivElement {
    return this.aria;
  }
}
