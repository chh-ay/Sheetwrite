---
title: Styling and theming
description: Customize Sheetwrite with package CSS, theme tokens, cell styles, borders, and number formats.
---

[Installation](/docs/start/installation/)

Sheetwrite paints cells on a canvas, so styling has two layers: the **`Theme`**
(colors, fonts, and geometry the renderer uses) and **`CellStyle`** (per-cell and
per-column formatting). A small stylesheet provides the host container chrome and
CSS custom properties.

## Theme

The `Theme` controls the canvas paint. Pass a `Partial<Theme>` as the `theme`
option, or call `grid.setTheme(partial)` at runtime; either is merged over the
defaults.

```ts partial="requires surrounding host state" title="Partial example"
interface Theme {
  font: string;
  bg: string;
  fg: string;
  gridLine: string;
  headerBg: string;
  headerFg: string;
  selection: string;
  selectionBorder: string;
  rowHeight: number;
  headerHeight: number;
  rowHeaderWidth: number; // 0 hides the left row-number gutter
  searchMatch: string;       // fill behind a search match
  searchActiveMatch: string; // fill/outline for the active (current) match
  highlight: string;         // fill for cells highlighted via Grid.highlightCells
}
```

`DEFAULT_THEME` (exported from `@sheetwrite/core`):

| Field | Default |
| --- | --- |
| `font` | `"13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"` |
| `bg` | `"#ffffff"` |
| `fg` | `"#111111"` |
| `gridLine` | `"#eeeeee"` |
| `headerBg` | `"#f4ede1"` |
| `headerFg` | `"#6b4a1f"` |
| `selection` | `"#2563eb22"` |
| `selectionBorder` | `"#2563eb"` |
| `rowHeight` | `28` |
| `headerHeight` | `32` |
| `rowHeaderWidth` | `48` |
| `searchMatch` | `"#ffd54f80"` |
| `searchActiveMatch` | `"#f59e0b"` |
| `highlight` | `"#a7f3d080"` |

Note: the shipped `styles.css` declares different values for the search/highlight
CSS custom properties (`#fff47580`, `#fbbc04`, `#e8f0fe99`); on a host that
imports the stylesheet those win over `DEFAULT_THEME` per the resolution order
below.

Override the search-match colors at runtime via `setTheme`:

```ts partial="requires surrounding host state" title="Partial example"
grid.setTheme({ searchMatch: "#fff47580", searchActiveMatch: "#fbbc04" });
```

### Resolution order

The effective theme is computed once at construction and again on `setTheme`:

```text partial="illustrative output or schema" title="Illustrative excerpt"
DEFAULT_THEME  <  --sheetwrite-* CSS custom properties (resolveThemeFromCss)  <  opts.theme / setTheme
```

`resolveThemeFromCss(host)` reads CSS custom properties from the host's computed
style into a partial theme, and `opts.theme` wins last.

Two runtime methods with different semantics:

- `grid.setTheme(partial)` — **imperative patch**: merges into the accumulated
  base theme and repaints. Use for incremental tweaks.
- `grid.replaceTheme(partial | undefined)` — **option-level replacement**:
  re-runs the construction-time resolution above with the new value;
  `undefined` restores the CSS-variable/default resolution. The framework
  adapters call this for their `theme` prop, so **the prop is authoritative**:
  removing it (or dropping a field) restores defaults instead of leaving stale
  merged values behind.
- `grid.getEffectiveTheme()` returns the effective (post-zoom) theme currently
  painting.

Tailwind works through the same seam: set `--sheetwrite-*` custom properties on
the host with arbitrary-property utilities (e.g.
`class="[--sheetwrite-bg:#0b0b0c] [--sheetwrite-fg:#e7e7e7]"`) or a `@layer`
rule; construction and `replaceTheme(undefined)` both pick them up from the
computed style.

```ts partial="requires surrounding host state" title="Partial example"
const DARK: Partial<Theme> = {
  bg: "#0b0b0c",
  fg: "#e7e7e7",
  gridLine: "#26262a",
  headerBg: "#1a160f",
  headerFg: "#e8c98a",
  selection: "#e8c98a22",
  selectionBorder: "#e8c98a",
};

grid.setTheme(DARK);
```

## CSS custom properties & the stylesheet

Import the stylesheet once. It styles the host container (the grid adds the
`.sheetwrite` class to your host element), declares the `--sheetwrite-*` defaults,
and ships a dark variant under `[data-theme="dark"]` or a `.dark` ancestor class
(the Tailwind convention):

```ts partial="requires surrounding host state" title="Partial example"
import "@sheetwrite/core/styles.css";
```

`resolveThemeFromCss` maps these custom properties onto `Theme` fields:

| CSS custom property | Theme field |
| --- | --- |
| `--sheetwrite-bg` | `bg` |
| `--sheetwrite-fg` | `fg` |
| `--sheetwrite-grid-line` | `gridLine` |
| `--sheetwrite-header-bg` | `headerBg` |
| `--sheetwrite-header-fg` | `headerFg` |
| `--sheetwrite-selection` | `selection` |
| `--sheetwrite-selection-border` | `selectionBorder` |
| `--sheetwrite-row-height` | `rowHeight` (parsed as a number) |
| `--sheetwrite-search-match` | `searchMatch` |
| `--sheetwrite-search-active` | `searchActiveMatch` |
| `--sheetwrite-highlight` | `highlight` |
| `--sheetwrite-font` | `font` (a `/ line-height` segment is stripped for the canvas) |

`headerHeight` and `rowHeaderWidth` have no CSS variable — set them through the
`theme` option. An explicit `--sheetwrite-*` value set on the `.sheetwrite`
element itself still wins over either dark selector (same-element beats
ancestor).

### Widget and context-menu styling

The stylesheet exposes widget variables in addition to the canvas theme
mapping:

| CSS custom property | Widget use | Fallback |
| --- | --- | --- |
| `--sheetwrite-widget-border` | Borders and separators for toolbar/find/menu chrome | `--sheetwrite-grid-line` |
| `--sheetwrite-menu-hover` | Context-menu item hover background | `--sheetwrite-grid-line` |
| `--sheetwrite-menu-disabled-opacity` | Disabled context-menu row opacity | `0.5` |

The bundled menu uses the public `.sheetwrite-context-menu` container,
`.sheetwrite-context-menu-item` row, `.sheetwrite-context-menu-item-disabled`
state, `.sheetwrite-context-menu-shortcut` hint, and
`.sheetwrite-context-menu-sep` separator classes. Scope overrides beneath the
grid host rather than replacing positioning, visibility, or disabled behavior:

```css partial="host-scoped visual override" title="Context menu theme hooks"
.sheetwrite {
  --sheetwrite-widget-border: #334155;
  --sheetwrite-menu-hover: #1e293b;
  --sheetwrite-menu-disabled-opacity: 0.45;
}

.sheetwrite .sheetwrite-context-menu-item {
  font-weight: 500;
}
```

The recommended runtime-theming pattern (from the theming example page) drives both
layers together: toggle `data-theme` on a wrapper so the surrounding
CSS-variable chrome flips, and call `setTheme` so the canvas repaints.

```ts partial="requires surrounding host state" title="Partial example"
darkBtn.addEventListener("click", () => {
  grid.setTheme(DARK);
  stage.setAttribute("data-theme", "dark");
});
```

## CellStyle

`CellStyle` formats individual cells. It appears in three places:

- as the `style` on a `set` patch — formatting for that one specific cell;
- as `Column.cellStyle` — a column-wide default the renderer paints under every
  body cell of the column;
- as `Column.headerStyle` — the style applied to that column's header cell.

`Column.cellStyle` is a default, not a lock: a per-cell `set` style overrides the
column default for that cell, so a cell paints with its column's `cellStyle` until
its own patch supplies styling.

```ts partial="requires surrounding host state" title="Partial example"
interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  color?: string;            // hex text color, e.g. "#111111"
  backgroundColor?: string;  // hex fill, e.g. "#ffffff"
  align?: "left" | "center" | "right";
  wrap?: boolean;
  border?: CellBorders;
}
```

Apply a style to a cell via a transaction (a `set` replaces value + style, so pass
the current value back when only restyling):

```ts partial="requires surrounding host state" title="Partial example"
grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "literal", value: "Total" },
      style: { bold: true, align: "center", backgroundColor: "#eef1f5" },
    },
  ],
});
```

### Borders

Borders are per side. `CellBorders.all` applies to any side not given its own
border:

```ts partial="requires surrounding host state" title="Partial example"
interface CellBorders {
  all?: CellBorder;
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

interface CellBorder {
  color?: string;                          // hex, e.g. "#111111"
  width?: number;
  style?: "solid" | "dashed" | "dotted";
}
```

```ts partial="requires surrounding host state" title="Partial example"
const style: CellStyle = {
  border: {
    all: { color: "#cccccc", width: 1, style: "solid" },
    bottom: { color: "#111111", width: 2, style: "solid" },
  },
};
```

## Number formats

A numeric/date column can carry an Excel-style `numberFormat` code and an explicit
BCP 47 `numberLocale`. The same UTC serial value and locale are used by the
canvas renderer, auto-fit measurement, and exported formatter:

```ts partial="requires surrounding host state" title="Partial example"
{
  key: "amount",
  header: "Amount",
  width: 140,
  type: "number",
  numberFormat: "#,##0.00",
  numberLocale: "de-DE",
}
{ key: "day", header: "Day", width: 120, type: "date", numberFormat: "yyyy-mm-dd" }
```

`formatNumber(value, code?, locale?)` is exported from `@sheetwrite/core`. It is
a cached renderer for the supported Excel-style families:

| Code | Example output |
| --- | --- |
| _(none)_ | `1234.5` → locale-default `1,234.5` |
| `0` | `1234.5` → `1235` |
| `0.00` | `1234.5` → `1234.50` |
| `#,##0.00` | `1234.5` → `1,234.50` |
| `0%` | `0.5` → `50%` |
| `$#,##0.00` | `1234.5` → `$1,234.50` |
| `0.00E+00` | `12345` → `1.23E+04` |
| `yyyy-mm-dd` | serial `45351` → `2024-02-29` |
| `mmm d, yyyy h:mm:ss AM/PM` | UTC serial → `Jul 4, 2024 3:06:07 PM` |
| `0.00;[Red](0.00);"none";"value: "@` | positive / negative / zero / text sections |

Numeric formats support fixed decimals, optional grouping, percent scaling,
scientific exponents with explicit width, quoted/escaped literals, and currency
prefixes/suffixes. Up to four semicolon sections select positive, negative, zero,
and text output; color directives such as `[Red]` are accepted as formatting
metadata but do not change canvas text color.

Date/time formats support numeric and named month/day fields, 12/24-hour time,
minutes, seconds, and AM/PM. Month/minute disambiguation follows neighboring time
tokens. UTC fields make date rendering deterministic across host timezones.
Locale-specific separators come from `numberLocale`, not ambient browser locale.

Fractions, elapsed-time bracket tokens, and fractional seconds are not supported.
Formula errors are explicit sentinels such as `#DIV/0!` and `#CYCLE!`; they are
not non-finite numbers hidden by the formatter. See
[Formulas](/docs/guides/formulas/#scalars-coercion-and-errors).

Native boolean values use the normal cell style model, render as uppercase
`TRUE`/`FALSE`, and default to centered alignment unless `CellStyle.align`
overrides it.

## See also

- [Configuration](/docs/guides/configuration/) for `theme`, `renderers`, and the toolbar color controls.
- [Concepts](/docs/concepts/runtime-ownership/#headers-letters-vs-field-names) for the styled row-0 field-header pattern.
