import type { Theme } from "./types/render.js";

// ── Widget custom-property seeding ───────────────────────────────────────────

/**
 * Custom properties the built-in widgets (find bar, toolbar, context menu) read
 * for their cosmetic styling. They are declared in `styles.css` via `var(...)`
 * and seeded here from the resolved {@link Theme} so the default look is
 * identical to the old hardcoded inline styles while remaining fully
 * restylable by host CSS.
 */
const WIDGET_THEME_VARS = {
  "--sheetwrite-widget-font": (t: Theme) => t.font,
  "--sheetwrite-widget-bg": (t: Theme) => t.bg,
  "--sheetwrite-widget-fg": (t: Theme) => t.fg,
  "--sheetwrite-widget-border": (t: Theme) => t.gridLine,
  "--sheetwrite-widget-accent": (t: Theme) => t.headerFg,
  "--sheetwrite-widget-selection": (t: Theme) => t.selection,
  "--sheetwrite-toolbar-bg": (t: Theme) => t.headerBg,
  "--sheetwrite-toolbar-fg": (t: Theme) => t.headerFg,
  "--sheetwrite-menu-hover": (t: Theme) => t.gridLine,
} as const;

/**
 * Seeds the widget custom properties from `theme` onto the grid *root* — the
 * shared host element that parents every built-in widget.
 *
 * They are declared on the ancestor (not each widget element) on purpose: an
 * inline custom property set on the widget element itself would outrank any
 * author rule, but an *inherited* value is overridden by a rule matching the
 * widget directly. That is what lets a host `.sheetwrite-find { --sheetwrite-
 * widget-bg: … }` (or a bare cosmetic override like `background: …`, which now
 * lives in the stylesheet rather than inline) win without `!important`.
 *
 * Idempotent: every widget seeds the same theme-derived values, so calling it
 * from each constructor on the shared root simply reasserts them.
 */
export function seedWidgetTheme(root: HTMLElement, theme: Theme): void {
  for (const [name, pick] of Object.entries(WIDGET_THEME_VARS)) {
    root.style.setProperty(name, String(pick(theme)));
  }
}
