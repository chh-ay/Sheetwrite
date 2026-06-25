import { cellA1, rangeA1, shiftA1Refs } from "./a1";
import type { EditController } from "./editor";
import type { FindBar } from "./find-bar";
import type { CellRef, SelectionModel, SelRect } from "./selection";
import type { SheetwriteStore } from "./store";
import type { CellAddress, CellValue, Patch, Sheet, SheetId, Store, Theme } from "./types";

const PRINTABLE = /^.$/u;

export interface InputControllerDeps {
  host: HTMLElement;
  scroller: HTMLDivElement;
  viewportEl: HTMLDivElement;
  editor: EditController;
  findBar: () => FindBar | null;
  store: Store;
  loadable: SheetwriteStore | null;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  theme: () => Theme;
  colIndices: () => number[];
  firstCol: () => number;
  lastCol: () => number;
  nextVisibleCol: (col: number, dir: 1 | -1) => number;
  colAtX: (contentX: number) => number;
  rowAtOffset: (contentY: number) => number;
  rowCount: () => number;
  contentTop: () => number;
  viewportH: () => number;
  screenRect: (
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ) => { x: number; y: number; w: number; h: number };
  anchorCell: (row: number, col: number) => CellRef;
  toDataRow: (viewRow: number) => number;
  beginEdit: (row: number, col: number, initial: string | undefined, selectAll: boolean) => void;
  clearSelection: () => void;
  emitSelection: () => void;
  scrollToCell: (addr: CellAddress) => void;
  scheduleRender: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  commit: (patches: Patch[]) => void;
  readOnly: () => boolean;
}

/**
 * Owns grid pointer/keyboard input, including formula point-mode and fill-drag
 * interactions, while delegating mutations back through the grid shell.
 */
export class InputController {
  private readonly deps: InputControllerDeps;
  private fillTarget: SelRect | null = null;
  private dragMove: ((ev: MouseEvent) => void) | null = null;
  private dragUp: ((ev: MouseEvent) => void) | null = null;

  constructor(deps: InputControllerDeps) {
    this.deps = deps;
    deps.scroller.addEventListener("mousedown", this.onMouseDown);
    deps.scroller.addEventListener("dblclick", this.onDblClick);
    deps.host.addEventListener("keydown", this.onKeyDown);
  }

  get fillPreview(): SelRect | null {
    return this.fillTarget;
  }

  cellAtPointer(clientX: number, clientY: number): CellRef | null {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const py = clientY - rect.top;
    const theme = this.deps.theme();
    if (py < theme.headerHeight) return null;

    const contentTop = this.deps.contentTop();
    const contentX = clientX - rect.left + this.deps.scroller.scrollLeft - theme.rowHeaderWidth;
    const contentY = contentTop + (py - theme.headerHeight);

    const row = this.deps.rowAtOffset(contentY);
    const col = this.deps.colAtX(contentX);
    if (col === -1 || row < 0 || row >= this.deps.sheet().rowCount) return null;

    return this.deps.anchorCell(row, col);
  }

  fillHandleScreen(contentTop: number, scrollLeft: number): { x: number; y: number } | null {
    if (this.deps.loadable?.hasView(this.deps.activeSheet())) return null;
    const src = this.fillSourceRect();
    if (!src) return null;
    const r = this.deps.screenRect(src.r1, src.c1, contentTop, scrollLeft);
    const y = r.y + r.h;
    if (y < this.deps.theme().headerHeight) return null;
    return { x: r.x + r.w, y };
  }

  destroy(): void {
    this.detachDrag();
    this.deps.scroller.removeEventListener("mousedown", this.onMouseDown);
    this.deps.scroller.removeEventListener("dblclick", this.onDblClick);
    this.deps.host.removeEventListener("keydown", this.onKeyDown);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;

    const editor = this.deps.editor;
    // Formula point mode: while editing a "=" formula, clicks/drags pick A1
    // references into the editor instead of moving the grid selection.
    if (editor.isEditing && editor.value.startsWith("=")) {
      e.preventDefault();
      const start = this.cellAtPointer(e.clientX, e.clientY);
      if (!start) return;
      editor.setReference(cellA1(start.row, start.col));
      const move = (ev: MouseEvent): void => {
        const c = this.cellAtPointer(ev.clientX, ev.clientY);
        if (c) editor.setReference(rangeA1(start, c));
      };
      const up = (): void => {
        editor.endReference();
        this.detachDrag();
      };
      this.attachDrag(move, up);
      return;
    }

    const viewportRect = this.deps.viewportEl.getBoundingClientRect();
    const fillHandle = this.fillHandleScreen(this.deps.contentTop(), this.deps.scroller.scrollLeft);
    if (fillHandle && !editor.isEditing) {
      const hx = e.clientX - viewportRect.left;
      const hy = e.clientY - viewportRect.top;
      if (Math.abs(hx - fillHandle.x) <= 5 && Math.abs(hy - fillHandle.y) <= 5) {
        e.preventDefault();
        this.startFillDrag();
        return;
      }
    }

    const additive = e.ctrlKey || e.metaKey;
    const theme = this.deps.theme();
    const py = e.clientY - viewportRect.top;
    const contentX =
      e.clientX - viewportRect.left + this.deps.scroller.scrollLeft - theme.rowHeaderWidth;

    // header row → column selection
    if (py < theme.headerHeight) {
      const col = this.deps.colAtX(contentX);
      if (col !== -1) {
        const selection = this.deps.selection();
        if (e.shiftKey) selection.extendTo(0, col);
        else selection.selectColumn(col, additive);
        this.deps.emitSelection();
        this.deps.scheduleRender();
      }
      return;
    }

    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;

    const selection = this.deps.selection();
    if (e.shiftKey) selection.extendTo(cell.row, cell.col);
    else selection.selectCell(cell.row, cell.col, additive);
    this.deps.emitSelection();
    this.deps.scheduleRender();

    const move = (ev: MouseEvent): void => {
      const c = this.cellAtPointer(ev.clientX, ev.clientY);
      if (!c) return;
      this.deps.selection().extendTo(c.row, c.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
    };
    this.attachDrag(move, () => this.detachDrag());
  };

  private readonly onDblClick = (e: MouseEvent): void => {
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.deps.beginEdit(cell.row, cell.col, undefined, true);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.deps.editor.isEditing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === "f") {
      e.preventDefault();
      this.deps.findBar()?.open();
      return;
    }

    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) this.deps.redo();
      else this.deps.undo();
      return;
    }

    if (mod && key === "y") {
      e.preventDefault();
      this.deps.redo();
      return;
    }

    if (mod && key === "c") return void this.deps.copy();
    if (mod && key === "x") return void this.deps.cut();
    if (mod && key === "v") return void this.deps.paste();

    const selection = this.deps.selection();
    const focus = selection.focusCell;
    const sheet = this.deps.sheet();
    const theme = this.deps.theme();
    const pageRows = Math.max(
      1,
      Math.floor((this.deps.viewportH() - theme.headerHeight) / theme.rowHeight),
    );

    switch (e.key) {
      case "ArrowDown":
        this.navigate(
          focus,
          mod ? sheet.rowCount - 1 : (focus?.row ?? 0) + 1,
          undefined,
          e.shiftKey,
        );
        break;
      case "ArrowUp":
        this.navigate(focus, mod ? 0 : (focus?.row ?? 0) - 1, undefined, e.shiftKey);
        break;
      case "ArrowRight":
        this.navigate(
          focus,
          undefined,
          mod
            ? this.deps.lastCol()
            : this.deps.nextVisibleCol(focus?.col ?? this.deps.firstCol(), 1),
          e.shiftKey,
        );
        break;
      case "ArrowLeft":
        this.navigate(
          focus,
          undefined,
          mod
            ? this.deps.firstCol()
            : this.deps.nextVisibleCol(focus?.col ?? this.deps.firstCol(), -1),
          e.shiftKey,
        );
        break;
      case "PageDown":
        this.navigate(focus, (focus?.row ?? 0) + pageRows, undefined, e.shiftKey);
        break;
      case "PageUp":
        this.navigate(focus, (focus?.row ?? 0) - pageRows, undefined, e.shiftKey);
        break;
      case "Home":
        if (mod) this.navigate(focus, 0, this.deps.firstCol(), e.shiftKey);
        else this.navigate(focus, undefined, this.deps.firstCol(), e.shiftKey);
        break;
      case "End":
        if (mod) this.navigate(focus, sheet.rowCount - 1, this.deps.lastCol(), e.shiftKey);
        else this.navigate(focus, undefined, this.deps.lastCol(), e.shiftKey);
        break;
      case "Enter":
      case "F2":
        if (focus) this.deps.beginEdit(focus.row, focus.col, undefined, e.key === "F2");
        break;
      case "Delete":
      case "Backspace":
        this.deps.clearSelection();
        break;
      default:
        if (!mod && !e.altKey && focus && PRINTABLE.test(e.key)) {
          this.deps.beginEdit(focus.row, focus.col, e.key, false);
        } else {
          return;
        }
    }
    e.preventDefault();
  };

  private navigate(
    focus: CellRef | null,
    row: number | undefined,
    col: number | undefined,
    extend: boolean,
  ): void {
    const maxRow = Math.max(0, this.deps.rowCount() - 1);
    const firstCol = this.deps.firstCol();
    const lastCol = this.deps.lastCol();
    const targetRow = Math.max(0, Math.min(maxRow, row ?? focus?.row ?? 0));
    const targetCol = Math.max(firstCol, Math.min(lastCol, col ?? focus?.col ?? firstCol));
    const selection = this.deps.selection();
    if (extend) selection.extendTo(targetRow, targetCol);
    else selection.selectCell(targetRow, targetCol);
    this.deps.emitSelection();
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: targetRow, col: targetCol });
    this.deps.scheduleRender();
  }

  private fillSourceRect(): SelRect | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    let found: SelRect | null = null;
    this.deps.selection().forEachRect((r) => {
      if (r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1) {
        found = r;
      }
    });
    return found;
  }

  private fillCellAt(clientX: number, clientY: number): CellRef {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const theme = this.deps.theme();
    const contentTop = this.deps.contentTop();
    const contentX = clientX - rect.left + this.deps.scroller.scrollLeft - theme.rowHeaderWidth;
    const contentY = contentTop + (clientY - rect.top - theme.headerHeight);
    const rowCount = this.deps.sheet().rowCount;
    const row = Math.max(0, Math.min(rowCount - 1, this.deps.rowAtOffset(Math.max(0, contentY))));
    let col = this.deps.colAtX(contentX);
    if (col === -1) {
      const cols = this.deps.colIndices();
      col = contentX < 0 ? (cols[0] ?? 0) : (cols[cols.length - 1] ?? 0);
    }
    return { row, col };
  }

  private startFillDrag(): void {
    const source = this.fillSourceRect();
    if (!source) return;
    const move = (ev: MouseEvent): void => {
      const c = this.fillCellAt(ev.clientX, ev.clientY);
      this.fillTarget = this.extendFill(source, c);
      this.deps.scheduleRender();
    };
    const up = (): void => {
      this.detachDrag();
      const target = this.fillTarget;
      this.fillTarget = null;
      if (target) {
        this.commitFill(source, target);
        const selection = this.deps.selection();
        selection.selectCell(target.r0, target.c0);
        selection.extendTo(target.r1, target.c1);
        this.deps.emitSelection();
      }
      this.deps.scheduleRender();
    };
    this.attachDrag(move, up);
  }

  private extendFill(source: SelRect, c: CellRef): SelRect {
    const down = Math.max(c.row - source.r1, 0);
    const up = Math.max(source.r0 - c.row, 0);
    const right = Math.max(c.col - source.c1, 0);
    const left = Math.max(source.c0 - c.col, 0);
    const vert = Math.max(down, up);
    const horiz = Math.max(right, left);
    if (vert === 0 && horiz === 0) return { ...source };
    if (vert >= horiz) {
      if (down >= up) return { r0: source.r0, c0: source.c0, r1: c.row, c1: source.c1 };
      return { r0: c.row, c0: source.c0, r1: source.r1, c1: source.c1 };
    }
    if (right >= left) return { r0: source.r0, c0: source.c0, r1: source.r1, c1: c.col };
    return { r0: source.r0, c0: c.col, r1: source.r1, c1: source.c1 };
  }

  private commitFill(source: SelRect, target: SelRect): void {
    if (this.deps.readOnly()) return;
    const srcRows = source.r1 - source.r0 + 1;
    const srcCols = source.c1 - source.c0 + 1;
    const patches: Patch[] = [];
    for (let r = target.r0; r <= target.r1; r++) {
      for (let c = target.c0; c <= target.c1; c++) {
        if (r >= source.r0 && r <= source.r1 && c >= source.c0 && c <= source.c1) continue;
        const sr = source.r0 + ((((r - source.r0) % srcRows) + srcRows) % srcRows);
        const sc = source.c0 + ((((c - source.c0) % srcCols) + srcCols) % srcCols);
        const sourceDataRow = this.deps.toDataRow(sr);
        const targetDataRow = this.deps.toDataRow(r);
        patches.push({
          op: "set",
          addr: { sheet: this.deps.activeSheet(), row: targetDataRow, col: c },
          value: this.fillValueFrom(sr, sc, targetDataRow - sourceDataRow, c - sc),
        });
      }
    }
    this.deps.commit(patches);
  }

  private fillValueFrom(sr: number, sc: number, dRow: number, dCol: number): CellValue {
    const addr = { sheet: this.deps.activeSheet(), row: this.deps.toDataRow(sr), col: sc };
    const formula = this.deps.loadable?.getFormula(addr) ?? null;
    if (formula) return { kind: "formula", src: shiftA1Refs(formula, dRow, dCol) };
    return { kind: "literal", value: this.deps.store.getCell(addr).resolved };
  }

  private attachDrag(move: (ev: MouseEvent) => void, up: (ev: MouseEvent) => void): void {
    this.detachDrag();
    this.dragMove = move;
    this.dragUp = up;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  private detachDrag(): void {
    const move = this.dragMove;
    const up = this.dragUp;
    if (move) window.removeEventListener("mousemove", move);
    if (up) window.removeEventListener("mouseup", up);
    this.dragMove = null;
    this.dragUp = null;
  }
}
