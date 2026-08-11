import type { SourceSnapshot } from "@sheetwrite/wasm";
import type { StyleDictionary } from "../style-dictionary.js";
import type { CellScalar, CellStyle, ConditionalFormatRule } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { Workbook } from "../types/document.js";
import type { ResourceOwnerBytes, VisibleWindowView } from "../types/store.js";
import type { ConsumingWindowView, RecomputingCellStore } from "./wasm-contract.js";
import { KIND_BOOL, KIND_EMPTY, KIND_NUMBER, KIND_STRING, NO_STRING } from "./wire-tags.js";

const EMPTY_COND_MATCHES = new Uint32Array(0);
// Kept independent from the worker cache cap so each thread can be tuned separately.
const STRING_CACHE_CAP = 65_536;
const WINDOW_SCRATCH_MAX_REUSE = 65_536;
const CONDITIONAL_MASK_BITS = Uint32Array.BYTES_PER_ELEMENT * 8;
const UTF8_DECODER = new TextDecoder();

const WINDOW_PACKED_MAGIC = 0x3157_4e53;
const WINDOW_PACKED_VERSION = 1;
const WINDOW_PACKED_HEADER_BYTES = 10 * Uint32Array.BYTES_PER_ELEMENT;

export interface DecodedPackedWindow {
  readonly nRows: number;
  readonly nCols: number;
  readonly kinds: Uint8Array;
  readonly numbers: Float64Array;
  readonly stringIds: Uint32Array;
  readonly stringIndex: Int32Array;
  readonly styleIds: Uint32Array;
  readonly styleDict: Uint32Array;
  readonly condMatches: Uint32Array;
  readonly localStringCount: number;
}

/** Validates the internal packed layout before exposing zero-copy owned-buffer views. */
export function decodePackedWindow(packed: Uint8Array): DecodedPackedWindow {
  if (packed.byteLength < WINDOW_PACKED_HEADER_BYTES) {
    throw new Error("Sheetwrite: truncated packed window");
  }
  const header = new DataView(packed.buffer, packed.byteOffset, WINDOW_PACKED_HEADER_BYTES);
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);
  const headerBytes = header.getUint32(8, true);
  const totalBytes = header.getUint32(12, true);
  const nRows = header.getUint32(16, true);
  const nCols = header.getUint32(20, true);
  const cellCount = header.getUint32(24, true);
  const styleCount = header.getUint32(28, true);
  const condCount = header.getUint32(32, true);
  const localStringCount = header.getUint32(36, true);
  if (
    magic !== WINDOW_PACKED_MAGIC ||
    version !== WINDOW_PACKED_VERSION ||
    headerBytes !== WINDOW_PACKED_HEADER_BYTES
  ) {
    throw new Error("Sheetwrite: invalid packed window header");
  }
  if (totalBytes > packed.byteLength) {
    throw new Error("Sheetwrite: truncated packed window");
  }
  if (totalBytes !== packed.byteLength) {
    throw new Error("Sheetwrite: invalid packed window length");
  }
  const expectedCellCount = nRows * nCols;
  if (!Number.isSafeInteger(expectedCellCount) || expectedCellCount !== cellCount) {
    throw new Error("Sheetwrite: invalid packed window dimensions");
  }
  if (condCount !== 0 && condCount !== cellCount) {
    throw new Error("Sheetwrite: invalid packed conditional-match length");
  }

  const kindsStart = WINDOW_PACKED_HEADER_BYTES;
  const numbersStart = alignTo8(checkedPackedEnd(kindsStart, cellCount));
  const stringIdsStart = checkedPackedEnd(numbersStart, cellCount * Float64Array.BYTES_PER_ELEMENT);
  const stringIndexStart = checkedPackedEnd(
    stringIdsStart,
    cellCount * Uint32Array.BYTES_PER_ELEMENT,
  );
  const styleIdsStart = checkedPackedEnd(
    stringIndexStart,
    cellCount * Int32Array.BYTES_PER_ELEMENT,
  );
  const styleDictStart = checkedPackedEnd(styleIdsStart, cellCount * Uint32Array.BYTES_PER_ELEMENT);
  const condMatchesStart = checkedPackedEnd(
    styleDictStart,
    styleCount * Uint32Array.BYTES_PER_ELEMENT,
  );
  const expectedBytes = checkedPackedEnd(
    condMatchesStart,
    condCount * Uint32Array.BYTES_PER_ELEMENT,
  );
  if (expectedBytes !== totalBytes) {
    throw new Error("Sheetwrite: invalid packed window layout");
  }

  const base = packed.byteOffset;
  if (
    (base + numbersStart) % Float64Array.BYTES_PER_ELEMENT !== 0 ||
    (base + stringIdsStart) % Uint32Array.BYTES_PER_ELEMENT !== 0
  ) {
    throw new Error("Sheetwrite: invalid packed window alignment");
  }
  return {
    nRows,
    nCols,
    kinds: new Uint8Array(packed.buffer, base + kindsStart, cellCount),
    numbers: new Float64Array(packed.buffer, base + numbersStart, cellCount),
    stringIds: new Uint32Array(packed.buffer, base + stringIdsStart, cellCount),
    stringIndex: new Int32Array(packed.buffer, base + stringIndexStart, cellCount),
    styleIds: new Uint32Array(packed.buffer, base + styleIdsStart, cellCount),
    styleDict: new Uint32Array(packed.buffer, base + styleDictStart, styleCount),
    condMatches: new Uint32Array(packed.buffer, base + condMatchesStart, condCount),
    localStringCount,
  };
}

function checkedPackedEnd(start: number, byteLength: number): number {
  const end = start + byteLength;
  if (!Number.isSafeInteger(end) || start < 0 || byteLength < 0) {
    throw new Error("Sheetwrite: invalid packed window layout");
  }
  return end;
}

function alignTo8(value: number): number {
  return Math.ceil(value / Float64Array.BYTES_PER_ELEMENT) * Float64Array.BYTES_PER_ELEMENT;
}

export interface PersistedCellView {
  readonly coordinates: Uint32Array;
  readonly values: readonly CellScalar[];
  readonly styles: readonly CellStyle[];
  readonly formulaOffsets: Uint32Array;
  readonly formulaSources: readonly string[];
  readonly referenceOffsets: Uint32Array;
  readonly referenceTargets: Uint32Array;
}

/** Exact internal diagnostics attached to each decoded visible-window read. */
interface VisibleWindowResourceMetrics {
  readonly ffiCalls: number;
  readonly ffiBoundaryCalls: number;
  readonly ffiInputBytes: number;
  readonly ffiOutputBytes: number;
  readonly ffiLargestTransferBytes: number;
  /** Fresh JS-owned packed-buffer allocation plus an optional local-string array. */
  readonly ffiOutputAllocationEvents: number;
}

export type InstrumentedVisibleWindowView = VisibleWindowView & VisibleWindowResourceMetrics;

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
  spillDerivedMask(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): Uint8Array {
    return this.wasm.spillDerivedMask(
      this.handleOf(sheet),
      rows.start,
      rows.end,
      this.colsU32For(cols),
    );
  }
  captureSourcesForRows(
    sheet: SheetId,
    rows: Uint32Array,
    cols: readonly number[],
  ): SourceSnapshot | undefined {
    if (rows.length === 0 || cols.length === 0) return undefined;
    return this.wasm.captureSourcesForRows(this.handleOf(sheet), rows, this.colsU32For(cols));
  }

  capturePersistedCells(sheet: SheetId): PersistedCellView {
    const packed = this.wasm.persistedCellData(this.handleOf(sheet));
    const coordinates: number[] = [];
    const values: CellScalar[] = [];
    const styles: CellStyle[] = [];
    const formulaOffsets: number[] = [];
    const formulaSources: string[] = [];
    const referenceOffsets: number[] = [];
    const referenceTargets: number[] = [];
    const stringIds: number[] = [];
    const stringOffsets: number[] = [];
    let cursor = 0;
    while (cursor < packed.length) {
      if (packed.length - cursor < 8) {
        throw new Error("Sheetwrite: truncated persisted-cell projection");
      }
      const row = packed[cursor++]!;
      const col = packed[cursor++]!;
      const kind = packed[cursor++]!;
      const number = packed[cursor++]!;
      const styleId = packed[cursor++]!;
      const stringId = packed[cursor++]!;
      const sourceKind = packed[cursor++]!;
      const sourceLength = packed[cursor++]!;
      if (
        !Number.isSafeInteger(row) ||
        row < 0 ||
        !Number.isSafeInteger(col) ||
        col < 0 ||
        !Number.isSafeInteger(kind) ||
        kind < 0 ||
        !Number.isSafeInteger(styleId) ||
        styleId < 0 ||
        !Number.isSafeInteger(sourceKind) ||
        !Number.isSafeInteger(sourceLength) ||
        sourceLength < 0
      ) {
        throw new Error("Sheetwrite: invalid persisted-cell projection");
      }
      const offset = values.length;
      coordinates.push(row, col);
      values.push(kind === KIND_NUMBER ? number : kind === KIND_BOOL ? number !== 0 : null);
      styles.push(this.styles.get(styleId));
      if (kind === KIND_STRING && stringId >= 0) {
        if (!Number.isSafeInteger(stringId)) {
          throw new Error("Sheetwrite: invalid persisted string id");
        }
        stringIds.push(stringId);
        stringOffsets.push(offset);
      }
      if (sourceKind === 1) {
        const wordCount = Math.ceil(sourceLength / 4);
        if (cursor + wordCount > packed.length) {
          throw new Error("Sheetwrite: truncated persisted formula source");
        }
        const bytes = new Uint8Array(sourceLength);
        for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
          const word = packed[cursor++]!;
          if (!Number.isSafeInteger(word) || word < 0 || word > 0xffff_ffff) {
            throw new Error("Sheetwrite: invalid persisted formula source");
          }
          for (let byte = 0; byte < 4; byte++) {
            const byteIndex = wordIndex * 4 + byte;
            if (byteIndex < bytes.length) bytes[byteIndex] = (word >>> (byte * 8)) & 0xff;
          }
        }
        formulaOffsets.push(offset);
        formulaSources.push(UTF8_DECODER.decode(bytes));
      } else if (sourceKind === 2) {
        if (sourceLength !== 3 || cursor + 3 > packed.length) {
          throw new Error("Sheetwrite: invalid persisted reference source");
        }
        const targetSheet = packed[cursor++]!;
        const targetRow = packed[cursor++]!;
        const targetCol = packed[cursor++]!;
        if (
          !Number.isSafeInteger(targetSheet) ||
          targetSheet < 0 ||
          !Number.isSafeInteger(targetRow) ||
          targetRow < 0 ||
          !Number.isSafeInteger(targetCol) ||
          targetCol < 0
        ) {
          throw new Error("Sheetwrite: invalid persisted reference target");
        }
        referenceOffsets.push(offset);
        referenceTargets.push(targetSheet, targetRow, targetCol);
      } else if (sourceKind !== 0 || sourceLength !== 0) {
        throw new Error("Sheetwrite: invalid persisted source kind");
      }
    }
    if (stringIds.length > 0) {
      const texts = this.wasm.poolStrings(Uint32Array.from(stringIds));
      if (texts.length !== stringOffsets.length) {
        throw new Error("Sheetwrite: invalid persisted string projection");
      }
      for (let index = 0; index < texts.length; index++) {
        values[stringOffsets[index]!] = texts[index] ?? null;
      }
    }
    return {
      coordinates: Uint32Array.from(coordinates),
      values,
      styles,
      formulaOffsets: Uint32Array.from(formulaOffsets),
      formulaSources,
      referenceOffsets: Uint32Array.from(referenceOffsets),
      referenceTargets: Uint32Array.from(referenceTargets),
    };
  }

  spillOwnerCoordinates(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): Uint32Array {
    return this.wasm.spillOwnerCoordinates(
      this.handleOf(sheet),
      rows.start,
      rows.end,
      this.colsU32For(cols),
    );
  }

  read(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    order: Uint32Array | undefined,
    applyConditionalRules: boolean,
  ): InstrumentedVisibleWindowView {
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
    let expectedRows: number;
    if (order) {
      const dataRows = order.subarray(rows.start, Math.min(rows.end, order.length));
      expectedRows = dataRows.length;
      ffiInputBytes += dataRows.byteLength;
      ffiLargestTransferBytes = Math.max(ffiLargestTransferBytes, dataRows.byteLength);
      view = this.wasm.getWindowRows(handle, dataRows, colsU32) as ConsumingWindowView;
    } else {
      expectedRows = Math.max(0, rows.end - rows.start);
      view = this.wasm.getWindow(handle, rows.start, rows.end, colsU32) as ConsumingWindowView;
    }
    ffiCalls += 1;

    let packed: Uint8Array;
    let decoded: DecodedPackedWindow;
    let strings: string[];
    try {
      packed = view.takePacked();
      decoded = decodePackedWindow(packed);
      if (
        decoded.nCols !== colsU32.length ||
        decoded.nRows > expectedRows ||
        (order !== undefined && decoded.nRows !== expectedRows) ||
        (hasCondRules &&
          decoded.kinds.length > 0 &&
          decoded.condMatches.length !== decoded.kinds.length)
      ) {
        throw new Error("Sheetwrite: invalid packed window shape");
      }
      strings = decoded.localStringCount === 0 ? [] : view.takeStrings();
      if (strings.length !== decoded.localStringCount) {
        throw new Error("Sheetwrite: invalid packed window strings");
      }
      for (let index = 0; index < decoded.kinds.length; index++) {
        const kind = decoded.kinds[index];
        const local = decoded.stringIndex[index]!;
        const pool = decoded.stringIds[index]!;
        if (
          (kind !== KIND_EMPTY &&
            kind !== KIND_NUMBER &&
            kind !== KIND_STRING &&
            kind !== KIND_BOOL) ||
          local < -1 ||
          local >= strings.length ||
          (local >= 0 && (kind !== KIND_STRING || pool !== NO_STRING)) ||
          (kind === KIND_STRING && pool === NO_STRING && local < 0)
        ) {
          throw new Error("Sheetwrite: invalid packed window value");
        }
      }
    } finally {
      view.free();
    }
    const { kinds, numbers, stringIds, stringIndex, styleIds, styleDict } = decoded;
    const condMatches = hasCondRules ? decoded.condMatches : EMPTY_COND_MATCHES;
    const stringOutputAllocationEvents = decoded.localStringCount === 0 ? 0 : 1;
    let ffiBoundaryCalls = ffiCalls + 2 + stringOutputAllocationEvents;
    let localStringBytes = 0;
    for (const value of strings) localStringBytes += utf8ByteLength(value);
    let ffiOutputBytes = packed.byteLength + localStringBytes;
    const ffiOutputAllocationEvents = 1 + stringOutputAllocationEvents;
    ffiLargestTransferBytes = Math.max(
      ffiLargestTransferBytes,
      packed.byteLength,
      localStringBytes,
    );

    let stringPoolUpdateIds: Uint32Array | undefined;
    let stringPoolUpdateValues: string[] | undefined;
    let missingIdSet: Set<number> | null = null;
    if (this.stringCache.size >= STRING_CACHE_CAP) this.stringCache.clear();

    for (let i = 0; i < stringIds.length; i++) {
      const id = stringIds[i];
      if (id !== undefined && id !== NO_STRING && !this.stringCache.has(id)) {
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
        this.stringCache.set(stringPoolUpdateIds[i] ?? NO_STRING, stringPoolUpdateValues[i] ?? "");
      }
    }

    const values = this.valuesFor(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) {
        values[i] = numbers[i] ?? null;
      } else if (kinds[i] === KIND_BOOL) {
        values[i] = (numbers[i] ?? 0) !== 0;
      } else if (kinds[i] === KIND_STRING) {
        const poolId = stringIds[i] ?? NO_STRING;
        if (poolId !== NO_STRING) {
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
    this.mergeHyperlinkStyles(sheet, rows, cols, order, styleIds, windowStyles);
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
      ffiOutputAllocationEvents,
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
    const packable = rules
      .filter((rule) => rule.range.sheet === sheet)
      .slice(0, CONDITIONAL_MASK_BITS);
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
      } else if (when.kind === "contains") {
        kinds[i] = 5;
        strs[i] = when.text;
        flags[i] = when.matchCase ? 1 : 0;
      } else {
        kinds[i] = 6;
        strs[i] = when.source;
      }
      if (rule.stopIfTrue) flags[i] = (flags[i] ?? 0) | 2;
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

  private mergeHyperlinkStyles(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    order: Uint32Array | undefined,
    styleIds: Uint32Array,
    styles: CellStyle[],
  ): void {
    const hyperlinks = this.sheetMeta(sheet).hyperlinks ?? [];
    if (hyperlinks.length === 0 || cols.length === 0 || rows.end <= rows.start) return;
    const colPositions = new Map<number, number>();
    for (let index = 0; index < cols.length; index++) colPositions.set(cols[index]!, index);
    const mergedIds = new Map<string, number>();
    const rowCount = Math.min(rows.end - rows.start, Math.floor(styleIds.length / cols.length));
    for (const hyperlink of hyperlinks) {
      if (hyperlink.range.sheet !== sheet) continue;
      const r0 = Math.min(hyperlink.range.start.row, hyperlink.range.end.row);
      const r1 = Math.max(hyperlink.range.start.row, hyperlink.range.end.row);
      const c0 = Math.min(hyperlink.range.start.col, hyperlink.range.end.col);
      const c1 = Math.max(hyperlink.range.start.col, hyperlink.range.end.col);
      const linkStyle: CellStyle = {
        color: "#0563C1",
        underline: true,
        ...hyperlink.style,
      };
      const styleKey = JSON.stringify(linkStyle);
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const dataRow = order?.[rows.start + rowIndex] ?? rows.start + rowIndex;
        if (dataRow < r0 || dataRow > r1) continue;
        for (const [col, colIndex] of colPositions) {
          if (col < c0 || col > c1) continue;
          const offset = rowIndex * cols.length + colIndex;
          const base = styleIds[offset]!;
          const key = `${base}:${styleKey}`;
          let merged = mergedIds.get(key);
          if (merged === undefined) {
            merged = styles.length;
            styles.push({ ...(styles[base] ?? {}), ...linkStyle });
            mergedIds.set(key, merged);
          }
          styleIds[offset] = merged;
        }
      }
    }
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
        for (let bit = Math.min(rules.length, CONDITIONAL_MASK_BITS) - 1; bit >= 0; bit--) {
          if ((fullMask & (1 << bit)) !== 0) merged = { ...merged, ...rules[bit]?.style };
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
    signature += `|${r0},${c0},${r1},${c1}|stop:${rule.stopIfTrue ? 1 : 0}`;

    const when = rule.when;
    if (when.kind === "greaterThan" || when.kind === "lessThan") {
      signature += `|${when.kind}:${when.value}`;
    } else if (when.kind === "equal") {
      const value = when.value;
      signature +=
        typeof value === "string" ? `|equal:s${value.length}:${value}` : `|equal:${value}`;
    } else if (when.kind === "contains") {
      signature += `|contains:${when.matchCase ? 1 : 0}:${when.text.length}:${when.text}`;
    } else {
      signature += `|formula:${when.source.length}:${when.source}`;
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
