// Autofill series detection for drag-to-fill. Given one source column vector,
// decide whether the fill should extrapolate an arithmetic sequence (Sheets
// semantics) or copy/tile the source. Pure and DOM-free: the caller supplies the
// resolved scalars plus per-cell formula flags and resolves tiled cells itself
// (so formula reference-shifting stays in the grid layer).

import type { CellScalar } from "./types.js";

// ── Inputs & outputs ─────────────────────────────────────────────────────────

/** One source cell in fill order (top→bottom for a vertical fill). */
export interface FillSourceCell {
  /** Resolved scalar value of the source cell. */
  value: CellScalar;
  /** True when the cell holds a formula; formulas tile (with ref-shift), never extrapolate. */
  isFormula: boolean;
}

/**
 * What to write at a target offset:
 * - `value`: a numeric literal produced by arithmetic extrapolation.
 * - `tile`: copy the source cell at `sourceIndex` (caller resolves value / shifts refs).
 */
export type FillStep = { kind: "value"; value: number } | { kind: "tile"; sourceIndex: number };

/** A resolved fill plan for a single column. */
export interface FillSeries {
  /**
   * Fill for target offset `p`, measured in rows from the source start. `p` is
   * negative above the source (up-fill), `>= length` below it (down-fill), and
   * within `[0, length)` inside the source itself (callers normally skip those).
   */
  stepAt(p: number): FillStep;
}

// ── Detection ────────────────────────────────────────────────────────────────

/** Relative+absolute slack so float deltas (0.1, 0.2, 0.3, …) read as constant. */
const DELTA_EPSILON = 1e-9;

function isFiniteNumber(v: CellScalar): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function tilingSeries(length: number): FillSeries {
  const n = Math.max(1, length);
  return {
    stepAt: (p) => ({ kind: "tile", sourceIndex: ((p % n) + n) % n }),
  };
}

/**
 * Classify a source column and return its fill plan:
 * - all-numeric, length ≥ 2, constant delta → arithmetic extrapolation (delta 0 = copy);
 * - single numeric cell → copy (tiling with length 1);
 * - any formula, mixed, or text → copy/tile the source modulo its length.
 *
 * Non-constant numeric runs (e.g. 1, 2, 4) fall back to tiling rather than fitting
 * a curve — a deliberate, predictable default.
 */
export function detectFillSeries(source: readonly FillSourceCell[]): FillSeries {
  const n = source.length;
  if (n === 0) return tilingSeries(1);

  let allNumeric = true;
  const nums = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const cell = source[i]!;
    if (cell.isFormula || !isFiniteNumber(cell.value)) {
      allNumeric = false;
      break;
    }
    nums[i] = cell.value;
  }

  if (!allNumeric || n < 2) return tilingSeries(n);

  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(nums[i]!));
  const tol = DELTA_EPSILON * Math.max(1, maxAbs);

  const delta = nums[1]! - nums[0]!;
  for (let i = 2; i < n; i++) {
    if (Math.abs(nums[i]! - nums[i - 1]! - delta) > tol) return tilingSeries(n);
  }

  // delta === 0 naturally degrades to a copy (every offset yields the base value).
  const base = nums[0]!;
  return { stepAt: (p) => ({ kind: "value", value: base + delta * p }) };
}
