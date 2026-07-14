// ── Standalone toolbar factory ───────────────────────────────────────────────
//
// Public wrapper over the same renderer the grid's built-in toolbar uses, so
// custom chrome and the stock toolbar can never drift. Adds toolbar semantics
// (role, label, roving focus) without duplicating any action binding.

import { defaultToolbarItems, renderToolbarItems } from "../toolbar.js";
import type { Grid, ToolbarActionName, ToolbarIcon, ToolbarItem } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

export interface ToolbarOptions {
  /** Items to render; defaults to the full built-in action set. */
  items?: readonly ToolbarItem[];
  /** Per-action icon overrides, exactly like `GridConfig.icons`. */
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
  /** Accessible toolbar label (default "Spreadsheet formatting"). */
  label?: string;
}

/**
 * Mount a toolbar bound to `grid.actions` (custom items receive the grid).
 * Mouse clicks never steal grid focus; keyboard users get local
 * Left/Right/Home/End movement across the controls while the toolbar has
 * focus. Returns the mounted piece with an idempotent `destroy`.
 */
export function createToolbar(
  host: HTMLElement,
  grid: Grid,
  options: ToolbarOptions = {},
): ShellPiece {
  const bar = document.createElement("div");
  bar.className = "sheetwrite-shell-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", options.label ?? "Spreadsheet formatting");

  const items = options.items ?? defaultToolbarItems({ export: true });
  renderToolbarItems(bar, items, grid, options.icons);

  // Local roving focus across focusable controls while the toolbar owns focus.
  const onKeydown = (event: KeyboardEvent): void => {
    const controls = [...bar.querySelectorAll<HTMLElement>("button, input")];
    if (controls.length === 0) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const current = controls.indexOf(active);
    if (current === -1) return;

    let next: number;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(controls.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else return;

    event.preventDefault();
    controls[next]?.focus();
  };

  bar.addEventListener("keydown", onKeydown);
  host.appendChild(bar);

  let destroyed = false;
  return {
    element: bar,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      bar.removeEventListener("keydown", onKeydown);
      bar.remove();
    },
  };
}
