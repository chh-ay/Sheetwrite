import { consumeSourceSnapshot } from "../reference.js";
import type {
  BoundaryResourceAccounting,
  RuntimeResourceOperation,
} from "../resource-accounting.js";
import { applySheetLifecycleOperation, createSheetLifecycleState } from "../sheet-lifecycle.js";
import type { CellAddress, SheetId } from "../types/coordinates.js";
import type { DocumentOp, MutationIssue, Workbook } from "../types/document.js";
import { integerAt, moveIndex, normalizedRange, patchSheetId } from "./ranges.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

export interface PagedDirtyPreflightStats {
  ffiCalls: number;
  maxTransferredArrayLength: number;
  admissionReferenceEntriesScanned: number;
  admissionReferenceMapsMaterialized: number;
}

interface PagedDirtyPreflightState {
  handle: number | null;
  rows: number;
  cols: number;
  columnKeys: string[];
  dirty: number;
  additional: number;
  existing: Set<string> | null;
  seen: Set<string>;
}

function cellKey(addr: CellAddress): string {
  return JSON.stringify([addr.sheet, addr.row, addr.col]);
}

function parseCellKey(key: string): CellAddress {
  const [sheet, row, col] = JSON.parse(key) as [SheetId, number, number];
  return { sheet, row, col };
}

/** Simulates paged dirty-cell and reference admission before a transaction mutates the store. */
export class PagedDirtyPreflight {
  constructor(
    private readonly wasm: RecomputingCellStore,
    private readonly workbook: Workbook,
    private readonly handles: ReadonlyMap<SheetId, number>,
    private readonly sheetIdsByHandle: readonly SheetId[],
    private readonly stats: PagedDirtyPreflightStats,
    private readonly boundaryAccounting: BoundaryResourceAccounting,
    private readonly dirtyCellLimit: number,
    private readonly referenceSimulationLimit: number,
  ) {}

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
  }

  private noteRangeMutationFfi(operation: RuntimeResourceOperation | null): void {
    this.stats.ffiCalls += 1;
    this.stats.maxTransferredArrayLength = Math.max(this.stats.maxTransferredArrayLength, 0);
    this.boundaryAccounting.record(operation ?? "edit", "js-to-wasm", 0, "scalar");
  }

  issue(
    patches: readonly DocumentOp[],
    resourceOperation: RuntimeResourceOperation | null,
  ): MutationIssue | null {
    const limit = this.dirtyCellLimit;
    const referenceSimulationLimit = this.referenceSimulationLimit;
    const wasmIndexLimit = 0xffff_ffff;
    const states = new Map<SheetId, PagedDirtyPreflightState>();
    const sheetLifecycle = createSheetLifecycleState(this.workbook.sheets);
    const referenceLifecycle = createSheetLifecycleState(this.workbook.sheets);
    const applicableRemove = patches.map((patch) => {
      const lifecycle = applySheetLifecycleOperation(referenceLifecycle, patch);
      return patch.op === "removeSheet" && lifecycle?.ok === true;
    });
    const removeAfter = new Array<boolean>(patches.length);
    let laterRemove = false;
    for (let index = patches.length - 1; index >= 0; index--) {
      removeAfter[index] = laterRemove;
      if (applicableRemove[index]) laterRemove = true;
    }
    let trackVirtualRefs = false;
    let referenceSimulationExceeded = false;
    let referenceSimulationActual = 0;
    let virtualRefs: Map<string, CellAddress> | null = null;
    const referenceSimulationIssue = (): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-reference-simulation",
      actual: referenceSimulationActual,
      max: referenceSimulationLimit,
      message: `Paged reference simulation exceeds the ${referenceSimulationLimit} entry limit`,
    });
    const materializeVirtualRefs = (force = false): Map<string, CellAddress> | null => {
      if (!trackVirtualRefs && !force) return null;
      if (virtualRefs) return virtualRefs;
      const refs = new Map<string, CellAddress>();
      for (const sheet of this.workbook.sheets) {
        if (!this.handles.has(sheet.id) || sheet.rowCount === 0 || sheet.columns.length === 0) {
          continue;
        }
        this.noteRangeMutationFfi(resourceOperation);
        const snapshot = this.wasm.captureReferences(
          this.handleOf(sheet.id),
          referenceSimulationLimit - refs.size,
        );
        if (!snapshot) {
          referenceSimulationActual = referenceSimulationLimit + 1;
          referenceSimulationExceeded = true;
          return null;
        }
        const projection = consumeSourceSnapshot(snapshot, this.sheetIdsByHandle);
        for (const [offset, target] of projection.references()) {
          referenceSimulationActual++;
          this.stats.admissionReferenceEntriesScanned++;
          if (referenceSimulationActual > referenceSimulationLimit) {
            referenceSimulationExceeded = true;
            return null;
          }
          const source = {
            sheet: sheet.id,
            row: Math.floor(offset / sheet.columns.length),
            col: offset % sheet.columns.length,
          };
          refs.set(cellKey(source), target);
        }
      }
      virtualRefs = refs;
      this.stats.admissionReferenceMapsMaterialized++;
      return virtualRefs;
    };
    const setVirtualRef = (source: CellAddress, target: CellAddress | null): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      const key = cellKey(source);
      const replaced = refs.delete(key);
      if (target) {
        if (!replaced && refs.size >= referenceSimulationLimit) {
          referenceSimulationActual = refs.size + 1;
          referenceSimulationExceeded = true;
          return;
        }
        refs.set(key, { ...target });
      }
    };
    const rebaseVirtualRefs = (
      sheet: SheetId,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      this.stats.admissionReferenceMapsMaterialized++;
      const rebased = new Map<string, CellAddress>();
      for (const [sourceKey, target] of refs) {
        const source = parseCellKey(sourceKey);
        const sourceRow = source.sheet === sheet ? rowAt(source.row) : source.row;
        const sourceCol = source.sheet === sheet ? colAt(source.col) : source.col;
        const targetRow = target.sheet === sheet ? rowAt(target.row) : target.row;
        const targetCol = target.sheet === sheet ? colAt(target.col) : target.col;
        if (sourceRow === null || sourceCol === null || targetRow === null || targetCol === null) {
          continue;
        }
        const nextSource = { sheet: source.sheet, row: sourceRow, col: sourceCol };
        rebased.set(cellKey(nextSource), {
          sheet: target.sheet,
          row: targetRow,
          col: targetCol,
        });
      }
      virtualRefs = rebased;
      if (rebased.size > referenceSimulationLimit) {
        referenceSimulationActual = rebased.size;
        referenceSimulationExceeded = true;
      }
    };
    const clearVirtualRefs = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      for (const sourceKey of refs.keys()) {
        const source = parseCellKey(sourceKey);
        if (
          source.sheet === sheet &&
          source.row >= startRow &&
          source.row < startRow + rows &&
          source.col >= startCol &&
          source.col < startCol + cols
        ) {
          refs.delete(sourceKey);
        }
      }
    };
    const keyOf = (row: number, col: number) => `${row}:${col}`;
    const stateFor = (sheet: SheetId) => {
      const existing = states.get(sheet);
      if (existing) return existing;
      if (!this.handles.has(sheet)) return undefined;
      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      if (!meta) throw new Error(`unknown sheet: ${sheet}`);
      const state: PagedDirtyPreflightState = {
        handle: this.handleOf(sheet),
        rows: meta.rowCount,
        cols: meta.columns.length,
        columnKeys: meta.columns.map((column) => column.key),
        dirty: this.wasm.pagedStats(this.handleOf(sheet))[2] ?? 0,
        additional: 0,
        existing: null,
        seen: new Set<string>(),
      };
      states.set(sheet, state);
      return state;
    };
    const issue = (actual: number): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-dirty-cells",
      actual: Math.min(Number.MAX_SAFE_INTEGER, actual),
      max: limit,
      message: `Paged dirty cells exceed the ${limit} cell limit`,
    });
    const invalid = (operationIndex: number, message: string): MutationIssue => ({
      kind: "invalid-operation",
      severity: "error",
      operationIndex,
      message,
    });
    const consume = (state: PagedDirtyPreflightState): MutationIssue | null => {
      const actual = state.dirty + state.additional + 1;
      if (actual > limit) return issue(actual);
      state.additional += 1;
      return null;
    };
    const materializeExisting = (state: PagedDirtyPreflightState) => {
      if (state.existing) return;
      const existing = new Set<string>();
      if (state.handle !== null) {
        const coordinates = this.wasm.pagedDirtyCoordinates(state.handle);
        for (let index = 0; index + 1 < coordinates.length; index += 2) {
          existing.add(keyOf(coordinates[index]!, coordinates[index + 1]!));
        }
      }
      state.existing = existing;
      state.dirty = existing.size;
    };
    const rebaseSet = (
      source: ReadonlySet<string>,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ) => {
      const rebased = new Set<string>();
      for (const encoded of source) {
        const separator = encoded.indexOf(":");
        const row = Number(encoded.slice(0, separator));
        const col = Number(encoded.slice(separator + 1));
        const nextRow = rowAt(row);
        const nextCol = colAt(col);
        if (nextRow !== null && nextCol !== null) rebased.add(keyOf(nextRow, nextCol));
      }
      return rebased;
    };
    const rebaseState = (
      state: PagedDirtyPreflightState,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ) => {
      materializeExisting(state);
      state.existing = rebaseSet(state.existing!, rowAt, colAt);
      state.seen = rebaseSet(state.seen, rowAt, colAt);
      state.dirty = state.existing.size;
      state.additional = state.seen.size;
    };
    const addSparse = (sheet: SheetId, row: number, col: number): MutationIssue | null => {
      const state = stateFor(sheet);
      if (!state || row < 0 || col < 0 || row >= state.rows || col >= state.cols) return null;
      const key = keyOf(row, col);
      if (state.seen.has(key)) return null;
      if (
        state.existing?.has(key) ||
        (state.existing === null &&
          state.handle !== null &&
          this.wasm.cellState(state.handle, row, col) === 3)
      ) {
        return null;
      }
      const rejection = consume(state);
      if (!rejection) state.seen.add(key);
      return rejection;
    };
    const cellApplies = (sheet: SheetId, row: number, col: number): boolean => {
      const state = stateFor(sheet);
      return Boolean(state && row >= 0 && col >= 0 && row < state.rows && col < state.cols);
    };
    const rectangleApplies = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): boolean => {
      const state = stateFor(sheet);
      return Boolean(
        state &&
          startRow >= 0 &&
          startCol >= 0 &&
          Number.isSafeInteger(rows) &&
          Number.isSafeInteger(cols) &&
          rows > 0 &&
          cols > 0 &&
          rows <= state.rows - startRow &&
          cols <= state.cols - startCol,
      );
    };
    const addRectangle = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): MutationIssue | null => {
      if (rows === 1 && cols === 1) return addSparse(sheet, startRow, startCol);
      const state = stateFor(sheet);
      if (!state) return null;
      if (startRow < 0 || startCol < 0) return null;
      if (
        !Number.isSafeInteger(rows) ||
        !Number.isSafeInteger(cols) ||
        rows < 0 ||
        cols < 0 ||
        rows > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(cols, 1))
      ) {
        return issue(Number.MAX_SAFE_INTEGER);
      }
      if (rows > state.rows - startRow || cols > state.cols - startCol) {
        const actual = state.dirty + state.additional + rows * cols;
        return actual > limit ? issue(actual) : null;
      }
      materializeExisting(state);
      for (let row = startRow; row < startRow + rows; row++) {
        for (let col = startCol; col < startCol + cols; col++) {
          const key = keyOf(row, col);
          if (state.existing!.has(key) || state.seen.has(key)) continue;
          const rejection = consume(state);
          if (rejection) return rejection;
          state.seen.add(key);
        }
      }
      return null;
    };

    for (let operationIndex = 0; operationIndex < patches.length; operationIndex++) {
      const patch = patches[operationIndex]!;
      trackVirtualRefs = removeAfter[operationIndex] ?? false;
      if (patch.op === "addSheet") {
        if (applySheetLifecycleOperation(sheetLifecycle, patch)?.ok !== true) continue;
        const snapshot = patch.sheet;
        const state: PagedDirtyPreflightState = {
          handle: null,
          rows: snapshot.rowCount,
          cols: snapshot.columns.length,
          columnKeys: snapshot.columns.map((column) => column.key),
          dirty: 0,
          additional: 0,
          existing: new Set<string>(),
          seen: new Set<string>(),
        };
        states.set(snapshot.id, state);
        for (const block of snapshot.cells) {
          for (const cell of block.cells) {
            const rejection = addSparse(
              snapshot.id,
              block.startRow + cell.rowOffset,
              block.startCol + cell.colOffset,
            );
            if (rejection) return rejection;
            if (cell.value.kind === "ref") {
              setVirtualRef(
                {
                  sheet: snapshot.id,
                  row: block.startRow + cell.rowOffset,
                  col: block.startCol + cell.colOffset,
                },
                cell.value.target,
              );
              if (referenceSimulationExceeded) return referenceSimulationIssue();
            }
          }
        }
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        continue;
      }
      if (patch.op === "removeSheet") {
        if (applySheetLifecycleOperation(sheetLifecycle, patch)?.ok !== true) continue;
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        if (!trackVirtualRefs && virtualRefs === null) {
          this.noteRangeMutationFfi(resourceOperation);
          const sources = this.wasm.referencesTargeting(
            this.handleOf(patch.sheet),
            referenceSimulationLimit,
          );
          if (!sources) {
            referenceSimulationActual = referenceSimulationLimit + 1;
            return referenceSimulationIssue();
          }
          this.stats.admissionReferenceEntriesScanned += sources.length / 3;
          for (let index = 0; index < sources.length; index += 3) {
            const sourceSheet = this.sheetIdsByHandle[sources[index]!];
            if (sourceSheet === undefined || sourceSheet === patch.sheet) continue;
            const rejection = addSparse(sourceSheet, sources[index + 1]!, sources[index + 2]!);
            if (rejection) return rejection;
          }
          states.delete(patch.sheet);
          continue;
        }
        const materializedRefs = materializeVirtualRefs(true);
        if (!materializedRefs) return referenceSimulationIssue();
        const entries = (function* (): IterableIterator<[CellAddress, CellAddress]> {
          for (const [sourceKey, target] of materializedRefs) {
            yield [parseCellKey(sourceKey), target];
          }
        })();
        const remaining = trackVirtualRefs ? new Map<string, CellAddress>() : null;
        for (const [source, target] of entries) {
          if (source.sheet !== patch.sheet && target.sheet === patch.sheet) {
            const rejection = addSparse(source.sheet, source.row, source.col);
            if (rejection) return rejection;
          }
          if (remaining && source.sheet !== patch.sheet && target.sheet !== patch.sheet) {
            remaining.set(cellKey(source), { ...target });
          }
        }
        virtualRefs = remaining;
        states.delete(patch.sheet);
        continue;
      }
      if (
        patch.op === "renameSheet" ||
        patch.op === "moveSheet" ||
        patch.op === "setSheetVisibility"
      ) {
        applySheetLifecycleOperation(sheetLifecycle, patch);
        continue;
      }
      const sheet = patchSheetId(patch);
      if (
        sheet !== null &&
        (patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns")
      ) {
        const state = stateFor(sheet);
        if (!state) continue;
        const keep = (index: number) => index;
        if (patch.op === "addRows") {
          if (patch.at > state.rows || patch.count > wasmIndexLimit - state.rows) {
            return invalid(operationIndex, "addRows exceeds the current sheet bounds");
          }
          rebaseState(state, (row) => (row >= patch.at ? row + patch.count : row), keep);
          rebaseVirtualRefs(sheet, (row) => (row >= patch.at ? row + patch.count : row), keep);
          state.rows += patch.count;
        } else if (patch.op === "removeRows") {
          if (patch.at > state.rows || patch.count > state.rows - patch.at) {
            return invalid(operationIndex, "removeRows exceeds the current sheet bounds");
          }
          rebaseState(
            state,
            (row) =>
              row < patch.at ? row : row < patch.at + patch.count ? null : row - patch.count,
            keep,
          );
          rebaseVirtualRefs(
            sheet,
            (row) =>
              row < patch.at ? row : row < patch.at + patch.count ? null : row - patch.count,
            keep,
          );
          state.rows -= patch.count;
        } else if (patch.op === "moveRows") {
          if (
            patch.from > state.rows ||
            patch.count > state.rows - patch.from ||
            patch.to > state.rows - patch.count
          ) {
            return invalid(operationIndex, "moveRows exceeds the current sheet bounds");
          }
          rebaseState(state, (row) => moveIndex(row, patch.from, patch.count, patch.to), keep);
          rebaseVirtualRefs(
            sheet,
            (row) => moveIndex(row, patch.from, patch.count, patch.to),
            keep,
          );
        } else if (patch.op === "addColumns") {
          const insertedKeys = patch.columns.map((column) => column.key);
          if (
            patch.at > state.cols ||
            insertedKeys.length === 0 ||
            insertedKeys.length > wasmIndexLimit - state.cols ||
            new Set([...state.columnKeys, ...insertedKeys]).size !==
              state.columnKeys.length + insertedKeys.length
          ) {
            return invalid(operationIndex, "addColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) => (col >= patch.at ? col + patch.columns.length : col));
          rebaseVirtualRefs(sheet, keep, (col) =>
            col >= patch.at ? col + patch.columns.length : col,
          );
          state.cols += patch.columns.length;
          state.columnKeys.splice(patch.at, 0, ...insertedKeys);
        } else if (patch.op === "removeColumns") {
          if (
            patch.at > state.cols ||
            patch.count > state.cols - patch.at ||
            patch.count === state.cols
          ) {
            return invalid(operationIndex, "removeColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) =>
            col < patch.at ? col : col < patch.at + patch.count ? null : col - patch.count,
          );
          rebaseVirtualRefs(sheet, keep, (col) =>
            col < patch.at ? col : col < patch.at + patch.count ? null : col - patch.count,
          );
          state.cols -= patch.count;
          state.columnKeys.splice(patch.at, patch.count);
        } else {
          if (
            patch.from > state.cols ||
            patch.count > state.cols - patch.from ||
            patch.to > state.cols - patch.count
          ) {
            return invalid(operationIndex, "moveColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) => moveIndex(col, patch.from, patch.count, patch.to));
          rebaseVirtualRefs(sheet, keep, (col) =>
            moveIndex(col, patch.from, patch.count, patch.to),
          );
          const movedKeys = state.columnKeys.splice(patch.from, patch.count);
          state.columnKeys.splice(patch.to, 0, ...movedKeys);
        }
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        continue;
      }
      let rejection: MutationIssue | null = null;
      if (patch.op === "set") {
        if (!cellApplies(patch.addr.sheet, patch.addr.row, patch.addr.col)) continue;
        rejection = addSparse(patch.addr.sheet, patch.addr.row, patch.addr.col);
        if (!rejection) {
          setVirtualRef(patch.addr, patch.value.kind === "ref" ? patch.value.target : null);
        }
      } else if (patch.op === "setRange") {
        const range = normalizedRange(patch.range);
        const rows = range.end.row - range.start.row + 1;
        const cols = range.end.col - range.start.col + 1;
        if (
          !rectangleApplies(range.sheet, range.start.row, range.start.col, rows, cols) ||
          patch.cells.some(
            (cell) =>
              !integerAt(cell.rowOffset) ||
              !integerAt(cell.colOffset) ||
              cell.rowOffset >= rows ||
              cell.colOffset >= cols,
          )
        ) {
          continue;
        }
        for (const cell of patch.cells) {
          rejection = addSparse(
            range.sheet,
            range.start.row + cell.rowOffset,
            range.start.col + cell.colOffset,
          );
          if (rejection) break;
          const source = {
            sheet: range.sheet,
            row: range.start.row + cell.rowOffset,
            col: range.start.col + cell.colOffset,
          };
          setVirtualRef(source, cell.value.kind === "ref" ? cell.value.target : null);
          if (referenceSimulationExceeded) return referenceSimulationIssue();
        }
      } else if (patch.op === "setBlock") {
        const range = normalizedRange(patch.range);
        rejection = addRectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          patch.block.rowCount,
          patch.block.colCount,
        );
        if (
          !rejection &&
          patch.block.rowCount === range.end.row - range.start.row + 1 &&
          patch.block.colCount === range.end.col - range.start.col + 1 &&
          rectangleApplies(
            range.sheet,
            range.start.row,
            range.start.col,
            patch.block.rowCount,
            patch.block.colCount,
          )
        ) {
          for (let rowOffset = 0; rowOffset < patch.block.rowCount; rowOffset++) {
            for (let colOffset = 0; colOffset < patch.block.colCount; colOffset++) {
              setVirtualRef(
                {
                  sheet: range.sheet,
                  row: range.start.row + rowOffset,
                  col: range.start.col + colOffset,
                },
                null,
              );
              if (referenceSimulationExceeded) return referenceSimulationIssue();
            }
          }
          for (const [offset, target] of patch.block.refs ?? []) {
            setVirtualRef(
              {
                sheet: range.sheet,
                row: range.start.row + Math.floor(offset / patch.block.colCount),
                col: range.start.col + (offset % patch.block.colCount),
              },
              target,
            );
            if (referenceSimulationExceeded) return referenceSimulationIssue();
          }
        }
      } else if (patch.op === "setRangeStyle" || patch.op === "clearRange") {
        const range = normalizedRange(patch.range);
        rejection = addRectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          range.end.row - range.start.row + 1,
          range.end.col - range.start.col + 1,
        );
        if (
          !rejection &&
          patch.op === "clearRange" &&
          (patch.contents ?? true) &&
          rectangleApplies(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          )
        ) {
          clearVirtualRefs(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          );
        }
      }
      if (referenceSimulationExceeded) return referenceSimulationIssue();
      if (rejection) return rejection;
    }
    return null;
  }
}
