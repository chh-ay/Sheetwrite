/**
 * Offline scenario — canonical dataset/workbook for the Svelte workbench.
 *
 * Framework-neutral: owns the offline/collaborative field-dispatch story
 * (durable pending queue over a shared collaboration server) — dataset, seed
 * snapshot, presence identities, deterministic edit scripts, and the expected
 * observable states browser specs assert against. Protocol behavior itself
 * lives in collaboration-protocol.ts; this module never reimplements it.
 */

import type {
  CellValue,
  ColumnarData,
  DocumentOp,
  PresenceActor,
  Theme,
  Workbook,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { SVELTE_SHOWCASE_THEME } from "../revenue.js";

export const OFFLINE_DOCUMENT_ID = "sheetwrite-offline-dispatch";
export const OFFLINE_ROWS = 240;
export const OFFLINE_SHEET_ID = "dispatch";
/** Single-word sheet name so cross-sheet formulas need no quoting. */
export const OFFLINE_SHEET_NAME = "Dispatch";

export const OFFLINE_SITES = [
  "Riverside depot",
  "North substation",
  "Airport annex",
  "Harbor yard",
  "Market hall",
  "Hillside tower",
] as const;
export const OFFLINE_TASKS = [
  "Meter swap",
  "Line inspection",
  "Transformer service",
  "Fault trace",
  "Reconnect",
] as const;
export const OFFLINE_STATUSES = ["Queued", "En route", "On site", "Blocked", "Done"] as const;
export const OFFLINE_CREWS = ["Crew A", "Crew B", "Crew C", "Crew D"] as const;

/** Zero-based column coordinates of the dispatch sheet. */
export const OFFLINE_COLUMNS = {
  ticket: 0,
  site: 1,
  task: 2,
  status: 3,
  priority: 4,
  crew: 5,
  hours: 6,
} as const;

export const OFFLINE_THEME: Partial<Theme> = {
  font: SVELTE_SHOWCASE_THEME.font,
  rowHeight: SVELTE_SHOWCASE_THEME.rowHeight,
  headerHeight: SVELTE_SHOWCASE_THEME.headerHeight,
  rowHeaderWidth: SVELTE_SHOWCASE_THEME.rowHeaderWidth,
};

/** Local device identity shown in presence overlays. */
export const OFFLINE_LOCAL_ACTOR: PresenceActor = {
  id: "field-tablet",
  displayName: "You · Field tablet",
  color: "#e7653d",
};

/** Simulated second client driven through the shared collaboration server. */
export const OFFLINE_COLLEAGUE_ACTOR: PresenceActor = {
  id: "hq-ops",
  displayName: "Rina · HQ ops",
  color: "#58c4dc",
};

/** Fresh columnar arrays per call so grid resets re-ingest pristine data. */
export function createOfflineData(): ColumnarData {
  const ticket: string[] = new Array(OFFLINE_ROWS);
  const site: string[] = new Array(OFFLINE_ROWS);
  const task: string[] = new Array(OFFLINE_ROWS);
  const status: string[] = new Array(OFFLINE_ROWS);
  const priority: string[] = new Array(OFFLINE_ROWS);
  const crew: string[] = new Array(OFFLINE_ROWS);
  const hours = new Float64Array(OFFLINE_ROWS);

  for (let row = 0; row < OFFLINE_ROWS; row++) {
    ticket[row] = `FT-${String(row + 1).padStart(4, "0")}`;
    site[row] = OFFLINE_SITES[row % OFFLINE_SITES.length] ?? "";
    task[row] = OFFLINE_TASKS[(row * 3) % OFFLINE_TASKS.length] ?? "";
    status[row] = OFFLINE_STATUSES[(row * 7) % OFFLINE_STATUSES.length] ?? "";
    priority[row] = row % 9 === 0 ? "Urgent" : "Routine";
    crew[row] = OFFLINE_CREWS[(row * 5) % OFFLINE_CREWS.length] ?? "";
    hours[row] = ((row * 13) % 14) + 1;
  }

  return {
    rowCount: OFFLINE_ROWS,
    columns: { ticket, site, task, status, priority, crew, hours },
  };
}

export function createOfflineWorkbook(): Workbook {
  return {
    activeSheet: OFFLINE_SHEET_ID,
    sheets: [
      {
        id: OFFLINE_SHEET_ID,
        name: OFFLINE_SHEET_NAME,
        rowCount: OFFLINE_ROWS,
        columns: [
          { key: "ticket", header: "Ticket", width: 96, type: "text" },
          { key: "site", header: "Site", width: 160, type: "text" },
          { key: "task", header: "Task", width: 160, type: "text" },
          { key: "status", header: "Status", width: 110, type: "text" },
          { key: "priority", header: "Priority", width: 100, type: "text" },
          { key: "crew", header: "Crew", width: 100, type: "text" },
          { key: "hours", header: "Est. hours", width: 100, type: "number" },
        ],
        frozenCols: 1,
      },
    ],
  };
}

/**
 * Seed snapshot equivalent to the workbook + data at version 0 — feeds the
 * shared showcase collaboration server and persistence adapters.
 */
export function createOfflineSeedSnapshot(): WorkbookSnapshot {
  const data = createOfflineData();
  const workbook = createOfflineWorkbook();
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("offline scenario workbook must define one sheet");
  const columnKeys = sheet.columns.map((column) => column.key);

  const cells = [];
  for (let row = 0; row < OFFLINE_ROWS; row++) {
    for (let col = 0; col < columnKeys.length; col++) {
      const raw = data.columns[columnKeys[col] ?? ""]?.[row];
      if (raw === undefined || raw === null) continue;
      const value: CellValue =
        typeof raw === "object" ? (raw as CellValue) : { kind: "literal", value: raw };
      cells.push({ rowOffset: row, colOffset: col, value });
    }
  }

  return {
    schemaVersion: 1,
    documentId: OFFLINE_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: OFFLINE_SHEET_ID },
    sheets: [
      {
        id: sheet.id,
        name: sheet.name,
        order: 0,
        rowCount: sheet.rowCount,
        columns: sheet.columns,
        frozenCols: sheet.frozenCols,
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: OFFLINE_ROWS,
            colCount: columnKeys.length,
            cells,
          },
        ],
      },
    ],
  };
}

/** Row targeted by the local edit script at a given step. */
export function offlineLocalEditRow(step: number): number {
  return step % OFFLINE_ROWS;
}

/** Row targeted by the colleague edit script at a given step. */
export function offlineColleagueEditRow(step: number): number {
  return (step * 13 + 7) % OFFLINE_ROWS;
}

export function offlineLocalEditText(step: number): string {
  return `Done · field sync ${step + 1}`;
}

export function offlineColleagueEditText(step: number): string {
  return `Crew HQ-${((step * 3) % 9) + 1}`;
}

/**
 * Deterministic local (field tablet) edit at `step`: always the status column,
 * never overlapping the colleague script's crew column — a base-version
 * conflict between the two scripts always rebases cleanly.
 */
export function offlineLocalEdit(step: number): DocumentOp[] {
  return [
    {
      op: "set",
      addr: {
        sheet: OFFLINE_SHEET_ID,
        row: offlineLocalEditRow(step),
        col: OFFLINE_COLUMNS.status,
      },
      value: { kind: "literal", value: offlineLocalEditText(step) },
    },
  ];
}

/** Deterministic colleague (HQ) edit at `step`: always the crew column. */
export function offlineColleagueEdit(step: number): DocumentOp[] {
  return [
    {
      op: "set",
      addr: {
        sheet: OFFLINE_SHEET_ID,
        row: offlineColleagueEditRow(step),
        col: OFFLINE_COLUMNS.crew,
      },
      value: { kind: "literal", value: offlineColleagueEditText(step) },
    },
  ];
}

/** Observable states browser contracts assert against. */
export const OFFLINE_EXPECTED = {
  firstDataCell: { row: 0, col: OFFLINE_COLUMNS.ticket, text: "FT-0001" },
  rowCount: OFFLINE_ROWS,
  documentId: OFFLINE_DOCUMENT_ID,
  localEditText: offlineLocalEditText,
  colleagueEditText: offlineColleagueEditText,
} as const;
