import type { SheetwriteStore } from "./store";
import type { CellAddress, SearchOptions, SearchResult, Sheet, SheetId, Store } from "./types";

export interface SearchControllerDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  sheet: (id?: SheetId) => Sheet;
  toViewRow: (dataRow: number) => number | null;
  scrollToCell: (addr: CellAddress) => void;
  scheduleRender: () => void;
  emit: (result: SearchResult) => void;
}

/**
 * Owns find state and match scanning, then asks the grid shell to reveal and
 * repaint the active match.
 */
export class SearchController {
  private readonly deps: SearchControllerDeps;
  private searchMatches: CellAddress[] = [];
  private searchActive = -1;
  private searchQuery = "";

  constructor(deps: SearchControllerDeps) {
    this.deps = deps;
  }

  get matches(): CellAddress[] {
    return this.searchMatches;
  }

  get active(): number {
    return this.searchActive;
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    this.searchQuery = query;
    this.searchMatches = query ? this.scanMatches(query, opts) : [];
    this.searchActive = this.searchMatches.length > 0 ? 0 : -1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  findNext(): SearchResult {
    if (this.searchMatches.length > 0) {
      this.searchActive = (this.searchActive + 1) % this.searchMatches.length;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  findPrev(): SearchResult {
    if (this.searchMatches.length > 0) {
      const n = this.searchMatches.length;
      this.searchActive = (this.searchActive - 1 + n) % n;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.searchMatches = [];
    this.searchActive = -1;
    this.deps.scheduleRender();
    this.emitSearch();
  }

  private scanMatches(query: string, opts: SearchOptions): CellAddress[] {
    const sheetId = opts.sheet ?? this.deps.activeSheet();

    // Fast path: scan the columnar store in WASM (no per-cell JS materialization).
    if (this.deps.loadable) {
      return this.deps.loadable.searchCells(sheetId, query, opts);
    }

    // Fallback for a non-SheetwriteStore store: bulk-read the sheet and scan in JS.
    const sheet = this.deps.sheet(sheetId);
    const cols = opts.columns ?? sheet.columns.map((_, i) => i);
    const needle = opts.matchCase ? query : query.toLowerCase();
    const matches: CellAddress[] = [];
    if (sheet.rowCount === 0 || cols.length === 0) return matches;

    const view = this.deps.store.getVisibleWindow(sheetId, { start: 0, end: sheet.rowCount }, cols);
    const n = cols.length;
    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < n; c++) {
        const v = view.values[r * n + c];
        if (v === null || v === undefined || v === "") continue;
        const text = opts.matchCase ? String(v) : String(v).toLowerCase();
        if (opts.wholeCell ? text === needle : text.includes(needle)) {
          matches.push({ sheet: sheetId, row: r, col: cols[c]! });
        }
      }
    }
    return matches;
  }

  private revealActiveMatch(): void {
    const m = this.searchMatches[this.searchActive];
    if (!m || m.sheet !== this.deps.activeSheet()) return;

    const viewRow = this.deps.toViewRow(m.row);
    if (viewRow === null) return;

    this.deps.scrollToCell({ ...m, row: viewRow });
  }

  private emitSearch(): SearchResult {
    const result: SearchResult = {
      query: this.searchQuery,
      matches: this.searchMatches,
      active: this.searchActive,
    };
    this.deps.emit(result);
    return result;
  }
}
