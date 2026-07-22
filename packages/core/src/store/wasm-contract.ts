import type { CellStore, RangeSnapshot, SourceSnapshot, WindowView } from "@sheetwrite/wasm";

/** Internal typed subset added by the generated WASM store at runtime. */
export type RecomputingCellStore = CellStore & {
  recompute(sheet: number): void;
  recomputeChanged(): void;
  setSheetName(sheet: number, id: string, name: string): void;
  renameSheet(sheet: number, id: string, name: string): boolean;
  removeSheet(sheet: number): boolean;
  isSheetAlive(sheet: number): boolean;
  insertCols(sheet: number, at: number, count: number): void;
  formulaSource(sheet: number, row: number, col: number): string | undefined;
  referenceTarget(sheet: number, row: number, col: number): Uint32Array | undefined;
  setSpillBlockers(sheet: number, bounds: Uint32Array): boolean;
  spillAnchorRow(sheet: number, row: number, col: number): number;
  spillAnchorCol(sheet: number, row: number, col: number): number;
  spillDerivedMask(sheet: number, rowStart: number, rowEnd: number, cols: Uint32Array): Uint8Array;
  spillDerivedMaskForRows(sheet: number, rows: Uint32Array, cols: Uint32Array): Uint8Array;
  spillOwnerCoordinates(
    sheet: number,
    rowStart: number,
    rowEnd: number,
    cols: Uint32Array,
  ): Uint32Array;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  recomputeVolatile(serial: number): void;
  setNamedRange(
    name: string,
    scope: number,
    sheet: number,
    rowStart: number,
    colStart: number,
    rowEnd: number,
    colEnd: number,
  ): boolean;
  removeNamedRange(name: string, scope: number): boolean;
  setTable(
    id: string,
    name: string,
    sheet: number,
    rowStart: number,
    colStart: number,
    rowEnd: number,
    colEnd: number,
    headerRow: boolean,
    totalsRow: boolean,
    columnIds: string[],
    columnNames: string[],
  ): boolean;
  removeTable(id: string): boolean;
  setColumnStringsPacked(
    sheet: number,
    col: number,
    startRow: number,
    buf: string,
    utf16Lens: Uint32Array,
    style: number,
  ): void;
  removeCols(sheet: number, at: number, count: number): void;
  poolStrings(ids: Uint32Array): string[];
  styleIdAt(sheet: number, row: number, col: number): number;
  setConditionalRules(
    sheet: number,
    kinds: Uint8Array,
    bounds: Uint32Array,
    nums: Float64Array,
    strs: string[],
    flags: Uint8Array,
  ): void;
  setBlock(
    sheet: number,
    startRow: number,
    startCol: number,
    rows: number,
    cols: number,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
    formulaOffsets: Uint32Array,
    formulaSources: string[],
    referenceOffsets: Uint32Array,
    referenceTargets: Uint32Array,
  ): number;
  setSparseBlock(
    sheet: number,
    startRow: number,
    startCol: number,
    rows: number,
    cols: number,
    offsets: Uint32Array,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
    formulaOffsets: Uint32Array,
    formulaSources: string[],
    referenceOffsets: Uint32Array,
    referenceTargets: Uint32Array,
  ): number;
  clearRange(
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    contents: boolean,
    style: boolean,
  ): boolean;
  rangeStyleIds(sheet: number, r0: number, c0: number, r1: number, c1: number): Uint32Array;
  remapRangeStyles(
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    oldIds: Uint32Array,
    newIds: Uint32Array,
  ): boolean;
  persistedCellData(sheet: number): Float64Array;
  captureRange(
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ): RangeSnapshot | undefined;
  captureSources(
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ): SourceSnapshot | undefined;
  captureSourcesForRows(
    sheet: number,
    rows: Uint32Array,
    cols: Uint32Array,
  ): SourceSnapshot | undefined;
  captureReferences(sheet: number, maxEntries: number): SourceSnapshot | undefined;
  referencesTargeting(targetSheet: number, maxEntries: number): Uint32Array | undefined;
  snapshotNumbers(snapshot: RangeSnapshot): Float64Array;
  snapshotTexts(snapshot: RangeSnapshot): string[];
  restoreRange(sheet: number, r0: number, c0: number, snapshot: RangeSnapshot): boolean;
  addPagedSheet(
    columns: number,
    rows: number,
    chunkRows: number,
    byteBudget: number,
    maxDirtyCells: number,
  ): number;
  isPaged(sheet: number): boolean;
  pagedStats(sheet: number): Float64Array;
  memoryStats(): Float64Array;
  wasmCommittedBytes(): number;
  formulaMatrixResourceStats(): Float64Array;
  resetFormulaMatrixResourceStats(): void;
  compactStringStorage(): void;
  cellState(sheet: number, row: number, col: number): number;
  canDirtyCell(sheet: number, row: number, col: number): boolean;
  pagedDirtyCoordinates(sheet: number): Float64Array;
  dirtyRevision(sheet: number, row: number, col: number): bigint;
  beginMutation(): bigint;
  endMutation(): void;
  acknowledgeRevision(revision: bigint): void;
  isFullyLoaded(sheet: number): boolean;
  rangeFullyLoaded(sheet: number, r0: number, c0: number, r1: number, c1: number): boolean;
  columnsFullyLoaded(sheet: number, startRow: number, endRow: number, cols: Uint32Array): boolean;
  pinRange(sheet: number, startRow: number, endRow: number, cols: Uint32Array): void;
  beginPageLoad(): void;
  endPageLoad(): void;
  hydratePageNumbers(
    sheet: number,
    col: number,
    startRow: number,
    values: Float64Array,
    style: number,
    protectedOffsets: Uint32Array,
  ): void;
  hydratePageStringsPacked(
    sheet: number,
    col: number,
    startRow: number,
    buf: string,
    utf16Lens: Uint32Array,
    style: number,
    protectedOffsets: Uint32Array,
  ): void;
  markRangeClean(
    sheet: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): void;
  markCellCleanRevision(sheet: number, row: number, col: number, revision: bigint): boolean;
};

/** Consuming accessors transfer packed arrays out of one WASM window exactly once. */
export type ConsumingWindowView = WindowView & {
  takeKinds(): Uint8Array;
  takeNumbers(): Float64Array;
  takeStringIndex(): Int32Array;
  takeStringIds(): Uint32Array;
  takeStyleIndex(): Uint32Array;
  takeStyleDict(): Uint32Array;
  takeStrings(): string[];
  takeCondMatches(): Uint32Array;
};
