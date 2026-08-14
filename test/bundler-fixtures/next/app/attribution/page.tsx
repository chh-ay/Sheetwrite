"use client";

import { createGrid, initSheetwrite } from "@sheetwrite/core";

const eagerImports = [createGrid, initSheetwrite] as const;

export default function AttributionPage() {
  return (
    <output data-sheetwrite-attribution>{eagerImports.map((value) => value.name).join(",")}</output>
  );
}
