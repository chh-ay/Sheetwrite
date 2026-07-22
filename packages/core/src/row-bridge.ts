import type { CellScalar, CellValue, Column } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, RowMetadata, SheetSnapshot } from "./types/document.js";
import type { ChangeEvent, CellChange, OperationSource, Transaction } from "./types/transaction.js";

/** A stable host identity for one data-space row. */
export type RowBridgeId = string | number;

/** Semantic column key accepted by the row bridge. */
export interface RowBridgeColumn<Row extends Record<string, CellScalar>> {
  readonly key: keyof Row & string;
}

/** Context supplied when a canonical row insertion needs a host identity. */
export interface RowBridgeInsertContext {
  readonly sheet: SheetId;
  readonly at: number;
  readonly offset: number;
  readonly transactionId: string;
}

/** Options for the framework-neutral, opt-in row bridge. */
export interface RowBridgeOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly columns: readonly RowBridgeColumn<Row>[];
  readonly defaultRows: readonly Row[];
  readonly getRowId: (row: Row, index: number) => Id;
  /** Sheet identity used by the simple data-first adapter. Defaults to `sheet1`. */
  readonly sheet?: SheetId;
  /** Optional identity factory for rows created by an addRows operation. */
  readonly createRowId?: (context: RowBridgeInsertContext) => Id;
}

/** A cell effect with semantic column and host row identity. */
export interface RowBridgeCell<Id extends RowBridgeId = RowBridgeId> {
  readonly sheet: SheetId;
  readonly row: number;
  readonly rowId: Id | null;
  readonly col: number;
  readonly columnKey: string | null;
  readonly previous: CellValue | undefined;
  readonly next: CellValue | undefined;
}

/** The canonical transaction identity carried by each projected delta. */
export interface RowBridgeTransaction {
  readonly id: string;
  readonly source: OperationSource;
  readonly commitReason: CommitReason;
  readonly epoch: number | undefined;
  readonly patches: readonly DocumentOp[];
}

interface RowBridgeDeltaBase<Id extends RowBridgeId = RowBridgeId> {
  readonly transaction: RowBridgeTransaction;
  readonly transactionId: string;
  readonly source: OperationSource;
  readonly previous: unknown;
  readonly next: unknown;
  readonly operation: DocumentOp;
  readonly rowIds: readonly (Id | null)[];
}

/** A single-cell edit, including edits from search, undo, and redo. */
export interface RowBridgeCellDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "cell";
  readonly cell: RowBridgeCell<Id>;
}

/** A setRange/setBlock effect expanded to its exact changed cells. */
export interface RowBridgeRangeDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "range";
  readonly range: Range;
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A clearRange effect expanded to its exact changed cells. */
export interface RowBridgeClearDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "clear";
  readonly range: Range;
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A paste transaction effect. A paste can contain multiple canonical patches. */
export interface RowBridgePasteDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "paste";
  readonly range: Range | null;
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A fill-series transaction effect. */
export interface RowBridgeFillDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "fill";
  readonly range: Range | null;
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** Stable row identity effects for insert, delete, and move operations. */
export interface RowBridgeRowStructureDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "row-structure";
  readonly action: "insert" | "delete" | "move";
  readonly sheet: SheetId;
  readonly at: number;
  readonly count: number;
  readonly from?: number;
  readonly to?: number;
  readonly inserted: readonly (Id | null)[];
  readonly removed: readonly (Id | null)[];
}

/** A document operation that changes workbook or column metadata. */
export interface RowBridgeMetadataDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "metadata";
  readonly metadata:
    | "column"
    | "row"
    | "sheet"
    | "merge"
    | "table"
    | "validation"
    | "hyperlink"
    | "protected-range"
    | "note"
    | "named-range";
}

/** A document operation that needs a host-side action rather than row mutation. */
export interface RowBridgeHostActionDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "host-action";
  readonly action:
    | "add-sheet"
    | "remove-sheet"
    | "rename-sheet"
    | "move-sheet"
    | "set-sheet-visibility";
}

/** An explicit projection record for an operation with no row-space meaning. */
export interface RowBridgeUnprojectableDelta<Id extends RowBridgeId = RowBridgeId>
  extends RowBridgeDeltaBase<Id> {
  readonly kind: "unprojectable";
  readonly reason: string;
}

/** Every possible projection produced by a row bridge. */
export type RowBridgeDelta<Id extends RowBridgeId = RowBridgeId> =
  | RowBridgeCellDelta<Id>
  | RowBridgeRangeDelta<Id>
  | RowBridgeClearDelta<Id>
  | RowBridgePasteDelta<Id>
  | RowBridgeFillDelta<Id>
  | RowBridgeRowStructureDelta<Id>
  | RowBridgeMetadataDelta<Id>
  | RowBridgeHostActionDelta<Id>
  | RowBridgeUnprojectableDelta<Id>;

/** Reconciliation status for a canonical transaction response. */
export type RowBridgeReconciliationStatus =
  | "accepted"
  | "transformed"
  | "rejected"
  | "out-of-order"
  | "duplicate"
  | "remote";

/** Input to {@link RowBridge.reconcile}. */
export interface RowBridgeReconciliationInput<Id extends RowBridgeId = RowBridgeId> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transactionId?: string;
  readonly source?: OperationSource;
  readonly version?: number;
  /** Canonical operations applied by the document engine. */
  readonly operations?: readonly DocumentOp[];
  /** Original host operations, used to identify a transformed acceptance. */
  readonly requestedOperations?: readonly DocumentOp[];
  readonly event?: ChangeEvent;
  readonly commitReason?: CommitReason;
  readonly _type?: Id;
}

/** Result of projection or reconciliation. */
export interface RowBridgeProjection<Id extends RowBridgeId = RowBridgeId> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transaction: RowBridgeTransaction;
  readonly deltas: readonly RowBridgeDelta<Id>[];
}

/** Callback accepted by imperative and framework adapters. */
export type RowBridgeHandler<Id extends RowBridgeId = RowBridgeId> = (
  projection: RowBridgeProjection<Id>,
) => void;

interface MutableSheetState<Id extends RowBridgeId> {
  readonly rowIds: Array<Id | null>;
  readonly columns: string[];
}

const DEFAULT_SHEET: SheetId = "sheet1";

function assertNever(value: never): never {
  const unknownValue: unknown = value;
  let operation = "unknown";
  if (
    typeof unknownValue === "object" &&
    unknownValue !== null &&
    "op" in unknownValue &&
    typeof unknownValue.op === "string"
  ) {
    operation = unknownValue.op;
  }
  throw new Error(`Sheetwrite: unsupported document operation ${operation}`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return `bigint:${String(value)}`;
    if (typeof value === "undefined") return "undefined";
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function operationFingerprint(operations: readonly DocumentOp[]): string {
  return hash(stableJson(operations));
}

function transactionFor(
  event: ChangeEvent,
  explicitId?: string,
  operations: readonly DocumentOp[] = event.transaction.patches,
): RowBridgeTransaction {
  const id = explicitId ?? `tx-${hash(stableJson({ epoch: event.epoch, operations }))}`;
  return {
    id,
    source: event.source,
    commitReason: event.commitReason,
    epoch: event.epoch,
    patches: operations,
  };
}

function cellAddressKey(addr: CellAddress): string {
  return `${addr.sheet}\u0000${addr.row}\u0000${addr.col}`;
}

function rangeContains(range: Range, addr: CellAddress): boolean {
  return (
    range.sheet === addr.sheet &&
    addr.row >= Math.min(range.start.row, range.end.row) &&
    addr.row <= Math.max(range.start.row, range.end.row) &&
    addr.col >= Math.min(range.start.col, range.end.col) &&
    addr.col <= Math.max(range.start.col, range.end.col)
  );
}

function operationRange(operation: DocumentOp): Range | null {
  switch (operation.op) {
    case "set":
      return {
        sheet: operation.addr.sheet,
        start: { row: operation.addr.row, col: operation.addr.col },
        end: { row: operation.addr.row, col: operation.addr.col },
      };
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange":
      return operation.range;
    default:
      return null;
  }
}

function operationColumns(operation: DocumentOp): string[] {
  switch (operation.op) {
    case "addColumns":
      return operation.columns.map((column) => column.key);
    default:
      return [];
  }
}

/**
 * Projects canonical document transactions into host-owned row changes.
 *
 * The bridge only owns compact data-space identity arrays. It never writes to
 * `defaultRows`, never renders, and never creates a second document store.
 */
export class RowBridge<
  Id extends RowBridgeId = RowBridgeId,
  Row extends Record<string, CellScalar> = Record<string, CellScalar>,
> {
  private readonly sheets = new Map<SheetId, MutableSheetState<Id>>();
  private readonly createRowId: RowBridgeOptions<Row, Id>["createRowId"];
  private readonly seenFingerprints = new Set<string>();
  private readonly localFingerprints = new Set<string>();
  private readonly seenTransactionIds = new Set<string>();
  private latestVersion = -Infinity;

  constructor(options: RowBridgeOptions<Row, Id>) {
    const columnKeys = options.columns.map((column) => column.key);
    if (new Set(columnKeys).size !== columnKeys.length) {
      throw new TypeError("Sheetwrite: row bridge columns must have unique semantic keys");
    }
    const rowIds: Array<Id | null> = [];
    const identities = new Set<Id>();
    for (let index = 0; index < options.defaultRows.length; index += 1) {
      const id = options.getRowId(options.defaultRows[index]!, index);
      if (id === undefined || id === null || (typeof id !== "string" && typeof id !== "number")) {
        throw new TypeError(
          `Sheetwrite: getRowId must return a stable string or number at row ${index}`,
        );
      }
      if (identities.has(id)) throw new TypeError(`Sheetwrite: duplicate row ID "${String(id)}"`);
      identities.add(id);
      rowIds.push(id);
    }
    this.sheets.set(options.sheet ?? DEFAULT_SHEET, { rowIds, columns: columnKeys });
    this.createRowId = options.createRowId;
  }

  /** Current data-space row identities; visual sort and filters do not affect this order. */
  rowIds(sheet: SheetId = DEFAULT_SHEET): readonly (Id | null)[] {
    return [...(this.sheets.get(sheet)?.rowIds ?? [])];
  }

  /** Current semantic column keys in canonical column order. */
  columnKeys(sheet: SheetId = DEFAULT_SHEET): readonly string[] {
    return [...(this.sheets.get(sheet)?.columns ?? [])];
  }

  /** Project an applied Grid change as an accepted, transformed, or remote result. */
  project(
    event: ChangeEvent,
    requestedOperations?: readonly DocumentOp[],
    transactionId?: string,
  ): RowBridgeProjection<Id> {
    const canonical = event.transaction.patches;
    const transformed =
      requestedOperations !== undefined &&
      stableJson(requestedOperations) !== stableJson(canonical);
    return this.projectEvent(
      event,
      transformed ? "transformed" : event.source === "remote" ? "remote" : "accepted",
      transactionId,
      requestedOperations,
    );
  }

  /** Reconcile a canonical transaction response without synchronizing host rows implicitly. */
  reconcile(input: RowBridgeReconciliationInput<Id>): RowBridgeProjection<Id> {
    const event = input.event;
    const operations = event?.transaction.patches ?? input.operations ?? [];
    const source =
      input.source ?? event?.source ?? (input.status === "remote" ? "remote" : "local");
    const transactionId = input.transactionId;
    if (input.version !== undefined) {
      if (input.version < this.latestVersion) {
        return this.emptyResult(
          input.status === "out-of-order" ? "out-of-order" : "out-of-order",
          transactionId,
          source,
          operations,
          input.commitReason,
          event?.epoch,
        );
      }
      this.latestVersion = input.version;
    }
    if (
      input.status === "rejected" ||
      input.status === "out-of-order" ||
      input.status === "duplicate"
    ) {
      return this.emptyResult(
        input.status,
        transactionId,
        source,
        operations,
        input.commitReason,
        event?.epoch,
      );
    }
    if (event) {
      return this.projectEvent(event, input.status, transactionId, input.requestedOperations);
    }
    const synthetic: ChangeEvent = {
      transaction: { patches: [...operations] },
      changes: [],
      commitReason: input.commitReason ?? "api",
      source,
    };
    return this.projectEvent(synthetic, input.status, transactionId, input.requestedOperations);
  }

  private emptyResult(
    status: RowBridgeReconciliationStatus,
    transactionId: string | undefined,
    source: OperationSource,
    operations: readonly DocumentOp[],
    commitReason = "api" as CommitReason,
    epoch?: number,
  ): RowBridgeProjection<Id> {
    const event: ChangeEvent = {
      transaction: { patches: [...operations], ...(epoch === undefined ? {} : { epoch }) },
      changes: [],
      commitReason,
      source,
      ...(epoch === undefined ? {} : { epoch }),
    };
    return { status, transaction: transactionFor(event, transactionId), deltas: [] };
  }

  private projectEvent(
    event: ChangeEvent,
    status: RowBridgeReconciliationStatus,
    explicitId?: string,
    requestedOperations?: readonly DocumentOp[],
  ): RowBridgeProjection<Id> {
    const operations = event.transaction.patches;
    const transaction = transactionFor(event, explicitId);
    const fingerprint = operationFingerprint(operations);
    const hasTransactionIdentity = explicitId !== undefined || event.epoch !== undefined;
    if (hasTransactionIdentity && this.seenTransactionIds.has(transaction.id)) {
      return { status: "duplicate", transaction, deltas: [] };
    }
    if (event.source === "remote" && this.localFingerprints.has(fingerprint)) {
      this.localFingerprints.delete(fingerprint);
      if (hasTransactionIdentity) this.seenTransactionIds.add(transaction.id);
      return { status: "duplicate", transaction, deltas: [] };
    }
    if (event.epoch !== undefined && event.epoch < this.latestVersion) {
      return { status: "out-of-order", transaction, deltas: [] };
    }
    if (event.epoch !== undefined) this.latestVersion = Math.max(this.latestVersion, event.epoch);
    if (hasTransactionIdentity) this.seenTransactionIds.add(transaction.id);
    this.seenFingerprints.add(fingerprint);
    if (event.source === "local") this.localFingerprints.add(fingerprint);
    const changeQueues = new Map<string, CellChange[]>();
    for (const change of event.changes) {
      const key = cellAddressKey(change.addr);
      const queue = changeQueues.get(key);
      if (queue) queue.push(change);
      else changeQueues.set(key, [change]);
    }
    const deltas: RowBridgeDelta<Id>[] = [];
    for (const operation of operations) {
      deltas.push(...this.projectOperation(operation, transaction, changeQueues));
    }
    // Keep the explicit requested argument observable to callers through the status only;
    // the canonical patches above are always the source of projected identity changes.
    void requestedOperations;
    return { status, transaction, deltas };
  }

  private state(sheet: SheetId): MutableSheetState<Id> | null {
    return this.sheets.get(sheet) ?? null;
  }

  private rowId(sheet: SheetId, row: number): Id | null {
    return this.state(sheet)?.rowIds[row] ?? null;
  }

  private columnKey(sheet: SheetId, col: number): string | null {
    return this.state(sheet)?.columns[col] ?? null;
  }

  private cellsFor(
    operation: DocumentOp,
    changeQueues: Map<string, CellChange[]>,
  ): RowBridgeCell<Id>[] {
    const addresses: CellAddress[] = [];
    const values = new Map<string, CellValue>();
    if (operation.op === "set") {
      addresses.push(operation.addr);
      values.set(cellAddressKey(operation.addr), operation.value);
    } else if (operation.op === "setRange") {
      const range = operation.range;
      const startRow = Math.min(range.start.row, range.end.row);
      const startCol = Math.min(range.start.col, range.end.col);
      for (const cell of operation.cells) {
        const addr = {
          sheet: range.sheet,
          row: startRow + cell.rowOffset,
          col: startCol + cell.colOffset,
        };
        addresses.push(addr);
        values.set(cellAddressKey(addr), cell.value);
      }
    } else if (operation.op === "setBlock") {
      const range = operation.range;
      const startRow = Math.min(range.start.row, range.end.row);
      const startCol = Math.min(range.start.col, range.end.col);
      const formulas = new Map(operation.block.formulas ?? []);
      const refs = new Map(operation.block.refs ?? []);
      for (let offset = 0; offset < operation.block.values.length; offset += 1) {
        const addr = {
          sheet: range.sheet,
          row: startRow + Math.floor(offset / operation.block.colCount),
          col: startCol + (offset % operation.block.colCount),
        };
        addresses.push(addr);
        values.set(
          cellAddressKey(addr),
          formulas.has(offset)
            ? { kind: "formula", src: formulas.get(offset)! }
            : refs.has(offset)
              ? { kind: "ref", target: refs.get(offset)! }
              : { kind: "literal", value: operation.block.values[offset]! },
        );
      }
    } else if (operation.op === "clearRange") {
      const range = operation.range;
      const startRow = Math.min(range.start.row, range.end.row);
      const endRow = Math.max(range.start.row, range.end.row);
      const startCol = Math.min(range.start.col, range.end.col);
      const endCol = Math.max(range.start.col, range.end.col);
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const addr = { sheet: range.sheet, row, col };
          addresses.push(addr);
          if (operation.contents !== false) {
            values.set(cellAddressKey(addr), { kind: "literal", value: null });
          }
        }
      }
    }
    return addresses.map((addr) => {
      const key = cellAddressKey(addr);
      const change = changeQueues.get(key)?.shift();
      return {
        sheet: addr.sheet,
        row: addr.row,
        rowId: this.rowId(addr.sheet, addr.row),
        col: addr.col,
        columnKey: this.columnKey(addr.sheet, addr.col),
        previous: change?.oldValue,
        next: change?.newValue ?? values.get(key),
      };
    });
  }

  private base<Kind extends RowBridgeDelta["kind"]>(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    previous: unknown,
    next: unknown,
    rowIds: readonly (Id | null)[],
  ): RowBridgeDeltaBase<Id> & { readonly kind?: Kind } {
    return {
      transaction,
      transactionId: transaction.id,
      source: transaction.source,
      previous,
      next,
      operation,
      rowIds,
    };
  }

  private projectOperation(
    operation: DocumentOp,
    transaction: RowBridgeTransaction,
    changeQueues: Map<string, CellChange[]>,
  ): RowBridgeDelta<Id>[] {
    const sheet =
      "sheet" in operation && typeof operation.sheet === "string" ? operation.sheet : null;
    switch (operation.op) {
      case "set": {
        const cells = this.cellsFor(operation, changeQueues);
        const cell = cells[0]!;
        const kind =
          transaction.commitReason === "paste"
            ? "paste"
            : transaction.commitReason === "fill"
              ? "fill"
              : "cell";
        const base = this.base(
          transaction,
          operation,
          cell?.previous,
          cell?.next,
          cell ? [cell.rowId] : [],
        );
        if (kind === "paste") {
          return [
            { ...base, kind, range: operationRange(operation), cells } as RowBridgePasteDelta<Id>,
          ];
        }
        if (kind === "fill") {
          return [
            { ...base, kind, range: operationRange(operation), cells } as RowBridgeFillDelta<Id>,
          ];
        }
        return [{ ...base, kind: "cell", cell } as RowBridgeCellDelta<Id>];
      }
      case "setRange":
      case "setBlock": {
        const cells = this.cellsFor(operation, changeQueues);
        const range = operation.range;
        const base = this.base(
          transaction,
          operation,
          cells.map((cell) => cell.previous),
          cells.map((cell) => cell.next),
          cells.map((cell) => cell.rowId),
        );
        const kind =
          transaction.commitReason === "paste"
            ? "paste"
            : transaction.commitReason === "fill"
              ? "fill"
              : "range";
        if (kind === "paste") return [{ ...base, kind, range, cells } as RowBridgePasteDelta<Id>];
        if (kind === "fill") return [{ ...base, kind, range, cells } as RowBridgeFillDelta<Id>];
        return [{ ...base, kind, range, cells } as RowBridgeRangeDelta<Id>];
      }
      case "clearRange": {
        const cells = this.cellsFor(operation, changeQueues);
        const base = this.base(
          transaction,
          operation,
          cells.map((cell) => cell.previous),
          cells.map((cell) => cell.next),
          cells.map((cell) => cell.rowId),
        );
        return [
          { ...base, kind: "clear", range: operation.range, cells } as RowBridgeClearDelta<Id>,
        ];
      }
      case "addRows": {
        const state = this.state(operation.sheet);
        const inserted: Array<Id | null> = [];
        const insertedIds = new Set<Id>();
        for (let offset = 0; offset < operation.count; offset += 1) {
          let id: Id | null = null;
          if (this.createRowId) {
            id = this.createRowId({
              sheet: operation.sheet,
              at: operation.at,
              offset,
              transactionId: transaction.id,
            });
            if (typeof id !== "string" && typeof id !== "number") {
              throw new TypeError("Sheetwrite: createRowId must return a stable string or number");
            }
            if (state?.rowIds.includes(id) || insertedIds.has(id)) {
              throw new TypeError(`Sheetwrite: duplicate inserted row ID "${String(id)}"`);
            }
            insertedIds.add(id);
          }
          inserted.push(id);
        }
        state?.rowIds.splice(operation.at, 0, ...inserted);
        const base = this.base(transaction, operation, [], inserted, inserted);
        return [
          {
            ...base,
            kind: "row-structure",
            action: "insert",
            sheet: operation.sheet,
            at: operation.at,
            count: operation.count,
            inserted,
            removed: [],
          } as RowBridgeRowStructureDelta<Id>,
        ];
      }
      case "removeRows": {
        const state = this.state(operation.sheet);
        const removed = state?.rowIds.splice(operation.at, operation.count) ?? [];
        const base = this.base(transaction, operation, removed, [], removed);
        return [
          {
            ...base,
            kind: "row-structure",
            action: "delete",
            sheet: operation.sheet,
            at: operation.at,
            count: operation.count,
            inserted: [],
            removed,
          } as RowBridgeRowStructureDelta<Id>,
        ];
      }
      case "moveRows": {
        const state = this.state(operation.sheet);
        const moved = state?.rowIds.splice(operation.from, operation.count) ?? [];
        state?.rowIds.splice(operation.to, 0, ...moved);
        const base = this.base(transaction, operation, moved, moved, moved);
        return [
          {
            ...base,
            kind: "row-structure",
            action: "move",
            sheet: operation.sheet,
            at: operation.to,
            from: operation.from,
            to: operation.to,
            count: operation.count,
            inserted: moved,
            removed: [],
          } as RowBridgeRowStructureDelta<Id>,
        ];
      }
      case "addColumns": {
        this.state(operation.sheet)?.columns.splice(
          operation.at,
          0,
          ...operationColumns(operation),
        );
        return [this.metadata(transaction, operation, "column", sheet)];
      }
      case "removeColumns": {
        this.state(operation.sheet)?.columns.splice(operation.at, operation.count);
        return [this.metadata(transaction, operation, "column", sheet)];
      }
      case "moveColumns": {
        const columns = this.state(operation.sheet)?.columns;
        const moved = columns?.splice(operation.from, operation.count) ?? [];
        columns?.splice(operation.to, 0, ...moved);
        return [this.metadata(transaction, operation, "column", sheet)];
      }
      case "setColumn":
        return [this.metadata(transaction, operation, "column", sheet)];
      case "setRowMeta":
        return [
          this.metadata(transaction, operation, "row", sheet, [
            this.rowId(operation.sheet, operation.row),
          ]),
        ];
      case "setRangeStyle":
        return [this.metadata(transaction, operation, "row", sheet)];
      case "addMerge":
      case "removeMerge":
        return [this.metadata(transaction, operation, "merge", sheet)];
      case "addSheet": {
        const snapshot = operation.sheet;
        this.sheets.set(snapshot.id, this.sheetStateForSnapshot(snapshot));
        return [
          {
            ...this.base(transaction, operation, undefined, snapshot, []),
            kind: "host-action",
            action: "add-sheet",
          } as RowBridgeHostActionDelta<Id>,
        ];
      }
      case "removeSheet": {
        const previous = this.sheets.get(operation.sheet)?.rowIds ?? [];
        this.sheets.delete(operation.sheet);
        return [
          {
            ...this.base(transaction, operation, previous, undefined, previous),
            kind: "host-action",
            action: "remove-sheet",
          } as RowBridgeHostActionDelta<Id>,
        ];
      }
      case "renameSheet":
        return [
          {
            ...this.base(transaction, operation, undefined, operation.name, []),
            kind: "host-action",
            action: "rename-sheet",
          } as RowBridgeHostActionDelta<Id>,
        ];
      case "moveSheet":
        return [
          {
            ...this.base(transaction, operation, undefined, operation.to, []),
            kind: "host-action",
            action: "move-sheet",
          } as RowBridgeHostActionDelta<Id>,
        ];
      case "setSheetVisibility":
        return [
          {
            ...this.base(transaction, operation, undefined, operation.visibility, []),
            kind: "host-action",
            action: "set-sheet-visibility",
          } as RowBridgeHostActionDelta<Id>,
        ];
      case "setSheetMeta":
        return [this.metadata(transaction, operation, "sheet", sheet)];
      case "addTable":
      case "updateTable":
      case "removeTable":
        return [this.metadata(transaction, operation, "table", sheet)];
      case "setValidationRule":
      case "removeValidationRule":
        return [this.metadata(transaction, operation, "validation", sheet)];
      case "setHyperlink":
      case "removeHyperlink":
        return [this.metadata(transaction, operation, "hyperlink", sheet)];
      case "setProtectedRange":
      case "removeProtectedRange":
        return [this.metadata(transaction, operation, "protected-range", sheet)];
      case "setNote":
        return [
          this.metadata(transaction, operation, "note", operation.addr.sheet, [
            this.rowId(operation.addr.sheet, operation.addr.row),
          ]),
        ];
      case "setNamedRange":
      case "removeNamedRange":
        return [this.metadata(transaction, operation, "named-range", sheet)];
      default:
        return assertNever(operation);
    }
  }

  private sheetStateForSnapshot(snapshot: SheetSnapshot): MutableSheetState<Id> {
    return {
      rowIds: new Array<Id | null>(snapshot.rowCount).fill(null),
      columns: snapshot.columns.map((column) => column.key),
    };
  }

  private metadata(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    metadata: RowBridgeMetadataDelta["metadata"],
    sheet: SheetId | null,
    rowIds: readonly (Id | null)[] = [],
  ): RowBridgeMetadataDelta<Id> {
    return {
      ...this.base(transaction, operation, undefined, operation, rowIds),
      kind: "metadata",
      metadata,
    };
  }
}

/** Create a typed bridge while preserving row and identity inference. */
export function createRowBridge<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(options: RowBridgeOptions<Row, Id>): RowBridge<Id> {
  return new RowBridge(options);
}

/** Compute a deterministic identity for a canonical transaction. */
export function rowBridgeTransactionId(
  transaction: Pick<Transaction, "patches" | "epoch">,
): string {
  return `tx-${hash(stableJson({ epoch: transaction.epoch, operations: transaction.patches }))}`;
}
