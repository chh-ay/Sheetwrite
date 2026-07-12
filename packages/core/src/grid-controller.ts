import { createGrid } from "./grid.js";
import type {
  ChangeEvent,
  Grid,
  GridConfig,
  GridEvents,
  GridOptions,
  Selection,
  Theme,
} from "./types.js";

/**
 * Event callbacks a host (a framework adapter, or any plain app) hangs off a
 * grid's lifecycle.
 *
 * The controller reads these fields **live** on every event — see
 * {@link createGridController} — so a host may swap any callback at any time by
 * mutating the fields of the object it passed in, without recreating the grid.
 * Every field is optional; a missing callback simply drops that event.
 */
export interface GridControllerHandlers {
  /** Forwarded from the grid's `change` event (a committed transaction). */
  onChange?(event: ChangeEvent): void;

  /** Forwarded from the grid's `selection` event; `null` when nothing is selected. */
  onSelectionChange?(selection: Selection | null): void;
  /** Forwarded from the grid's `scroll` event. */
  onScroll?(event: GridEvents["scroll"]): void;

  /** Forwarded when a cell editor opens. */
  onEditBegin?(event: GridEvents["edit-begin"]): void;

  /** Forwarded after a cell editor commits. */
  onEditCommit?(event: GridEvents["edit-commit"]): void;

  /** Forwarded whenever the active search result changes. */
  onSearch?(result: GridEvents["search"]): void;

  /** Forwarded after the visible sheet changes. */
  onActiveSheetChange?(event: GridEvents["active-sheet"]): void;

  /** Invoked exactly once, with the freshly created grid, before the create call returns. */
  onReady?(grid: Grid): void;
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

  /** Detach every event subscription and destroy the grid. Call exactly once. */
  destroy(): void;
}

/**
 * Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters
 * (and any plain host) share a single, drift-free implementation instead of
 * each re-deriving the same create → subscribe → `onReady` → teardown dance.
 *
 * `initSheetwrite()` MUST already have been awaited; {@link createGrid} throws
 * otherwise.
 *
 * ### Live handlers
 * `handlers` is held **by reference**, not copied. Every event reads the
 * object's *current* fields (`handlers.onChange?.(…)`), so a host swaps
 * callbacks across renders by **mutating the fields of the same object** it
 * passed in — never by replacing the object, which the controller would not
 * see. This is what lets a framework feed fresh closures each render without
 * tearing the grid down and rebuilding it.
 *
 * @param host     element the grid mounts into
 * @param options  grid options forwarded verbatim to {@link createGrid}
 * @param handlers mutable callback bag, read live on every event
 */
export function createGridController(
  host: HTMLElement,
  options: GridOptions,
  handlers: GridControllerHandlers,
): GridController {
  const grid = createGrid(host, options);

  // Each closure reads `handlers.*` lazily, so mutating a field on the passed
  // object takes effect on the next event without re-subscribing.
  const unsubscribes: Array<() => void> = [
    grid.on("change", (event) => handlers.onChange?.(event)),
    grid.on("selection", (event) => handlers.onSelectionChange?.(event.selection)),
    grid.on("scroll", (event) => handlers.onScroll?.(event)),
    grid.on("edit-begin", (event) => handlers.onEditBegin?.(event)),
    grid.on("edit-commit", (event) => handlers.onEditCommit?.(event)),
    grid.on("search", (result) => handlers.onSearch?.(result)),
    grid.on("active-sheet", (event) => handlers.onActiveSheetChange?.(event)),
  ];

  let destroyed = false;

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }

    grid.destroy();
  };

  // Announce the grid once subscriptions exist, so an `onReady` handler that
  // drives an immediate edit is already observed by the listeners above. A
  // throwing `onReady` must not leak the fully mounted grid: tear it down and
  // rethrow the consumer's original error.
  try {
    handlers.onReady?.(grid);
  } catch (error) {
    destroy();
    throw error;
  }

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

    destroy,
  };
}
