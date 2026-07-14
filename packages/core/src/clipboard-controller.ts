import { shiftA1Refs } from "./a1.js";
import { parseCellInput } from "./cell-input.js";
import {
  type ClipboardCell,
  type ClipboardSnapshot,
  neutralizeInjection,
  parseTsv,
  toTsv,
} from "./clipboard.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, PackedCellBlock, Sheet } from "./types/document.js";
import type { ClipboardOutcome } from "./types/grid.js";
import type { Store } from "./types/store.js";

export interface ClipboardControllerDeps {
  store: Store;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  colIndices: () => number[];
  readOnly: () => boolean;
  mergeAnchorAt: (row: number, col: number) => SelRect | null;
  toDataRow: (viewRow: number) => number;
  commit: (patches: DocumentOp[], reason: CommitReason) => void;
}

/** What a single paste target cell should become, or `null` to skip it. */
interface CellWrite {
  value: CellValue;
  style?: CellStyle;
}

interface CapturedClipboard extends ClipboardSnapshot {
  /** Exact source addresses captured before an asynchronous cut writes the clipboard. */
  clearPatches: DocumentOp[];
}

/** Private-format MIME type used for rich Sheetwrite clipboard payloads. */
export const SHEETWRITE_CLIPBOARD_MIME = "application/x-sheetwrite+json";
const SHEETWRITE_WEB_CLIPBOARD_FORMAT = `web ${SHEETWRITE_CLIPBOARD_MIME}`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clipboardHtml(snapshot: ClipboardSnapshot): string {
  let html = "<table><tbody>";
  for (const row of snapshot.cells) {
    html += "<tr>";
    for (const cell of row) {
      const style = cell.style;
      const css: string[] = [];
      if (style.bold) css.push("font-weight:bold");
      if (style.italic) css.push("font-style:italic");
      if (style.underline) css.push("text-decoration:underline");
      if (style.strikethrough) css.push("text-decoration:line-through");
      if (style.color) css.push(`color:${style.color}`);
      if (style.backgroundColor) css.push(`background-color:${style.backgroundColor}`);
      if (style.align) css.push(`text-align:${style.align}`);
      const formula =
        cell.value.kind === "formula"
          ? ` data-sheetwrite-formula="${escapeHtml(cell.value.src)}"`
          : "";
      const styleAttr = css.length > 0 ? ` style="${escapeHtml(css.join(";"))}"` : "";
      const text =
        cell.resolved === null
          ? ""
          : typeof cell.resolved === "boolean"
            ? cell.resolved
              ? "TRUE"
              : "FALSE"
            : String(cell.resolved);
      html += `<td${formula}${styleAttr}>${escapeHtml(text)}</td>`;
    }
    html += "</tr>";
  }
  return `${html}</tbody></table>`;
}

function clipboardJson(snapshot: ClipboardSnapshot): string {
  return JSON.stringify({
    version: 1,
    anchor: snapshot.anchor,
    cells: snapshot.cells,
    tsv: snapshot.tsv,
    cut: snapshot.cut,
  });
}

function parseClipboardJson(text: string): ClipboardSnapshot | null {
  try {
    const value = JSON.parse(text) as Partial<ClipboardSnapshot> & { version?: unknown };
    if (
      value.version !== 1 ||
      !value.anchor ||
      !Number.isInteger(value.anchor.row) ||
      !Number.isInteger(value.anchor.col) ||
      !Array.isArray(value.cells) ||
      typeof value.tsv !== "string" ||
      typeof value.cut !== "boolean"
    ) {
      return null;
    }
    for (const row of value.cells) {
      if (!Array.isArray(row)) return null;
      for (const cell of row) {
        if (
          !cell ||
          typeof cell !== "object" ||
          !cell.value ||
          typeof cell.value !== "object" ||
          !["literal", "formula", "ref"].includes(cell.value.kind) ||
          !(
            cell.resolved === null ||
            typeof cell.resolved === "string" ||
            typeof cell.resolved === "number" ||
            typeof cell.resolved === "boolean"
          )
        ) {
          return null;
        }
      }
    }
    return value as ClipboardSnapshot;
  } catch {
    return null;
  }
}

function safeExternalFormula(source: string | null): string | null {
  if (!source?.startsWith("=")) return null;
  for (const char of source) {
    const codePoint = char.charCodeAt(0);
    if (codePoint <= 0x1f || char === "[" || char === "]" || char === "{" || char === "}") {
      return null;
    }
  }
  if (/^=\s*(?:WEBSERVICE|IMPORTXML|IMPORTHTML|HYPERLINK|DDE|CMD|EXEC|SHELL)\b/i.test(source)) {
    return null;
  }
  return source;
}

function spreadsheetFormula(cell: Element): string | null {
  const direct =
    cell.getAttribute("data-sheetwrite-formula") ??
    cell.getAttribute("data-formula") ??
    cell.getAttribute("x:fmla");
  const safeDirect = safeExternalFormula(direct);
  if (safeDirect) return safeDirect;
  const sheets = cell.getAttribute("data-sheets-formula");
  if (!sheets) return null;
  try {
    const parsed = JSON.parse(sheets) as unknown;
    const source =
      typeof parsed === "string"
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed as Record<string, unknown>).find(
              (value): value is string => typeof value === "string" && value.startsWith("="),
            )
          : null;
    return safeExternalFormula(source ?? null);
  } catch {
    return null;
  }
}

function safeCssColor(value: string): string | undefined {
  const color = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(color);
  if (!rgb) return undefined;
  const channels = rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function styleFromHtml(cell: HTMLElement): CellStyle | undefined {
  const decoration = cell.style.textDecoration.toLowerCase();
  const align = cell.style.textAlign;
  const style: CellStyle = {
    ...(cell.style.fontWeight === "bold" || Number(cell.style.fontWeight) >= 600
      ? { bold: true }
      : {}),
    ...(cell.style.fontStyle === "italic" ? { italic: true } : {}),
    ...(decoration.includes("underline") ? { underline: true } : {}),
    ...(decoration.includes("line-through") ? { strikethrough: true } : {}),
    ...(safeCssColor(cell.style.color) ? { color: safeCssColor(cell.style.color) } : {}),
    ...(safeCssColor(cell.style.backgroundColor)
      ? { backgroundColor: safeCssColor(cell.style.backgroundColor) }
      : {}),
    ...(align === "left" || align === "center" || align === "right" ? { align } : {}),
    ...(cell.style.whiteSpace.includes("pre-wrap") ? { wrap: true } : {}),
  };
  return Object.keys(style).length > 0 ? style : undefined;
}

function parseClipboardHtml(html: string, valuesOnly: boolean): CellWrite[][] | null {
  if (typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) return null;
  const grid: CellWrite[][] = [];
  for (const row of table.querySelectorAll(
    ":scope > thead > tr, :scope > tbody > tr, :scope > tr",
  )) {
    const values: CellWrite[] = [];
    for (const cell of row.querySelectorAll(":scope > th, :scope > td")) {
      const formula = valuesOnly ? null : spreadsheetFormula(cell);
      values.push({
        value: formula
          ? { kind: "formula", src: formula }
          : { kind: "literal", value: neutralizeInjection(cell.textContent ?? "") },
        style: valuesOnly || !(cell instanceof HTMLElement) ? undefined : styleFromHtml(cell),
      });
    }
    if (values.length > 0) grid.push(values);
  }
  return grid.length > 0 ? grid : null;
}

/** Re-anchor a copied value's relative A1 refs by (dRow, dCol); literals pass through. */
function shiftValue(value: CellValue, dRow: number, dCol: number): CellValue {
  if (value.kind === "formula") {
    return { kind: "formula", src: shiftA1Refs(value.src, dRow, dCol) };
  }
  return value;
}

/**
 * Translates between the current selection and clipboard payloads. Copy/cut write
 * TSV to the system clipboard (external interop, unchanged) and additionally keep
 * an internal snapshot: when paste sees that same TSV back it restores the rich
 * payload — formulas re-anchored, styles carried — Google-Sheets style; otherwise
 * it parses the external TSV as neutralized literals. Preserves the grid's
 * view-row mapping and paste injection neutralization throughout.
 */
export class ClipboardController {
  private readonly deps: ClipboardControllerDeps;

  /** The last copy/cut payload, matched against the system clipboard on paste. */
  private snapshot: ClipboardSnapshot | null = null;

  constructor(deps: ClipboardControllerDeps) {
    this.deps = deps;
  }

  async copy(): Promise<ClipboardOutcome> {
    const snapshot = this.capture(false);
    if (!snapshot) return "empty";
    const outcome = await this.writeCaptured(snapshot);
    if (outcome === "done") this.snapshot = snapshot;
    return outcome;
  }

  async cut(): Promise<ClipboardOutcome> {
    const snapshot = this.capture(true);
    if (!snapshot) return "empty";
    const outcome = await this.writeCaptured(snapshot);
    if (outcome !== "done") return outcome;
    if (this.deps.readOnly()) return "done";
    this.snapshot = snapshot;
    this.deps.commit(snapshot.clearPatches, "cut");
    return "done";
  }

  private async writeCaptured(snapshot: ClipboardSnapshot): Promise<ClipboardOutcome> {
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
    const clipboard = navigator.clipboard;
    if (typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
      const plain = new Blob([snapshot.tsv], { type: "text/plain" });
      const html = new Blob([clipboardHtml(snapshot)], { type: "text/html" });
      try {
        await clipboard.write([
          new ClipboardItem({
            "text/plain": plain,
            "text/html": html,
            [SHEETWRITE_WEB_CLIPBOARD_FORMAT]: new Blob([clipboardJson(snapshot)], {
              type: SHEETWRITE_CLIPBOARD_MIME,
            }),
          }),
        ]);
        return "done";
      } catch {
        try {
          await clipboard.write([new ClipboardItem({ "text/plain": plain, "text/html": html })]);
          return "done";
        } catch {
          // Retain the universally available text-only fallback.
        }
      }
    }
    if (typeof clipboard.writeText !== "function") return "unsupported";
    try {
      await clipboard.writeText(snapshot.tsv);
      return "done";
    } catch {
      return "blocked";
    }
  }
  /**
   * Paste at the focus cell. Restores the internal snapshot's rich payload when
   * the system clipboard still holds its TSV (copy re-anchors formulas, cut keeps
   * them verbatim; styles carried either way); otherwise parses external TSV as
   * neutralized literals.
   */
  paste(): Promise<ClipboardOutcome> {
    return this.pasteFrom(false);
  }

  /**
   * Like {@link paste} but writes only resolved literals — never formulas or
   * styles. For external text this is identical to {@link paste}.
   */
  pasteValues(): Promise<ClipboardOutcome> {
    return this.pasteFrom(true);
  }

  private async pasteFrom(valuesOnly: boolean): Promise<ClipboardOutcome> {
    if (this.deps.readOnly()) return "empty";
    const focus = this.deps.selection().focusCell;
    if (!focus) return "empty";
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
    const clipboard = navigator.clipboard;
    let richReadFailed = false;

    if (typeof clipboard.read === "function") {
      try {
        const items = await clipboard.read();
        for (const item of items) {
          const customType = item.types.includes(SHEETWRITE_WEB_CLIPBOARD_FORMAT)
            ? SHEETWRITE_WEB_CLIPBOARD_FORMAT
            : item.types.includes(SHEETWRITE_CLIPBOARD_MIME)
              ? SHEETWRITE_CLIPBOARD_MIME
              : null;
          if (!customType) continue;
          const snapshot = parseClipboardJson(await (await item.getType(customType)).text());
          if (!snapshot) continue;
          this.pasteInternal(snapshot, focus, valuesOnly);
          return "done";
        }
        for (const item of items) {
          if (!item.types.includes("text/html")) continue;
          const grid = parseClipboardHtml(
            await (await item.getType("text/html")).text(),
            valuesOnly,
          );
          if (!grid) continue;
          this.pasteExternalHtml(grid, focus);
          return "done";
        }
        for (const item of items) {
          if (!item.types.includes("text/plain")) continue;
          const text = await (await item.getType("text/plain")).text();
          if (text.length === 0) return "empty";
          const snapshot = this.snapshot;
          if (snapshot && text === snapshot.tsv) this.pasteInternal(snapshot, focus, valuesOnly);
          else this.pasteExternal(text, focus);
          return "done";
        }
      } catch {
        richReadFailed = true;
      }
    }

    if (typeof clipboard.readText !== "function") {
      return richReadFailed ? "blocked" : "unsupported";
    }
    try {
      const text = await clipboard.readText();
      if (text.length === 0) return "empty";
      const snapshot = this.snapshot;
      if (snapshot && text === snapshot.tsv) this.pasteInternal(snapshot, focus, valuesOnly);
      else this.pasteExternal(text, focus);
      return "done";
    } catch {
      return "blocked";
    }
  }

  // ── Rich paste ─────────────────────────────────────────────────────────────

  private pasteInternal(snapshot: ClipboardSnapshot, focus: CellRef, valuesOnly: boolean): void {
    // Copy shifts every relative ref by the block's rigid displacement; cut does
    // not shift (and clears its source at cut time).
    const dRow = snapshot.cut ? 0 : this.deps.toDataRow(focus.row) - snapshot.anchor.row;
    const dCol = snapshot.cut ? 0 : focus.col - snapshot.anchor.col;

    this.commitBlock(
      focus,
      snapshot.cells.length,
      (r) => snapshot.cells[r]!.length,
      (r, c): CellWrite => {
        const cell = snapshot.cells[r]![c]!;
        if (valuesOnly) return { value: { kind: "literal", value: cell.resolved } };
        return { value: shiftValue(cell.value, dRow, dCol), style: cell.style };
      },
    );
  }

  private pasteExternalHtml(grid: CellWrite[][], focus: CellRef): void {
    const sheet = this.deps.sheet();
    this.commitBlock(
      focus,
      grid.length,
      (row) => grid[row]!.length,
      (row, col, targetCol): CellWrite => {
        const cell = grid[row]![col]!;
        if (cell.value.kind !== "literal" || typeof cell.value.value !== "string") return cell;
        return {
          value: parseCellInput(
            neutralizeInjection(cell.value.value),
            sheet.columns[targetCol]?.type ?? "text",
          ),
          style: cell.style,
        };
      },
    );
  }

  // ── External TSV paste ───────────────────────────────────────────────────────

  private pasteExternal(text: string, focus: CellRef): void {
    const grid = parseTsv(text);
    if (grid.length === 0) return;
    const sheet = this.deps.sheet();

    this.commitBlock(
      focus,
      grid.length,
      (r) => grid[r]!.length,
      (r, c, targetCol): CellWrite => ({
        value: parseCellInput(
          neutralizeInjection(grid[r]![c]!),
          sheet.columns[targetCol]?.type ?? "text",
        ),
      }),
    );
  }

  // ── Shared plumbing ──────────────────────────────────────────────────────────

  /**
   * Walk a `height`×`widthAt(r)` block anchored at `focus`, resolving each cell to
   * a `set` patch via `cellAt`. Honors the view-row mapping, the visible-column
   * order, the row limit, and merge-anchor skipping, then commits one transaction.
   */
  private commitBlock(
    focus: CellRef,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number) => CellWrite | null,
  ): void {
    const activeSheet = this.deps.activeSheet();
    const rowLimit = this.deps.store.viewRowCount(activeSheet);
    const colIndices = this.deps.colIndices();
    const startPos = colIndices.indexOf(focus.col);
    if (startPos < 0) return;

    const availableRows = Math.min(height, rowLimit - focus.row);
    const width = availableRows > 0 ? widthAt(0) : 0;
    const targetCols = colIndices.slice(startPos, startPos + width);
    const firstDataRow = availableRows > 0 ? this.deps.toDataRow(focus.row) : -1;
    const rectangular =
      availableRows > 0 &&
      width > 0 &&
      targetCols.length === width &&
      Array.from({ length: availableRows }, (_, row) => row).every(
        (row) =>
          widthAt(row) === width && this.deps.toDataRow(focus.row + row) === firstDataRow + row,
      );
    if (rectangular) {
      const values: CellScalar[] = new Array(availableRows * width);
      const formulas: Array<[number, string]> = [];
      const refs: Array<[number, { sheet: SheetId; row: number; col: number }]> = [];
      const styleTable: CellStyle[] = [];
      const styleLookup = new Map<string, number>();
      const styleIds: number[] = new Array(availableRows * width);
      let canPack = true;
      for (let row = 0; row < availableRows && canPack; row++) {
        for (let col = 0; col < width; col++) {
          const targetRow = focus.row + row;
          const targetCol = targetCols[col]!;
          if (this.deps.mergeAnchorAt(targetRow, targetCol)) {
            canPack = false;
            break;
          }
          const write = cellAt(row, col, targetCol);
          if (!write) {
            canPack = false;
            break;
          }
          const offset = row * width + col;
          if (write.value.kind === "formula") {
            values[offset] = null;
            formulas.push([offset, write.value.src]);
          } else if (write.value.kind === "ref") {
            values[offset] = null;
            refs.push([offset, { ...write.value.target }]);
          } else {
            values[offset] = write.value.value;
          }
          const style = write.style ?? {};
          const styleKey = JSON.stringify(style);
          let styleId = styleLookup.get(styleKey);
          if (styleId === undefined) {
            styleId = styleTable.length;
            styleLookup.set(styleKey, styleId);
            styleTable.push(style);
          }
          styleIds[offset] = styleId;
        }
      }
      if (canPack) {
        const block: PackedCellBlock = {
          rowCount: availableRows,
          colCount: width,
          values,
          formulas: formulas.length > 0 ? formulas : undefined,
          refs: refs.length > 0 ? refs : undefined,
          styleTable,
          styleIds,
        };
        this.deps.commit(
          [
            {
              op: "setBlock",
              range: {
                sheet: activeSheet,
                start: { row: firstDataRow, col: targetCols[0]! },
                end: {
                  row: firstDataRow + availableRows - 1,
                  col: targetCols[targetCols.length - 1]!,
                },
              },
              block,
            },
          ],
          "paste",
        );
        return;
      }
    }

    const patches: DocumentOp[] = [];
    for (let r = 0; r < height; r++) {
      const width = widthAt(r);
      for (let c = 0; c < width; c++) {
        const targetRow = focus.row + r;
        const targetCol = colIndices[startPos + c];
        if (targetRow >= rowLimit || targetCol === undefined) continue;

        const merge = this.deps.mergeAnchorAt(targetRow, targetCol);
        if (merge && (merge.r0 !== targetRow || merge.c0 !== targetCol)) continue;

        const write = cellAt(r, c, targetCol);
        if (!write) continue;
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: this.deps.toDataRow(targetRow), col: targetCol },
          value: write.value,
          style: write.style,
        });
      }
    }
    this.deps.commit(patches, "paste");
  }

  /**
   * Snapshot the focused selection rectangle into a {@link ClipboardSnapshot}:
   * per-cell value (formula src preserved, else literal), resolved scalar, and
   * style, plus the source anchor and the TSV those resolved scalars produce.
   * Returns `null` when there is no focused rectangle.
   */
  private capture(cut: boolean): CapturedClipboard | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    const rects: SelRect[] = [];
    this.deps.selection().forEachRect((r) => rects.push(r));
    const rect = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!rect) return null;

    const activeSheet = this.deps.activeSheet();
    const cells: ClipboardCell[][] = [];
    const values: CellScalar[][] = [];
    const clearPatches: DocumentOp[] = [];
    const firstDataRow = this.deps.toDataRow(rect.r0);
    let rangeClear = true;
    for (let row = rect.r0; row <= rect.r1 && rangeClear; row++) {
      if (this.deps.toDataRow(row) !== firstDataRow + row - rect.r0) {
        rangeClear = false;
        break;
      }
      for (let col = rect.c0; col <= rect.c1; col++) {
        if (this.deps.mergeAnchorAt(row, col)) {
          rangeClear = false;
          break;
        }
      }
    }
    if (rangeClear) {
      clearPatches.push({
        op: "clearRange",
        range: {
          sheet: activeSheet,
          start: { row: firstDataRow, col: rect.c0 },
          end: { row: firstDataRow + rect.r1 - rect.r0, col: rect.c1 },
        },
      });
    }
    for (let r = rect.r0; r <= rect.r1; r++) {
      const cellLine: ClipboardCell[] = [];
      const valueLine: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const merge = this.deps.mergeAnchorAt(r, c);
        if (merge && (merge.r0 !== r || merge.c0 !== c)) {
          cellLine.push({ value: { kind: "literal", value: null }, resolved: null, style: {} });
          valueLine.push(null);
          continue;
        }

        const addr = { sheet: activeSheet, row: this.deps.toDataRow(r), col: c };
        const cell = this.deps.store.getCell(addr);
        const formula = this.deps.store.getFormula(addr);
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : { kind: "literal", value: cell.resolved };

        cellLine.push({ value, resolved: cell.resolved, style: cell.style });
        valueLine.push(cell.resolved);
        if (!rangeClear) {
          clearPatches.push({
            op: "set",
            addr,
            value: { kind: "literal", value: null },
          });
        }
      }
      cells.push(cellLine);
      values.push(valueLine);
    }

    const anchor = { row: this.deps.toDataRow(rect.r0), col: rect.c0 };
    return { anchor, cells, tsv: toTsv(values), cut, clearPatches };
  }
}
