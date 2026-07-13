import { cellScalarToText, parseCellInput } from "./cell-input.js";
import { replaceInText } from "./search-replace.js";
import type { SheetwriteStore } from "./store.js";
import type {
  CellAddress,
  CellValue,
  DocumentOp,
  ReplaceResult,
  SearchOptions,
  SearchResult,
  Sheet,
  SheetId,
  Store,
} from "./types.js";

export interface SearchControllerDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  sheet: (id?: SheetId) => Sheet;
  toViewRow: (dataRow: number) => number | null;
  viewportAnchor: () => { row: number; col: number };
  scrollToCell: (addr: CellAddress) => void;
  scheduleRender: () => void;
  emit: (result: SearchResult) => void;
  /** Whether writes are disabled; replace becomes a no-op. */
  readOnly: () => boolean;
  /** Route replacement writes through the grid so they land on the undo stack. */
  commit: (patches: DocumentOp[]) => void;
}

export interface SearchMatchSet {
  readonly sheet: SheetId | null;
  readonly length: number;
  at(index: number): CellAddress | null;
  rowAt(index: number): number;
  colAt(index: number): number;
  materialize(): CellAddress[];
}

class FlatSearchMatchSet implements SearchMatchSet {
  readonly length: number;

  constructor(
    readonly sheet: SheetId | null,
    private readonly pairs: Uint32Array,
  ) {
    this.length = pairs.length >>> 1;
  }

  at(index: number): CellAddress | null {
    if (index < 0 || index >= this.length || !this.sheet) return null;
    const offset = index << 1;
    return {
      sheet: this.sheet,
      row: this.pairs[offset]!,
      col: this.pairs[offset + 1]!,
    };
  }

  rowAt(index: number): number {
    return index >= 0 && index < this.length ? (this.pairs[index << 1] ?? -1) : -1;
  }

  colAt(index: number): number {
    return index >= 0 && index < this.length ? (this.pairs[(index << 1) + 1] ?? -1) : -1;
  }

  materialize(): CellAddress[] {
    if (!this.sheet || this.length === 0) return [];
    const matches = new Array<CellAddress>(this.length);
    for (let i = 0; i < this.length; i++) {
      const offset = i << 1;
      matches[i] = {
        sheet: this.sheet,
        row: this.pairs[offset]!,
        col: this.pairs[offset + 1]!,
      };
    }
    return matches;
  }
}

const EMPTY_MATCHES = new FlatSearchMatchSet(null, new Uint32Array(0));

/**
 * Owns find state and match scanning, then asks the grid shell to reveal and
 * repaint the active match.
 */
export class SearchController {
  private readonly deps: SearchControllerDeps;
  private searchMatches: SearchMatchSet = EMPTY_MATCHES;
  private searchActive = -1;
  private searchQuery = "";
  private searchOpts: SearchOptions = {};
  private revision = 0;

  constructor(deps: SearchControllerDeps) {
    this.deps = deps;
  }

  get matches(): SearchMatchSet {
    return this.searchMatches;
  }

  get active(): number {
    return this.searchActive;
  }

  get version(): number {
    return this.revision;
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    this.searchQuery = query;
    this.searchOpts = opts;
    this.searchMatches = query ? this.scanMatches(query, opts) : EMPTY_MATCHES;
    this.searchActive =
      this.searchMatches.length > 0
        ? this.activeFromViewport(this.searchMatches, this.deps.viewportAnchor())
        : -1;
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  findNext(): SearchResult {
    if (this.searchMatches.length > 0) {
      this.searchActive = (this.searchActive + 1) % this.searchMatches.length;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  findPrev(): SearchResult {
    if (this.searchMatches.length > 0) {
      const n = this.searchMatches.length;
      this.searchActive = (this.searchActive - 1 + n) % n;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.searchMatches = EMPTY_MATCHES;
    this.searchActive = -1;
    this.revision += 1;
    this.deps.scheduleRender();
    this.emitSearch();
  }

  /**
   * Replace the active match, then advance to the next match after it (in
   * row-major order, wrapping). Formula/ref cells are skipped rather than
   * rewritten; the active pointer still advances so the caller is never stuck.
   */
  replaceCurrent(replacement: string): SearchResult {
    const target = this.searchMatches.at(this.searchActive);
    if (this.deps.readOnly() || !target) return this.emitSearch();

    const patch = this.replacementPatch(target, replacement);
    if (patch) {
      this.deps.commit([patch]);
      this.searchMatches = this.scanMatches(this.searchQuery, this.searchOpts);
    }
    this.searchActive = this.advanceAfter(target, this.searchMatches);
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  /**
   * Replace every current match in one transaction (a single undo step), then
   * re-scan. Skipped formula/ref cells are not counted.
   */
  replaceAll(replacement: string): ReplaceResult {
    if (this.deps.readOnly()) {
      return { replaced: 0, result: this.emitSearch() };
    }

    const patches: DocumentOp[] = [];
    for (let i = 0; i < this.searchMatches.length; i++) {
      const match = this.searchMatches.at(i);
      if (!match) continue;
      const patch = this.replacementPatch(match, replacement);
      if (patch) patches.push(patch);
    }

    if (patches.length > 0) {
      this.deps.commit(patches);
      this.searchMatches = this.scanMatches(this.searchQuery, this.searchOpts);
      this.searchActive = this.searchMatches.length > 0 ? 0 : -1;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return { replaced: patches.length, result: this.emitSearch() };
  }

  /**
   * Build a `set` patch that rewrites `addr` for the current query, or null when
   * the cell is not eligible (formula/ref) or holds no occurrence to replace.
   * Preserves the cell's existing style and re-parses through `parseCellInput`
   * so numbers stay numbers.
   */
  private replacementPatch(addr: CellAddress, replacement: string): DocumentOp | null {
    // Formula cells carry source text we must never rewrite; ref cells are
    // WASM-cleared and never surface in matches, but guard anyway.
    if (this.deps.store.getFormula(addr) !== null) return null;

    const cell = this.deps.store.getCell(addr);
    const text = cellScalarToText(cell.resolved);
    const next = replaceInText(text, this.searchQuery, replacement, this.searchOpts);
    if (next === null) return null;

    const column = this.deps.sheet(addr.sheet).columns[addr.col];
    const value: CellValue = parseCellInput(next, column?.type ?? "text");
    return { op: "set", addr, value, style: cell.style };
  }

  /** Index of the first match ordered after `prev` (row-major), wrapping to 0. */
  private advanceAfter(prev: CellAddress, matches: SearchMatchSet): number {
    if (matches.length === 0) return -1;
    for (let i = 0; i < matches.length; i++) {
      const row = matches.rowAt(i);
      const col = matches.colAt(i);
      if (row > prev.row || (row === prev.row && col > prev.col)) return i;
    }
    return 0;
  }

  /**
   * Pick the first match at or after the viewport's top-left cell in current
   * view order. If no later match exists, wrap to the earliest visible-order
   * match. Search results stay in data space; sorted views are mapped here.
   */
  private activeFromViewport(
    matches: SearchMatchSet,
    anchor: { row: number; col: number },
  ): number {
    let firstIndex = -1;
    let firstRow = Number.MAX_SAFE_INTEGER;
    let firstCol = Number.MAX_SAFE_INTEGER;
    let afterIndex = -1;
    let afterRow = Number.MAX_SAFE_INTEGER;
    let afterCol = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < matches.length; i++) {
      const viewRow = this.deps.toViewRow(matches.rowAt(i));
      if (viewRow === null) continue;
      const col = matches.colAt(i);
      if (viewRow < firstRow || (viewRow === firstRow && col < firstCol)) {
        firstIndex = i;
        firstRow = viewRow;
        firstCol = col;
      }
      const atOrAfter = viewRow > anchor.row || (viewRow === anchor.row && col >= anchor.col);
      if (atOrAfter && (viewRow < afterRow || (viewRow === afterRow && col < afterCol))) {
        afterIndex = i;
        afterRow = viewRow;
        afterCol = col;
      }
    }
    return afterIndex >= 0 ? afterIndex : firstIndex;
  }

  private scanMatches(query: string, opts: SearchOptions): SearchMatchSet {
    const sheetId = opts.sheet ?? this.deps.activeSheet();

    // Fast path: scan the columnar store in WASM (no per-cell JS materialization).
    if (this.deps.loadable) {
      return new FlatSearchMatchSet(
        sheetId,
        this.deps.loadable.searchCellsFlat(sheetId, query, opts),
      );
    }

    // Fallback for a non-SheetwriteStore store: bulk-read the sheet and scan in JS.
    const sheet = this.deps.sheet(sheetId);
    const cols = opts.columns ?? sheet.columns.map((_, i) => i);
    const needle = opts.matchCase ? query : query.toLowerCase();
    const pairs: number[] = [];
    if (sheet.rowCount === 0 || cols.length === 0) return EMPTY_MATCHES;

    const view = this.deps.store.getVisibleWindow(sheetId, { start: 0, end: sheet.rowCount }, cols);
    const n = cols.length;
    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < n; c++) {
        const v = view.values[r * n + c];
        if (v === null || v === undefined || v === "") continue;
        const text = opts.matchCase ? String(v) : String(v).toLowerCase();
        if (opts.wholeCell ? text === needle : text.includes(needle)) {
          pairs.push(r, cols[c]!);
        }
      }
    }
    return pairs.length === 0
      ? EMPTY_MATCHES
      : new FlatSearchMatchSet(sheetId, Uint32Array.from(pairs));
  }

  private revealActiveMatch(): void {
    const m = this.searchMatches.at(this.searchActive);
    if (!m || m.sheet !== this.deps.activeSheet()) return;

    const viewRow = this.deps.toViewRow(m.row);
    if (viewRow === null) return;

    this.deps.scrollToCell({ ...m, row: viewRow });
  }

  private emitSearch(): SearchResult {
    const result: SearchResult = {
      query: this.searchQuery,
      matches: this.searchMatches.materialize(),
      active: this.searchActive,
    };
    this.deps.emit(result);
    return result;
  }
}
