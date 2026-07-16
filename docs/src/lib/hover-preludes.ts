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
  'import type { CellAddress, CellScalar, CellStyle, ChangeEvent, Column, ColumnarData, DataSource, Grid, GridOptions, Selection, SheetId, Theme, Transaction, Workbook } from "@sheetwrite/core";';

export const HOVER_PRELUDES: ReadonlyMap<string, string> = new Map([
  [
    "core",
    [
      CORE_TYPES,
      "declare const host: HTMLElement;",
      "declare const grid: Grid;",
      "declare const workbook: Workbook;",
      "declare const data: ColumnarData;",
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
