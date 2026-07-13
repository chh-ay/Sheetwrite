import type { SheetwriteStore } from "./store.js";
import type { CellAddress, DataSourcePage, DataSourceRequest, SheetId } from "./types.js";

export interface DatasourceControllerOptions {
  datasource?: (request: DataSourceRequest) => Promise<DataSourcePage>;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  rowCount: (sheet: SheetId) => number;
  revision: () => number;
  isCellNewerThan: (address: CellAddress, revision: number) => boolean;
  onRowsLoaded: () => void;
  onError: (request: Omit<DataSourceRequest, "signal">, error: unknown) => void;
}

/** Owns datasource request bands, cancellation, generations, and loaded-row state. */
export class DatasourceController {
  private loaded: Uint8Array;
  private readonly inFlight = new Set<number>();
  private readonly controllers = new Set<AbortController>();
  private generation = 0;
  private destroyed = false;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.loaded = new Uint8Array(rowCount);
  }

  ensureLoaded(start: number, end: number): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed) return;
    let lo = -1;
    let hi = -1;
    for (let row = start; row < end; row++) {
      if (this.loaded[row] === 0 && !this.inFlight.has(row)) {
        if (lo === -1) lo = row;
        hi = row;
      }
    }
    if (lo === -1) return;

    const requestStart = lo;
    const requestEnd = hi + 1;
    for (let row = requestStart; row < requestEnd; row++) this.inFlight.add(row);

    const sheet = this.options.activeSheet();
    const generation = this.generation;
    const revision = this.options.revision();
    const controller = new AbortController();
    this.controllers.add(controller);
    const request: DataSourceRequest = {
      sheet,
      start: requestStart,
      end: requestEnd,
      signal: controller.signal,
      revision,
    };
    let pending: Promise<DataSourcePage>;

    try {
      pending = datasource(request);
    } catch (error) {
      this.controllers.delete(controller);
      this.clearInFlight(requestStart, requestEnd);
      this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        this.controllers.delete(controller);
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        const rows = page.rows;
        const valid =
          page.start === requestStart &&
          Array.isArray(rows) &&
          rows.length <= requestEnd - requestStart &&
          page.start + rows.length <= this.options.rowCount(sheet);
        if (!valid) {
          this.clearInFlight(requestStart, requestEnd);
          this.options.onError(
            { sheet, start: requestStart, end: requestEnd, revision },
            new RangeError("Datasource page does not match the requested range"),
          );
          return;
        }

        loadable.loadRows(sheet, page.start, rows, (address) =>
          this.options.isCellNewerThan(address, revision),
        );
        for (let row = page.start; row < page.start + rows.length; row++) this.loaded[row] = 1;
        this.clearInFlight(requestStart, requestEnd);
        this.options.onRowsLoaded();
      })
      .catch((error: unknown) => {
        this.controllers.delete(controller);
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.clearInFlight(requestStart, requestEnd);
        this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      });
  }

  resize(rowCount: number): void {
    if (this.loaded.length !== rowCount) this.loaded = new Uint8Array(rowCount);
  }

  reset(rowCount: number): void {
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.inFlight.clear();
    this.loaded = new Uint8Array(rowCount);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.inFlight.clear();
  }

  private clearInFlight(start: number, end: number): void {
    for (let row = start; row < end; row++) this.inFlight.delete(row);
  }
}
