import { createGrid } from "./grid";
import type { ChangeEvent, Grid, GridOptions, Selection, Theme } from "./types";

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

  /** Forward a (partial) theme update to the grid. */
  setTheme(theme: Partial<Theme>): void;

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
  ];

  // Announce the grid once subscriptions exist, so an `onReady` handler that
  // drives an immediate edit is already observed by the listeners above.
  handlers.onReady?.(grid);

  return {
    grid,

    setTheme(theme) {
      grid.setTheme(theme);
    },

    destroy() {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      grid.destroy();
    },
  };
}
