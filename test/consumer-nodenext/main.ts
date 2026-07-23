// Declaration-resolution guard: a strict `moduleResolution: nodenext` consumer
// must be able to follow @sheetwrite/core's d.ts graph (every relative
// specifier inside dist/*.d.ts needs an explicit .js extension).
// biome-ignore-all assist/source/organizeImports: Negative imports intentionally bind one error directive each.
import type {
  ChangeEvent,
  DataSource,
  DataSourceRequest,
  DocumentOp,
  GridOptions,
  PersistenceAdapter,
  PersistenceCommitResponse,
  Store,
  Theme,
  TransactionApplicationOptions,
  VersionedOperation,
  Workbook,
  WorkbookSnapshot,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
} from "@sheetwrite/core";
import {
  createGrid,
  createGridFromSnapshot,
  fromXlsxTable,
  initSheetwrite,
  MemoryPersistenceAdapter,
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  SyncCoordinator,
  toXlsxTable,
} from "@sheetwrite/core";
import { createGridController } from "@sheetwrite/core/adapter";
import * as Xlsx from "@sheetwrite/xlsx";
import "@sheetwrite/xlsx/register";

// Removed pre-release names must stay absent from packed declarations.
// @ts-expect-error `Patch` was removed in favor of `DocumentOp`.
import type { Patch as RemovedPatch } from "@sheetwrite/core";
// @ts-expect-error positional datasources were removed.
import type { LegacyDataSource as RemovedLegacyDataSource } from "@sheetwrite/core";
// @ts-expect-error ambiguous table backend name was removed.
import type { XlsxBackend as RemovedXlsxBackend } from "@sheetwrite/core";
// @ts-expect-error ambiguous table import backend name was removed.
import type { XlsxImportBackend as RemovedXlsxImportBackend } from "@sheetwrite/core";
// @ts-expect-error use `toXlsxTable`.
import type { toXlsx as removedToXlsx } from "@sheetwrite/core";
// @ts-expect-error use `fromXlsxTable`.
import type { fromXlsx as removedFromXlsx } from "@sheetwrite/core";
// @ts-expect-error use `setXlsxTableExportBackend`.
import type { setXlsxBackend as removedSetXlsxBackend } from "@sheetwrite/core";
// @ts-expect-error use `setXlsxTableImportBackend`.
import type { setXlsxImportBackend as removedSetXlsxImportBackend } from "@sheetwrite/core";

export type RemovedExportsMustStayAbsent = [
  RemovedPatch,
  RemovedLegacyDataSource,
  RemovedXlsxBackend,
  RemovedXlsxImportBackend,
  typeof removedToXlsx,
  typeof removedFromXlsx,
  typeof removedSetXlsxBackend,
  typeof removedSetXlsxImportBackend,
];

const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    },
  ],
};

const options: GridOptions = { workbook };
const theme: Partial<Theme> = { bg: "#ffffff" };
const snapshot = null as unknown as WorkbookSnapshot;
const persistence = null as unknown as PersistenceAdapter;
const commitResponse = null as unknown as PersistenceCommitResponse;
const versionedOperation = null as unknown as VersionedOperation;

const operation: DocumentOp = {
  op: "set",
  addr: { sheet: "s1", row: 0, col: 0 },
  value: { kind: "literal", value: 1 },
};
const datasource: DataSource = {
  capabilities: { protocol: 2, columns: "windowed" },
  async getRows(request: DataSourceRequest) {
    return { protocol: 2, start: request.start, columns: request.columns, rows: [] };
  },
};
const tableExportBackend: XlsxTableExportBackend = {
  name: "consumer-export",
  async toXlsxTable() {
    return new Uint8Array();
  },
};
const tableImportBackend: XlsxTableImportBackend = {
  name: "consumer-import",
  async fromXlsxTable() {
    return { rowCount: 0, columns: {} };
  },
};
setXlsxTableExportBackend(tableExportBackend);
setXlsxTableImportBackend(tableImportBackend);
void toXlsxTable;
void fromXlsxTable;
void datasource;
void operation;
void Xlsx.registerXlsxBackends;

const positionalDatasource: DataSource = {
  capabilities: { protocol: 2, columns: "windowed" },
  // @ts-expect-error positional datasource implementations are not accepted.
  getRows: async (_sheet: string, _start: number, _end: number) => [],
};
const applicationOptions: TransactionApplicationOptions = {
  // @ts-expect-error outgoing ownership is handled by `SyncCoordinator`.
  markDirty: true,
};
declare const event: ChangeEvent;
// @ts-expect-error change events expose only their current transaction.
void event.dirty;
declare const store: Store;
// @ts-expect-error the manual dirty queue was removed.
void store.getDirty();
// @ts-expect-error the manual dirty queue was removed.
store.markClean([]);
// @ts-expect-error dirty tracking suspension was removed.
store.suspendDirtyTracking();
void positionalDatasource;
void applicationOptions;

export {
  commitResponse,
  createGrid,
  createGridController,
  createGridFromSnapshot,
  initSheetwrite,
  MemoryPersistenceAdapter,
  options,
  persistence,
  SyncCoordinator,
  snapshot,
  theme,
  versionedOperation,
};
