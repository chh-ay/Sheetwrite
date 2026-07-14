import type { CellValue } from "./types/cell.js";
import type { CellAddress, Range } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock, SheetSnapshot, SnapshotCell } from "./types/document.js";

export type RebaseConflictCode =
  | "overlapping-edit"
  | "sheet-removed"
  | "sheet-lifecycle"
  | "formula-structural"
  | "structural-overlap"
  | "unsupported-structural";

export interface RebaseConflict {
  code: RebaseConflictCode;
  localOperationIndex: number;
  remoteOperationIndex: number;
  message: string;
}

export type DocumentRebaseResult =
  | { status: "rebased"; operations: readonly DocumentOp[] }
  | { status: "conflict"; conflict: RebaseConflict };

type Axis = "row" | "column";

type AxisChange =
  | { kind: "insert"; axis: Axis; sheet: string; at: number; count: number }
  | { kind: "delete"; axis: Axis; sheet: string; at: number; count: number }
  | { kind: "move"; axis: Axis; sheet: string };

interface TransformFailure {
  code: RebaseConflictCode;
  message: string;
}

/**
 * Conservative server-ordered rebase for pending offline work. Non-overlapping
 * literal edits are shifted across row/column insertion and deletion. Ambiguous
 * formula, overlapping, sheet-lifecycle, and move cases become explicit
 * conflicts instead of lossy guesses. This is the collaboration design gate;
 * no CRDT dependency is required for the supported cases.
 */
export function rebaseDocumentOperations(
  localOperations: readonly DocumentOp[],
  remoteOperations: readonly DocumentOp[],
): DocumentRebaseResult {
  const operations: DocumentOp[] = cloneJsonValue([...localOperations]);

  for (let remoteIndex = 0; remoteIndex < remoteOperations.length; remoteIndex++) {
    const remote = remoteOperations[remoteIndex]!;
    const axisChange = structuralChange(remote);
    for (let localIndex = 0; localIndex < operations.length; localIndex++) {
      const local = operations[localIndex]!;
      if (axisChange) {
        if (axisChange.kind === "move" && operationTouchesSheet(local, axisChange.sheet)) {
          return conflict(
            "unsupported-structural",
            localIndex,
            remoteIndex,
            "Concurrent row/column moves require host review; index intent is ambiguous",
          );
        }
        if (operationContainsFormula(local)) {
          return conflict(
            "formula-structural",
            localIndex,
            remoteIndex,
            "Formula source cannot be rebased across a concurrent structural edit without parsing sheet-aware references",
          );
        }
        const transformed = transformForAxis(local, axisChange);
        if ("code" in transformed) {
          return conflict(transformed.code, localIndex, remoteIndex, transformed.message);
        }
        operations[localIndex] = transformed.operation;
        continue;
      }

      const lifecycle = lifecycleConflict(local, remote);
      if (lifecycle) {
        return conflict(lifecycle.code, localIndex, remoteIndex, lifecycle.message);
      }
      if (operationsOverlap(local, remote)) {
        return conflict(
          "overlapping-edit",
          localIndex,
          remoteIndex,
          "Concurrent operations mutate overlapping cells or range metadata",
        );
      }
    }
  }

  return { status: "rebased", operations };
}

function conflict(
  code: RebaseConflictCode,
  localOperationIndex: number,
  remoteOperationIndex: number,
  message: string,
): DocumentRebaseResult {
  return {
    status: "conflict",
    conflict: { code, localOperationIndex, remoteOperationIndex, message },
  };
}

function structuralChange(operation: DocumentOp): AxisChange | null {
  switch (operation.op) {
    case "addRows":
      return {
        kind: "insert",
        axis: "row",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };
    case "removeRows":
      return {
        kind: "delete",
        axis: "row",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };
    case "moveRows":
      return { kind: "move", axis: "row", sheet: operation.sheet };
    case "addColumns":
      return {
        kind: "insert",
        axis: "column",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.columns.length,
      };
    case "removeColumns":
      return {
        kind: "delete",
        axis: "column",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };
    case "moveColumns":
      return { kind: "move", axis: "column", sheet: operation.sheet };
    default:
      return null;
  }
}

function transformForAxis(
  input: DocumentOp,
  change: AxisChange,
): { operation: DocumentOp } | TransformFailure {
  if (change.kind === "move") return { operation: input };
  const operation = cloneJsonValue(input);
  const direct = transformDirectTarget(operation, change);
  if (direct) return direct;
  const embedded = transformEmbeddedReferences(operation, change);
  return embedded ? embedded : { operation };
}

function transformDirectTarget(
  operation: DocumentOp,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  switch (operation.op) {
    case "set":
    case "setNote": {
      const address = transformAddress(operation.addr, change);
      if (!address) return deletedTarget(operation.op);
      operation.addr = address;
      return null;
    }
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange": {
      const range = transformRange(operation.range, change);
      if (!range) return overlappingStructure(operation.op);
      operation.range = range;
      return null;
    }
    case "addRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        operation.at = transformPosition(operation.at, change);
      }
      return null;
    case "removeRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transformSpan(operation.at, operation.count, change);
        if (!mapped) return overlappingStructure(operation.op);
        operation.at = mapped.at;
      }
      return null;
    case "moveRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transformSpan(operation.from, operation.count, change);
        if (!mapped) return overlappingStructure(operation.op);
        operation.from = mapped.at;
        operation.to = transformPosition(operation.to, change);
      }
      return null;
    case "addColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        operation.at = transformPosition(operation.at, change);
      }
      return null;
    case "removeColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transformSpan(operation.at, operation.count, change);
        if (!mapped) return overlappingStructure(operation.op);
        operation.at = mapped.at;
      }
      return null;
    case "moveColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transformSpan(operation.from, operation.count, change);
        if (!mapped) return overlappingStructure(operation.op);
        operation.from = mapped.at;
        operation.to = transformPosition(operation.to, change);
      }
      return null;
    case "setColumn":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transformIndex(operation.col, change);
        if (mapped === null) return deletedTarget(operation.op);
        operation.col = mapped;
      }
      return null;
    case "setRowMeta":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transformIndex(operation.row, change);
        if (mapped === null) return deletedTarget(operation.op);
        operation.row = mapped;
      }
      return null;
    case "addMerge":
    case "removeMerge":
      if (operation.sheet === change.sheet) {
        const range: Range = {
          sheet: operation.sheet,
          start: { row: operation.merge.r0, col: operation.merge.c0 },
          end: { row: operation.merge.r1, col: operation.merge.c1 },
        };
        const mapped = transformRange(range, change);
        if (!mapped) return overlappingStructure(operation.op);
        operation.merge = {
          r0: mapped.start.row,
          c0: mapped.start.col,
          r1: mapped.end.row,
          c1: mapped.end.col,
        };
      }
      return null;
    case "setValidationRule": {
      const mapped = transformRange(operation.rule.range, change);
      if (!mapped && operation.rule.range.sheet === change.sheet) {
        return overlappingStructure(operation.op);
      }
      if (mapped) operation.rule.range = mapped;
      return null;
    }
    case "setProtectedRange": {
      const mapped = transformRange(operation.protectedRange.range, change);
      if (!mapped && operation.protectedRange.range.sheet === change.sheet) {
        return overlappingStructure(operation.op);
      }
      if (mapped) operation.protectedRange.range = mapped;
      return null;
    }
    case "setNamedRange": {
      const mapped = transformRange(operation.namedRange.range, change);
      if (!mapped && operation.namedRange.range.sheet === change.sheet) {
        return overlappingStructure(operation.op);
      }
      if (mapped) operation.namedRange.range = mapped;
      return null;
    }
    case "setSheetMeta":
      if (operation.sheet === change.sheet) {
        return {
          code: "unsupported-structural",
          message:
            "Row groups, filters, and conditional formatting require metadata-aware structural rebase",
        };
      }
      return null;
    case "addSheet":
    case "removeSheet":
    case "renameSheet":
    case "moveSheet":
    case "removeValidationRule":
    case "removeProtectedRange":
    case "removeNamedRange":
      return null;
  }
}

function transformEmbeddedReferences(
  operation: DocumentOp,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  switch (operation.op) {
    case "set": {
      const value = transformCellValue(operation.value, change);
      if (!value) return deletedReference();
      operation.value = value;
      return null;
    }
    case "setRange":
      return transformSnapshotCells(operation.cells, change);
    case "setBlock":
      return transformPackedBlock(operation.block, change);
    case "addSheet":
      return transformSheetSnapshot(operation.sheet, change);
    default:
      return null;
  }
}

function transformSnapshotCells(
  cells: SnapshotCell[],
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  for (const cell of cells) {
    const value = transformCellValue(cell.value, change);
    if (!value) return deletedReference();
    cell.value = value;
  }
  return null;
}

function transformPackedBlock(
  block: PackedCellBlock,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  if (!block.refs) return null;
  for (const tuple of block.refs) {
    const address = transformAddress(tuple[1], change);
    if (!address) return deletedReference();
    tuple[1] = address;
  }
  return null;
}

function transformSheetSnapshot(
  sheet: SheetSnapshot,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  for (const block of sheet.cells) {
    const failure = transformSnapshotCells(block.cells, change);
    if (failure) return failure;
  }
  return null;
}

function transformCellValue(
  value: CellValue,
  change: Exclude<AxisChange, { kind: "move" }>,
): CellValue | null {
  if (value.kind !== "ref") return value;
  const target = transformAddress(value.target, change);
  return target ? { kind: "ref", target } : null;
}

function transformAddress(
  address: CellAddress,
  change: Exclude<AxisChange, { kind: "move" }>,
): CellAddress | null {
  if (address.sheet !== change.sheet) return address;
  const current = change.axis === "row" ? address.row : address.col;
  const mapped = transformIndex(current, change);
  if (mapped === null) return null;
  return change.axis === "row" ? { ...address, row: mapped } : { ...address, col: mapped };
}

function transformRange(range: Range, change: Exclude<AxisChange, { kind: "move" }>): Range | null {
  if (range.sheet !== change.sheet) return range;
  const start = change.axis === "row" ? range.start.row : range.start.col;
  const end = change.axis === "row" ? range.end.row : range.end.col;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const mapped = transformInclusiveSpan(low, high, change);
  if (!mapped) return null;
  const forward = start <= end;
  const mappedStart = forward ? mapped.start : mapped.end;
  const mappedEnd = forward ? mapped.end : mapped.start;
  return change.axis === "row"
    ? {
        ...range,
        start: { ...range.start, row: mappedStart },
        end: { ...range.end, row: mappedEnd },
      }
    : {
        ...range,
        start: { ...range.start, col: mappedStart },
        end: { ...range.end, col: mappedEnd },
      };
}

function transformInclusiveSpan(
  start: number,
  end: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): { start: number; end: number } | null {
  if (change.kind === "insert") {
    if (end < change.at) return { start, end };
    if (start >= change.at) return { start: start + change.count, end: end + change.count };
    return null;
  }
  const removedEnd = change.at + change.count - 1;
  if (end < change.at) return { start, end };
  if (start > removedEnd) return { start: start - change.count, end: end - change.count };
  return null;
}

function transformSpan(
  at: number,
  count: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): { at: number } | null {
  const mapped = transformInclusiveSpan(at, at + count - 1, change);
  return mapped ? { at: mapped.start } : null;
}

function transformIndex(
  index: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): number | null {
  if (change.kind === "insert") return index >= change.at ? index + change.count : index;
  if (index < change.at) return index;
  if (index >= change.at + change.count) return index - change.count;
  return null;
}

function transformPosition(
  position: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): number {
  if (change.kind === "insert") return position >= change.at ? position + change.count : position;
  if (position <= change.at) return position;
  if (position >= change.at + change.count) return position - change.count;
  return change.at;
}

function operationContainsFormula(operation: DocumentOp): boolean {
  switch (operation.op) {
    case "set":
      return operation.value.kind === "formula";
    case "setRange":
      return operation.cells.some((cell) => cell.value.kind === "formula");
    case "setBlock":
      return (operation.block.formulas?.length ?? 0) > 0;
    case "addSheet":
      return operation.sheet.cells.some((block) =>
        block.cells.some((cell) => cell.value.kind === "formula"),
      );
    default:
      return false;
  }
}

function lifecycleConflict(local: DocumentOp, remote: DocumentOp): TransformFailure | null {
  if (remote.op === "removeSheet") {
    if (operationTouchesSheet(local, remote.sheet) || operationContainsFormula(local)) {
      return {
        code: "sheet-removed",
        message: "Pending work targets or may reference a removed sheet",
      };
    }
    return null;
  }
  if (remote.op === "addSheet" && local.op === "addSheet" && local.sheet.id === remote.sheet.id) {
    return {
      code: "sheet-lifecycle",
      message: "Concurrent sheet creation reused the same stable ID",
    };
  }
  if (remote.op === "renameSheet") {
    if (
      (local.op === "renameSheet" && local.sheet === remote.sheet) ||
      operationContainsFormula(local)
    ) {
      return {
        code: "sheet-lifecycle",
        message: "Concurrent sheet rename conflicts with a pending rename or formula source",
      };
    }
  }
  if (remote.op === "moveSheet" && local.op === "moveSheet" && local.sheet === remote.sheet) {
    return {
      code: "sheet-lifecycle",
      message: "Concurrent sheet moves have ambiguous ordering intent",
    };
  }
  return null;
}

function operationTouchesSheet(operation: DocumentOp, sheet: string): boolean {
  switch (operation.op) {
    case "set":
      return (
        operation.addr.sheet === sheet ||
        (operation.value.kind === "ref" && operation.value.target.sheet === sheet)
      );
    case "setNote":
      return operation.addr.sheet === sheet;
    case "setRange":
      return (
        operation.range.sheet === sheet ||
        operation.cells.some(
          (cell) => cell.value.kind === "ref" && cell.value.target.sheet === sheet,
        )
      );
    case "setBlock":
      return (
        operation.range.sheet === sheet ||
        (operation.block.refs?.some((tuple) => tuple[1].sheet === sheet) ?? false)
      );
    case "setRangeStyle":
    case "clearRange":
      return operation.range.sheet === sheet;
    case "setNamedRange":
      return operation.namedRange.range.sheet === sheet || operation.namedRange.scope === sheet;
    case "removeNamedRange":
      return operation.scope === sheet;
    case "addSheet":
      return (
        operation.sheet.id === sheet ||
        operation.sheet.cells.some((block) =>
          block.cells.some(
            (cell) => cell.value.kind === "ref" && cell.value.target.sheet === sheet,
          ),
        )
      );
    default:
      return "sheet" in operation && operation.sheet === sheet;
  }
}

function operationsOverlap(local: DocumentOp, remote: DocumentOp): boolean {
  const localRanges = mutationRanges(local);
  const remoteRanges = mutationRanges(remote);
  for (const a of localRanges) {
    for (const b of remoteRanges) {
      if (
        a.sheet === b.sheet &&
        Math.min(a.start.row, a.end.row) <= Math.max(b.start.row, b.end.row) &&
        Math.min(b.start.row, b.end.row) <= Math.max(a.start.row, a.end.row) &&
        Math.min(a.start.col, a.end.col) <= Math.max(b.start.col, b.end.col) &&
        Math.min(b.start.col, b.end.col) <= Math.max(a.start.col, a.end.col)
      ) {
        return true;
      }
    }
  }
  return operationIdentity(local) !== "" && operationIdentity(local) === operationIdentity(remote);
}

function mutationRanges(operation: DocumentOp): Range[] {
  switch (operation.op) {
    case "set":
    case "setNote":
      return [
        {
          sheet: operation.addr.sheet,
          start: { row: operation.addr.row, col: operation.addr.col },
          end: { row: operation.addr.row, col: operation.addr.col },
        },
      ];
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange":
      return [operation.range];
    case "addMerge":
    case "removeMerge":
      return [
        {
          sheet: operation.sheet,
          start: { row: operation.merge.r0, col: operation.merge.c0 },
          end: { row: operation.merge.r1, col: operation.merge.c1 },
        },
      ];
    case "setValidationRule":
      return [operation.rule.range];
    case "setProtectedRange":
      return [operation.protectedRange.range];
    case "setNamedRange":
      return [operation.namedRange.range];
    default:
      return [];
  }
}

function operationIdentity(operation: DocumentOp): string {
  switch (operation.op) {
    case "setColumn":
      return `column:${operation.sheet}:${operation.col}`;
    case "setRowMeta":
      return `row:${operation.sheet}:${operation.row}`;
    case "setValidationRule":
    case "removeValidationRule":
      return `validation:${operation.sheet}:${operation.op === "setValidationRule" ? operation.rule.id : operation.id}`;
    case "setProtectedRange":
    case "removeProtectedRange":
      return `protection:${operation.sheet}:${operation.op === "setProtectedRange" ? operation.protectedRange.id : operation.id}`;
    case "setNamedRange":
      return `name:${operation.namedRange.scope ?? ""}:${operation.namedRange.name.toLowerCase()}`;
    case "removeNamedRange":
      return `name:${operation.scope ?? ""}:${operation.name.toLowerCase()}`;
    case "setSheetMeta":
      return `sheet-meta:${operation.sheet}`;
    default:
      return "";
  }
}

function deletedTarget(operation: string): TransformFailure {
  return {
    code: "structural-overlap",
    message: `${operation} targets a row or column deleted by the server-ordered operation`,
  };
}

function deletedReference(): TransformFailure {
  return {
    code: "structural-overlap",
    message: "Pending reference targets a row or column deleted by the server-ordered operation",
  };
}

function overlappingStructure(operation: string): TransformFailure {
  return {
    code: "structural-overlap",
    message: `${operation} spans a concurrent row or column insertion/deletion boundary`,
  };
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
