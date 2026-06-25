# Formulas

[Docs index](./README.md)

Sheetwrite ships a small arithmetic formula dialect evaluated in the WASM calc
layer. Formulas reference other cells by A1 address, support the usual operators
and a fixed function set, and are re-evaluated whenever their inputs change.

## Authoring a formula

A formula is a cell value of `kind: "formula"`. Set it like any other value; the
leading `=` is optional (the parser strips it):

```ts
grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 5, col: 4 },
      value: { kind: "formula", src: "=SUM(E1:E5)" },
    },
  ],
});
```

The result is computed in WASM and cached, so the render path reads a plain number.

## References and ranges

- A **cell reference** is an A1 token: `A1`, `B12`, `AA3` (columns are
  1–3 letters; rows are 1-based).
- A reference may be **absolute** on either axis: `$A$1`, `$A1`, and `A$1` are all
  valid tokens, and the engine evaluates each to the same cell as the bare `A1`.
  The `$` markers only matter to [drag-to-fill](#reference-rewriting) — they pin
  the column and/or row when the formula is copied — and are otherwise transparent
  to the calc engine.
- A **range** is two corners joined by `:` — `A1:B3` — and is normalized, so
  `B3:A1` means the same rectangle.
- A bare range only makes sense **inside a function** that consumes it
  (`SUM(A1:A9)`). Using a range as a plain operand yields a non-finite result.
- A **cross-sheet formula reference** is written as `=Sales!E2` (quote names with
  spaces as `='Sales 2026'!E2`). Sheetwrite evaluates these in the Rust formula
  engine, so arithmetic and range formulas work too:
  `=Sales!E2 * 2`, `=SUM(Sales!E2:E10)`, and `=IF('Sales 2026'!B2 > 0, 1, 0)`.
  A bare cross-sheet cell link still works; it is stored as a formula source, so
  the formula bar shows the same string the user typed.

During evaluation a referenced non-formula cell contributes its numeric value;
empty or text cells count as `0`.

## Operators

| Category | Operators |
| --- | --- |
| Arithmetic | `+`  `-`  `*`  `/`  and unary minus (`-A1`) |
| Comparison | `=`  `<>`  `<`  `>`  `<=`  `>=` |

Inside a formula `=` is the equality operator (not assignment). Comparisons
evaluate to `1` for true and `0` for false, which composes directly with `IF`,
`AND`, `OR`, and `NOT`:

```
=IF(A1 >= 100, A1 * 0.9, A1)
```

## Functions

The full function set, evaluated over numeric arguments (ranges are expanded into
their cells first):

| Function | Arguments | Result |
| --- | --- | --- |
| `SUM` | values / ranges | Sum of all values. |
| `AVG` / `AVERAGE` | values / ranges | Mean (`0` when empty). Both spellings work. |
| `MIN` | values / ranges | Smallest value. |
| `MAX` | values / ranges | Largest value. |
| `COUNT` | values / ranges | Number of collected values. |
| `IF` | `(cond, then, else)` | `then` when `cond` is non-zero, else `else`. |
| `ABS` | `(x)` | Absolute value. |
| `ROUND` | `(x, digits)` | `x` rounded to `digits` decimal places. |
| `SQRT` | `(x)` | Square root. |
| `MOD` | `(a, b)` | `a` modulo `b` (non-finite when `b = 0`). |
| `POW` | `(a, b)` | `a` raised to the power `b`. |
| `AND` | values | `1` if every value is non-zero, else `0`. |
| `OR` | values | `1` if any value is non-zero, else `0`. |
| `NOT` | `(x)` | `1` when `x` is `0`, else `0`. |

Function names are case-insensitive. `IF`, `AND`, `OR`, and `NOT` treat any
non-zero number as true and `0` as false.

```
=ROUND(AVERAGE(B2:B10), 2)
=IF(AND(A1 > 0, B1 > 0), POW(A1, B1), 0)
```

## Cycle detection

Sheetwrite guards against reference cycles, and there are two tiers:

- **Arithmetic formulas** (`kind: "formula"`) are evaluated with a visited set; a
  cell that references itself, directly or transitively, evaluates to a non-finite
  result rather than looping. Because the number formatter renders non-finite
  values as an empty string, a cyclic formula shows blank.
- **Plain cross-references** (`kind: "ref"`) are resolved by a separate display
  tier that follows `ref → target` chains. When a chain forms a cycle the resolved
  value is the sentinel `REF_CYCLE`, exported from `@sheetwrite/core`:

  ```ts
  import { REF_CYCLE } from "@sheetwrite/core";
  // REF_CYCLE === "#CYCLE!"
  ```

## Point-mode

While editing a cell whose text begins with `=`, clicking or dragging on the grid
inserts references into the formula instead of moving the selection:

- A single click inserts that cell's A1 reference at the caret (`A1`).
- Dragging extends it to a range (`A1:C4`).

Releasing the mouse ends point-mode; keep typing to continue the formula. This is
the standard "click to build a formula" behavior.

## Reference rewriting

References are rewritten automatically so formulas keep pointing at the right data:

- **Row insert / delete.** When rows are added or removed (`addRows` / `removeRows`
  patches), row references at or after the change shift by the row delta.
- **Drag-to-fill.** When a formula is filled into neighboring cells, **relative**
  A1 parts shift by the fill offset while **absolute** parts (prefixed with `$`)
  stay fixed. Given `=A1 + $B$1` filled one column to the right, the relative `A1`
  becomes `B1` and the absolute `$B$1` is preserved. See
  [Interaction → Drag-to-fill](./interaction.md#drag-to-fill).

The same `$`-aware rewriting is available as a utility:

```ts
import { shiftA1Refs } from "@sheetwrite/core";

shiftA1Refs("A1 + $B$1", 0, 1); // "B1 + $B$1"
```

## A1 utilities

For working with addresses outside formulas, the core exports:

```ts
import { cellA1, colToA1, labelToCol, rangeA1 } from "@sheetwrite/core";

colToA1(0);            // "A"
colToA1(26);           // "AA"
labelToCol("AA");      // 26
cellA1(0, 0);          // "A1"
rangeA1({ row: 0, col: 0 }, { row: 2, col: 1 }); // "A1:B3"
```
