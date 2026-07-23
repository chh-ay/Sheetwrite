import type { CellRef } from "./selection.js";

/** Column index (0-based) → A1 column label (0 → "A", 26 → "AA"). */
export function colToA1(col: number): string {
  let c = col + 1;
  let out = "";

  while (c > 0) {
    const rem = (c - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    c = Math.floor((c - 1) / 26);
  }

  return out;
}

/** A1 column label → 0-based column index (inverse of {@link colToA1}). */
export function labelToCol(label: string): number {
  let c = 0;
  for (let i = 0; i < label.length; i++) c = c * 26 + (label.charCodeAt(i) - 64);
  return c - 1;
}

/** 0-based (row, col) → A1 cell reference (0, 0 → "A1"). */
export function cellA1(row: number, col: number): string {
  return `${colToA1(col)}${row + 1}`;
}

/** Two cell corners → A1 range ("A1:B3"), collapsing to a single ref when equal. */
export function rangeA1(a: CellRef, b: CellRef): string {
  if (a.row === b.row && a.col === b.col) return cellA1(a.row, a.col);

  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col);
  const c1 = Math.max(a.col, b.col);

  return `${cellA1(r0, c0)}:${cellA1(r1, c1)}`;
}

/**
 * Shift relative A1 references in a formula by (dRow, dCol) — used when a
 * formula is filled into other cells. Absolute parts ($A, A$1) stay fixed, and
 * tokens preceded by an alphanumeric (function names, identifiers) are skipped.
 */
export function shiftA1Refs(src: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return src;

  return src.replace(
    /(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)/g,
    (
      match: string,
      ca: string,
      letters: string,
      ra: string,
      digits: string,
      offset: number,
      full: string,
    ): string => {
      const prev = offset > 0 ? full.charAt(offset - 1) : "";
      if (prev === "_" || /[A-Za-z0-9]/.test(prev)) return match;

      let col = labelToCol(letters.toUpperCase());
      let rowNum = Number(digits);

      if (!ca) col = Math.max(0, col + dCol);
      if (!ra) rowNum = Math.max(1, rowNum + dRow);

      return `${ca}${colToA1(col)}${ra}${rowNum}`;
    },
  );
}

/**
 * Rewrite unqualified A1 references through one structural row/column mapping.
 * Absolute markers control copy translation, not structural identity, so both
 * relative and absolute coordinates follow inserts/removes/moves. Qualified
 * references are left for their target sheet's own structural pass.
 */
export function remapFormulaA1Refs(
  source: string,
  axis: "row" | "column",
  remap: (index: number) => number | null,
): string {
  return source.replace(
    /(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)/g,
    (
      match: string,
      colAbsolute: string,
      letters: string,
      rowAbsolute: string,
      digits: string,
      offset: number,
      full: string,
    ): string => {
      const previous = offset > 0 ? full.charAt(offset - 1) : "";
      if (previous === "!" || previous === "_" || /[A-Za-z0-9]/.test(previous)) return match;
      const col = labelToCol(letters.toUpperCase());
      const row = Number(digits) - 1;
      const mapped = remap(axis === "row" ? row : col);
      if (mapped === null) return "#REF!";
      return axis === "row"
        ? `${colAbsolute}${colToA1(col)}${rowAbsolute}${mapped + 1}`
        : `${colAbsolute}${colToA1(mapped)}${rowAbsolute}${row + 1}`;
    },
  );
}
