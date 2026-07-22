import type { ConditionalFormatRule } from "./types/cell.js";
import type { Sheet } from "./types/document.js";

/** Maximum ordered conditional-format rules admitted per worksheet and encoded in one u32 match mask. */
export const MAX_CONDITIONAL_FORMAT_RULES = 32;

/** Maximum serialized formula predicate source; parsing/evaluation stays bounded per visible cell. */
export const MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH = 8_192;

/** Validate bounded, sheet-local renderer rules without allocating normalized range objects. */
export function validConditionalRules(
  sheet: Sheet,
  rules: readonly ConditionalFormatRule[],
): boolean {
  if (rules.length > MAX_CONDITIONAL_FORMAT_RULES) return false;
  return rules.every((rule) => {
    const formulaSource = rule.when?.kind === "formula" ? rule.when.source : undefined;
    if (
      rule.range.sheet !== sheet.id ||
      (rule.stopIfTrue !== undefined && typeof rule.stopIfTrue !== "boolean") ||
      (rule.when?.kind === "formula" &&
        (typeof formulaSource !== "string" ||
          !formulaSource.startsWith("=") ||
          formulaSource.length > MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH))
    ) {
      return false;
    }
    const startRow = Math.min(rule.range.start.row, rule.range.end.row);
    const startCol = Math.min(rule.range.start.col, rule.range.end.col);
    const endRow = Math.max(rule.range.start.row, rule.range.end.row);
    const endCol = Math.max(rule.range.start.col, rule.range.end.col);
    return (
      Number.isInteger(startRow) &&
      startRow >= 0 &&
      Number.isInteger(startCol) &&
      startCol >= 0 &&
      Number.isInteger(endRow) &&
      endRow < sheet.rowCount &&
      Number.isInteger(endCol) &&
      endCol < sheet.columns.length
    );
  });
}
