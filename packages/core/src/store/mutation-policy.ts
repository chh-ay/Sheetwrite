import type { CellScalar, CellValue } from "../types/cell.js";
import type { Range, SheetId } from "../types/coordinates.js";
import type {
  CommitReason,
  DataValidationComparison,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  Sheet,
  Workbook,
} from "../types/document.js";
import {
  cellRange,
  fullSheetRange,
  normalizedRange,
  patchSheetId,
  rangeContains,
  rangesIntersect,
} from "./ranges.js";

export interface MutationPolicyResult {
  readonly patches: DocumentOp[];
  readonly warnings: MutationIssue[];
  readonly rejections: MutationIssue[];
}

/** Pure policy evaluation over workbook metadata; storage and events stay outside this owner. */
export class StoreMutationPolicy {
  constructor(private readonly workbook: Workbook) {}

  evaluate(
    patches: readonly DocumentOp[],
    commitReason: CommitReason,
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode,
  ): MutationPolicyResult {
    const allowed: DocumentOp[] = [];
    const warnings: MutationIssue[] = [];
    const rejections: MutationIssue[] = [];
    const rulesBySheet = new Map<SheetId, DataValidationRule[]>();
    const protectionsBySheet = new Map<SheetId, ProtectedRange[]>();

    const rulesFor = (sheet: SheetId): DataValidationRule[] => {
      let rules = rulesBySheet.get(sheet);
      if (!rules) {
        rules = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.validationRules ?? []),
        ];
        rulesBySheet.set(sheet, rules);
      }
      return rules;
    };
    const protectionsFor = (sheet: SheetId): ProtectedRange[] => {
      let ranges = protectionsBySheet.get(sheet);
      if (!ranges) {
        ranges = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.protectedRanges ?? []),
        ];
        protectionsBySheet.set(sheet, ranges);
      }
      return ranges;
    };

    for (let operationIndex = 0; operationIndex < patches.length; operationIndex++) {
      const patch = patches[operationIndex]!;
      const patchIssues: MutationIssue[] = [];
      const sheetId = patchSheetId(patch);
      if (sheetId) {
        patchIssues.push(
          ...this.protectionIssues(
            patch,
            operationIndex,
            commitReason,
            protectionsFor(sheetId),
            resolver,
          ),
          ...this.validationIssues(patch, operationIndex, rulesFor(sheetId)),
        );
      }
      warnings.push(...patchIssues.filter((issue) => issue.severity === "warning"));
      const errors = patchIssues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        rejections.push(...errors);
        continue;
      }

      allowed.push(patch);
      if (patch.op === "setValidationRule") {
        const rules = rulesFor(patch.sheet);
        const index = rules.findIndex((rule) => rule.id === patch.rule.id);
        if (index < 0) rules.push(patch.rule);
        else rules[index] = patch.rule;
      } else if (patch.op === "removeValidationRule") {
        rulesBySheet.set(
          patch.sheet,
          rulesFor(patch.sheet).filter((rule) => rule.id !== patch.id),
        );
      } else if (patch.op === "setProtectedRange") {
        const ranges = protectionsFor(patch.sheet);
        const index = ranges.findIndex((range) => range.id === patch.protectedRange.id);
        if (index < 0) ranges.push(patch.protectedRange);
        else ranges[index] = patch.protectedRange;
      } else if (patch.op === "removeProtectedRange") {
        protectionsBySheet.set(
          patch.sheet,
          protectionsFor(patch.sheet).filter((range) => range.id !== patch.id),
        );
      }
    }

    return {
      patches: mode === "atomic" && rejections.length > 0 ? [] : allowed,
      warnings,
      rejections,
    };
  }

  private protectionIssues(
    patch: DocumentOp,
    operationIndex: number,
    commitReason: CommitReason,
    protectedRanges: readonly ProtectedRange[],
    resolver: ProtectionResolver | undefined,
  ): MutationIssue[] {
    if (protectedRanges.length === 0) return [];
    const affected = this.affectedRanges(patch);
    if (affected.length === 0) return [];

    const issues: MutationIssue[] = [];
    const seen = new Set<string>();
    for (const protectedRange of protectedRanges) {
      if (
        seen.has(protectedRange.id) ||
        !affected.some((range) => rangesIntersect(range, protectedRange.range))
      ) {
        continue;
      }
      seen.add(protectedRange.id);
      let allowed = false;
      try {
        allowed =
          resolver?.({
            protectedRange,
            operation: patch,
            commitReason,
          }) === "allow";
      } catch {
        allowed = false;
      }
      if (!allowed) {
        issues.push({
          kind: "protection",
          severity: "error",
          protectedRangeId: protectedRange.id,
          range: normalizedRange(protectedRange.range),
          operationIndex,
          message: protectedRange.label
            ? `Protected range "${protectedRange.label}" denied this mutation`
            : `Protected range "${protectedRange.id}" denied this mutation`,
        });
      }
    }
    return issues;
  }

  private affectedRanges(patch: DocumentOp): Range[] {
    switch (patch.op) {
      case "set":
      case "setNote":
        return [cellRange(patch.addr)];
      case "setRange":
      case "setBlock":
      case "setRangeStyle":
      case "clearRange":
        return [normalizedRange(patch.range)];
      case "addMerge":
      case "removeMerge":
        return [
          {
            sheet: patch.sheet,
            start: { row: patch.merge.r0, col: patch.merge.c0 },
            end: { row: patch.merge.r1, col: patch.merge.c1 },
          },
        ];
      case "setValidationRule":
        return [normalizedRange(patch.rule.range)];
      case "setColumn": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [
          {
            sheet: patch.sheet,
            start: { row: 0, col: patch.col },
            end: { row: sheet.rowCount - 1, col: patch.col },
          },
        ];
      }
      case "setRowMeta": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [
          {
            sheet: patch.sheet,
            start: { row: patch.row, col: 0 },
            end: { row: patch.row, col: sheet.columns.length - 1 },
          },
        ];
      }
      case "addRows":
      case "removeRows":
      case "moveRows":
      case "addColumns":
      case "removeColumns":
      case "moveColumns":
      case "removeSheet":
      case "renameSheet":
      case "moveSheet":
      case "setSheetVisibility": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [fullSheetRange(sheet)];
      }
      case "addSheet":
      case "setSheetMeta":
      case "removeValidationRule":
      case "setProtectedRange":
      case "removeProtectedRange":
      case "setNamedRange":
      case "removeNamedRange":
        return [];
      default: {
        const unclassified: never = patch;
        return unclassified;
      }
    }
  }

  private sheet(id: SheetId): Sheet | undefined {
    return this.workbook.sheets.find((candidate) => candidate.id === id);
  }

  private validationIssues(
    patch: DocumentOp,
    operationIndex: number,
    rules: readonly DataValidationRule[],
  ): MutationIssue[] {
    if (rules.length === 0) return [];
    const issues: MutationIssue[] = [];

    if (patch.op === "set" && patch.value.kind === "literal") {
      for (const rule of rules) {
        if (
          rule.policy === "allow" ||
          !rangeContains(rule.range, patch.addr) ||
          validationAccepts(rule, patch.value.value)
        ) {
          continue;
        }
        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr: patch.addr,
          value: patch.value,
          operationIndex,
          message: rule.helpText ?? validationMessage(rule),
        });
      }
      return issues;
    }

    if (patch.op === "setRange") {
      const range = normalizedRange(patch.range);
      for (const cell of patch.cells) {
        if (cell.value.kind !== "literal") continue;
        const addr = {
          sheet: range.sheet,
          row: range.start.row + cell.rowOffset,
          col: range.start.col + cell.colOffset,
        };
        for (const rule of rules) {
          if (
            rule.policy === "allow" ||
            !rangeContains(rule.range, addr) ||
            validationAccepts(rule, cell.value.value)
          ) {
            continue;
          }
          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr,
            value: cell.value,
            operationIndex,
            message: rule.helpText ?? validationMessage(rule),
          });
        }
      }
      return issues;
    }

    if (patch.op === "clearRange") {
      const range = normalizedRange(patch.range);
      for (const rule of rules) {
        const ruleRange = normalizedRange(rule.range);
        if (
          rule.policy === "allow" ||
          !rangesIntersect(range, ruleRange) ||
          validationAccepts(rule, null)
        ) {
          continue;
        }
        const addr = {
          sheet: range.sheet,
          row: Math.max(range.start.row, ruleRange.start.row),
          col: Math.max(range.start.col, ruleRange.start.col),
        };
        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr,
          value: { kind: "literal", value: null },
          operationIndex,
          message: rule.helpText ?? validationMessage(rule),
        });
      }
      return issues;
    }

    if (patch.op !== "setBlock") return issues;
    const range = normalizedRange(patch.range);
    const formulaOffsets = new Set((patch.block.formulas ?? []).map(([offset]) => offset));
    const refOffsets = new Set((patch.block.refs ?? []).map(([offset]) => offset));
    for (const rule of rules) {
      if (rule.policy === "allow" || rule.range.sheet !== range.sheet) continue;
      const ruleRange = normalizedRange(rule.range);
      const rowStart = Math.max(range.start.row, ruleRange.start.row);
      const rowEnd = Math.min(range.end.row, ruleRange.end.row);
      const colStart = Math.max(range.start.col, ruleRange.start.col);
      const colEnd = Math.min(range.end.col, ruleRange.end.col);
      if (rowStart > rowEnd || colStart > colEnd) continue;

      for (let row = rowStart; row <= rowEnd; row++) {
        const rowOffset = (row - range.start.row) * patch.block.colCount;
        for (let col = colStart; col <= colEnd; col++) {
          const offset = rowOffset + col - range.start.col;
          if (formulaOffsets.has(offset) || refOffsets.has(offset)) continue;
          const scalar = patch.block.values[offset] ?? null;
          if (validationAccepts(rule, scalar)) continue;
          const value: CellValue = { kind: "literal", value: scalar };
          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr: { sheet: range.sheet, row, col },
            value,
            operationIndex,
            message: rule.helpText ?? validationMessage(rule),
          });
        }
      }
    }
    return issues;
  }
}

function comparisonAccepts(comparison: DataValidationComparison, value: number): boolean {
  switch (comparison.operator) {
    case "between":
      return value >= comparison.min && value <= comparison.max;
    case "notBetween":
      return value < comparison.min || value > comparison.max;
    case "equal":
      return value === comparison.value;
    case "notEqual":
      return value !== comparison.value;
    case "greaterThan":
      return value > comparison.value;
    case "lessThan":
      return value < comparison.value;
    case "greaterThanOrEqual":
      return value >= comparison.value;
    case "lessThanOrEqual":
      return value <= comparison.value;
  }
}

function validationAccepts(rule: DataValidationRule, value: CellScalar): boolean {
  if (value === null && (rule.allowBlank ?? true)) return true;
  const condition = rule.condition;
  if (condition.kind === "list") {
    return (
      condition.allowCustom === true || condition.values.some((item) => Object.is(item, value))
    );
  }
  if (condition.kind === "checkbox") {
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    return Object.is(value, checked) || Object.is(value, unchecked);
  }
  if (condition.kind === "textLength") {
    if (typeof value !== "string") return false;
    if (condition.comparison) return comparisonAccepts(condition.comparison, value.length);
    return (
      (condition.min === undefined || value.length >= condition.min) &&
      (condition.max === undefined || value.length <= condition.max)
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (condition.kind === "number" && condition.integer && !Number.isInteger(value)) return false;
  if (condition.comparison) return comparisonAccepts(condition.comparison, value);
  return (
    (condition.min === undefined || value >= condition.min) &&
    (condition.max === undefined || value <= condition.max)
  );
}

function comparisonMessage(subject: string, comparison: DataValidationComparison): string {
  switch (comparison.operator) {
    case "between":
      return `${subject} must be between ${comparison.min} and ${comparison.max}, inclusive`;
    case "notBetween":
      return `${subject} must be less than ${comparison.min} or greater than ${comparison.max}`;
    case "equal":
      return `${subject} must equal ${comparison.value}`;
    case "notEqual":
      return `${subject} must not equal ${comparison.value}`;
    case "greaterThan":
      return `${subject} must be greater than ${comparison.value}`;
    case "lessThan":
      return `${subject} must be less than ${comparison.value}`;
    case "greaterThanOrEqual":
      return `${subject} must be greater than or equal to ${comparison.value}`;
    case "lessThanOrEqual":
      return `${subject} must be less than or equal to ${comparison.value}`;
  }
}

function validationMessage(rule: DataValidationRule): string {
  switch (rule.condition.kind) {
    case "list":
      return "Value must match one of the allowed options";
    case "number":
      return rule.condition.comparison
        ? comparisonMessage("Value", rule.condition.comparison)
        : "Value must be within the allowed numeric range";
    case "date":
      return rule.condition.comparison
        ? comparisonMessage("Date", rule.condition.comparison)
        : "Date must be within the allowed range";
    case "textLength":
      return rule.condition.comparison
        ? comparisonMessage("Text length", rule.condition.comparison)
        : "Text length is outside the allowed range";
    case "checkbox":
      return "Value must be a valid checkbox state";
  }
}
