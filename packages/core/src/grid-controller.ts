import { createGrid } from "./grid.js";
import type { Selection } from "./types/coordinates.js";
import type { Grid, GridConfig, GridEvents, GridOptions } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import type { ChangeEvent } from "./types/transaction.js";
import type { RowBridge, RowBridgeHandler, RowBridgeId } from "./row-bridge.js";

/**
 * Event callbacks a host (a framework adapter, or any plain app) hangs off a
 * grid's lifecycle.
 *
 * The controller reads these fields **live** on every event — see
 * {@link createGridController} — so a host may swap any callback at any time by
 * mutating the fields of the object it passed in, without recreating the grid.
 * Every field is optional; a missing callback simply drops that event.
 */
export interface GridControllerHandlers<Id extends RowBridgeId = RowBridgeId> {
  /** Forwarded from the grid's `change` event (a committed transaction). */
  onGridChange?(event: ChangeEvent): void;
  /** Forwarded as a typed host-row projection when a bridge is attached. */
  onRowDelta?(projection: Parameters<RowBridgeHandler<Id>>[0]): void;

  /** Forwarded from the grid's `selection` event; `null` when nothing is selected. */
  onSelectionChange?(selection: Selection | null): void;
  /** Forwarded from the grid's `scroll` event. */
  onViewportChange?(event: GridEvents["scroll"]): void;

  /** Forwarded when a cell editor opens. */
  onEditBegin?(event: GridEvents["edit-begin"]): void;

  /** Forwarded after a cell editor commits. */
  onEditCommit?(event: GridEvents["edit-commit"]): void;

  /** Forwarded whenever the active search result changes. */
  onSearch?(result: GridEvents["search"]): void;
  /** Forwarded whenever command availability or formatting activity changes. */
  onCommandStateChange?(event: GridEvents["command-state-change"]): void;

  /** Forwarded after the visible sheet changes. */
  onActiveSheetChange?(event: GridEvents["active-sheet"]): void;

  /** Forwarded when a Grid mutation is rejected. */
  onMutationRejected?(event: GridEvents["mutation-rejected"]): void;

  /** Forwarded when worker rendering falls back to the main-thread canvas renderer. */
  onRendererFallback?(event: GridEvents["renderer-fallback"]): void;

  /** Forwarded when a datasource request fails. */
  onDatasourceError?(event: GridEvents["datasource-error"]): void;

  /** Forwarded when a built-in XLSX export action fails. */
  onExportError?(event: GridEvents["export-error"]): void;
}

/**
 * The lifecycle handle returned by {@link createGridController}: the live grid,
 * a theme passthrough, and a single teardown that detaches every subscription
 * and destroys the grid.
 */
export interface GridController {
  /** The imperative core grid this controller owns. */
  readonly grid: Grid;

  /**
   * Apply the host's declarative theme prop: option-level replacement via
   * {@link Grid.replaceTheme}; `undefined` restores CSS/default resolution.
   */
  setTheme(theme: Partial<Theme> | undefined): void;
  /** Update editability without replacing the owned grid. */
  setReadOnly(readOnly: boolean): void;

  /** Update built-in chrome and keyboard configuration without replacing the grid. */
  setConfig(config: GridConfig | undefined): void;

  /**
   * Live-update the render overscan without replacing the grid; `undefined`
   * restores the default.
   */
  setOverscan(overscan: number | undefined): void;
  /**
   * Live-update the minimum rendered column count without emitting user edits.
   */
  setMinColumns(minColumns: number | undefined): void;

  /** Detach every event subscription and destroy the grid. Call exactly once. */
  destroy(): void;
}

/**
 * Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters
 * (and any plain host) share a single, drift-free implementation instead of
 * each re-deriving the same create → subscribe → teardown behavior.
 *
 * `initSheetwrite()` MUST already have been awaited; {@link createGrid} throws
 * otherwise.
 *
 * ### Live handlers
 * `handlers` is held **by reference**, not copied. Every event reads the
 * object's *current* fields (`handlers.onGridChange?.(…)`), so a host may swap
 * callbacks without rebuilding the grid. Framework adapters must mutate the
 * shared object only from their commit lifecycle; mutating it during render can
 * expose callbacks from work that never commits.
 *
 * @param host     element the grid mounts into
 * @param options  grid options forwarded verbatim to {@link createGrid}
 * @param handlers mutable callback bag, read live on every event after host commit
 */
export function createGridController<Id extends RowBridgeId = RowBridgeId>(
  host: HTMLElement,
  options: GridOptions,
  handlers: GridControllerHandlers<Id>,
  rowBridge?: RowBridge<Id>,
): GridController {
  const grid = createGrid(host, options);
  grid.store.setDetailedChangeCapture?.(rowBridge !== undefined);

  // Each closure reads `handlers.*` lazily, so mutating a field on the passed
  const unsubscribes: Array<() => void> = [
    grid.on("change", (event) => {
      handlers.onGridChange?.(event);
      const projection = rowBridge?.project(event);
      if (projection) handlers.onRowDelta?.(projection);
    }),
    grid.on("selection", (event) => handlers.onSelectionChange?.(event.selection)),
    grid.on("scroll", (event) => handlers.onViewportChange?.(event)),
    grid.on("edit-begin", (event) => handlers.onEditBegin?.(event)),
    grid.on("edit-commit", (event) => handlers.onEditCommit?.(event)),
    grid.on("search", (result) => handlers.onSearch?.(result)),
    grid.on("command-state-change", (event) => handlers.onCommandStateChange?.(event)),
    grid.on("active-sheet", (event) => handlers.onActiveSheetChange?.(event)),
    grid.on("mutation-rejected", (event) => handlers.onMutationRejected?.(event)),
    grid.on("renderer-fallback", (event) => handlers.onRendererFallback?.(event)),
    grid.on("datasource-error", (event) => handlers.onDatasourceError?.(event)),
    grid.on("export-error", (event) => handlers.onExportError?.(event)),
  ];

  let destroyed = false;

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }

    grid.store.setDetailedChangeCapture?.(false);
    grid.destroy();
  };

  return {
    grid,

    setTheme(theme) {
      grid.replaceTheme(theme);
    },
    setReadOnly(readOnly) {
      grid.setReadOnly(readOnly);
    },

    setConfig(config) {
      grid.setConfig(config);
    },

    setOverscan(overscan) {
      grid.setOverscan(overscan);
    },
    setMinColumns(minColumns) {
      grid.setMinColumns(minColumns);
    },

    destroy,
  };
}
