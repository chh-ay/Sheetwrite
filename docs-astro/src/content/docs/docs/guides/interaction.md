---
title: Interaction and editing
description: Configure selection, editing, clipboard, validation, protection, search, merge, and fill behavior.
---

[Installation](/docs/start/installation/)

Sheetwrite handles selection, keyboard navigation, inline editing, the clipboard,
the toolbar, merges, and drag-to-fill out of the box. The host element is made
focusable (`tabindex="0"`) so it receives keyboard events. Setting
`readOnly: true` disables every mutating interaction below (editing, clearing,
fill, paste, and restyling) while leaving navigation and selection intact.

## Selection model

A `Selection` is one of five shapes:

```ts partial="requires surrounding host state" title="Partial example"
type Selection =
  | { kind: "cell"; addr: CellAddress }
  | { kind: "range"; range: Range }
  | { kind: "row"; sheet: SheetId; row: number }
  | { kind: "column"; sheet: SheetId; col: number }
  | { kind: "multi"; ranges: Range[] };
```

Read or set it imperatively, and subscribe to changes:

```ts partial="requires surrounding host state" title="Partial example"
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

## Clipboard interoperability

Copy and cut always produce injection-hardened TSV and, where the browser exposes
`ClipboardItem`, also write sanitized `text/html` plus Sheetwrite's private
`application/x-sheetwrite+json` payload. The private payload preserves formula
source and cell styles for same-app round-trips. HTML contains only escaped table
markup, plain cell text, safe `data-sheetwrite-formula` attributes, and a bounded
style subset; no pasted HTML is inserted into the document.

Paste prefers the private Sheetwrite payload, then sanitized HTML tables, then
plain TSV. HTML parsing uses an inert `DOMParser` document and accepts only cell
text, safe formula attributes, and supported inline styles. External formulas
containing control characters are treated as text. TSV handles quoted,
multi-line fields, matching Excel and Google Sheets. External text beginning
with `=`, `+`, `-`, `@`, tab, or CR is prefixed with a single quote, so it cannot
become an executable formula.

`paste()` preserves supported formula/style data; `pasteValues()` intentionally
writes resolved literals and drops formulas/styles. Cut clears its source only
after the system clipboard accepts the payload. Paste is disabled when
`readOnly`.

`grid.actions.copy/cut/paste/pasteValues` return
`Promise<ClipboardOutcome>` — `"done" | "unsupported" | "blocked" | "empty"` —
and never reject. A missing API resolves `"unsupported"`; permission or
user-activation rejection resolves `"blocked"`, so custom UI can surface the
outcome without tripping global error monitoring.

## Validation, protection, and notes

`DataValidationRule` covers list, numeric range, date range, text-length, and
checkbox conditions. Rules carry a stable ID, range, `reject` / `warn` / `allow`
policy, optional blank handling, and help text. List rules open a keyboard-
operable `listbox`; checkbox rules open a real ARIA `checkbox`. Arrow keys and
typeahead change a list choice, Space toggles a checkbox, Enter commits, Tab
commits and moves, and Escape cancels. Every mutation ingress—including paste,
fill, clear, and host transactions—passes through the same validation boundary.

`ProtectedRange` is serializable client policy metadata. Local writes are denied
by default and can be allowed by a host `ProtectionResolver`; atomic mode rejects
the whole transaction, while partial mode applies allowed operations and reports
the rest. Remote operations bypass this UX policy. A server must enforce its own
authorization.

Plain-text notes use `setNote(addr, text)` / `getNote(addr)`. The focused cell's
note is exposed as the ARIA description. Notes serialize, rebase with structural
edits, participate in undo/redo, and round-trip through Sheetwrite XLSX metadata.

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

See [Configuration → GridConfig](/docs/guides/configuration/#gridconfig-toolbar).

## Context menu

`GridConfig.contextMenu` is `true` by default, `false` to disable, a static
readonly item list, or a factory evaluated for each right-click context.
Sheetwrite prevents the browser menu, hit-tests the pointer, and selects the
resolved cell before evaluating item visibility/disabled predicates.

Rows may provide `id`, `label`, and `shortcut`; bind a built-in `action` or use
`onClick(grid, cell)`. `visible` and `disabled` accept booleans or predicates
receiving the lean `{ cell, clientX, clientY }` `ContextMenuContext`. Hidden
separators are normalized and disabled rows cannot invoke actions.

The built-in action names are:

| Clipboard/content | Rows | Columns | View/export |
| --- | --- | --- | --- |
| `cut`, `copy`, `paste`, `clearContents` | `insertRowAbove`, `insertRowBelow`, `deleteRow`, `hideRow`, `showAllRows`, `autoFitRow` | `insertColumnLeft`, `insertColumnRight`, `deleteColumn`, `hideColumn`, `showAllColumns`, `autoFitColumn` | `clearFilter`, `merge`, `unmerge`, `exportCsv`, `exportXlsx` |

The default list uses the clipboard/content, row, column, filter, and
merge/unmerge actions; export actions are available for custom lists. XLSX
still requires `@sheetwrite/xlsx/register`.

For fully host-owned menu rendering, disable the bundled menu and bind the host
element's DOM `contextmenu` event. `grid.getCellAtPoint(clientX, clientY)`
resolves the pointer without exposing renderer internals; the host then owns
`preventDefault`, selection, positioning, dismissal, and invoking
`grid.actions`.

See [Configuration → Context-menu items](/docs/guides/configuration/#context-menu-items)
for both models and [Styling → Widget and context-menu styling](/docs/guides/styling/#widget-and-context-menu-styling)
for the bundled menu CSS hooks.

## Merged cells

Merging combines the selected range into one cell: the top-left value is shown and
the covered cells are hidden, tracked in a per-sheet merge registry. Unmerge
reverses it. Merges are **not drawn while a sort or filter view is active** (the
display order no longer maps cleanly to the merged region); clear the view to see
them again. See [Data operations](/docs/guides/data-operations/#display-views).

## Drag-to-fill

A small fill handle sits at the bottom-right corner of the selection. Drag it
**down, up, left, or right** — the dominant axis wins — to fill the source block
across the new region. The source is tiled (repeated) to cover the target.

When the filled cells contain formulas, references are rewritten as they are
copied: **relative** A1 parts shift by the fill offset and **absolute** parts
(prefixed with `$`) stay fixed. For example, filling `=A1 + $B$1` one column right
yields `=B1 + $B$1`. See [Formulas → Point mode and reference rewriting](/docs/guides/formulas/#point-mode-and-reference-rewriting).

Drag-to-fill is unavailable while a sort/filter view is active (the handle is
hidden) and when `readOnly`.

## Touch

Grid input runs on Pointer Events, so mouse, touch, and pen share one code
path. For `pointerType: "touch"` the policy is:

| Gesture | Behavior |
| --- | --- |
| Tap on a cell | select the cell (same as a click) |
| Tap on a column header | select the column |
| Drag starting on a plain cell | **native scroll** — the grid neither captures the pointer nor calls `preventDefault` |
| Drag starting on the fill handle | drag-to-fill (pointer captured) |
| Drag starting on a row/column resize boundary | resize (pointer captured) |
| Drag starting on the border of a multi-cell selection (±6px band) | extend the selection (pointer captured) |
| Double-tap on a cell | begin editing (the browser's synthesized `dblclick`) |

Mouse and pen behave classically: any drag from a cell extends the selection,
and hovering a resize boundary shows the resize cursor. A `pointercancel`
(e.g. the browser reclaims the gesture) abandons the drag without committing.
The scroller sets `touch-action: pan-x pan-y`, which keeps native panning but
disables double-tap zoom so captured drags keep receiving `pointermove`.
Long-press → context menu on touch is deferred; when added it must cancel on
move to respect the native-scroll rule.
