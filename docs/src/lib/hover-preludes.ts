/**
 * Hidden typed preludes for documentation code fences.
 *
 * Partial snippets reference host state (`grid`, `workbook`, …) that no fence
 * declares, so standalone analysis degrades those hovers to `any`. A fence
 * opts into a named prelude via ```ts prelude="core" — the prelude text is
 * injected for type analysis only, never rendered, and every hover position is
 * mapped back to the original source. The TypeScript compiler stays the only
 * source of type truth; preludes only supply declarations.
 */

const CORE_TYPES =
  'import type { AggregateOp, ApplyTransactionResult, CellAddress, CellBorders, CellPaintContext, CellRenderer, CellScalar, CellStyle, ChangeEvent, Column, ColumnarData, ColumnFilter, DataSource, DataValidationRule, DocumentOp, Grid, GridActions, GridConfig, GridEvents, GridOptions, HighlightRange, MutationPolicyMode, PersistenceAdapter, ProtectedRange, ProtectionResolver, ReplaceResult, ResolvedCell, RowGroup, SearchOptions, SearchResult, Selection, SheetId, SortKey, Store, SyncCoordinator, Theme, Transaction, VisibleWindowView, Workbook, WorkbookSnapshot } from "@sheetwrite/core";';
const CORE_VALUES =
  'import { createGrid, createGridFromSnapshot, initSheetwrite, validateWorkbookSnapshot } from "@sheetwrite/core";';
const CORE_PRELUDE = [
  CORE_TYPES,
  CORE_VALUES,
  "declare const host: HTMLElement;",
  "declare const grid: Grid;",
  "declare const workbook: Workbook;",
  "declare const data: ColumnarData;",
  "declare const store: Store;",
].join("\n");
const FRAMEWORK_PRELUDE = [
  CORE_PRELUDE,
  'import type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";',
  "declare const columns: readonly SimpleColumn<Record<string, CellScalar>>[];",
  "declare const rows: readonly Record<string, CellScalar>[];",
  "declare const datasource: DataSource;",
  "declare const gridRef: Grid | null;",
  "declare const persist: (transaction: Transaction) => void;",
  "declare const observe: (grid: Grid, generation: number, reason: string) => void;",
  "declare const connect: (grid: Grid) => void;",
  'declare const operationQueue: { push(...patches: Transaction["patches"]): void };',
].join("\n");

export const HOVER_PRELUDES: ReadonlyMap<string, string> = new Map([
  ["core", CORE_PRELUDE],
  ["framework", FRAMEWORK_PRELUDE],
  [
    "react",
    [FRAMEWORK_PRELUDE, 'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/react";'].join(
      "\n",
    ),
  ],
  [
    "vue",
    [FRAMEWORK_PRELUDE, 'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/vue";'].join("\n"),
  ],
  [
    "svelte",
    [FRAMEWORK_PRELUDE, 'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/svelte";'].join(
      "\n",
    ),
  ],
  [
    "collaboration",
    [
      CORE_PRELUDE,
      "declare const adapter: PersistenceAdapter;",
      "declare const persistenceAdapter: PersistenceAdapter;",
      "declare const sync: SyncCoordinator;",
      "declare const snapshot: WorkbookSnapshot;",
      "declare const loadedSnapshot: WorkbookSnapshot;",
      "declare const documentId: string;",
      "declare const signal: AbortSignal;",
      "declare const saveButton: HTMLButtonElement;",
      "declare const remoteOperationSource: AsyncIterable<DocumentOp>;",
      "declare const showConflict: (conflict: unknown) => void;",
      "declare const requestFreshSnapshot: () => Promise<void>;",
      "declare const pendingStorage: { remove(documentId: string): Promise<void> };",
    ].join("\n"),
  ],
  [
    "theming",
    [
      CORE_PRELUDE,
      "declare const darkBtn: HTMLButtonElement;",
      "declare const stage: HTMLElement;",
      "declare const DARK: Partial<Theme>;",
    ].join("\n"),
  ],
  [
    "architecture",
    [
      CORE_PRELUDE,
      "declare const payload: string;",
      "declare function computeWindow(index: unknown, contentTop: number, viewportHeight: number, overscan: number): { start: number; end: number };",
      "declare function toContent(scrollTop: number): number;",
      "declare function toScroll(contentOffset: number): number;",
    ].join("\n"),
  ],
  [
    "xlsx",
    [
      CORE_PRELUDE,
      'import type { SimpleColumn } from "@sheetwrite/core/adapter";',
      "declare const csvText: string;",
      "declare const columns: readonly SimpleColumn<Record<string, CellScalar>>[];",
      "declare const abortController: AbortController;",
      "declare const signal: AbortSignal;",
      "declare const sheet: SheetId;",
      "declare const range: { start: CellAddress; end: CellAddress };",
    ].join("\n"),
  ],
  [
    "wasm",
    [
      CORE_PRELUDE,
      "declare const source: BufferSource | URL | string | Request | WebAssembly.Module;",
    ].join("\n"),
  ],
]);

export function resolveHoverPrelude(name: string): string {
  const prelude = HOVER_PRELUDES.get(name);
  if (prelude === undefined) {
    throw new Error(
      `Unknown hover prelude "${name}"; known preludes: ${[...HOVER_PRELUDES.keys()].join(", ")}`,
    );
  }
  return prelude;
}

export interface OriginalPosition {
  line: number;
  character: number;
  start: number;
}

export interface PreludeInjection {
  /** Source fed to type analysis; the prelude occupies whole lines. */
  analysisSource: string;
  /**
   * Maps an analysis-source position back to the original source. Returns
   * null for positions inside the injected prelude lines.
   */
  toOriginal(position: { line: number; character: number }): OriginalPosition | null;
}

function lineStartOffsets(source: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

const SCRIPT_OPEN_TAG = /<script\b[^>]*>/i;

/**
 * Injects a prelude as complete lines. For plain TS/TSX the prelude is
 * prepended; for Vue/Svelte it is inserted directly after the first script
 * open tag, moving any same-line script content onto its own following line
 * so all mapping stays line- and column-exact.
 */
export function injectHoverPrelude(
  source: string,
  language: "ts" | "tsx" | "vue" | "svelte",
  prelude: string,
): PreludeInjection {
  const originalOffsets = lineStartOffsets(source);
  const original = (line: number, character: number): OriginalPosition => ({
    line,
    character,
    start: (originalOffsets[line] ?? 0) + character,
  });
  const preludeLines = prelude.split("\n").length;

  if (language === "ts" || language === "tsx") {
    return {
      analysisSource: `${prelude}\n${source}`,
      toOriginal(position) {
        if (position.line < preludeLines) return null;
        return original(position.line - preludeLines, position.character);
      },
    };
  }

  const tag = SCRIPT_OPEN_TAG.exec(source);
  if (tag === null) {
    // Template-only snippet: synthesize a script block so the prelude can
    // type template expressions; the whole synthetic range maps to null.
    const scriptOpen = language === "vue" ? '<script setup lang="ts">' : '<script lang="ts">';
    const syntheticLines = preludeLines + 2;
    return {
      analysisSource: `${scriptOpen}\n${prelude}\n</script>\n${source}`,
      toOriginal(position) {
        if (position.line < syntheticLines) return null;
        return original(position.line - syntheticLines, position.character);
      },
    };
  }

  const insertAt = tag.index + tag[0].length;
  const before = source.slice(0, insertAt);
  const after = source.slice(insertAt);
  const tagLine = before.split("\n").length - 1;
  const tagColumn = insertAt - (originalOffsets[tagLine] ?? 0);
  // `after` starts on its own line, so injected lines are exactly
  // [tagLine + 1, tagLine + preludeLines] and every original position keeps
  // whole-line granularity.
  const insertedLines = preludeLines + 1;
  const remainderLine = tagLine + preludeLines + 1;

  return {
    analysisSource: `${before}\n${prelude}\n${after}`,
    toOriginal(position) {
      if (position.line < tagLine) return original(position.line, position.character);
      if (position.line === tagLine) {
        return position.character <= tagColumn ? original(position.line, position.character) : null;
      }
      if (position.line < remainderLine) return null;
      if (position.line === remainderLine) {
        return original(tagLine, position.character + tagColumn);
      }
      return original(position.line - insertedLines, position.character);
    },
  };
}
