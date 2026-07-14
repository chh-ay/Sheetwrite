// Verifies published entrypoints resolve under real Node ESM semantics.
// Extensionless relative specifiers in dist/ would make every import below
// throw ERR_MODULE_NOT_FOUND when run with `node` (not Bun).
import { createGridController } from "../packages/core/dist/adapter.js";
import { createGrid, initSheetwrite } from "../packages/core/dist/index.js";
import * as Xlsx from "../packages/xlsx/dist/index.js";
import "../packages/xlsx/dist/register.js";

console.log(
  typeof createGrid,
  typeof initSheetwrite,
  typeof createGridController,
  typeof Xlsx.registerXlsxBackends,
);
