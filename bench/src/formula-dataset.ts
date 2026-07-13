export interface FormulaCell {
  row: number;
  col: number;
  src: string;
}

/** Independent formulas in column B, each reading the same-row scalar in A. */
export function independentFormulas(count: number): FormulaCell[] {
  return Array.from({ length: count }, (_, row) => ({ row, col: 1, src: `=A${row + 1}+1` }));
}

/** A single-column dependency chain. Row 0 is a literal source. */
export function linearChain(depth: number): FormulaCell[] {
  return Array.from({ length: Math.max(0, depth - 1) }, (_, index) => {
    const row = index + 1;
    return { row, col: 0, src: `=A${row}+1` };
  });
}

/** Wide fan-out in column B from the absolute source A1. */
export function fanOutFormulas(count: number): FormulaCell[] {
  return Array.from({ length: count }, (_, row) => ({
    row,
    col: 1,
    src: `=$A$1+${row + 1}`,
  }));
}

/** Repeated B/C branches joined in D; each D feeds the next row's branches. */
export function diamondFormulas(levels: number): FormulaCell[] {
  const formulas: FormulaCell[] = [];
  for (let row = 0; row < levels; row++) {
    const source = row === 0 ? "$A$1" : `$D$${row}`;
    formulas.push(
      { row, col: 1, src: `=${source}+1` },
      { row, col: 2, src: `=${source}+2` },
      { row, col: 3, src: `=B${row + 1}+C${row + 1}` },
    );
  }
  return formulas;
}

/** Many formulas sharing one dependency range. */
export function sharedRangeFormulas(count: number, rangeRows = 100): FormulaCell[] {
  return Array.from({ length: count }, (_, row) => ({
    row,
    col: 1,
    src: `=SUM($A$1:$A$${rangeRows})`,
  }));
}

/** Many formulas with deterministic, distinct ten-row ranges. */
export function distinctRangeFormulas(count: number): FormulaCell[] {
  return Array.from({ length: count }, (_, row) => {
    const start = row * 10 + 1;
    return { row, col: 1, src: `=SUM(A${start}:A${start + 9})` };
  });
}
