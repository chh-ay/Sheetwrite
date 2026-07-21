---
title: Formulas
description: Use Sheetwrite formula syntax, references, functions, errors, and compatibility limits.
---

[Installation](/docs/start/installation/)

Sheetwrite evaluates formulas in the Rust/WASM calculation engine. Formula sources are persisted exactly as document values; evaluated results are cached for rendering, queries, export, and dependent formulas.

Sheetwrite intentionally implements a coherent spreadsheet subset. It does **not** claim full Google Sheets or Excel formula parity.

## Authoring formulas

A formula is a `CellValue` with `kind: "formula"`. The leading `=` is optional at the storage API, although UI input conventionally includes it.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
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

`store.getFormula(address)` returns the source. `store.getCell(address).resolved` returns the evaluated scalar or error sentinel. An unsupported function evaluates to `#NAME?`, but its source remains retrievable and persists through snapshots/XLSX round-trips so a later engine can evaluate it.

## Supported formulas

The Rust parser table in `packages/wasm/src/calc.rs` is the engine source of truth. `FORMULA_FUNCTIONS` in `packages/core/src/formula-assist.ts` mirrors that table for autocomplete; parser and assist tests must change with the table.

| Family | Supported names | Compatibility contract |
| --- | --- | --- |
| Aggregate | `SUM`, `AVG`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA` | Scalars and rectangular ranges; range text is ignored by numeric aggregates. |
| Logical/error | `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `NA` | `IF` and `IFERROR` evaluate only the selected branch. Boolean results are native booleans. |
| Math | `ABS`, `ROUND`, `SQRT`, `MOD`, `POW`, `FLOOR`, `CEILING`, `INT`, `TRUNC`, `SIGN`, `PI` | Finite numeric spreadsheet semantics; invalid numeric domains return an explicit error. |
| Text | `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT`, `CONCATENATE`, `UPPER`, `LOWER`, `TRIM`, `TEXT`, `EXACT` | `TEXT` supports basic decimal patterns plus the documented date/time patterns below. |
| Date/time | `DATE`, `DATEVALUE`, `DAY`, `MONTH`, `YEAR`, `TODAY`, `NOW` | Excel-compatible serial dates, including serial 60; volatile values change only at an explicit barrier. |
| Criteria | `COUNTIF`, `COUNTIFS`, `SUMIF`, `SUMIFS`, `AVERAGEIF`, `AVERAGEIFS` | Operators, wildcard criteria, and equal-shaped criteria ranges. |
| Lookup/reference | `INDEX`, `MATCH`, `VLOOKUP`, `HLOOKUP`, `XLOOKUP` | Exact and documented approximate modes; missing matches return `#N/A`. |
| Names | workbook- and sheet-scoped named ranges | Sheet scope shadows workbook scope; names rebase with structural edits. |
| Dynamic arrays | `FILTER`, `SORT`, `UNIQUE` | A rectangular result spills from one persisted anchor; direct range formulas spill too. |
| External/volatile random | none | `IMPORT*`, `GOOGLEFINANCE`, custom JS, `RAND`, and `RANDBETWEEN` are unsupported. |

Function names are case-insensitive. Commas are the only documented argument separator. Interior omitted optional arguments are preserved (`XLOOKUP(key, keys, results,, 0)`). Locale-specific separators are not accepted.

## Scalars, coercion, and errors

Persisted literals and evaluated formula results use `string | number | boolean | null`. Boolean literals entered as `TRUE`/`FALSE`, formula comparisons, XLSX boolean cells, snapshots, visible windows, clipboard output, and CSV/TSV output remain booleans end to end. Display and text export use uppercase `TRUE` and `FALSE`.

| Sentinel | Meaning |
| --- | --- |
| `#REF!` | Missing sheet/cell reference or invalid reference structure. |
| `#VALUE!` | Wrong value type, malformed formula, invalid arity, or range-shape mismatch. |
| `#DIV/0!` | Division/modulo by zero or an empty criteria average. |
| `#NAME?` | Unknown function or unresolved named range. |
| `#N/A` | Lookup did not find a compatible value. |
| `#NUM!` | Non-finite numeric result, excessive recursion, or an oversized range. |
| `#SPILL!` | A dynamic result intersects content, another spill, a merge, validation/protection metadata, or a sheet boundary. |
| `#CALC!` | A supported array calculation has no result, such as `FILTER` without matches or an empty fallback. |
| `#CYCLE!` | Direct or transitive formula/reference cycle. |
| `#LOADING!` | A formula depends on datasource cells that have not loaded yet. |

Errors are values for display and dependency propagation, not `NaN` or blank rendering. `IFERROR` can replace them. Unsupported or malformed source remains stored even when the result is an error.

Coercion follows these documented rules:

- Arithmetic converts numeric text and booleans (`TRUE = 1`, `FALSE = 0`); nonnumeric text returns `#VALUE!`.
- Direct scalar boolean/text arguments may be coerced by numeric functions. Text/booleans reached through a range are ignored by numeric aggregates, matching common spreadsheet behavior.
- Empty scalar arithmetic behaves as zero. Empty range cells are skipped.
- Comparisons are case-insensitive for text and use spreadsheet type ordering.
- `AND`, `OR`, `NOT`, and `IF` accept booleans, numbers, and the text `TRUE`/`FALSE`.

## References, ranges, and named ranges

A1 cells (`A1`, `$B12`, `AA$3`), normalized rectangles (`A1:B3`), and cross-sheet references (`Sales!E2`, `'Sales 2026'!E2:E10`) are supported. Absolute markers affect fill/structural rewriting; they do not change evaluation.

Named ranges are document operations and snapshot metadata:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.applyTransaction({
  patches: [
    {
      op: "setNamedRange",
      namedRange: {
        name: "Revenue",
        range: {
          sheet: "data",
          start: { row: 1, col: 4 },
          end: { row: 100, col: 4 },
        },
      },
    },
    {
      op: "setNamedRange",
      namedRange: {
        name: "Revenue",
        scope: "summary",
        range: {
          sheet: "data",
          start: { row: 1, col: 5 },
          end: { row: 100, col: 5 },
        },
      },
    },
  ],
});
```

A formula on `summary` resolves the sheet-scoped `Revenue`; formulas on other sheets resolve the workbook definition. Names are case-insensitive, must be formula-safe identifiers, and cannot look like A1 cells or boolean literals. Row/column insertions, removals, and moves rebase their rectangles. Deleting the complete target or its scope removes the definition; formulas then fall back to a workbook definition or evaluate to `#NAME?`.

## Operators

| Precedence, high to low | Operators | Associativity |
| --- | --- | --- |
| Reference | `:` | — |
| Unary sign | unary `+`, unary `-` | right |
| Percentage | postfix `%` | left |
| Exponentiation | `^` | left |
| Multiplication | `*`, `/` | left |
| Addition | `+`, `-` | left |
| Concatenation | `&` | left |
| Comparison | `=`, `<>`, `<`, `>`, `<=`, `>=` | one comparison |

This deliberately follows Excel's spreadsheet precedence rather than programming-language
conventions: `=-2^2` is `4`, `=2^3^2` is `64`, and `=2^-2` is `0.25`. Parenthesize formulas
when portability to a non-spreadsheet evaluator matters. Percentage divides its operand by
100 and may repeat (`=50%%` is `0.005`). Concatenation formats numbers, booleans, and blanks
as spreadsheet text; arithmetic and comparison bind before `&`.

Comparisons return native booleans. For example, `=IF(A1 >= 100, A1 * 0.9, A1)`.

## Date/time semantics

Dates are numbers: whole days since the spreadsheet epoch, with a fractional day for time. The mapping matches the Excel 1900 system used by Sheetwrite XLSX import/export:

- `DATE(1900,1,1) = 1`
- serial `60` is the compatibility-only date `1900-02-29`
- `DATE(1900,3,1) = 61`
- `DATE` normalizes month/day overflow; `DATE(2024,13,1)` is 2025-01-01.
- `DATEVALUE` accepts documented ISO `yyyy-mm-dd` and slash-delimited month/day/year or unambiguous day/month/year.

`TODAY` and `NOW` are volatile, but never consult the clock during paint or ordinary dependency reads. The host captures one absolute instant and triggers a barrier:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

The default captures `new Date()` once. The instant is converted to a UTC serial, so a fixed `Date` produces identical results in every host timezone. `TODAY` returns its whole-day component; `NOW` retains the fraction.

Basic `TEXT` date patterns are `yyyy-mm-dd`, `yyyy/mm/dd`, `mm/dd/yyyy`, `dd/mm/yyyy`, `m/d/yyyy`, `yyyy-mm-dd hh:mm`, `yyyy-mm-dd hh:mm:ss`, `hh:mm`, and `hh:mm:ss`.

## Criteria semantics

Criteria strings may begin with `=`, `<>`, `<`, `<=`, `>`, or `>=`. Numeric and boolean operands are parsed before text comparison. Plain text comparisons are case-insensitive.

`*` matches zero or more characters, `?` matches one character, and `~` escapes the next wildcard. Wildcards apply to equality/inequality text criteria. Criteria are parsed once per formula evaluation, not once per cell.

Every `*IFS` criteria range must have the same shape as its result range/first criteria range; mismatches return `#VALUE!`. `AVERAGEIF(S)` with no numeric matches returns `#DIV/0!`.

## Lookup semantics

- `INDEX(range, row, [column])` uses 1-based indices and returns one scalar. Zero/negative indices return `#VALUE!`; array-return row/column projections are not implemented.
- `MATCH(key, range, 0)` is exact. Match type `1` returns the largest value less than or equal to the key from ascending data. `-1` returns the smallest value greater than or equal to the key from descending data. Invalid ordering returns `#N/A` rather than a plausible wrong row.
- `VLOOKUP`/`HLOOKUP` use exact matching when the final argument is false. The omitted/true mode uses correctly ordered approximate data and returns the largest value less than or equal to the key.
- `XLOOKUP` supports exact, next-smaller (`-1`), next-larger (`1`), and wildcard (`2`) match modes; forward/reverse and ordered binary-search modes are accepted. `if_not_found` is optional. If it is omitted—including via an interior empty argument—the result is `#N/A`.

Lookup errors in the scanned range propagate. Approximate modes validate ordering and do not silently return a result from unsorted input.

## Dynamic arrays and spills

`FILTER(array, include, [if_empty])`, `SORT(array, [sort_index], [sort_order], [by_col])`,
and `UNIQUE(array, [by_col], [exactly_once])` return rectangular values. A direct range formula
such as `=A1:B4` also spills. Arguments use the same 1-based indices and `TRUE`/`FALSE`
coercions as the scalar engine:

- `FILTER` accepts a one-column include range matching the array's rows or a one-row include
  range matching its columns. Shape mismatches are `#VALUE!`. No selected values returns
  `if_empty`, or `#CALC!` when omitted.
- `SORT` defaults to the first column, ascending. `sort_index` selects the row/column key;
  `sort_order` is `1` or `-1`; `by_col=TRUE` sorts columns instead of rows.
- `UNIQUE` preserves first-seen order. `by_col=TRUE` compares columns;
  `exactly_once=TRUE` keeps only items occurring once.

The formula cell is the **anchor** and owns the complete runtime rectangle. Spill children
have no formula source or persisted document identity. `store.getSpillAnchor(address)` returns
the anchor for either the anchor or a child, and returns `null` for an ordinary cell.

Spills publish atomically. Any nonempty destination, another spill, merge, validation or
protected range, unloaded paged cell, or sheet boundary makes the anchor `#SPILL!`; no partial
children remain. Styles, conditional formatting, and hidden rows/columns do not obstruct.
Editing a projected child through canonical core mutations is rejected. Edit or clear the
anchor instead. Structural and metadata changes invalidate ownership and recompute it.

Snapshots and XLSX export serialize only the anchor formula. Children recompute after
hydration. Internal rich copy preserves the anchor formula while treating children as
derived blanks on paste; external TSV receives the displayed spill values. History snapshots
likewise restore the anchor and recompute children, so undo never persists stale projections.
Unsupported OOXML array/data-table formula records remain inert source text with an explicit
warning rather than being silently treated as Sheetwrite spills.

Each array dimension is capped at Excel's row/column limits, one spill is capped at 1,000,000
cells and 64 MiB of bounded value/intermediate storage, and one dynamic recompute pass is
capped at 2,000,000 cell operations. Oversized work returns `#NUM!`; unstable or colliding
shapes return an explicit error rather than truncating.

## Point mode and reference rewriting

While editing a formula, clicking a cell inserts its A1 reference and dragging inserts a range. Relative references shift during fill; `$`-absolute axes remain fixed. Structural row/column edits rewrite direct and named references while preserving stable sheet identity.

The same `$`-aware utility is public:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import { shiftA1Refs } from "@sheetwrite/core";

shiftA1Refs("A1 + $B$1", 0, 1); // "B1 + $B$1"
```

A1 address helpers are exported as `cellA1`, `colToA1`, `labelToCol`, and `rangeA1`.
