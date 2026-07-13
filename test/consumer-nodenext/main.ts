// Declaration-resolution guard: a strict `moduleResolution: nodenext` consumer
// must be able to follow @sheetwrite/core's d.ts graph (every relative
// specifier inside dist/*.d.ts needs an explicit .js extension).
import type {
  GridOptions,
  PersistenceAdapter,
  PersistenceCommitResponse,
  Theme,
  VersionedOperation,
  Workbook,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import {
  createGrid,
  createGridFromSnapshot,
  initSheetwrite,
  MemoryPersistenceAdapter,
  SyncCoordinator,
} from "@sheetwrite/core";
import { createGridController } from "@sheetwrite/core/adapter";
import "@sheetwrite/core/xlsx";

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
