---
title: "Formula function contract"
description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."
---

# Formula function contract

This page is generated from the checked version 1 `sheetwrite.formula-capabilities` inventory. It publishes **100 required-supported target functions** and **54 incumbent functions** (154 canonical functions total) without maintaining a second name list. Aliases are shown beside their canonical function.

A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.

## Bounded evaluation contract

- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.
- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see the [formula guide](/docs/guides/formulas/#dynamic-arrays-and-spills) for admission rules.
- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.
- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.
- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.

No formula throughput or latency number is published here because this contract has no checked final formula-performance artifact. Use the [performance evidence protocol](/docs/guides/performance-resources/) to capture and validate measurements; limits above are implementation ceilings, not benchmark results.

## Functions by family

### Dynamic array

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `FILTER` | incumbent | [`filter`](#signature-filter) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SORT` | incumbent | [`sort`](#signature-sort) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNIQUE` | incumbent | [`unique`](#signature-unique) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRANSPOSE` | required target | [`array-unary`](#signature-array-unary) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEQUENCE` | required target | [`sequence`](#signature-sequence) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TAKE` | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DROP` | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSECOLS` | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSEROWS` | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Date and time

Taxonomy/source: [Date and time functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `DATE` | incumbent | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DATEVALUE` | incumbent | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAY` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MONTH` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEAR` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TODAY` | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOW` | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIME` | required target | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIMEVALUE` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HOUR` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINUTE` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SECOND` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS` | required target | [`date-pair`](#signature-date-pair) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EDATE` | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EOMONTH` | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKDAY` | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKNUM` | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WORKDAY` | required target | [`workday`](#signature-workday) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NETWORKDAYS` | required target | [`networkdays`](#signature-networkdays) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEARFRAC` | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS360` | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Financial

Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `PV` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FV` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PMT` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NPV` | required target | [`npv`](#signature-npv) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IRR` | required target | [`irr`](#signature-irr) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RATE` | required target | [`rate`](#signature-rate) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IPMT` | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PPMT` | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Information and error

Taxonomy/source: [Information functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `IFERROR` | incumbent | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFNA` | required target | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISBLANK` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNUMBER` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISTEXT` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISLOGICAL` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERROR` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERR` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNA` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TYPE` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `N` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `T` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NA` | incumbent | [`zero`](#signature-zero) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Logical and control flow

Taxonomy/source: [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `IF` | incumbent | [`if`](#signature-if) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AND` | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `OR` | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOT` | incumbent | [`unary-value`](#signature-unary-value) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFS` | required target | [`ifs`](#signature-ifs) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SWITCH` | required target | [`switch`](#signature-switch) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XOR` | required target | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUE` | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FALSE` | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LET` | required target | [`let`](#signature-let) | [`let-binding`](#semantics-let-binding) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Lookup and reference

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `INDEX` | incumbent | [`index`](#signature-index) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MATCH` | incumbent | [`match`](#signature-match) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VLOOKUP` | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HLOOKUP` | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XLOOKUP` | incumbent | [`xlookup`](#signature-xlookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XMATCH` | required target | [`xmatch`](#signature-xmatch) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSE` | required target | [`choose`](#signature-choose) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROW` | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROWS` | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMN` | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMNS` | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ADDRESS` | required target | [`address`](#signature-address) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Math and trigonometry

Taxonomy/source: [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `SUM` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ABS` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUND` | incumbent | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SQRT` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MOD` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POW` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`parser-assisted-evaluator-declared`](#implementation-parser-assisted-evaluator-declared) |
| `FLOOR` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CEILING` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `INT` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUNC` | incumbent | [`trunc`](#signature-trunc) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SIGN` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PI` | incumbent | [`zero`](#signature-zero) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIF` | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIFS` | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PRODUCT` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMPRODUCT` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POWER` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXP` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LN` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG` | required target | [`log`](#signature-log) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG10` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDUP` | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDDOWN` | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MROUND` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EVEN` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ODD` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUOTIENT` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GCD` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LCM` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBTOTAL` | required target | [`subtotal`](#signature-subtotal) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Statistical

Taxonomy/source: [Statistical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `AVERAGE` (`AVG`) | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MIN` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAX` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNT` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTA` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIF` | incumbent | [`criteria-one`](#signature-criteria-one) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIFS` | incumbent | [`criteria-many`](#signature-criteria-many) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIF` | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIFS` | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MEDIAN` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MODE.SNGL` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LARGE` | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SMALL` | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RANK.EQ` | required target | [`rank`](#signature-rank) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PERCENTILE.INC` | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUARTILE.INC` | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.S` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.P` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.S` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.P` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GEOMEAN` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CORREL` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.S` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.P` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTBLANK` | required target | [`unary-value`](#signature-unary-value) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAXIFS` | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINIFS` | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Text

Taxonomy/source: [Text functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- |
| `LEN` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LEFT` | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RIGHT` | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MID` | incumbent | [`mid`](#signature-mid) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CONCAT` (`CONCATENATE`) | incumbent | [`variadic-values`](#signature-variadic-values) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UPPER` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOWER` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRIM` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXT` | incumbent | [`text-format`](#signature-text-format) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXACT` | incumbent | [`binary-number`](#signature-binary-number) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXTJOIN` | required target | [`text-join`](#signature-text-join) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBSTITUTE` | required target | [`substitute`](#signature-substitute) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPLACE` | required target | [`replace`](#signature-replace) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FIND` | required target | [`find-search`](#signature-find-search) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEARCH` | required target | [`find-search`](#signature-find-search) | [`text-search`](#semantics-text-search) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VALUE` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CLEAN` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPT` | required target | [`repeat-text`](#signature-repeat-text) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHAR` | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CODE` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICHAR` | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICODE` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PROPER` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NUMBERVALUE` | required target | [`number-value`](#signature-number-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

### Signature: zero

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

### Signature: unary-value

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: unary-number

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

### Signature: binary-number

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

### Signature: variadic-values

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: optional-variadic-values

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |

### Signature: logical-variadic

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logical` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: if

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logicalTest` | yes | none | `scalar`, `reference` | `once` |
| `valueIfTrue` | no | true | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfFalse` | no | false | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: if-error

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfError` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: ifs

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `testAndValue` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: switch

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `expression` | yes | none | `scalar`, `reference` | `once` |
| `valueAndResult` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |
| `defaultValue` | no | #N/A | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: let

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nameAndValue` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `paired` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `once` |

### Signature: round

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | yes | none | `scalar`, `reference` | `once` |

### Signature: trunc

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | no | 0 | `scalar`, `reference` | `once` |

### Signature: log

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `base` | no | 10 | `scalar`, `reference` | `once` |

### Signature: subtotal

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

### Signature: left-right

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | no | 1 | `scalar`, `reference` | `once` |

### Signature: mid

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

### Signature: text-format

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `formatText` | yes | none | `scalar`, `reference` | `once` |

### Signature: text-join

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `delimiter` | yes | none | `scalar`, `reference` | `once` |
| `ignoreEmpty` | yes | none | `scalar`, `reference` | `once` |
| `text` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: substitute

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |
| `instance` | no | all | `scalar`, `reference` | `once` |

### Signature: replace

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |

### Signature: find-search

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `findText` | yes | none | `scalar`, `reference` | `once` |
| `withinText` | yes | none | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |

### Signature: repeat-text

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

### Signature: number-value

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `decimalSeparator` | no | . | `scalar`, `reference` | `once` |
| `groupSeparator` | no | , | `scalar`, `reference` | `once` |

### Signature: date-three

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `part1` | yes | none | `scalar`, `reference` | `once` |
| `part2` | yes | none | `scalar`, `reference` | `once` |
| `part3` | yes | none | `scalar`, `reference` | `once` |

### Signature: date-pair

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `startDate` | yes | none | `scalar`, `reference` | `once` |

### Signature: date-offset

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `offset` | yes | none | `scalar`, `reference` | `once` |

### Signature: weekday-weeknum

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `serialNumber` | yes | none | `scalar`, `reference` | `once` |
| `returnType` | no | 1 | `scalar`, `reference` | `once` |

### Signature: workday

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `days` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

### Signature: networkdays

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

### Signature: yearfrac-days360

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `basisOrMethod` | no | 0 | `scalar`, `reference` | `once` |

### Signature: value-k

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `k` | yes | none | `scalar`, `reference` | `once` |

### Signature: rank

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `once` |
| `order` | no | 0 | `scalar`, `reference` | `once` |

### Signature: percentile

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `fraction` | yes | none | `scalar`, `reference` | `once` |

### Signature: pair-arrays

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: criteria-one

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |

### Signature: criteria-many

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: sumif

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |
| `sumRange` | no | range | `range`, `array`, `reference` | `once` |

### Signature: sumifs

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `sumRange` | yes | none | `range`, `array`, `reference` | `once` |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: match

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: xmatch

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: index

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | no | 1 | `scalar`, `reference` | `once` |

### Signature: xlookup

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `returnArray` | yes | none | `range`, `array`, `reference` | `once` |
| `ifNotFound` | no | #N/A | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: table-lookup

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `table` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `approximate` | no | true | `scalar`, `reference` | `once` |

### Signature: filter

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `include` | yes | none | `range`, `array`, `reference` | `once` |
| `ifEmpty` | no | #CALC! | `scalar`, `reference` | `once` |

### Signature: sort

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `sortIndex` | no | 1 | `scalar`, `reference` | `once` |
| `sortOrder` | no | 1 | `scalar`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |

### Signature: unique

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |
| `exactlyOnce` | no | false | `scalar`, `reference` | `once` |

### Signature: choose

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: optional-reference

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | no | formula-cell | `range`, `array`, `reference` | `once` |

### Signature: address

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | yes | none | `scalar`, `reference` | `once` |
| `absNumber` | no | 1 | `scalar`, `reference` | `once` |
| `a1` | no | true | `scalar`, `reference` | `once` |
| `sheetText` | no | none | `scalar`, `reference` | `once` |

### Signature: array-unary

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: sequence

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | 1 | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |
| `step` | no | 1 | `scalar`, `reference` | `once` |

### Signature: take-drop

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | all | `scalar`, `reference` | `once` |

### Signature: choose-axis

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `array`, `reference` | `one-or-more` |

### Signature: pv-fv-pmt

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `paymentOrPresentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

### Signature: npv

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: irr

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

### Signature: rate

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

### Signature: period-payment

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guide's function-specific sections rather than assuming another spreadsheet's edge behavior.

### Semantics: scalar

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: aggregate

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: ignored<br />text: ignored-in-ranges<br />boolean: ignored-in-ranges<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: information

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: function-defined |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: logical

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: false<br />text: function-defined<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: lazy-control

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: trap-selected |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-branches<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: let-binding

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-bindings<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: literal |
| environment | locale: function-defined<br />dateSystem: function-defined |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text-sensitive

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: sensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text-search

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: criteria

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: pairwise<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: date-time

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: excel-1900 |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: volatile-date

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: rejected<br />array: rejected<br />broadcast: none<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: not-applicable<br />dateSystem: host-clock |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: none<br />lazy: not-applicable<br />spill: scalar<br />fill: source-preserved<br />copy: source-preserved<br />structuralRewrite: source-preserved |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: lookup

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: exact<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: array

| Dimension | Contract |
| --- | --- |
| shape | scalar: contextual<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: array |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: array<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: financial

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: financial-iterative

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: bounded<br />maximum: 100 |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

## Dialect profiles

### Dialect: excel-documented

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

## Implementation profiles

### Implementation: implemented-assisted

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

### Implementation: parser-assisted-evaluator-declared

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |

### Implementation: parser-declared-target

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | missing<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | registration-tested<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

## Unsupported categories

Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.

| Category | Scope | Examples | Source | Evidence |
| --- | --- | --- | --- | --- |
| **Volatile recalculation** (`volatile`) | Automatic volatility semantics beyond the existing clock functions are outside the supported contract. | `INDIRECT`, `OFFSET`, `RAND`, `RANDBETWEEN`, `RANDARRAY` | [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Network functions** (`network`) | Formula evaluation never performs network requests. | `ENCODEURL`, `FILTERXML`, `IMAGE`, `WEBSERVICE` | [Web functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **External data functions** (`external`) | Functions that query external providers or live data connections are not evaluated. | `GOOGLEFINANCE`, `IMPORTDATA`, `IMPORTHTML`, `IMPORTXML`, `RTD` | [Add-in and Automation functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Database functions** (`database`) | D-prefixed database aggregation functions are not evaluated. | `DAVERAGE`, `DCOUNT`, `DGET`, `DSUM`, `DVAR` | [Database functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Cube functions** (`cube`) | OLAP cube members, sets, and values are not resolved. | `CUBEMEMBER`, `CUBESET`, `CUBEVALUE` | [Cube functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **LAMBDA and higher-order functions** (`lambda`) | User-defined lambdas and higher-order array execution are not evaluated. | `BYCOL`, `BYROW`, `LAMBDA`, `MAKEARRAY`, `MAP`, `REDUCE`, `SCAN` | [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Arbitrary external workbook references** (`external-workbook`) | References to arbitrary workbook files are not loaded or dereferenced. | `'[Book.xlsx]Sheet1'!A1` | [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

In particular, automatic volatile functions beyond the explicit host-clock barrier, network/external-data functions, arbitrary external workbook links, database functions, cube/OLAP functions, and `LAMBDA`/higher-order execution are unsupported. `TODAY` and `NOW` are the documented clock-function exception; `LET` is supported and is not a `LAMBDA` fallback.
