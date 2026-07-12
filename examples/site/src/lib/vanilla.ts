import type {
  CellAddress,
  CellStyle,
  CellValue,
  ColumnarData,
  Grid,
  Patch,
  Selection,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { colToA1, createGrid, fromCsv, labelToCol, parseCellInput } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { ensureSheetwrite } from "./sheetwrite";

const SALES_ROWS = 100_000;
const TOTAL_ROWS = SALES_ROWS + 1; // row 0 holds the field-name header
const SUMMARY_ROWS = 8;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];
const SALES_HEADERS = ["ID", "Date", "Customer", "City", "Amount"] as const;
const SUMMARY_HEADERS = ["Metric", "Source", "Linked Text", "Linked Amount"] as const;

// A dark operator-console palette makes the headless demo feel intentionally
// distinct from the framework examples while keeping spreadsheet semantics.
const SHEETS_THEME: Partial<Theme> = {
  font: "12.5px 'Inter Variable', Arial, 'Helvetica Neue', sans-serif",
  bg: "#0a0d14",
  fg: "#e8ebf2",
  gridLine: "#20283a",
  headerBg: "#111722",
  headerFg: "#8d98ad",
  selection: "#f0b42924",
  selectionBorder: "#f0b429",
  rowHeight: 24,
  headerHeight: 26,
  rowHeaderWidth: 46,
  searchMatch: "#f0b4294d",
  searchActiveMatch: "#fbbf24",
  highlight: "#10b98138",
};

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: TOTAL_ROWS,
      columns: [
        { key: "id", header: "ID", width: 90, type: "number" },
        { key: "date", header: "Date", width: 120, type: "text" },
        { key: "customer", header: "Customer", width: 260, type: "text" },
        { key: "city", header: "City", width: 160, type: "text" },
        {
          key: "amount",
          header: "Amount",
          width: 140,
          type: "number",
          numberFormat: "#,##0.00",
          cellStyle: { align: "right" },
        },
      ],
    },
    {
      id: "summary",
      name: "Summary",
      rowCount: SUMMARY_ROWS,
      columns: [
        { key: "metric", header: "Metric", width: 220, type: "text" },
        { key: "source", header: "Source", width: 140, type: "text" },
        { key: "linked_text", header: "Linked Text", width: 260, type: "text" },
        {
          key: "linked_amount",
          header: "Linked Amount",
          width: 160,
          type: "number",
          numberFormat: "#,##0.00",
          cellStyle: { align: "right" },
        },
      ],
    },
  ],
};

function buildSalesData(): ColumnarData {
  const id = new Float64Array(TOTAL_ROWS);
  const date = new Array<string>(TOTAL_ROWS);
  const customer = new Array<string>(TOTAL_ROWS);
  const city = new Array<string>(TOTAL_ROWS);
  const amount = new Float64Array(TOTAL_ROWS);

  // Only 1000 distinct days appear; precompute them instead of 100k Date objects.
  const days: string[] = [];
  for (let d = 0; d < 1000; d++) {
    days.push(new Date(Date.UTC(2020, 0, 1 + d)).toISOString().slice(0, 10));
  }

  date[0] = "";
  customer[0] = "";
  city[0] = "";
  for (let r = 1; r < TOTAL_ROWS; r++) {
    const i = r - 1;
    id[r] = i + 1;
    date[r] = days[i % 1000] ?? "";
    customer[r] = `Customer ${String(i + 1).padStart(6, "0")}`;
    city[r] = CITIES[i % CITIES.length] ?? "";
    amount[r] = Math.round((Math.sin(i) * 0.5 + 0.5) * 1_000_000) / 100;
  }

  return { rowCount: TOTAL_ROWS, columns: { id, date, customer, city, amount } };
}

const refSources = new Map<string, string>();

function cellKey(addr: CellAddress): string {
  return `${addr.sheet}\u0000${addr.row}\u0000${addr.col}`;
}

function literal(value: string | number | null): CellValue {
  return { kind: "literal", value };
}

function setPatch(
  sheet: string,
  row: number,
  col: number,
  value: CellValue,
  style?: CellStyle,
): Patch {
  const addr: CellAddress = { sheet, row, col };
  return style === undefined ? { op: "set", addr, value } : { op: "set", addr, value, style };
}

function initialPatches(): Patch[] {
  const headerStyle: CellStyle = {
    bold: true,
    align: "center",
    backgroundColor: "#171e2b",
    color: "#f0b429",
  };
  const labelStyle: CellStyle = { bold: true, color: "#f1f3f8" };
  const sourceStyle: CellStyle = { color: "#8994a8" };

  return [
    ...SALES_HEADERS.map((label, col) => setPatch("sales", 0, col, literal(label), headerStyle)),
    ...SUMMARY_HEADERS.map((label, col) =>
      setPatch("summary", 0, col, literal(label), headerStyle),
    ),
    setPatch("summary", 1, 0, literal("First customer"), labelStyle),
    setPatch("summary", 1, 1, literal("=Sales!C2"), sourceStyle),
    setPatch("summary", 1, 2, { kind: "formula", src: "=Sales!C2" }),
    setPatch("summary", 2, 0, literal("First city"), labelStyle),
    setPatch("summary", 2, 1, literal("=Sales!D2"), sourceStyle),
    setPatch("summary", 2, 2, { kind: "formula", src: "=Sales!D2" }),
    setPatch("summary", 3, 0, literal("First sale amount"), labelStyle),
    setPatch("summary", 3, 1, literal("=Sales!E2"), sourceStyle),
    setPatch("summary", 3, 3, { kind: "formula", src: "=Sales!E2" }),
    setPatch("summary", 4, 0, literal("Second sale amount"), labelStyle),
    setPatch("summary", 4, 1, literal("=Sales!E3"), sourceStyle),
    setPatch("summary", 4, 3, { kind: "formula", src: "=Sales!E3" }),
    setPatch("summary", 5, 0, literal("Live edit check"), labelStyle),
    setPatch("summary", 5, 1, literal("Edit Sales!E2, then return here"), sourceStyle),
    setPatch("summary", 5, 2, literal("Formula-bar syntax: =Sales!E2 * 2")),
    setPatch("summary", 5, 3, { kind: "formula", src: "=Sales!E2 * 2" }),
    setPatch("summary", 6, 0, literal("How to create one"), labelStyle),
    setPatch("summary", 6, 1, literal("Type =SUM(Sales!E2:E3)"), sourceStyle),
    setPatch("summary", 6, 2, { kind: "formula", src: "=SUM(Sales!E2:E3)" }),
  ];
}

await ensureSheetwrite();

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

// The built-in toolbar is off — the page provides a Google-Sheets-style toolbar
// wired to `grid.actions`. Ctrl+F find and the right-click menu stay enabled.
const grid = createGrid(host, {
  workbook,
  data: buildSalesData(),
  theme: SHEETS_THEME,
  config: { toolbar: false, find: true, contextMenu: true },
});

// Bold, centered, lightly-filled field-name headers plus a Summary sheet that
// demonstrates live cross-sheet refs back into Sales.
grid.store.applyTransaction({ patches: initialPatches() });
grid.highlightCells([
  { sheet: "sales", start: { row: 1, col: 4 }, end: { row: 2, col: 4 } },
  { sheet: "summary", start: { row: 1, col: 2 }, end: { row: 6, col: 3 } },
]);

// Sheets-style frozen panes: pin the field-name header row and the ID column.
grid.setFrozen(1, 1);

// Zoom control: cycle through the Sheets presets on the toolbar button.
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5] as const;
const zoomButton = document.querySelector<HTMLButtonElement>(".gs-zoom");
zoomButton?.addEventListener("click", () => {
  const current = grid.getZoom();
  const index = ZOOM_STEPS.findIndex((step) => step > current + 0.001);
  const next = (index === -1 ? ZOOM_STEPS[0] : ZOOM_STEPS[index]) ?? 1;
  grid.setZoom(next);
  zoomButton.textContent = `${Math.round(next * 100)}%`;
});

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  // The page owns these ids; a DOM-node cast is the sanctioned use of `as`.
  return el as T;
}

// ── Name box + formula bar ───────────────────────────────────────────────────

const nameBox = byId<HTMLInputElement>("namebox");
const formulaInput = byId<HTMLInputElement>("formula");
let activeCell: CellAddress | null = null;
let currentSheet = workbook.activeSheet;

function sheetById(id: string) {
  return workbook.sheets.find((sheet) => sheet.id === id);
}

function quoteSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

function formatSheetReference(addr: CellAddress): string {
  const sheetName = sheetById(addr.sheet)?.name ?? addr.sheet;
  return `=${quoteSheetName(sheetName)}!${colToA1(addr.col)}${addr.row + 1}`;
}

function rememberInputValue(addr: CellAddress, value: CellValue): void {
  if (value.kind === "ref") {
    refSources.set(cellKey(addr), formatSheetReference(value.target));
  } else if (value.kind === "formula") {
    refSources.set(cellKey(addr), value.src);
  } else {
    refSources.delete(cellKey(addr));
  }
}

host.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const tab = target.closest<HTMLButtonElement>(".sheetwrite-tab");
  const sheet = workbook.sheets.find((candidate) => candidate.name === tab?.textContent);
  if (sheet) currentSheet = sheet.id;
});

// Jump to a typed reference (e.g. "C12") from the name box.
nameBox.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const match = /^([A-Za-z]+)(\d+)$/.exec(nameBox.value.trim());
  if (!match) return;
  const col = labelToCol(match[1]!.toUpperCase());
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0) return;
  const addr: CellAddress = { sheet: currentSheet, row, col };
  grid.setSelection({ kind: "cell", addr });
  grid.scrollToCell(addr);
  host?.focus();
});

// Commit a value/formula from the formula bar through the shared coercion.
formulaInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !activeCell) return;
  const type = sheetById(activeCell.sheet)?.columns[activeCell.col]?.type ?? "text";
  const value = parseCellInput(formulaInput.value, type);
  rememberInputValue(activeCell, value);
  // Grid-level transaction: participates in undo history like a cell edit.
  grid.applyTransaction({
    patches: [{ op: "set", addr: activeCell, value }],
  });
  host?.focus();
});

// ── Toolbar wired to grid.actions ────────────────────────────────────────────

const a = grid.actions;
byId<HTMLButtonElement>("t-undo").addEventListener("click", () => a.undo());
byId<HTMLButtonElement>("t-redo").addEventListener("click", () => a.redo());
byId<HTMLButtonElement>("t-bold").addEventListener("click", () => a.toggleBold());
byId<HTMLButtonElement>("t-italic").addEventListener("click", () => a.toggleItalic());
byId<HTMLButtonElement>("t-border").addEventListener("click", () => a.toggleBorder());
byId<HTMLButtonElement>("t-merge").addEventListener("click", () => a.merge());
byId<HTMLButtonElement>("t-alignl").addEventListener("click", () => a.setAlign("left"));
byId<HTMLButtonElement>("t-alignc").addEventListener("click", () => a.setAlign("center"));
byId<HTMLButtonElement>("t-alignr").addEventListener("click", () => a.setAlign("right"));
byId<HTMLButtonElement>("t-sort").addEventListener("click", () => a.sort(true));
byId<HTMLButtonElement>("t-export").addEventListener("click", () => a.exportCsv("sales.csv"));

const textColor = byId<HTMLInputElement>("t-textcolor");
const textColorBar = byId<HTMLSpanElement>("t-textcolor-bar");
textColor.addEventListener("input", () => {
  textColorBar.style.background = textColor.value;
  a.setTextColor(textColor.value);
});

const fillColor = byId<HTMLInputElement>("t-fillcolor");
const fillColorBar = byId<HTMLSpanElement>("t-fillcolor-bar");
fillColor.addEventListener("input", () => {
  fillColorBar.style.background = fillColor.value;
  a.setFillColor(fillColor.value);
});

// ── CSV import (symmetric with the toolbar's CSV export) ──────────────────────

const importBtn = byId<HTMLButtonElement>("t-import");
const csvFile = byId<HTMLInputElement>("csvfile");
const importColumns = sheetById("sales")?.columns ?? [];

importBtn.addEventListener("click", () => csvFile.click());

csvFile.addEventListener("change", async () => {
  const file = csvFile.files?.[0];
  if (!file) return;

  const imported = fromCsv(await file.text(), importColumns);
  const patches: Patch[] = [];
  for (let c = 0; c < importColumns.length; c++) {
    const column = importColumns[c];
    if (!column) continue;
    const values = imported.columns[column.key];
    if (!values) continue;
    for (let r = 0; r < imported.rowCount; r++) {
      const cell = values[r];
      const value: CellValue =
        cell == null
          ? { kind: "literal", value: null }
          : typeof cell === "object"
            ? cell
            : { kind: "literal", value: cell };
      patches.push({ op: "set", addr: { sheet: "sales", row: r + 1, col: c }, value });
    }
  }

  // Grid-level transaction: one Ctrl+Z reverts the whole import.
  grid.applyTransaction({ patches });
  csvFile.value = "";
});

// ── Selection-driven UI: name box, formula bar, and the status-bar stats ──────

const statusEl = byId<HTMLDivElement>("status");

grid.on("change", (event) => {
  for (const patch of event.transaction.patches) {
    if (patch.op === "set") rememberInputValue(patch.addr, patch.value);
  }
});

grid.on("selection", (e) => {
  const sel = e.selection;
  if (sel) currentSheet = selectionSheet(sel);
  activeCell =
    sel?.kind === "cell"
      ? sel.addr
      : sel?.kind === "range"
        ? { sheet: sel.range.sheet, row: sel.range.start.row, col: sel.range.start.col }
        : null;

  if (activeCell) {
    nameBox.value = `${colToA1(activeCell.col)}${activeCell.row + 1}`;
    const refSource = refSources.get(cellKey(activeCell));
    const formula = grid.store.getFormula(activeCell);
    const resolved = grid.store.getCell(activeCell).resolved;
    formulaInput.value = refSource ?? formula ?? (resolved === null ? "" : String(resolved));
  } else {
    nameBox.value = "";
    formulaInput.value = "";
  }

  statusEl.textContent = "";
  if (sel) renderSelectionStats(sel);
});

/** Google-Sheets-style status readout: Sum / Avg / Count over the selection. */
function renderSelectionStats(sel: Selection): void {
  const sheetId = selectionSheet(sel);
  const sheet = sheetById(sheetId);
  if (!sheet) return;

  const rects = selectionRects(sel, sheet.rowCount, sheet.columns.length);
  let count = 0;
  let numeric = 0;
  let sum = 0;

  for (const rect of rects) {
    const view = grid.store.getVisibleWindow(
      sheet.id,
      { start: rect.r0, end: rect.r1 + 1 },
      rect.cols,
    );
    for (let i = 0; i < view.values.length; i++) {
      const v = view.values[i];
      if (v === null || v === undefined || v === "") continue;
      count++;
      if (typeof v === "number") {
        numeric++;
        sum += v;
      }
    }
  }

  if (count <= 1) return; // single cell — Sheets shows nothing
  const parts = [`Count: <b>${count}</b>`];
  if (numeric > 0) {
    parts.unshift(`Sum: <b>${formatNumber(sum)}</b>`, `Avg: <b>${formatNumber(sum / numeric)}</b>`);
  }
  statusEl.innerHTML = parts.join("&nbsp;&nbsp;");
}

function selectionSheet(sel: Selection): string {
  switch (sel.kind) {
    case "cell":
      return sel.addr.sheet;
    case "range":
      return sel.range.sheet;
    case "row":
      return sel.sheet;
    case "column":
      return sel.sheet;
    case "multi":
      return sel.ranges[0]?.sheet ?? workbook.activeSheet;
  }
}

interface StatRect {
  r0: number;
  r1: number;
  cols: number[];
}

function selectionRects(sel: Selection, rowCount: number, colCount: number): StatRect[] {
  const allCols = Array.from({ length: colCount }, (_, i) => i);
  switch (sel.kind) {
    case "cell":
      return [{ r0: sel.addr.row, r1: sel.addr.row, cols: [sel.addr.col] }];
    case "range":
      return [
        rectOf(sel.range.start.row, sel.range.start.col, sel.range.end.row, sel.range.end.col),
      ];
    case "row":
      return [{ r0: sel.row, r1: sel.row, cols: allCols }];
    case "column":
      return [{ r0: 0, r1: rowCount - 1, cols: [sel.col] }];
    case "multi":
      return sel.ranges.map((r) => rectOf(r.start.row, r.start.col, r.end.row, r.end.col));
  }
}

function rectOf(ra: number, ca: number, rb: number, cb: number): StatRect {
  const c0 = Math.min(ca, cb);
  const c1 = Math.max(ca, cb);
  return {
    r0: Math.min(ra, rb),
    r1: Math.max(ra, rb),
    cols: Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i),
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// expose for manual poking in the console
(globalThis as unknown as { grid: Grid }).grid = grid;
