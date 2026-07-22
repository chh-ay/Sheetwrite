---
title: Formulas
description: Use Sheetwrite formula syntax, references, functions, errors, and compatibility limits.
---

[Installation](/docs/start/installation/)

Sheetwrite evaluates formulas in the Rust/WASM calculation engine. Formula sources are persisted exactly as document values; evaluated results are cached for rendering, queries, export, and dependent formulas.

Sheetwrite intentionally implements a coherent spreadsheet subset. It does **not** claim full Google Sheets or Excel formula parity.

See the generated [formula function contract](/docs/reference/formula-functions/) for the complete inventory-derived function table and the [detailed compatibility results](/docs/reference/compatibility-matrix/) for checked operator, spill, preservation, and unsupported boundaries.

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

The checked, versioned `sheetwrite.formula-capabilities` contract is the source of truth for function registration. Its generated reference publishes all **100 required-supported target functions plus every incumbent function**, grouped by family, with aliases, exact signature and semantic profiles, implementation/evidence paths, source links, and behavior status. Do not infer support from an Excel, Google Sheets, or OpenFormula function with a similar name.

[Browse the generated formula function contract →](/docs/reference/formula-functions/)

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

## LET bindings

`LET(name1, value1, [name2, value2, …], calculation)` supports lexical, case-insensitive local names. A name starts with an ASCII letter or `_`; subsequent characters may also contain ASCII digits or `.`. Inner `LET` bindings shadow outer bindings, and each value expression can see only earlier bindings.

Bindings are lazy. Only names reachable from `calculation` are expanded and evaluated, so an unused cell read, error, or `NOW()` does not become a dependency, error, or volatile marker. A used binding preserves ordinary formula dependency, spill, copy/fill, and structural-reference behavior. `LET(x,1/0,7)` therefore returns `7`, while `LET(x,A1,x+1)` tracks `A1`.

One `LET` admits at most 126 bindings. Expansion admits at most 16,384 AST nodes across reachable bindings. Invalid name/arity/binding structure returns `#VALUE!`; expansion beyond the node ceiling returns `#NUM!`. `LET` does not create callable functions: `LAMBDA` and higher-order execution remain unsupported.

## References, ranges, and named ranges

A1 cells (`A1`, `$B12`, `AA$3`), rectangular ranges (`A1:B3`), and cross-sheet references (`Sales!E2`, `'Sales 2026'!E2:E10`) are supported. Absolute markers affect fill/structural rewriting; they do not change evaluation.

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

Dates are numbers: whole days since the spreadsheet epoch, with a fractional day for time. Sheetwrite uses only the Excel 1900 date system on this path:

- serial `0` maps to `1899-12-31`
- `DATE(1900,1,1) = 1`
- serial `60` is retained as the compatibility-only, non-Gregorian date `1900-02-29`
- `DATE(1900,3,1) = 61`
- `DATE` treats 1900 as a leap year for this serial boundary and normalizes month/day overflow; `DATE(2024,13,1)` is 2025-01-01
- `DATEVALUE` is locale-neutral: it accepts the documented ISO `yyyy-mm-dd` form and fixed slash-delimited numeric forms; it never consults the host locale

`TODAY` and `NOW` are volatile, but never consult the clock during paint or ordinary dependency reads. The host captures one absolute instant and triggers a barrier:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

The default captures `new Date()` once. The instant is converted to a UTC serial, so a fixed `Date` produces identical results in every host timezone. `TODAY` returns its whole-day component; `NOW` retains the fraction.

Basic `TEXT` date patterns are `yyyy-mm-dd`, `yyyy/mm/dd`, `mm/dd/yyyy`, `dd/mm/yyyy`, `m/d/yyyy`, `yyyy-mm-dd hh:mm`, `yyyy-mm-dd hh:mm:ss`, `hh:mm`, and `hh:mm:ss`.

Text evaluation is host-locale neutral. Function argument separators stay commas; `VALUE` uses `.` decimal and `,` grouping, and `NUMBERVALUE(text, [decimal_separator], [group_separator])` uses those same defaults unless the separators are supplied explicitly. Case conversion uses Unicode mappings, not browser locale. `LEN`, `LEFT`, `RIGHT`, and `MID` count Unicode scalar values rather than UTF-16 code units. Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps; excess work returns `#NUM!`.

## Criteria semantics and shapes

Criteria strings may begin with `=`, `<>`, `<`, `<=`, `>`, or `>=`. Numeric and boolean operands are parsed before text comparison. Plain text comparisons are case-insensitive. `*` matches zero or more characters, `?` matches one character, and `~` escapes the next wildcard. Wildcards apply to equality/inequality text criteria. Criteria are parsed once per formula evaluation, not once per cell.

Shapes are exact row-by-column dimensions; equal cell counts with different dimensions do not match:

- `COUNTIF(criteria_range, criterion)` accepts one matrix and one scalar criterion.
- `COUNTIFS(criteria_range1, criterion1, …)` requires one or more range/criterion pairs. Every criteria range must have exactly the shape of the first.
- `SUMIF(criteria_range, criterion, [value_range])` and `AVERAGEIF(...)` use `criteria_range` as the value range when the third argument is omitted. When supplied, `value_range` must have exactly the same shape; Sheetwrite does not implement Excel's top-left range extension.
- `SUMIFS(value_range, criteria_range1, criterion1, …)`, `AVERAGEIFS`, `MAXIFS`, and `MINIFS` require one or more pairs after the value range. Every criteria range must exactly match the value range.

A mismatch or malformed pair list returns `#VALUE!`. Matching result-range errors propagate. Text, booleans, and blanks in a numeric result range are ignored. A criteria sum with no numeric matches is `0`; an average is `#DIV/0!`; `MAXIFS`/`MINIFS` return `0`.

## SUMPRODUCT and SUBTOTAL

`SUMPRODUCT(array1, [array2, …])` requires at least one argument. Every argument must have the same exact row-by-column shape; a scalar is a 1×1 shape, and a dimensional mismatch returns `#VALUE!`. It multiplies corresponding cells and sums the products. Text, booleans, and blanks reached through ranges contribute zero; directly supplied numeric text and booleans use ordinary scalar numeric coercion. Errors propagate, and a non-finite product or total returns `#NUM!`.

`SUBTOTAL(function_number, reference1, [reference2, …])` accepts codes `1`–`11`: `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `SUM`, `VAR.S`, and `VAR.P`. It accepts up to 253 reference arguments and uses the corresponding aggregate's range coercion/error rules. Codes `101`–`111` are deliberately unsupported and return `#VALUE!` pending hidden-row provenance in formula range values. Nested-subtotal and filtered/hidden-row exclusion must not be inferred.

## Financial functions

`PV`, `FV`, `PMT`, `NPV`, `IRR`, `RATE`, `IPMT`, and `PPMT` use binary64 arithmetic, fixed defaults from the generated signatures, and explicit domain errors. `NPV` discounts its first cash flow at period 1 and uses compensated summation. Range cash flows ignore text and blanks; errors propagate.

`IRR` requires at least one positive and one negative cash flow. `IRR` and `RATE` use the caller's guess (default `0.1`), 14 deterministic bracket steps, at most 100 deterministic solve steps, fixed absolute/relative tolerances of `1e-12`, and a finite transformed search domain. Invalid domains or failure to converge return `#NUM!`; no random seed, host locale, wall clock, or platform-specific iteration budget is used.

## Lookup semantics

- `INDEX(range, row, [column])` uses 1-based indices and returns one scalar. Zero/negative indices return `#VALUE!`; array-return row/column projections are not implemented.
- `MATCH(key, range, 0)` is exact. Match type `1` returns the largest value less than or equal to the key from ascending data. `-1` returns the smallest value greater than or equal to the key from descending data. Invalid ordering returns `#N/A` rather than a plausible wrong row.
- `VLOOKUP`/`HLOOKUP` use exact matching when the final argument is false. The omitted/true mode uses correctly ordered approximate data and returns the largest value less than or equal to the key.
- `XLOOKUP` supports exact, next-smaller (`-1`), next-larger (`1`), and wildcard (`2`) match modes; forward/reverse and ordered binary-search modes are accepted. `if_not_found` is optional. If it is omitted—including via an interior empty argument—the result is `#N/A`.

Lookup errors in the scanned range propagate. Approximate modes validate ordering and do not silently return a result from unsorted input.

## Dynamic arrays and spills

`FILTER`, `SORT`, `UNIQUE`, `TRANSPOSE`, `SEQUENCE`, `TAKE`, `DROP`, `CHOOSECOLS`, and `CHOOSEROWS` return rectangular values. A direct range formula such as `=A1:B4` also spills:

- `FILTER(array, include, [if_empty])` accepts a one-column include range matching the array's rows or a one-row include range matching its columns. Shape mismatches are `#VALUE!`. No selected values returns `if_empty`, or `#CALC!` when omitted.
- `SORT(array, [sort_index], [sort_order], [by_col])` defaults to the first column, ascending. `sort_index` selects the row/column key; `sort_order` is `1` or `-1`; `by_col=TRUE` sorts columns instead of rows. Multi-key sorting is unsupported.
- `UNIQUE(array, [by_col], [exactly_once])` preserves first-seen order. `by_col=TRUE` compares columns; `exactly_once=TRUE` keeps only items occurring once. An empty result is `#CALC!`.
- `TRANSPOSE(array)` swaps rows and columns.
- `SEQUENCE(rows, [columns], [start], [step])` requires positive integer dimensions and defaults to one column, start `1`, step `1`; values fill row-major.
- `TAKE`/`DROP(array, rows, [columns])` use positive counts from the start and negative counts from the end. A zero or empty result is `#CALC!`; counts beyond an axis clamp to that axis.
- `CHOOSECOLS`/`CHOOSEROWS(array, index1, …)` use 1-based positive indices and end-relative negative indices. Repeated indices repeat output axes; zero/out-of-range indices return `#VALUE!`.

Errors inside a returned array stay at their corresponding spill children; a mixed result such
as `{1;#N/A;2}` does not collapse to an anchor-only error.

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
capped at 2,000,000 cell operations. Materialized spill ownership across the complete store is
also capped at 1,000,000 cells and 64 MiB, including per-child error metadata. Installation
checks that cumulative budget atomically; clearing, shrinking, or removing a spill releases its
ownership. Oversized work returns stable `#NUM!` without partial children, while unstable or
colliding shapes return an explicit error rather than truncating.

The admission check happens before materialization when the shape is statically knowable and is repeated before spill ownership is installed. It accounts source/result copies and per-item auxiliary storage; a shape that could exceed a ceiling is rejected rather than optimistically allocated. A recompute either atomically replaces the complete previous spill or leaves no projected children.

## Unsupported categories

Formula evaluation performs no network request and runs no custom JavaScript. Automatic volatile functions beyond the explicit `TODAY`/`NOW` host-clock barrier, network functions, external/live-data providers, arbitrary external workbook references, database functions, cube/OLAP functions, and `LAMBDA` or higher-order array execution are unsupported. Examples include `RAND`, `RANDBETWEEN`, `INDIRECT`, `OFFSET`, `WEBSERVICE`, `GOOGLEFINANCE`, `IMPORT*`, `RTD`, `DSUM`, `CUBEVALUE`, `LAMBDA`, `MAP`, `REDUCE`, and `SCAN`.

Unsupported names evaluate to `#NAME?` while preserving source for snapshots and interchange. There is no compatibility shim or side-effecting fallback. The generated [unsupported-category ledger](/docs/reference/formula-functions/#unsupported-categories) is derived from the versioned inventory.

## Performance evidence

No formula throughput or latency number is published from this guide because no checked final formula-performance evidence file is present. Follow the [performance evidence guide](/docs/guides/performance-resources/) to capture and freshness-check measurements; do not treat resource ceilings as benchmark results.

## Point mode and reference rewriting

While editing a formula, clicking a cell inserts its A1 reference and dragging inserts a range. Relative references shift during fill; `$`-absolute axes remain fixed. Structural row/column edits rewrite direct and named references while preserving stable sheet identity.

The same `$`-aware utility is public:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import { shiftA1Refs } from "@sheetwrite/core";

shiftA1Refs("A1 + $B$1", 0, 1); // "B1 + $B$1"
```

A1 address helpers are exported as `cellA1`, `colToA1`, `labelToCol`, and `rangeA1`.
