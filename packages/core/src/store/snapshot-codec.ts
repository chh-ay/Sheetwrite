import {
  SnapshotValidationError,
  validateWorkbookSnapshot,
  WORKBOOK_SCHEMA_VERSION,
} from "../document-protocol.js";
import { cellKey, type ReferenceGraph } from "../reference.js";
import type { CellValue } from "../types/cell.js";
import type { CellAddress } from "../types/coordinates.js";
import type { SheetSnapshot, SnapshotCell, Workbook, WorkbookSnapshot } from "../types/document.js";
import type { StoreWindowReader } from "./window-reader.js";

export interface DecodedWorkbookSnapshot {
  readonly snapshot: WorkbookSnapshot;
  readonly workbook: Workbook;
}

/** Validate once at the trust boundary and convert persisted metadata to live collections. */
export function decodeWorkbookSnapshot(input: unknown): DecodedWorkbookSnapshot {
  const checked = validateWorkbookSnapshot(input);
  if (!checked.ok) throw new SnapshotValidationError(checked.errors);
  const snapshot = checked.value;
  const workbook: Workbook = {
    activeSheet: snapshot.workbook.activeSheet,
    namedRanges: cloneJsonValue(snapshot.workbook.namedRanges),
    sheets: snapshot.sheets.map((source) => {
      const rowHeights = new Map<number, number>();
      const hiddenRows = new Set<number>();
      for (const [row, meta] of source.rowMeta ?? []) {
        if (meta.height !== undefined) rowHeights.set(row, meta.height);
        if (meta.hidden) hiddenRows.add(row);
      }
      return {
        id: source.id,
        name: source.name,
        rowCount: source.rowCount,
        columns: cloneJsonValue(source.columns) ?? [],
        frozenRows: source.frozenRows,
        frozenCols: source.frozenCols,
        rowHeights: rowHeights.size > 0 ? rowHeights : undefined,
        hiddenRows: hiddenRows.size > 0 ? hiddenRows : undefined,
        merges: cloneJsonValue(source.merges),
        conditionalFormats: cloneJsonValue(source.conditionalFormats),
        validationRules: cloneJsonValue(source.validationRules),
        protectedRanges: cloneJsonValue(source.protectedRanges),
        notes: cloneJsonValue(source.notes),
        sortKeys: cloneJsonValue(source.sortKeys),
        filters: cloneJsonValue(source.filters),
        rowGroups: cloneJsonValue(source.rowGroups),
      };
    }),
  };
  return { snapshot, workbook };
}

/** Cold-path serializer over stable live owners; none of these references are copied on reads. */
export class StoreSnapshotCodec {
  constructor(
    private readonly workbook: Workbook,
    private readonly windowReader: StoreWindowReader,
    private readonly formulaSources: ReadonlyMap<string, string>,
    private readonly refs: ReferenceGraph,
  ) {}

  encode(documentId: string | undefined, documentVersion: number | undefined): WorkbookSnapshot {
    const refTargets = new Map<string, CellAddress>();
    for (const [source, target] of this.refs.entries()) {
      refTargets.set(cellKey(source), target);
    }
    const sheets: SheetSnapshot[] = this.workbook.sheets.map((sheet, order) => {
      const rowMetaRows = new Set<number>([
        ...(sheet.rowHeights?.keys() ?? []),
        ...(sheet.hiddenRows?.values() ?? []),
      ]);
      const rowMeta = [...rowMetaRows]
        .sort((left, right) => left - right)
        .map(
          (row) =>
            [
              row,
              {
                ...(sheet.rowHeights?.has(row) ? { height: sheet.rowHeights.get(row) } : {}),
                ...(sheet.hiddenRows?.has(row) ? { hidden: true } : {}),
              },
            ] as const,
        );

      const cols = sheet.columns.map((_, col) => col);
      const window = this.windowReader.read(
        sheet.id,
        { start: 0, end: sheet.rowCount },
        cols,
        undefined,
        false,
      );
      const cells: SnapshotCell[] = [];
      for (let row = 0; row < sheet.rowCount; row++) {
        for (let col = 0; col < cols.length; col++) {
          const index = row * cols.length + col;
          const addr = { sheet: sheet.id, row, col };
          const key = cellKey(addr);
          const formula = this.formulaSources.get(key);
          const target = refTargets.get(key);
          const style = window.styles[window.styleIds[index] ?? 0] ?? {};
          const hasStyle = Object.keys(style).length > 0;
          const resolved = window.values[index] ?? null;
          if (!formula && !target && resolved === null && !hasStyle) continue;
          const value: CellValue = formula
            ? { kind: "formula", src: formula }
            : target
              ? { kind: "ref", target: { ...target } }
              : { kind: "literal", value: resolved };
          cells.push({
            rowOffset: row,
            colOffset: col,
            value,
            ...(hasStyle ? { style: cloneJsonValue(style) } : {}),
          });
        }
      }

      return {
        id: sheet.id,
        name: sheet.name,
        order,
        rowCount: sheet.rowCount,
        columns: cloneJsonValue(sheet.columns) ?? [],
        ...(sheet.frozenRows !== undefined ? { frozenRows: sheet.frozenRows } : {}),
        ...(sheet.frozenCols !== undefined ? { frozenCols: sheet.frozenCols } : {}),
        ...(rowMeta.length > 0 ? { rowMeta: rowMeta.map(([row, meta]) => [row, meta]) } : {}),
        ...(sheet.merges?.length ? { merges: cloneJsonValue(sheet.merges) } : {}),
        ...(sheet.conditionalFormats?.length
          ? { conditionalFormats: cloneJsonValue(sheet.conditionalFormats) }
          : {}),
        ...(sheet.validationRules?.length
          ? { validationRules: cloneJsonValue(sheet.validationRules) }
          : {}),
        ...(sheet.protectedRanges?.length
          ? { protectedRanges: cloneJsonValue(sheet.protectedRanges) }
          : {}),
        ...(sheet.notes?.length ? { notes: cloneJsonValue(sheet.notes) } : {}),
        ...(sheet.sortKeys?.length ? { sortKeys: cloneJsonValue(sheet.sortKeys) } : {}),
        ...(sheet.filters?.length ? { filters: cloneJsonValue(sheet.filters) } : {}),
        ...(sheet.rowGroups?.length ? { rowGroups: cloneJsonValue(sheet.rowGroups) } : {}),
        cells:
          cells.length > 0
            ? [
                {
                  startRow: 0,
                  startCol: 0,
                  rowCount: sheet.rowCount,
                  colCount: sheet.columns.length,
                  cells,
                },
              ]
            : [],
      };
    });

    return {
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      ...(documentId !== undefined ? { documentId } : {}),
      ...(documentVersion !== undefined ? { version: documentVersion } : {}),
      workbook: {
        activeSheet: this.workbook.activeSheet,
        ...(this.workbook.namedRanges?.length
          ? { namedRanges: cloneJsonValue(this.workbook.namedRanges) }
          : {}),
      },
      sheets,
    };
  }
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
