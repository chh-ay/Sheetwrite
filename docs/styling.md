# Styling

[Docs index](./README.md)

Sheetwrite paints cells on a canvas, so styling has two layers: the **`Theme`**
(colors, fonts, and geometry the renderer uses) and **`CellStyle`** (per-cell and
per-column formatting). A small stylesheet provides the host container chrome and
CSS custom properties.

## Theme

The `Theme` controls the canvas paint. Pass a `Partial<Theme>` as the `theme`
option, or call `grid.setTheme(partial)` at runtime; either is merged over the
defaults.

```ts
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

```ts
grid.setTheme({ searchMatch: "#fff47580", searchActiveMatch: "#fbbc04" });
```

### Resolution order

The effective theme is computed once at construction and again on `setTheme`:

```
DEFAULT_THEME  <  --sheetwrite-* CSS custom properties (resolveThemeFromCss)  <  opts.theme / setTheme
```

`resolveThemeFromCss(host)` reads CSS custom properties from the host's computed
style into a partial theme, and `opts.theme` wins last. For runtime theme
switching, prefer `grid.setTheme(...)` — it repaints the canvas immediately.

```ts
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
and ships a dark variant under `[data-theme="dark"]`:

```ts
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

`headerHeight` and `rowHeaderWidth` have no CSS variable — set them through the
`theme` option. The stylesheet's `--sheetwrite-font` styles the container font but
is not mapped to `Theme.font`.

The recommended runtime-theming pattern (from the theming example page) drives both
layers together: toggle `data-theme` on a wrapper so the surrounding
CSS-variable chrome flips, and call `setTheme` so the canvas repaints.

```ts
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

```ts
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

```ts
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

```ts
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

```ts
const style: CellStyle = {
  border: {
    all: { color: "#cccccc", width: 1, style: "solid" },
    bottom: { color: "#111111", width: 2, style: "solid" },
  },
};
```

## Number formats

A numeric column can carry an Excel-style `numberFormat` code that controls how
values render on screen (and matches the exported value):

```ts
{ key: "amount", header: "Amount", width: 140, type: "number", numberFormat: "#,##0.00" }
```

`formatNumber(value, code?)` (exported from `@sheetwrite/core`) is the renderer
behind it. It is a best-effort formatter for the common presets, not a full Excel
engine:

| Code | `1234.5` renders as |
| --- | --- |
| _(none)_ | `1,234.5` (locale default) |
| `0` | `1235` |
| `0.00` | `1234.50` |
| `#,##0` | `1,235` |
| `#,##0.00` | `1,234.50` |
| `0%` | applied to `0.5` → `50%` |
| `$#,##0.00` | `$1,234.50` |

Supported tokens: fixed decimal places (count the `0`/`#` after the `.`),
thousands grouping (a `,`), percent (`%`, which scales the value by 100), and a
literal prefix/suffix (currency symbols, units). It does **not** support date
codes or conditional sections. A non-finite value (including a formula cycle, see
[Formulas](./formulas.md#cycle-detection)) renders as an empty string.

## See also

- [Configuration](./configuration.md) for `theme`, `renderers`, and the toolbar color controls.
- [Concepts](./concepts.md#headers-letters-vs-field-names) for the styled row-0 field-header pattern.
