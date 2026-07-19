import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "@sheetwrite/core";
import { sheetwriteTableExportBackend } from "./table-export.js";
import { sheetwriteTableImportBackend } from "./table-import.js";
import { sheetwriteWorkbookBackend } from "./workbook.js";

/** Register all concrete XLSX backends with the backend-neutral core contracts. */
export function registerXlsxBackends(): void {
  setXlsxTableExportBackend(sheetwriteTableExportBackend);
  setXlsxTableImportBackend(sheetwriteTableImportBackend);
  setXlsxWorkbookBackend(sheetwriteWorkbookBackend);
}
