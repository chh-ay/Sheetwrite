import type { Range, Selection, SheetId } from "./types";

export interface CellRef {
  row: number;
  col: number;
}

export interface SelRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

type RegionType = "range" | "row" | "column";

interface Region {
  rect: SelRect;
  type: RegionType;
}

function norm(a: CellRef, b: CellRef): SelRect {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

/**
 * Backend-agnostic selection state: a stack of rectangular regions (cells, full
 * rows, full columns) plus the live anchor/focus that keyboard extension drives.
 * The renderer reads `forEachRect` to draw Layer-2 overlays; the grid reads
 * `focusCell` for navigation and `contains` for range clears.
 */
export class SelectionModel {
  private regions: Region[] = [];
  private anchor: CellRef | null = null;
  private focus: CellRef | null = null;

  constructor(
    private rowCount: number,
    private firstCol: number,
    private lastCol: number,
  ) {}

  setBounds(rowCount: number, firstCol: number, lastCol: number): void {
    this.rowCount = rowCount;
    this.firstCol = firstCol;
    this.lastCol = lastCol;
  }

  clear(): void {
    this.regions = [];
    this.anchor = null;
    this.focus = null;
  }

  get isEmpty(): boolean {
    return this.regions.length === 0;
  }

  get focusCell(): CellRef | null {
    return this.focus;
  }

  selectCell(row: number, col: number, additive = false): void {
    const region: Region = { rect: { r0: row, c0: col, r1: row, c1: col }, type: "range" };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row, col };
    this.focus = { row, col };
  }

  /** Extend the active region from the current anchor to (row, col). */
  extendTo(row: number, col: number): void {
    if (!this.anchor) {
      this.selectCell(row, col);
      return;
    }
    this.focus = { row, col };
    const active = this.regions[this.regions.length - 1];
    if (!active) return;

    if (active.type === "column") {
      active.rect = {
        r0: 0,
        c0: Math.min(this.anchor.col, col),
        r1: this.rowCount - 1,
        c1: Math.max(this.anchor.col, col),
      };
    } else if (active.type === "row") {
      active.rect = {
        r0: Math.min(this.anchor.row, row),
        c0: this.firstCol,
        r1: Math.max(this.anchor.row, row),
        c1: this.lastCol,
      };
    } else {
      active.rect = norm(this.anchor, { row, col });
    }
  }

  selectColumn(col: number, additive = false): void {
    const region: Region = {
      rect: { r0: 0, c0: col, r1: Math.max(0, this.rowCount - 1), c1: col },
      type: "column",
    };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row: 0, col };
    this.focus = { row: 0, col };
  }

  selectRow(row: number, additive = false): void {
    const region: Region = {
      rect: { r0: row, c0: this.firstCol, r1: row, c1: this.lastCol },
      type: "row",
    };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row, col: this.firstCol };
    this.focus = { row, col: this.firstCol };
  }

  set(selection: Selection | null): void {
    if (!selection) {
      this.clear();
      return;
    }
    switch (selection.kind) {
      case "cell":
        this.selectCell(selection.addr.row, selection.addr.col);
        break;
      case "range":
        this.selectCell(selection.range.start.row, selection.range.start.col);
        this.extendTo(selection.range.end.row, selection.range.end.col);
        break;
      case "row":
        this.selectRow(selection.row);
        break;
      case "column":
        this.selectColumn(selection.col);
        break;
      case "multi":
        this.clear();
        for (const r of selection.ranges) {
          this.selectCell(r.start.row, r.start.col, true);
          this.extendTo(r.end.row, r.end.col);
        }
        break;
    }
  }

  toSelection(sheet: SheetId): Selection | null {
    if (this.regions.length === 0) return null;
    const toRange = (rect: SelRect): Range => ({
      sheet,
      start: { row: rect.r0, col: rect.c0 },
      end: { row: rect.r1, col: rect.c1 },
    });
    if (this.regions.length > 1) {
      return { kind: "multi", ranges: this.regions.map((r) => toRange(r.rect)) };
    }
    const region = this.regions[0]!;
    const { rect } = region;
    if (region.type === "column" && rect.c0 === rect.c1)
      return { kind: "column", sheet, col: rect.c0 };
    if (region.type === "row" && rect.r0 === rect.r1) return { kind: "row", sheet, row: rect.r0 };
    if (rect.r0 === rect.r1 && rect.c0 === rect.c1) {
      return { kind: "cell", addr: { sheet, row: rect.r0, col: rect.c0 } };
    }
    return { kind: "range", range: toRange(rect) };
  }

  forEachRect(cb: (rect: SelRect) => void): void {
    for (const region of this.regions) cb(region.rect);
  }

  contains(row: number, col: number): boolean {
    for (const { rect } of this.regions) {
      if (row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1) return true;
    }
    return false;
  }
}
