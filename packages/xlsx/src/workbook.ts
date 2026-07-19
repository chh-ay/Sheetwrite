import type { XlsxWorkbookBackend } from "@sheetwrite/core";
import { readWorkbook } from "./reader.js";
import { createCodecContext } from "./resources.js";
import { writeWorkbook } from "./writer.js";

/** Deterministic optional OOXML workbook backend implemented by Sheetwrite. */
export const sheetwriteWorkbookBackend: XlsxWorkbookBackend = {
  name: "sheetwrite-ooxml",
  async toXlsxWorkbook(snapshot, options) {
    return writeWorkbook(snapshot, createCodecContext("export", options));
  },
  async fromXlsxWorkbook(data, options) {
    return readWorkbook(data, createCodecContext("import", options));
  },
};
