import type { CellScalar, CellValue, Column } from "../../../packages/core/src/types/cell.js";
import type { formatNumber as formatNumberType } from "../../../packages/core/src/number-format.js";
import type { DocumentOp, Workbook } from "../../../packages/core/src/types/document.js";
import { canonicalJson, isNonemptyString } from "../normalize.js";
import type { ConformanceCase, ConformanceResult } from "../types.js";

function a1(cell: string): { row: number; col: number } {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell);
  if (!match) throw new Error(`Invalid A1 cell ${cell}`);
  let col = 0;
  for (const character of match[1]!) col = col * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, col: col - 1 };
}

function classify(
  value: CellScalar,
  numberFormat: string | undefined,
  formatter: typeof formatNumberType,
): ConformanceResult {
  const displayedText =
    numberFormat !== undefined && (typeof value === "number" || typeof value === "string")
      ? formatter(value, numberFormat, "en-US")
      : undefined;
  if (value === null) return { type: "blank" };
  if (typeof value === "number") return { type: "number", value, displayedText };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NUM!|SPILL!)$/.test(value)) {
    return { type: "error", error: value };
  }
  return { type: "string", value };
}

function fixtureWorkbook(): Workbook {
  const columns: Column[] = Array.from({ length: 32 }, (_, index) => ({
    key: `c${index}`,
    header: `Column ${index + 1}`,
    width: 100,
    type: "text",
  }));
  return {
    activeSheet: "oracle",
    sheets: [{ id: "oracle", name: "Oracle", rowCount: 256, columns }],
  };
}

export async function runSheetwriteCase(entry: ConformanceCase): Promise<ConformanceResult> {
  if (entry.unsupported) return { type: "unsupported" };
  const [{ initSheetwrite }, { formatNumber }, { SheetwriteStore }] = await Promise.all([
    import("../../../packages/core/src/grid.js"),
    import("../../../packages/core/src/number-format.js"),
    import("../../../packages/core/src/store.js"),
  ]);
  await initSheetwrite();
  const store = new SheetwriteStore(fixtureWorkbook());
  try {
    if (entry.kind === "workbook") {
      const patches: DocumentOp[] = [];
      const observedCells: Array<{ sheet: string; cell: string }> = [];
      let activeSheet = "oracle";
      let createdSheets = 0;
      for (const operation of entry.operations ?? []) {
        if (operation.op === "create-sheet" && isNonemptyString(operation.name)) {
          if (createdSheets === 0) {
            patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
          } else {
            const id = `oracle-${createdSheets + 1}`;
            patches.push({
              op: "addSheet",
              sheet: {
                id,
                name: operation.name,
                order: createdSheets,
                rowCount: 256,
                columns: fixtureWorkbook().sheets[0]!.columns,
                cells: [],
              },
            });
            activeSheet = id;
          }
          createdSheets += 1;
        } else if (operation.op === "set" && isNonemptyString(operation.cell)) {
          patches.push({
            op: "set",
            addr: { sheet: activeSheet, ...a1(operation.cell) },
            value: { kind: "literal", value: operation.value as CellScalar } satisfies CellValue,
          });
          observedCells.push({ sheet: activeSheet, cell: operation.cell });
        } else if (operation.op === "rename-sheet" && isNonemptyString(operation.name)) {
          patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
        } else if (
          operation.op === "set-visibility" &&
          (operation.visibility === "visible" ||
            operation.visibility === "hidden" ||
            operation.visibility === "veryHidden")
        ) {
          patches.push({
            op: "setSheetVisibility",
            sheet: activeSheet,
            visibility: operation.visibility,
          });
        } else {
          throw new Error(`${entry.id}: unsupported workbook operation ${String(operation.op)}`);
        }
      }
      const outcome = store.applyTransaction({ patches });
      if (outcome.status !== "applied") {
        throw new Error(`${entry.id}: workbook operations rejected: ${canonicalJson(outcome)}`);
      }
      const workbook = store.getWorkbook();
      const active = workbook.sheets.find((sheet) => sheet.id === activeSheet);
      return {
        type: "workbook",
        value: {
          activeSheet: active?.name,
          sheetCount: workbook.sheets.length,
          sheets: workbook.sheets.map((sheet) => ({
            name: sheet.name,
            visibility: sheet.visibility ?? "visible",
            cells: Object.fromEntries(
              observedCells
                .filter((cell) => cell.sheet === sheet.id)
                .map((cell) => [
                  cell.cell,
                  store.getCell({ sheet: sheet.id, ...a1(cell.cell) }).resolved,
                ]),
            ),
          })),
        },
      };
    }

    const patches: DocumentOp[] = (entry.inputs ?? []).map((input) => ({
      op: "set",
      addr: { sheet: "oracle", ...a1(input.cell) },
      value: { kind: "literal", value: input.value },
    }));
    patches.push({
      op: "set",
      addr: { sheet: "oracle", ...a1(entry.target!) },
      value: { kind: "formula", src: entry.formula! },
    });
    const outcome = store.applyTransaction({ patches });
    if (outcome.status !== "applied") {
      throw new Error(`${entry.id}: formula setup rejected: ${canonicalJson(outcome)}`);
    }
    const target = a1(entry.target!);
    const anchor = classify(
      store.getCell({ sheet: "oracle", ...target }).resolved,
      entry.numberFormat,
      formatNumber,
    );
    if (entry.expected.type !== "array") return { ...anchor, formula: entry.formula };
    const rows = entry.expected.rows!;
    const columns = entry.expected.columns!;
    const values: unknown[][] = [];
    for (let row = 0; row < rows; row++) {
      const line: unknown[] = [];
      for (let col = 0; col < columns; col++) {
        line.push(
          store.getCell({ sheet: "oracle", row: target.row + row, col: target.col + col }).resolved,
        );
      }
      values.push(line);
    }
    return { type: "array", value: values, rows, columns, formula: entry.formula };
  } finally {
    store.dispose();
  }
}
