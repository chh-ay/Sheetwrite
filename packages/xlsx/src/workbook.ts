import type { XlsxWorkbookBackend } from "@sheetwrite/core";
import { readWorkbook } from "./reader.js";
import { createCodecContext, xlsxFailure } from "./resources.js";
import { writeWorkbook } from "./writer.js";

/** Deterministic optional OOXML workbook backend implemented by Sheetwrite. */
export const sheetwriteWorkbookBackend: XlsxWorkbookBackend = {
  name: "sheetwrite-ooxml",
  async toXlsxWorkbook(snapshot, options) {
    try {
      return writeWorkbook(snapshot, createCodecContext("export", options));
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml");
    }
  },
  async fromXlsxWorkbook(data, options) {
    try {
      return readWorkbook(data, createCodecContext("import", options));
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml");
    }
  },
};
