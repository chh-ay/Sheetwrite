/**
 * Business scenario — canonical dataset/workbook for the Vue workbench.
 *
 * Framework-neutral: owns the composed business-workflow story (purchase
 * orders with validation, protection, notes, metadata, styles, merges, frozen
 * panes, and a second sheet for workbook operations) plus the expected
 * observable states browser specs assert against.
 */

import type {
  CellNote,
  CellValue,
  ColumnarData,
  DataValidationRule,
  DocumentOp,
  ProtectedRange,
  RowMetadata,
  SnapshotCell,
  Theme,
  Workbook,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { VUE_SHOWCASE_THEME } from "../revenue.js";

export const BUSINESS_DOCUMENT_ID = "sheetwrite-business-orders";
export const BUSINESS_ROWS = 500;
export const BUSINESS_SHEET_ID = "orders";
/** Single-word sheet names so cross-sheet formulas need no quoting. */
export const BUSINESS_SHEET_NAME = "Orders";
export const BUSINESS_SUPPLIERS_SHEET_ID = "suppliers";
export const BUSINESS_SUPPLIERS_SHEET_NAME = "Suppliers";

export const BUSINESS_STATUSES = ["Draft", "Submitted", "Approved", "Paid"] as const;
export const BUSINESS_CATEGORIES = ["Logistics", "Hardware", "Packaging", "Services"] as const;
export const BUSINESS_SUPPLIERS = [
  "Mekong Freight",
  "Kampot Mills",
  "Angkor Packaging",
  "Tonle Services",
  "Bassac Hardware",
] as const;

/** Zero-based column coordinates of the orders sheet. */
export const BUSINESS_COLUMNS = {
  po: 0,
  supplier: 1,
  category: 2,
  status: 3,
  qty: 4,
  unitCost: 5,
  total: 6,
} as const;

export const BUSINESS_MAX_QTY = 5_000;
export const BUSINESS_THEME: Partial<Theme> = VUE_SHOWCASE_THEME;

/** Deterministic integer quantity per row (1..480). */
export function businessQty(row: number): number {
  return ((row * 17) % 480) + 1;
}

/** Deterministic unit cost in whole dollars per row (8..2007). */
export function businessUnitCost(row: number): number {
  return ((row * 271) % 2_000) + 8;
}

/** Fresh columnar arrays per call so grid resets re-ingest pristine data. */
export function createBusinessData(): ColumnarData {
  const po: string[] = new Array(BUSINESS_ROWS);
  const supplier: string[] = new Array(BUSINESS_ROWS);
  const category: string[] = new Array(BUSINESS_ROWS);
  const status: string[] = new Array(BUSINESS_ROWS);
  const qty = new Float64Array(BUSINESS_ROWS);
  const unitCost = new Float64Array(BUSINESS_ROWS);
  const total: CellValue[] = new Array(BUSINESS_ROWS);

  for (let row = 0; row < BUSINESS_ROWS; row++) {
    po[row] = `PO-${String(row + 1).padStart(4, "0")}`;
    supplier[row] = BUSINESS_SUPPLIERS[row % BUSINESS_SUPPLIERS.length] ?? "";
    category[row] = BUSINESS_CATEGORIES[(row * 3) % BUSINESS_CATEGORIES.length] ?? "";
    status[row] = BUSINESS_STATUSES[(row * 7) % BUSINESS_STATUSES.length] ?? "";
    qty[row] = businessQty(row);
    unitCost[row] = businessUnitCost(row);
    total[row] = { kind: "formula", src: `=E${row + 1}*F${row + 1}` };
  }

  return {
    rowCount: BUSINESS_ROWS,
    columns: { po, supplier, category, status, qty, unitCost, total },
  };
}

/** Status entries must come from the workflow list — rejected at the barrier. */
export const BUSINESS_STATUS_RULE: DataValidationRule = {
  id: "orders-status-list",
  range: {
    sheet: BUSINESS_SHEET_ID,
    start: { row: 0, col: BUSINESS_COLUMNS.status },
    end: { row: BUSINESS_ROWS - 1, col: BUSINESS_COLUMNS.status },
  },
  condition: { kind: "list", values: BUSINESS_STATUSES },
  policy: "reject",
  helpText: `Status must be one of: ${BUSINESS_STATUSES.join(", ")}.`,
};

/** Quantities outside procurement bounds warn but may proceed. */
export const BUSINESS_QTY_RULE: DataValidationRule = {
  id: "orders-qty-bounds",
  range: {
    sheet: BUSINESS_SHEET_ID,
    start: { row: 0, col: BUSINESS_COLUMNS.qty },
    end: { row: BUSINESS_ROWS - 1, col: BUSINESS_COLUMNS.qty },
  },
  condition: { kind: "number", min: 1, max: BUSINESS_MAX_QTY, integer: true },
  policy: "warn",
  helpText: `Quantity should be a whole number between 1 and ${BUSINESS_MAX_QTY}.`,
};

/** Computed totals are client-protected; the host resolver decides overrides. */
export const BUSINESS_TOTALS_PROTECTION: ProtectedRange = {
  id: "orders-computed-totals",
  range: {
    sheet: BUSINESS_SHEET_ID,
    start: { row: 0, col: BUSINESS_COLUMNS.total },
    end: { row: BUSINESS_ROWS - 1, col: BUSINESS_COLUMNS.total },
  },
  label: "Computed totals",
  permissionKey: "orders:totals",
};

export const BUSINESS_NOTES: readonly CellNote[] = [
  {
    addr: { sheet: BUSINESS_SHEET_ID, row: 2, col: BUSINESS_COLUMNS.status },
    text: "Held for finance review — resubmit with the Q3 budget code.",
  },
  {
    addr: { sheet: BUSINESS_SHEET_ID, row: 7, col: BUSINESS_COLUMNS.supplier },
    text: "Preferred supplier under the FY26 freight agreement.",
  },
];

/** Row display metadata applied through `setRowMeta` document operations. */
export const BUSINESS_ROW_META: ReadonlyArray<[row: number, meta: RowMetadata]> = [
  [2, { height: 44 }],
  [7, { height: 44 }],
];

/** Suppliers directory rows seeded onto the second sheet. */
export const BUSINESS_SUPPLIER_ROWS: ReadonlyArray<[name: string, region: string, rating: string]> =
  [
    ["Mekong Freight", "Phnom Penh", "A"],
    ["Kampot Mills", "Kampot", "B+"],
    ["Angkor Packaging", "Siem Reap", "A-"],
    ["Tonle Services", "Phnom Penh", "B"],
    ["Bassac Hardware", "Ta Khmau", "A"],
  ];

export function createBusinessWorkbook(): Workbook {
  const totalRange = BUSINESS_TOTALS_PROTECTION.range;
  return {
    activeSheet: BUSINESS_SHEET_ID,
    sheets: [
      {
        id: BUSINESS_SHEET_ID,
        name: BUSINESS_SHEET_NAME,
        rowCount: BUSINESS_ROWS,
        columns: [
          { key: "po", header: "PO", width: 96, type: "text" },
          { key: "supplier", header: "Supplier", width: 170, type: "text" },
          { key: "category", header: "Category", width: 120, type: "text" },
          { key: "status", header: "Status", width: 110, type: "text" },
          { key: "qty", header: "Qty", width: 80, type: "number" },
          {
            key: "unitCost",
            header: "Unit cost",
            width: 110,
            type: "currency",
            numberFormat: "$#,##0",
          },
          {
            key: "total",
            header: "Total (=E×F)",
            width: 130,
            type: "currency",
            numberFormat: "$#,##0",
          },
        ],
        frozenCols: 1,
        validationRules: [BUSINESS_STATUS_RULE, BUSINESS_QTY_RULE],
        protectedRanges: [BUSINESS_TOTALS_PROTECTION],
        notes: [...BUSINESS_NOTES],
        conditionalFormats: [
          {
            range: totalRange,
            when: { kind: "greaterThan", value: 400_000 },
            style: { backgroundColor: "#42b88324", bold: true },
          },
        ],
      },
      {
        id: BUSINESS_SUPPLIERS_SHEET_ID,
        name: BUSINESS_SUPPLIERS_SHEET_NAME,
        rowCount: 24,
        columns: [
          { key: "name", header: "Supplier", width: 190, type: "text" },
          { key: "region", header: "Region", width: 140, type: "text" },
          { key: "rating", header: "Rating", width: 90, type: "text" },
        ],
        merges: [{ r0: 0, c0: 0, r1: 0, c1: 2 }],
        frozenRows: 1,
      },
    ],
  };
}

/** Seeds the Suppliers sheet: merged banner row, then the directory rows. */
export function businessSuppliersSeedOps(): DocumentOp[] {
  const ops: DocumentOp[] = [
    {
      op: "set",
      addr: { sheet: BUSINESS_SUPPLIERS_SHEET_ID, row: 0, col: 0 },
      value: { kind: "literal", value: "Approved supplier directory — FY26" },
      style: { bold: true },
    },
  ];
  BUSINESS_SUPPLIER_ROWS.forEach(([name, region, rating], index) => {
    const row = index + 1;
    ops.push(
      {
        op: "set",
        addr: { sheet: BUSINESS_SUPPLIERS_SHEET_ID, row, col: 0 },
        value: { kind: "literal", value: name },
      },
      {
        op: "set",
        addr: { sheet: BUSINESS_SUPPLIERS_SHEET_ID, row, col: 1 },
        value: { kind: "literal", value: region },
      },
      {
        op: "set",
        addr: { sheet: BUSINESS_SUPPLIERS_SHEET_ID, row, col: 2 },
        value: { kind: "literal", value: rating },
      },
    );
  });
  for (const [row, meta] of BUSINESS_ROW_META) {
    ops.push({ op: "setRowMeta", sheet: BUSINESS_SHEET_ID, row, meta });
  }
  return ops;
}

/**
 * Seed snapshot equivalent to the workbook + data at version 0, for hosts that
 * boot from a persistence adapter instead of a columnar ingest.
 */
export function createBusinessSeedSnapshot(): WorkbookSnapshot {
  const data = createBusinessData();
  const workbook = createBusinessWorkbook();
  const columnKeys = ["po", "supplier", "category", "status", "qty", "unitCost", "total"] as const;

  const cells: SnapshotCell[] = [];
  for (let row = 0; row < BUSINESS_ROWS; row++) {
    for (let col = 0; col < columnKeys.length; col++) {
      const column = data.columns[columnKeys[col] ?? ""];
      const raw = column?.[row];
      if (raw === undefined || raw === null) continue;
      const value: CellValue =
        typeof raw === "object" ? (raw as CellValue) : { kind: "literal", value: raw };
      cells.push({ rowOffset: row, colOffset: col, value });
    }
  }

  return {
    schemaVersion: 1,
    documentId: BUSINESS_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: BUSINESS_SHEET_ID },
    sheets: workbook.sheets.map((sheet, order) => ({
      id: sheet.id,
      name: sheet.name,
      order,
      rowCount: sheet.rowCount,
      columns: sheet.columns,
      frozenRows: sheet.frozenRows,
      frozenCols: sheet.frozenCols,
      merges: sheet.merges,
      conditionalFormats: sheet.conditionalFormats,
      validationRules: sheet.validationRules,
      protectedRanges: sheet.protectedRanges,
      notes: sheet.notes,
      cells:
        sheet.id === BUSINESS_SHEET_ID
          ? [
              {
                startRow: 0,
                startCol: 0,
                rowCount: BUSINESS_ROWS,
                colCount: columnKeys.length,
                cells,
              },
            ]
          : [],
    })),
  };
}

/** Observable states browser contracts assert against. */
export const BUSINESS_EXPECTED = {
  firstDataCell: { row: 0, col: BUSINESS_COLUMNS.po, text: "PO-0001" },
  rowCount: BUSINESS_ROWS,
  sheetIds: [BUSINESS_SHEET_ID, BUSINESS_SUPPLIERS_SHEET_ID],
  statusRule: {
    id: BUSINESS_STATUS_RULE.id,
    validSample: "Approved",
    invalidSample: "Perhaps",
  },
  qtyRule: { id: BUSINESS_QTY_RULE.id, validSample: 12, invalidSample: 999_999 },
  protection: {
    id: BUSINESS_TOTALS_PROTECTION.id,
    permissionKey: BUSINESS_TOTALS_PROTECTION.permissionKey,
    cell: { sheet: BUSINESS_SHEET_ID, row: 0, col: BUSINESS_COLUMNS.total },
  },
  note: BUSINESS_NOTES[0],
  supplierBanner: "Approved supplier directory — FY26",
} as const;
