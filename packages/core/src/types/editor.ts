import type { CellScalar } from "./cell.js";
import type { CellAddress } from "./coordinates.js";
import type { Column } from "./cell.js";
import type { Grid } from "./grid.js";

/** Selection movement applied after a successful editor commit. */
export type CellEditorNavigation = "down" | "right" | "left" | "none";

/** Viewport-relative geometry of the cell currently owned by an editor. */
export interface CellEditorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Immutable state and guarded completion callbacks for one mounted editor.
 * `address` is the canonical data address; `viewAddress` is the current visual
 * row/column. Async work must use `signal` so reset, cancel, and unmount abort it.
 */
export interface CellEditorContext {
  readonly grid: Grid;
  readonly address: Readonly<CellAddress>;
  readonly viewAddress: Readonly<CellAddress>;
  readonly column: Readonly<Column>;
  readonly value: CellScalar;
  readonly text: string;
  readonly initialInput: string | undefined;
  readonly selectAll: boolean;
  readonly label: string;
  readonly signal: AbortSignal;
  /** Commit text through the Grid parser, policy, history, and collaboration path. */
  commit(value: string, navigation?: CellEditorNavigation): void;
  /** Cancel without mutating and return focus to the Grid. */
  cancel(): void;
}

/** Retained lifecycle returned by a custom editor's `mount` method. */
export interface CellEditorInstance {
  /** Refresh external value/context while the same cell remains owned. */
  update(context: CellEditorContext): void;
  /** Reposition editor-owned popovers after the core wrapper has moved. */
  reposition(rect: CellEditorRect): void;
  /** Called for Enter/Tab. Return text (or a promise for it) to use the canonical commit path. */
  commit(navigation: CellEditorNavigation): string | void | Promise<string | void>;
  /** Called for Escape or replacement before teardown. */
  cancel(): void;
  /** Release every DOM node, listener, subscription, and framework subtree. */
  destroy(): void;
}

/** Framework-neutral named editor definition registered through `GridOptions.editors`. */
export interface CellEditor {
  /** Mount one editor instance into the supplied retained wrapper. */
  mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
}
