import type { ResourceOwnerBytes } from "../resource-accounting.js";
import type { StyleDictionary } from "../style-dictionary.js";
import type { CellScalar, CellStyle, ConditionalFormatRule } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { Workbook } from "../types/document.js";
import type { VisibleWindowView } from "../types/store.js";
import type { ConsumingWindowView, RecomputingCellStore } from "./wasm-contract.js";

const KIND_NUMBER = 1;
const KIND_STRING = 2;
const KIND_BOOL = 3;
const EMPTY_COND_MATCHES = new Uint32Array(0);
const STRING_CACHE_CAP = 65_536;
const WINDOW_SCRATCH_MAX_REUSE = 65_536;

/** Owns packed-window decoding, caches, and reusable viewport scratch. */
export class StoreWindowReader {
  private readonly colsU32Cache = new WeakMap<ReadonlyArray<number>, Uint32Array>();
  private valuesScratch: CellScalar[] = [];
  private readonly stringCache = new Map<number, string>();
  private readonly condRulesSynced = new Map<SheetId, string>();
  private conditionalRuleInputBytes = 0;
  private conditionalRuleLargestInputBytes = 0;

  constructor(
    private readonly wasm: RecomputingCellStore,
    private readonly workbook: Workbook,
    private readonly handles: ReadonlyMap<SheetId, number>,
    private readonly styles: StyleDictionary,
  ) {}

  read(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    order: Uint32Array | undefined,
    applyConditionalRules: boolean,
  ): VisibleWindowView {
    const handle = this.handleOf(sheet);
    const colsU32 = this.colsU32For(cols);
    let ffiCalls = 1;
    let ffiInputBytes = colsU32.byteLength;
    let ffiLargestTransferBytes = colsU32.byteLength;
    if (this.wasm.isPaged(handle)) {
      this.wasm.pinRange(handle, rows.start, rows.end, colsU32);
      ffiCalls += 1;
      ffiInputBytes += colsU32.byteLength;
    }
    const conditionalSync = applyConditionalRules ? this.syncConditionalRules(sheet, handle) : 0;
    const hasCondRules = (conditionalSync & 1) !== 0;
    if ((conditionalSync & 2) !== 0) {
      ffiCalls += 1;
      ffiInputBytes += this.conditionalRuleInputBytes;
      ffiLargestTransferBytes = Math.max(
        ffiLargestTransferBytes,
        this.conditionalRuleLargestInputBytes,
      );
    }

    let view: ConsumingWindowView;
    if (order) {
      const dataRows = order.subarray(rows.start, Math.min(rows.end, order.length));
      ffiInputBytes += dataRows.byteLength;
      ffiLargestTransferBytes = Math.max(ffiLargestTransferBytes, dataRows.byteLength);
      view = this.wasm.getWindowRows(handle, dataRows, colsU32) as ConsumingWindowView;
    } else {
      view = this.wasm.getWindow(handle, rows.start, rows.end, colsU32) as ConsumingWindowView;
    }
    ffiCalls += 1;

    const kinds = view.takeKinds();
    const numbers = view.takeNumbers();
    const stringIds = view.takeStringIds();
    const stringIndex = view.takeStringIndex();
    const styleIds = view.takeStyleIndex();
    const styleDict = view.takeStyleDict();
    const strings = view.takeStrings();
    const condMatches = hasCondRules ? view.takeCondMatches() : EMPTY_COND_MATCHES;
    view.free();
    let ffiBoundaryCalls = ffiCalls + 8 + (hasCondRules ? 1 : 0);
    let ffiOutputBytes =
      kinds.byteLength +
      numbers.byteLength +
      stringIds.byteLength +
      stringIndex.byteLength +
      styleIds.byteLength +
      styleDict.byteLength +
      condMatches.byteLength;
    let localStringBytes = 0;
    for (const value of strings) localStringBytes += utf8ByteLength(value);
    ffiOutputBytes += localStringBytes;
    ffiLargestTransferBytes = Math.max(
      ffiLargestTransferBytes,
      kinds.byteLength,
      numbers.byteLength,
      stringIds.byteLength,
      stringIndex.byteLength,
      styleIds.byteLength,
      styleDict.byteLength,
      condMatches.byteLength,
      localStringBytes,
    );

    let stringPoolUpdateIds: Uint32Array | undefined;
    let stringPoolUpdateValues: string[] | undefined;
    let missingIdSet: Set<number> | null = null;
    if (this.stringCache.size >= STRING_CACHE_CAP) this.stringCache.clear();

    for (let i = 0; i < stringIds.length; i++) {
      const id = stringIds[i];
      if (id !== undefined && id !== 0xffffffff && !this.stringCache.has(id)) {
        if (!missingIdSet) missingIdSet = new Set<number>();
        missingIdSet.add(id);
      }
    }
    if (missingIdSet) {
      stringPoolUpdateIds = Uint32Array.from(missingIdSet);
      stringPoolUpdateValues = this.wasm.poolStrings(stringPoolUpdateIds);
      ffiCalls += 1;
      ffiBoundaryCalls += 1;
      ffiInputBytes += stringPoolUpdateIds.byteLength;
      let poolStringBytes = 0;
      for (const value of stringPoolUpdateValues) poolStringBytes += utf8ByteLength(value);
      ffiOutputBytes += poolStringBytes;
      ffiLargestTransferBytes = Math.max(
        ffiLargestTransferBytes,
        stringPoolUpdateIds.byteLength,
        poolStringBytes,
      );
      for (let i = 0; i < stringPoolUpdateValues.length; i++) {
        this.stringCache.set(stringPoolUpdateIds[i] ?? 0xffffffff, stringPoolUpdateValues[i] ?? "");
      }
    }

    const values = this.valuesFor(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) {
        values[i] = numbers[i] ?? null;
      } else if (kinds[i] === KIND_BOOL) {
        values[i] = (numbers[i] ?? 0) !== 0;
      } else if (kinds[i] === KIND_STRING) {
        const poolId = stringIds[i] ?? 0xffffffff;
        if (poolId !== 0xffffffff) {
          values[i] = this.stringCache.get(poolId) ?? null;
        } else {
          const stringSlot = stringIndex[i] ?? -1;
          values[i] = stringSlot >= 0 ? (strings[stringSlot] ?? null) : null;
        }
      } else {
        values[i] = null;
      }
    }

    const windowStyles = this.stylesFrom(styleDict);
    if (condMatches.length > 0) {
      this.mergeCondMatches(sheet, condMatches, styleIds, windowStyles);
    }

    return {
      sheet,
      rows: { start: rows.start, end: rows.end },
      cols,
      values,
      styleIds,
      styles: windowStyles,
      valueKinds: kinds,
      numberValues: numbers,
      stringPoolIds: stringIds,
      stringLocalIds: stringIndex,
      stringPoolUpdateIds,
      stringPoolUpdateValues,
      localStrings: strings,
      ffiInputBytes,
      ffiOutputBytes,
      ffiLargestTransferBytes,
      ffiBoundaryCalls,
      ffiCalls,
    };
  }

  conditionalRulesChanged(sheet: SheetId): void {
    this.condRulesSynced.delete(sheet);
    this.syncConditionalRules(sheet, this.handleOf(sheet));
  }

  resourceOwners(): ResourceOwnerBytes[] {
    let cachedStringBytes = 0;
    for (const value of this.stringCache.values()) cachedStringBytes += value.length * 2;
    let conditionalSignatureBytes = 0;
    for (const value of this.condRulesSynced.values())
      conditionalSignatureBytes += value.length * 2;
    return [
      {
        owner: "js.window.values-scratch",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.valuesScratch.length,
        measurement: "entry-count-only",
      },
      {
        owner: "js.window.string-cache",
        logicalBytes: cachedStringBytes,
        allocatedBytes: cachedStringBytes,
        entries: this.stringCache.size,
        measurement: "utf16-upper-bound",
      },
      {
        owner: "js.window.conditional-signatures",
        logicalBytes: conditionalSignatureBytes,
        allocatedBytes: conditionalSignatureBytes,
        entries: this.condRulesSynced.size,
        measurement: "utf16-upper-bound",
      },
    ];
  }

  clear(): void {
    this.valuesScratch = [];
    this.stringCache.clear();
    this.condRulesSynced.clear();
  }

  removeSheet(sheet: SheetId): void {
    this.condRulesSynced.delete(sheet);
  }

  private colsU32For(cols: readonly number[]): Uint32Array {
    const cached = this.colsU32Cache.get(cols);
    if (cached && cached.length === cols.length) {
      let sameColumns = true;
      for (let i = 0; i < cols.length; i++) {
        if (cached[i] !== cols[i]) {
          sameColumns = false;
          break;
        }
      }
      if (sameColumns) return cached;
    }

    const fresh = Uint32Array.from(cols);
    this.colsU32Cache.set(cols, fresh);
    return fresh;
  }

  private valuesFor(cellCount: number): CellScalar[] {
    if (this.valuesScratch.length !== cellCount) {
      this.valuesScratch = new Array<CellScalar>(cellCount);
    }
    const values = this.valuesScratch;
    if (cellCount > WINDOW_SCRATCH_MAX_REUSE) {
      this.valuesScratch = [];
    }
    return values;
  }

  private stylesFrom(styleDict: Uint32Array): CellStyle[] {
    const styles: CellStyle[] = new Array(styleDict.length);
    for (let index = 0; index < styleDict.length; index++) {
      styles[index] = this.styles.get(styleDict[index]!);
    }
    return styles;
  }

  private syncConditionalRules(sheet: SheetId, handle: number): number {
    const rules = this.sheetMeta(sheet).conditionalFormats ?? [];
    const packable = rules.filter((rule) => rule.range.sheet === sheet).slice(0, 32);
    const signature = conditionalRulesSignature(packable);
    if (this.condRulesSynced.get(sheet) === signature) {
      this.conditionalRuleInputBytes = 0;
      this.conditionalRuleLargestInputBytes = 0;
      return packable.length > 0 ? 1 : 0;
    }
    this.condRulesSynced.set(sheet, signature);

    const kinds = new Uint8Array(packable.length);
    const bounds = new Uint32Array(packable.length * 4);
    const nums = new Float64Array(packable.length);
    const strs: string[] = new Array(packable.length).fill("");
    const flags = new Uint8Array(packable.length);

    for (let i = 0; i < packable.length; i++) {
      const rule = packable[i]!;
      bounds[i * 4] = Math.min(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 1] = Math.min(rule.range.start.col, rule.range.end.col);
      bounds[i * 4 + 2] = Math.max(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 3] = Math.max(rule.range.start.col, rule.range.end.col);

      const when = rule.when;
      if (when.kind === "greaterThan") {
        kinds[i] = 0;
        nums[i] = when.value;
      } else if (when.kind === "lessThan") {
        kinds[i] = 1;
        nums[i] = when.value;
      } else if (when.kind === "equal") {
        if (typeof when.value === "number") {
          kinds[i] = 2;
          nums[i] = when.value;
        } else if (typeof when.value === "string") {
          kinds[i] = 3;
          strs[i] = when.value;
        } else {
          kinds[i] = 4;
        }
      } else {
        kinds[i] = 5;
        strs[i] = when.text;
        flags[i] = when.matchCase ? 1 : 0;
      }
    }
    const stringBytes = strs.reduce((bytes, value) => bytes + utf8ByteLength(value), 0);
    this.conditionalRuleInputBytes =
      kinds.byteLength + bounds.byteLength + nums.byteLength + flags.byteLength + stringBytes;
    this.conditionalRuleLargestInputBytes = Math.max(
      kinds.byteLength,
      bounds.byteLength,
      nums.byteLength,
      flags.byteLength,
      stringBytes,
    );
    this.wasm.setConditionalRules(handle, kinds, bounds, nums, strs, flags);
    return (packable.length > 0 ? 1 : 0) | 2;
  }

  private mergeCondMatches(
    sheet: SheetId,
    condMatches: Uint32Array,
    styleIds: Uint32Array,
    styles: CellStyle[],
  ): void {
    const rules = (this.sheetMeta(sheet).conditionalFormats ?? []).filter(
      (rule) => rule.range.sheet === sheet,
    );
    const mergedIds = new Map<number, number>();

    for (let i = 0; i < condMatches.length; i++) {
      const fullMask = condMatches[i]!;
      if (fullMask === 0) continue;

      const base = styleIds[i]!;
      const comboKey = base * 0x1_0000_0000 + fullMask;
      let local = mergedIds.get(comboKey);
      if (local === undefined) {
        let merged = styles[base] ?? {};
        for (let bit = 0, mask = fullMask; mask !== 0; bit++, mask >>>= 1) {
          if (mask & 1) merged = { ...merged, ...rules[bit]?.style };
        }
        local = styles.length;
        styles.push(merged);
        mergedIds.set(comboKey, local);
      }
      styleIds[i] = local;
    }
  }

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
  }

  private sheetMeta(sheet: SheetId) {
    const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
    if (!meta) throw new Error(`unknown sheet: ${sheet}`);
    return meta;
  }
}

function conditionalRulesSignature(rules: readonly ConditionalFormatRule[]): string {
  let signature = String(rules.length);
  for (const rule of rules) {
    const r0 = Math.min(rule.range.start.row, rule.range.end.row);
    const c0 = Math.min(rule.range.start.col, rule.range.end.col);
    const r1 = Math.max(rule.range.start.row, rule.range.end.row);
    const c1 = Math.max(rule.range.start.col, rule.range.end.col);
    signature += `|${r0},${c0},${r1},${c1}`;

    const when = rule.when;
    if (when.kind === "greaterThan" || when.kind === "lessThan") {
      signature += `|${when.kind}:${when.value}`;
    } else if (when.kind === "equal") {
      const value = when.value;
      signature +=
        typeof value === "string" ? `|equal:s${value.length}:${value}` : `|equal:${value}`;
    } else {
      signature += `|contains:${when.matchCase ? 1 : 0}:${when.text.length}:${when.text}`;
    }
  }
  return signature;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
