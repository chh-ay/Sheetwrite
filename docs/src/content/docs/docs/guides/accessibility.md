---
title: Accessibility
description: Understand the ARIA grid mirror, keyboard behavior, focus, and visible-window accessibility limits.
---

[Installation](/docs/start/installation/)

The grid paints to a `<canvas>`, which assistive technology can not read. To make
it navigable, Sheetwrite maintains a parallel **ARIA shadow tree**: a
visually-hidden DOM mirror of the visible window that carries the grid semantics,
while the canvas itself is hidden from the accessibility tree.

## The host grid

`createGrid` annotates the host element as the grid:

| Attribute | Value |
| --- | --- |
| `role` | `"grid"` |
| `aria-multiselectable` | `"true"` |
| `aria-rowcount` | total rows **+ 1** (the column-letter header counts as a row) |
| `aria-colcount` | number of visible columns |
| `aria-readonly` | `"true"` when the grid is `readOnly` (omitted otherwise) |
| `aria-label` | `"Spreadsheet grid"` (default; not overwritten if you set your own) |
| `aria-activedescendant` | the id of the focused cell in the mirror |

The visual layers — the scroller, the overlay, and the `<canvas>` — are all marked
`aria-hidden="true"`, so screen readers ignore the pixels and read the mirror.

## The SR-only mirror

Alongside the host the grid appends a visually-hidden `<div class="sheetwrite-aria">`
with a unique id (`sheetwrite-grid-<n>`) and `role="rowgroup"`. It contains:

- A **header row** — `role="row"`, `aria-rowindex="1"` — whose cells are
  `role="columnheader"` with a 1-based `aria-colindex` and the column letter
  (`A`, `B`, …) as text.
- One **data row** per visible row — `role="row"` with `aria-rowindex` set to the
  true row position (data row + 2, leaving index 1 for the letter header). Its
  cells are `role="gridcell"` with a 1-based `aria-colindex`, a stable id
  (`<gridId>-<row>-<col>`), and the cell's value as text.
- Every visible cell covered by the current cell/range/multi selection carries
  `aria-selected="true"`. A row selection marks its visible row; a column
  selection marks both its header and visible cells. The focused cell's id is
  mirrored into the host's `aria-activedescendant`.

Sketch of the emitted structure:

```html partial="illustrative output or schema" title="Illustrative excerpt"
<div role="grid" aria-multiselectable="true" aria-rowcount="100001" aria-colcount="5"
     aria-activedescendant="sheetwrite-grid-1-0-0" tabindex="0">
  <!-- canvas / scroller / overlay, all aria-hidden -->
  <div class="sheetwrite-aria" id="sheetwrite-grid-1" role="rowgroup">
    <div role="row" aria-rowindex="1">
      <div role="columnheader" aria-colindex="1">A</div>
      <div role="columnheader" aria-colindex="2">B</div>
    </div>
    <div role="row" aria-rowindex="2">
      <div role="gridcell" aria-colindex="1" id="sheetwrite-grid-1-0-0"
           aria-selected="true">Widget</div>
      <div role="gridcell" aria-colindex="2" id="sheetwrite-grid-1-0-1">12</div>
    </div>
    <!-- … one row per visible row … -->
  </div>
</div>
```

As keyboard or pointer input changes the selection, `aria-selected` and the
host's `aria-activedescendant` update. Scrolling rebuilds the visible mirror.
A focused cell note is connected through `aria-describedby` to hidden plain text.
Validation list and checkbox editors use real `listbox` / `option` and `checkbox`
semantics, with the rule help text as their accessible label.

## Limitation: the mirror reflects the visible window

The mirror contains **only the rows and columns currently rendered** (the same
virtualized window the canvas paints, plus overscan) — not the entire sheet. This
is deliberate: materializing 100k+ rows of DOM would defeat the point of canvas
rendering.

The consequences to be aware of:

- `aria-rowindex` / `aria-colindex` carry the **true** positions, so assistive
  technology can announce "row N of `aria-rowcount`" correctly even though only a
  window is present.
- A screen reader's own virtual cursor can only walk the cells in the rendered
  window. Use the grid's keyboard navigation (arrows, Page Up/Down, Home/End — see
  [Interaction](/docs/guides/interaction/#keyboard-navigation)) to move focus; that scrolls
  new rows into view and into the mirror, and updates `aria-activedescendant`.
