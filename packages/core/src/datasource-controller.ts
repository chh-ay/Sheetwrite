import type { SheetwriteStore } from "./store.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DataSourcePage, DataSourceRequest } from "./types/data.js";

export interface DatasourceControllerOptions {
  datasource?: (request: DataSourceRequest) => Promise<DataSourcePage>;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  rowCount: (sheet: SheetId) => number;
  revision: () => number;
  isCellNewerThan: (address: CellAddress, revision: number) => boolean;
  retainRevision: (revision: number) => () => void;
  onRowsLoaded: () => void;
  onError: (request: Omit<DataSourceRequest, "signal">, error: unknown) => void;
}

interface ActiveRequest {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly controller: AbortController;
  readonly releaseRevision: () => void;
  released: boolean;
}

/** Owns datasource request bands, cancellation, generations, and loaded-row state. */
export class DatasourceController {
  private loaded: Uint8Array;
  private owners: Uint32Array;
  private readonly activeIds = new Set<number>();
  private readonly requests = new Set<ActiveRequest>();
  private nextRequestId = 1;
  private generation = 0;
  private destroyed = false;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.loaded = new Uint8Array(rowCount);
    this.owners = new Uint32Array(rowCount);
  }

  ensureLoaded(start: number, end: number): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed) return;

    this.refreshPagedResidency(loadable, start, end);

    const requestLimit = Math.min(this.loaded.length, Math.max(0, Math.ceil(end)));
    let row = Math.min(requestLimit, Math.max(0, Math.floor(start)));
    while (row < requestLimit) {
      while (row < requestLimit && (this.loaded[row] !== 0 || this.owners[row] !== 0)) row += 1;
      if (row >= requestLimit) return;

      const requestStart = row;
      while (row < requestLimit && this.loaded[row] === 0 && this.owners[row] === 0) row += 1;
      this.requestBand(datasource, loadable, requestStart, row);
    }
  }

  private refreshPagedResidency(loadable: SheetwriteStore, start: number, end: number): void {
    const sheet = this.options.activeSheet();
    if (!loadable.isPaged(sheet)) return;
    const schema = loadable.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    const columnCount = schema?.columns.length ?? 0;
    const rangeStart = Math.min(this.loaded.length, Math.max(0, Math.floor(start)));
    const rangeEnd = Math.min(this.loaded.length, Math.max(rangeStart, Math.ceil(end)));
    if (columnCount === 0 || rangeStart === rangeEnd) return;

    const resident = loadable.isRangeFullyLoaded({
      sheet,
      start: { row: rangeStart, col: 0 },
      end: { row: rangeEnd - 1, col: columnCount - 1 },
    });
    this.loaded.fill(resident ? 1 : 0, rangeStart, rangeEnd);
  }

  resize(rowCount: number): void {
    if (this.loaded.length !== rowCount) this.reset(rowCount);
  }

  reset(rowCount: number): void {
    this.generation += 1;
    for (const request of this.requests) {
      request.controller.abort();
      this.finishRequest(request);
    }
    this.loaded = new Uint8Array(rowCount);
    this.owners = new Uint32Array(rowCount);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    for (const request of this.requests) {
      request.controller.abort();
      this.finishRequest(request);
    }
    this.owners.fill(0);
  }

  private requestBand(
    datasource: NonNullable<DatasourceControllerOptions["datasource"]>,
    loadable: SheetwriteStore,
    requestStart: number,
    requestEnd: number,
  ): void {
    const id = this.allocateRequestId();
    for (let row = requestStart; row < requestEnd; row++) this.owners[row] = id;

    const sheet = this.options.activeSheet();
    const generation = this.generation;
    const revision = this.options.revision();
    const controller = new AbortController();
    const activeRequest: ActiveRequest = {
      id,
      start: requestStart,
      end: requestEnd,
      controller,
      releaseRevision: this.options.retainRevision(revision),
      released: false,
    };
    this.activeIds.add(id);
    this.requests.add(activeRequest);
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
      this.clearOwned(activeRequest);
      this.finishRequest(activeRequest);
      this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        const rows = page.rows;
        const valid =
          page.start === requestStart &&
          Array.isArray(rows) &&
          rows.length <= requestEnd - requestStart &&
          page.start + rows.length <= this.options.rowCount(sheet);
        if (!valid) {
          this.clearOwned(activeRequest);
          this.options.onError(
            { sheet, start: requestStart, end: requestEnd, revision },
            new RangeError("Datasource page does not match the requested range"),
          );
          return;
        }

        loadable.loadRows(sheet, page.start, rows, (address) =>
          this.options.isCellNewerThan(address, revision),
        );
        for (let row = page.start; row < page.start + rows.length; row++) {
          if (this.owners[row] === id) this.loaded[row] = 1;
        }
        this.clearOwned(activeRequest);
        this.options.onRowsLoaded();
      })
      .catch((error: unknown) => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.clearOwned(activeRequest);
        this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      })
      .finally(() => this.finishRequest(activeRequest));
  }

  private allocateRequestId(): number {
    for (;;) {
      const id = this.nextRequestId;
      this.nextRequestId = id === 0xffff_ffff ? 1 : id + 1;
      if (!this.activeIds.has(id)) return id;
    }
  }

  private finishRequest(request: ActiveRequest): void {
    if (request.released) return;
    request.released = true;
    this.requests.delete(request);
    this.activeIds.delete(request.id);
    request.releaseRevision();
  }

  private clearOwned(request: ActiveRequest): void {
    for (let row = request.start; row < request.end; row++) {
      if (this.owners[row] === request.id) this.owners[row] = 0;
    }
  }
}
