# Interaction

[Docs index](./README.md)

Sheetwrite handles selection, keyboard navigation, inline editing, the clipboard,
the toolbar, merges, and drag-to-fill out of the box. The host element is made
focusable (`tabindex="0"`) so it receives keyboard events. Setting
`readOnly: true` disables every mutating interaction below (editing, clearing,
fill, paste, and restyling) while leaving navigation and selection intact.

## Selection model

A `Selection` is one of five shapes:

```ts
type Selection =
  | { kind: "cell"; addr: CellAddress }
  | { kind: "range"; range: Range }
  | { kind: "row"; sheet: SheetId; row: number }
  | { kind: "column"; sheet: SheetId; col: number }
  | { kind: "multi"; ranges: Range[] };
```

Read or set it imperatively, and subscribe to changes:

```ts
const sel = grid.getSelection();
grid.setSelection({ kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } });
grid.setSelection(null); // clear

grid.on("selection", (e) => console.log(e.selection));
```

How selections are made with the mouse (primary button):

| Gesture | Result |
| --- | --- |
| Click a cell | Select that cell. |
| Drag across cells | Extend to a **range**. |
| Shift-click | Extend the range from the current anchor. |
| Ctrl/Cmd-click | Add a region — produces a **multi** selection. |
| Click a column letter (top header) | Select that **column** (Shift extends; Ctrl/Cmd adds). |

Row and full-column selections are part of the model. Column selection is wired to
the top header; **row selection is programmatic only** — there is no row-header
click gesture, so set it via `setSelection({ kind: "row", sheet, row })`.

## Keyboard navigation

When the grid is focused and not editing:

| Key | Action |
| --- | --- |
| Arrow keys | Move the focus one cell. |
| Ctrl/Cmd + Arrow | Jump to the first/last row or column. |
| Page Up / Page Down | Move by a viewport of rows. |
| Home / End | Move to the first / last column of the row. |
| Ctrl/Cmd + Home / End | Move to the sheet's first / last cell. |
| Shift + any of the above | Extend the selection instead of moving. |
| Enter or F2 | Edit the focused cell (F2 selects the existing text). |
| Delete / Backspace | Clear the selected cells. |
| A printable character | Start editing, replacing the cell's content. |
| Ctrl/Cmd + C / X / V | Copy / cut / paste. |
| Ctrl/Cmd + Z | Undo the last edit. |
| Ctrl/Cmd + Shift + Z (or Ctrl/Cmd + Y) | Redo. |
| Ctrl/Cmd + F | Open the find bar (when `config.find` is not `false`). |

## Inline editing

Editing happens in a single real `<textarea>` overlaid on the active cell. It is
never recycled across cells, so **IME composition and focus survive scrolling** —
composing CJK or other input methods is safe. Begin editing by double-clicking,
pressing Enter or F2, or just typing.

Commit and navigation keys:

| Key | Result |
| --- | --- |
| Enter | Commit, move **down**. |
| Tab | Commit, move **right**. |
| Shift + Tab | Commit, move **left**. |
| Shift + Enter | Insert a newline (does not commit). |
| Escape | Cancel the edit. |
| Blur (click away) | Commit in place. |

While the IME is composing, keystrokes belong to the composition and are not
treated as navigation. Editing emits `edit-begin` and `edit-commit` events.

## Clipboard (TSV)

Copy and cut serialize the focused rectangle to the system clipboard as TSV
(tab-separated, with fields containing tabs/newlines/quotes quoted), matching
Excel and Google Sheets. Cut also clears the copied cells.

Paste reads TSV from the clipboard, parses it (handling quoted, multi-line
fields), and writes a block anchored at the focused cell. Pasted strings are
**injection-hardened**: a value beginning with `=`, `+`, `-`, `@`, tab, or CR is
prefixed with a single quote so a pasted `=cmd|...` can not become an executable
formula. Copy/cut/paste use the async Clipboard API (`navigator.clipboard`) and
are no-ops where it is unavailable; paste is disabled when `readOnly`.

## Toolbar actions

When you opt into the toolbar via `config`, each control acts on the current
selection. The controls (and the `config` flag that gates each) are:

| Control | Flag |
| --- | --- |
| Bold | `bold` |
| Italic | `italic` |
| Align left / center / right | `align` |
| Text color | `textColor` |
| Fill color | `fillColor` |
| Border | `border` |
| Clear formatting | `clearFormat` |
| Merge / unmerge | `merge` |
| Sort ascending / descending | `sort` |

See [Configuration → GridConfig](./configuration.md#gridconfig-toolbar).

## Merged cells

Merging combines the selected range into one cell: the top-left value is shown and
the covered cells are hidden, tracked in a per-sheet merge registry. Unmerge
reverses it. Merges are **not drawn while a sort or filter view is active** (the
display order no longer maps cleanly to the merged region); clear the view to see
them again. See [Data operations](./data-operations.md#sort--filter-views).

## Drag-to-fill

A small fill handle sits at the bottom-right corner of the selection. Drag it
**down, up, left, or right** — the dominant axis wins — to fill the source block
across the new region. The source is tiled (repeated) to cover the target.

When the filled cells contain formulas, references are rewritten as they are
copied: **relative** A1 parts shift by the fill offset and **absolute** parts
(prefixed with `$`) stay fixed. For example, filling `=A1 + $B$1` one column right
yields `=B1 + $B$1`. See [Formulas → Reference rewriting](./formulas.md#reference-rewriting).

Drag-to-fill is unavailable while a sort/filter view is active (the handle is
hidden) and when `readOnly`.
