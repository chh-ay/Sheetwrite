import type {
  ChangeEvent,
  DataSource,
  DataSourceStorageOptions,
  DocumentOp,
  Grid,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  RowData,
  RuntimeResourceOperation,
  SheetId,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { SheetwriteStore } from "@sheetwrite/core";

export const ENGINE_LIVE_SHEET = "forecast" satisfies SheetId;
export const ENGINE_LIVE_ROWS = 50_000;
export const ENGINE_TRACE_LIMIT = 40;
export const ENGINE_PENDING_LIMIT = 16;
export const ENGINE_PAGE_DELAY_MS = 24;

export const ENGINE_LIVE_STORAGE: Required<DataSourceStorageOptions> = {
  mode: "paged",
  chunkRows: 512,
  cacheBytes: 2 * 1024 * 1024,
  dirtyCellLimit: 4_096,
};

export const ENGINE_LIVE_THEME: Partial<Theme> = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  rowHeight: 30,
  headerHeight: 32,
  rowHeaderWidth: 48,
};

const TEAMS = ["North", "West", "South", "East"] as const;

export type EngineRenderer = "canvas" | "worker";
export type EngineAction = "jump" | "edit" | "undo" | "save" | "renderer";
export type EngineResourceReason = "load" | "jump" | "edit" | "undo" | "save";

export interface EngineColumnBand {
  readonly start: number;
  readonly end: number;
  readonly keys: readonly string[];
}

const RESOURCE_OPERATION_BY_REASON: Readonly<
  Record<EngineResourceReason, RuntimeResourceOperation>
> = {
  load: "ingest",
  jump: "scroll",
  edit: "formula-recompute",
  undo: "formula-recompute",
  save: "persistence",
};

interface EngineEventBase {
  readonly sequence: number;
}

export type EngineEvent =
  | (EngineEventBase & {
      readonly type: "datasource-request";
      readonly requestId: number;
      readonly start: number;
      readonly end: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "datasource-result";
      readonly requestId: number;
      readonly rows: number;
      readonly durationMs: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "transaction-result";
      readonly action: "edit" | "undo" | "grid-edit";
      readonly status: "applied" | "noop" | "rejected" | "conflict";
      readonly changedCells: number;
      readonly epoch: number | null;
    })
  | (EngineEventBase & {
      readonly type: "page-resource";
      readonly reason: EngineResourceReason;
      readonly loadedCells: number;
      readonly dirtyCells: number;
      readonly pageBytes: number;
      readonly engineBytes: number;
    })
  | (EngineEventBase & {
      readonly type: "formula-update";
      readonly row: number;
      readonly source: string;
      readonly resolved: string | number | boolean | null;
    })
  | (EngineEventBase & {
      readonly type: "visible-window";
      readonly firstRow: number;
      readonly lastRow: number;
      readonly scrollTop: number;
    })
  | (EngineEventBase & {
      readonly type: "renderer";
      readonly requested: EngineRenderer;
      readonly active: EngineRenderer;
      readonly fallback: string | null;
    })
  | (EngineEventBase & {
      readonly type: "host-save";
      readonly saveId: string;
      readonly status: PersistenceCommitResponse["status"];
      readonly version: number;
      readonly operations: number;
    });

export type EngineEventInput = EngineEvent extends infer Event
  ? Event extends EngineEvent
    ? Omit<Event, "sequence">
    : never
  : never;

export interface EngineTrace {
  push(event: EngineEventInput): EngineEvent;
  clear(): void;
  snapshot(): readonly EngineEvent[];
  readonly size: number;
}

/** Scenario-local fixed-size event storage; this is not a core event bus. */
export function createEngineTrace(limit = ENGINE_TRACE_LIMIT): EngineTrace {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("trace limit must be positive");
  const events = new Array<EngineEvent>(limit);
  let sequence = 0;
  let start = 0;
  let size = 0;

  return {
    push(input) {
      sequence += 1;
      const event = { ...input, sequence } as EngineEvent;
      const index = (start + size) % limit;
      events[index] = event;
      if (size < limit) {
        size += 1;
      } else {
        start = (start + 1) % limit;
      }
      return event;
    },
    clear() {
      start = 0;
      size = 0;
      events.fill(undefined as never);
    },
    snapshot() {
      return Array.from({ length: size }, (_, index) => events[(start + index) % limit]!);
    },
    get size() {
      return size;
    },
  };
}

export function createEngineLiveWorkbook(): Workbook {
  return {
    activeSheet: ENGINE_LIVE_SHEET,
    sheets: [
      {
        id: ENGINE_LIVE_SHEET,
        name: "Weekly forecast",
        rowCount: ENGINE_LIVE_ROWS,
        columns: [
          { key: "week", header: "Week", width: 84, type: "number" },
          { key: "team", header: "Team", width: 108, type: "text" },
          { key: "planned", header: "Planned", width: 108, type: "number" },
          { key: "actual", header: "Actual", width: 108, type: "number" },
          { key: "difference", header: "Difference", width: 118, type: "number" },
          { key: "pace", header: "Pace", width: 100, type: "number" },
        ],
      },
    ],
  };
}

export function engineLiveRow(row: number, columns?: readonly EngineColumnBand[]): RowData {
  const sheetRow = row + 1;
  const planned = 900 + ((row * 37) % 700);
  const actual = planned - 90 + ((row * 53) % 181);
  const completeRow: RowData = {
    week: sheetRow,
    team: TEAMS[row % TEAMS.length] ?? "North",
    planned,
    actual,
    difference: { kind: "formula", src: `=D${sheetRow}-C${sheetRow}` },
    pace: { kind: "formula", src: `=IF(C${sheetRow}=0,0,D${sheetRow}/C${sheetRow})` },
  };
  if (!columns) return completeRow;
  const keys = new Set(columns.flatMap((band) => band.keys));
  return Object.fromEntries(Object.entries(completeRow).filter(([key]) => keys.has(key)));
}
export function createEngineLiveDataSource(
  emit: (event: EngineEventInput) => void,
  onResult?: () => void,
  delayMs = ENGINE_PAGE_DELAY_MS,
): DataSource {
  let requestId = 0;
  return {
    capabilities: { protocol: 2, columns: "windowed" },
    getRows({ protocol, sheet, start, end, columns, signal, revision }) {
      if (protocol !== 2) throw new Error(`Unsupported datasource protocol ${protocol}`);
      requestId += 1;
      const currentRequest = requestId;
      const startedAt = performance.now();
      const requestedColumns = columns;
      emit({
        type: "datasource-request",
        requestId: currentRequest,
        start,
        end,
        columns: requestedColumns,
      });
      const { promise, resolve, reject } = Promise.withResolvers<{
        protocol: 2;
        start: number;
        columns: readonly EngineColumnBand[];
        rows: RowData[];
        revision: number;
      }>();
      const timer = setTimeout(() => {
        if (signal.aborted) return;
        const rows = Array.from({ length: end - start }, (_, offset) =>
          engineLiveRow(start + offset, requestedColumns),
        );
        emit({
          type: "datasource-result",
          requestId: currentRequest,
          rows: rows.length,
          durationMs: performance.now() - startedAt,
          columns: requestedColumns,
        });
        resolve({ protocol: 2, start, columns: requestedColumns, rows, revision });
        queueMicrotask(() => onResult?.());
      }, delayMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException(`Request for ${sheet} was cancelled`, "AbortError"));
        },
        { once: true },
      );
      return promise;
    },
  };
}

function changeAction(change: ChangeEvent): "edit" | "undo" | "grid-edit" {
  if (change.commitReason === "undo") return "undo";
  if (
    change.commitReason === "edit-blur" ||
    change.commitReason === "edit-enter" ||
    change.commitReason === "edit-tab"
  ) {
    return "grid-edit";
  }
  return "edit";
}

function operationKey(operation: DocumentOp, index: number): string {
  if (operation.op === "set") {
    return `${operation.addr.sheet}:${operation.addr.row}:${operation.addr.col}`;
  }
  return `${operation.op}:${index}`;
}

export interface EngineEventBindings {
  announceRenderer(requested: EngineRenderer, fallback?: string | null): void;
  announceResult(
    action: "edit" | "undo" | "grid-edit",
    status: "noop" | "rejected" | "conflict",
  ): void;
  acknowledgeHost(response: PersistenceCommitResponse, operations: readonly DocumentOp[]): void;
  pendingOperations(): readonly DocumentOp[];
  sampleResource(reason: EngineResourceReason, operation?: RuntimeResourceOperation): void;
  dispose(): void;
}

/**
 * Bind public Grid events and measurements to the engine showcase's typed,
 * fixed-size event stream. Explanatory state is emitted only after the Grid
 * event or API result already exists.
 */
export function bindEngineEvents(
  grid: Grid,
  emit: (event: EngineEventInput) => void,
  onPendingChange?: (count: number) => void,
): EngineEventBindings {
  const pending = new Map<string, DocumentOp>();
  const unsubscribes: Array<() => void> = [];

  const sampleResource = (
    reason: EngineResourceReason,
    operation: RuntimeResourceOperation = RESOURCE_OPERATION_BY_REASON[reason],
  ) => {
    const page =
      grid.store instanceof SheetwriteStore ? grid.store.getPagedStats(ENGINE_LIVE_SHEET) : null;
    const resource = grid.getRuntimeResourceSnapshot(operation, "settled");
    emit({
      type: "page-resource",
      reason,
      loadedCells: page?.loadedCells ?? 0,
      dirtyCells: page?.dirtyCells ?? 0,
      pageBytes: page?.allocatedBytes ?? 0,
      engineBytes: resource.wasm.allocatedCapacityBytes,
    });
  };

  unsubscribes.push(
    grid.on("change", (change) => {
      change.transaction.patches.forEach((operation, index) => {
        pending.set(operationKey(operation, index), operation);
      });
      while (pending.size > ENGINE_PENDING_LIMIT) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      onPendingChange?.(pending.size);
      const action = changeAction(change);
      emit({
        type: "transaction-result",
        action,
        status: "applied",
        changedCells: change.changes.length,
        epoch: change.epoch ?? null,
      });
      const editedActual = [...change.changes].reverse().find((cell) => cell.addr.col === 3);
      if (editedActual) {
        const formulaAddress = { ...editedActual.addr, col: 4 };
        emit({
          type: "formula-update",
          row: formulaAddress.row,
          source: grid.store.getFormula(formulaAddress) ?? "",
          resolved: grid.store.getCell(formulaAddress).resolved,
        });
      }
      sampleResource(action === "undo" ? "undo" : "edit", "formula-recompute");
    }),
    grid.on("scroll", ({ firstRow, lastRow, scrollTop }) => {
      emit({ type: "visible-window", firstRow, lastRow, scrollTop });
    }),
    grid.on("renderer-fallback", ({ requested, error }) => {
      emit({
        type: "renderer",
        requested,
        active: grid.rendererKind(),
        fallback: error.message,
      });
    }),
  );

  return {
    announceRenderer(requested, fallback = null) {
      emit({ type: "renderer", requested, active: grid.rendererKind(), fallback });
    },
    announceResult(action, status) {
      emit({ type: "transaction-result", action, status, changedCells: 0, epoch: null });
    },
    acknowledgeHost(response, operations) {
      if (response.status === "conflict") {
        emit({
          type: "host-save",
          saveId: "conflict",
          status: response.status,
          version: response.currentVersion,
          operations: operations.length,
        });
        return;
      }
      for (const operation of operations) pending.delete(operationKey(operation, 0));
      grid.store.acknowledgeOperations?.(operations, BigInt(response.version));
      onPendingChange?.(pending.size);
      emit({
        type: "host-save",
        saveId: response.clientMutationId,
        status: response.status,
        version: response.version,
        operations: operations.length,
      });
      sampleResource("save", "persistence");
    },
    pendingOperations() {
      return [...pending.values()];
    },
    sampleResource,
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      pending.clear();
      onPendingChange?.(0);
    },
  };
}

export interface EngineHostSaver {
  commit(operations: readonly DocumentOp[]): Promise<PersistenceCommitResponse>;
  reset(): void;
  readonly version: number;
}

/** Small real host boundary: accepts the exact Grid operations and returns a typed acknowledgement. */
export function createEngineHostSaver(): EngineHostSaver {
  let version = 0;
  let saveSequence = 0;
  return {
    async commit(operations) {
      saveSequence += 1;
      const request: PersistenceCommitRequest = {
        documentId: "engine-live",
        baseVersion: version,
        clientMutationId: `engine-save-${saveSequence}`,
        operations,
      };
      version += 1;
      return {
        status: "applied",
        version,
        clientMutationId: request.clientMutationId,
      };
    },
    reset() {
      version = 0;
      saveSequence = 0;
    },
    get version() {
      return version;
    },
  };
}

export const ENGINE_SCRIPT: readonly EngineAction[] = [
  "jump",
  "edit",
  "undo",
  "edit",
  "save",
  "renderer",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null) return "blank";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function formatEngineEvent(event: EngineEvent): string {
  switch (event.type) {
    case "datasource-request": {
      const keys = event.columns.flatMap((band) => band.keys).join(", ") || "none";
      return `Rows requested: ${event.start + 1}–${event.end}; columns ${keys}`;
    }
    case "datasource-result": {
      const keys = event.columns.flatMap((band) => band.keys).join(", ") || "none";
      return `Rows ready: ${event.rows.toLocaleString()} in ${event.durationMs.toFixed(1)} ms; columns ${keys}`;
    }
    case "transaction-result":
      return `${event.action === "undo" ? "Undo" : "Edit"}: ${event.status}, ${event.changedCells} cell${event.changedCells === 1 ? "" : "s"} changed`;
    case "page-resource":
      return `Page sample: ${event.loadedCells.toLocaleString()} cells loaded, ${event.dirtyCells.toLocaleString()} changed, ${formatBytes(event.pageBytes)} kept in pages, ${formatBytes(event.engineBytes)} in the calculation engine`;
    case "formula-update":
      return `Formula E${event.row + 1}: ${event.source} → ${formatValue(event.resolved)}`;
    case "visible-window":
      return `Visible rows: ${event.firstRow + 1}–${event.lastRow + 1}`;
    case "renderer":
      return event.fallback
        ? `Drawing: ${event.requested} requested, ${event.active} active (${event.fallback})`
        : `Drawing: ${event.active} active`;
    case "host-save":
      return `Host save: ${event.status} at version ${event.version}, ${event.operations} change${event.operations === 1 ? "" : "s"}`;
  }
}
