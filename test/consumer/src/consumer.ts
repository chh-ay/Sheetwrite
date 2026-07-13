// biome-ignore-all assist/source/organizeImports: Negative imports intentionally bind one error directive each.
import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Worker from "@sheetwrite/core/worker";
import * as Xlsx from "@sheetwrite/core/xlsx";
import * as ReactAdapter from "@sheetwrite/react";
import * as SvelteAdapter from "@sheetwrite/svelte";
import * as VueAdapter from "@sheetwrite/vue";
import * as Wasm from "@sheetwrite/wasm";
import type {
  DataSource,
  DataSourceRequest,
  DocumentOp,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
} from "@sheetwrite/core";
import {
  fromXlsxTable,
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  toXlsxTable,
} from "@sheetwrite/core";

// @ts-expect-error removed pre-release operation alias.
import type { Patch as RemovedPatch } from "@sheetwrite/core";
// @ts-expect-error removed positional datasource contract.
import type { LegacyDataSource as RemovedLegacyDataSource } from "@sheetwrite/core";
// @ts-expect-error removed ambiguous table export contract.
import type { XlsxBackend as RemovedXlsxBackend } from "@sheetwrite/core";
// @ts-expect-error removed ambiguous table import contract.
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

const publicEntries: readonly Record<string, unknown>[] = [
  Core,
  Adapter,
  Shell,
  Worker,
  Xlsx,
  ReactAdapter,
  SvelteAdapter,
  VueAdapter,
  Wasm,
];

if (publicEntries.some((entry) => Object.keys(entry).length === 0)) {
  throw new Error("A public package entry has no declarations");
}

const canonicalOperation: DocumentOp = {
  op: "set",
  addr: { sheet: "s1", row: 0, col: 0 },
  value: { kind: "literal", value: 1 },
};
const canonicalDatasource: DataSource = {
  async getRows(request: DataSourceRequest) {
    return { start: request.start, rows: [] };
  },
};
const canonicalTableExporter: XlsxTableExportBackend = {
  name: "packed-consumer-export",
  async toXlsxTable() {
    return new Uint8Array();
  },
};
const canonicalTableImporter: XlsxTableImportBackend = {
  name: "packed-consumer-import",
  async fromXlsxTable() {
    return { rowCount: 0, columns: {} };
  },
};
setXlsxTableExportBackend(canonicalTableExporter);
setXlsxTableImportBackend(canonicalTableImporter);
void canonicalOperation;
void canonicalDatasource;
void toXlsxTable;
void fromXlsxTable;
