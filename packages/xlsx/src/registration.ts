import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "@sheetwrite/core";
import { writeExcelFileTableExportBackend } from "./table-export.js";
import { readExcelFileTableImportBackend } from "./table-import.js";
import { excelJsWorkbookBackend } from "./workbook.js";

/** Register all concrete XLSX backends with the backend-neutral core contracts. */
export function registerXlsxBackends(): void {
  setXlsxTableExportBackend(writeExcelFileTableExportBackend);
  setXlsxTableImportBackend(readExcelFileTableImportBackend);
  setXlsxWorkbookBackend(excelJsWorkbookBackend);
}
