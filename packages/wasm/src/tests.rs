use super::*;

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "expected {expected}, got {actual}"
    );
}

fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

fn string(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
    store.get_cell(sheet, row, col).string()
}

fn put_number(sheet: &mut SheetData, row: usize, col: usize, value: f64) {
    let i = sheet.idx(row, col);
    sheet.kind[i] = KIND_NUMBER;
    sheet.set_num(i, value);
}

#[test]
fn sheet_insert_rows_moves_cells_and_shifts_formulas() {
    let mut sheet = SheetData::new(2, 3);
    put_number(&mut sheet, 0, 0, 10.0);
    put_number(&mut sheet, 1, 0, 20.0);
    put_number(&mut sheet, 2, 1, 30.0);
    sheet
        .formulas
        .insert((0, 0), FormulaEntry::parsed(parse("=A2+B3").unwrap(), 0));

    sheet.insert_rows(0, 1, 1);

    assert_eq!(sheet.row_count, 4);
    assert_eq!(sheet.kind[sheet.idx(1, 0)], KIND_EMPTY);
    assert_close(sheet.num_at(sheet.idx(2, 0)), 20.0);
    assert_close(sheet.num_at(sheet.idx(3, 1)), 30.0);

    let entry = sheet.formulas.get(&(0, 0)).expect("formula should remain");
    assert_eq!(entry.ast, Some(parse("=A3+B4").unwrap()));
    assert!(sheet.all_dirty);
}

#[test]
fn sheet_delete_rows_moves_cells_removes_formulas_and_shifts_refs() {
    let mut sheet = SheetData::new(1, 4);
    put_number(&mut sheet, 0, 0, 1.0);
    put_number(&mut sheet, 1, 0, 2.0);
    put_number(&mut sheet, 2, 0, 3.0);
    put_number(&mut sheet, 3, 0, 4.0);
    sheet
        .formulas
        .insert((0, 0), FormulaEntry::parsed(parse("=A4").unwrap(), 0));
    sheet
        .formulas
        .insert((1, 0), FormulaEntry::parsed(parse("=A1").unwrap(), 0));

    sheet.delete_rows(0, 1, 1);

    assert_eq!(sheet.row_count, 3);
    assert_close(sheet.num_at(sheet.idx(1, 0)), 3.0);
    assert_close(sheet.num_at(sheet.idx(2, 0)), 4.0);
    assert!(!sheet.formulas.contains_key(&(1, 0)));

    let entry = sheet.formulas.get(&(0, 0)).expect("formula should remain");
    assert_eq!(entry.ast, Some(parse("=A3").unwrap()));
    assert!(sheet.all_dirty);
}

#[test]
fn sheet_resize_rows_preserves_overlap_and_drops_oob_formulas() {
    let mut sheet = SheetData::new(2, 3);
    put_number(&mut sheet, 2, 0, 12.0);
    put_number(&mut sheet, 2, 1, 24.0);
    sheet
        .formulas
        .insert((2, 1), FormulaEntry::parsed(parse("=A3").unwrap(), 0));

    sheet.resize_rows(5);
    assert_eq!(sheet.row_count, 5);
    assert_close(sheet.num_at(sheet.idx(2, 0)), 12.0);
    assert_close(sheet.num_at(sheet.idx(2, 1)), 24.0);

    sheet.resize_rows(2);
    assert_eq!(sheet.row_count, 2);
    assert!(!sheet.formulas.contains_key(&(2, 1)));
}

#[test]
fn sheet_noops_overflow_and_paged_load_state_preserve_invariants() {
    let overflow = SheetData::new(usize::MAX, 2);
    assert_eq!((overflow.n_cols, overflow.row_count), (0, 0));

    let mut dense = SheetData::new(2, 2);
    put_number(&mut dense, 1, 1, 9.0);
    dense.resize_rows(2);
    dense.insert_rows(0, 1, 0);
    dense.delete_rows(0, 2, 1);
    dense.delete_rows(0, 0, 0);
    dense.insert_cols(0, 1, 0);
    dense.delete_cols(0, 2, 1);
    dense.delete_cols(0, 0, 0);
    assert_close(dense.num_at(dense.idx(1, 1)), 9.0);

    dense.dirty_cells.extend((0..5_000).map(|row| (row, 0)));
    assert!(dense.dirty_cells.capacity() > 4_096);
    dense.clear_dirty();
    assert!(dense.dirty_cells.is_empty());
    assert!(dense.dirty_cells.capacity() <= 4_096);

    let mut paged = SheetData::new_paged(2, 2, 1, 0);
    assert!(!paged.is_fully_loaded());
    assert!(!paged.range_fully_loaded(0, 0, 1, 1));
    for col in 0..2 {
        for row in 0..2 {
            paged.mark_cell_loaded(row, col, true);
        }
    }
    assert!(paged.is_fully_loaded());
    assert!(paged.range_fully_loaded(0, 0, 1, 1));
    assert!(paged.is_cell_dirty(1, 1));
    paged.mark_range_clean(0, 2, 0, 2);
    assert!(!paged.is_cell_dirty(1, 1));
    paged.pin_range(1, 1, &[0]);
    paged.pin_range(0, 2, &[0, 1]);
    assert_eq!(paged.paged_stats().map(|stats| stats.1), Some(4));
}

#[test]
fn formulas_cover_functions_ranges_and_comparisons() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 32);
    store.set_number(sheet, 0, 0, 9.0, 0);
    store.set_number(sheet, 1, 0, 3.0, 0);
    store.set_number(sheet, 2, 0, 6.0, 0);
    store.set_number(sheet, 0, 1, 2.0, 0);

    let formulas = [
        (0, 2, "=SUM(A1:A3)"),
        (1, 2, "=AVG(A1:A3)"),
        (2, 2, "=MIN(A1:A3)"),
        (3, 2, "=MAX(A1:A3)"),
        (4, 2, "=COUNT(A1:A3)"),
        (5, 2, "=IF(A1>A2,10,20)"),
        (6, 2, "=ABS(-4)"),
        (7, 2, "=ROUND(1.234,2)"),
        (8, 2, "=SQRT(9)"),
        (9, 2, "=MOD(10,3)"),
        (10, 2, "=POW(2,3)"),
        (11, 2, "=AND(1,1,0)"),
        (12, 2, "=OR(0,0,5)"),
        (13, 2, "=NOT(0)"),
        (14, 2, "=A1>A2"),
        (15, 2, "=A1=A2"),
        (16, 2, "=$A$1 + A$2 + $B1"),
        (17, 2, "=AVERAGE(A1:A3)"),
        (18, 2, "=FLOOR(5.9)"),
        (19, 2, "=FLOOR(5.9,2)"),
        (20, 2, "=CEILING(5.1)"),
        (21, 2, "=CEILING(5.1,2)"),
        (22, 2, "=INT(-1.2)"),
        (23, 2, "=TRUNC(-1.9)"),
        (24, 2, "=TRUNC(12.345,2)"),
        (25, 2, "=SIGN(-9)"),
        (26, 2, "=PI()"),
        (27, 2, "=IFERROR(1/0,42)"),
        (28, 2, "=IFERROR(5,42)"),
        (29, 2, "=COUNTA(A1:A3)"),
    ];
    for (row, col, src) in formulas {
        store.set_formula(sheet, row, col, src, 0);
    }

    store.recompute(sheet);

    let expected = [
        18.0,
        6.0,
        3.0,
        9.0,
        3.0,
        10.0,
        4.0,
        1.23,
        3.0,
        1.0,
        8.0,
        0.0,
        1.0,
        1.0,
        1.0,
        0.0,
        14.0,
        6.0,
        5.0,
        4.0,
        6.0,
        6.0,
        -2.0,
        -1.0,
        12.34,
        -1.0,
        std::f64::consts::PI,
        42.0,
        5.0,
        3.0,
    ];
    for (row, expected) in expected.into_iter().enumerate() {
        assert_close(number(&store, sheet, row, 2), expected);
    }
}

#[test]
fn text_functions_surface_string_and_boolean_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 16);
    let formulas = [
        (0, r#"="Hello ""Q""""#),
        (1, r#"=LEN("Hello")"#),
        (2, r#"=LEFT("abcdef",3)"#),
        (3, r#"=RIGHT("abcdef",3)"#),
        (4, r#"=MID("abcdef",2,3)"#),
        (5, r#"=CONCAT("A",1,TRUE)"#),
        (6, r#"=CONCATENATE("x","y")"#),
        (7, r#"=UPPER("MiX")"#),
        (8, r#"=LOWER("MiX")"#),
        (9, r#"=TRIM("  a   b  ")"#),
        (10, r#"=TEXT(12.345,"0.00")"#),
        (11, r#"=EXACT("Hi","Hi")"#),
        (12, r#"=EXACT("Hi","hi")"#),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 0, src, 0);
    }
    store.recompute(sheet);

    assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_STRING);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("Hello \"Q\""));
    assert_close(number(&store, sheet, 1, 0), 5.0);
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("abc"));
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("def"));
    assert_eq!(string(&store, sheet, 4, 0).as_deref(), Some("bcd"));
    assert_eq!(string(&store, sheet, 5, 0).as_deref(), Some("A1TRUE"));
    assert_eq!(string(&store, sheet, 6, 0).as_deref(), Some("xy"));
    assert_eq!(string(&store, sheet, 7, 0).as_deref(), Some("MIX"));
    assert_eq!(string(&store, sheet, 8, 0).as_deref(), Some("mix"));
    assert_eq!(string(&store, sheet, 9, 0).as_deref(), Some("a b"));
    assert_eq!(string(&store, sheet, 10, 0).as_deref(), Some("12.35"));
    assert_eq!(store.get_cell(sheet, 11, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 11, 0), 1.0);
    assert_eq!(store.get_cell(sheet, 12, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 12, 0), 0.0);
}

#[test]
fn value_coercion_logic_iferror_and_comparisons() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 14);
    store.set_string(sheet, 0, 0, "2.5", 0);
    store.set_string(sheet, 1, 0, "nope", 0);

    let formulas = [
        (0, r#"=A1+1"#),
        (1, r#"=A2+1"#),
        (2, r#"=IF(TRUE,"yes","no")"#),
        (3, r#"=IF(FALSE,1,2)"#),
        (4, r#"=AND(TRUE,1,"TRUE")"#),
        (5, r#"=OR(FALSE,0,"TRUE")"#),
        (6, r#"=NOT(FALSE)"#),
        (7, r#"=IFERROR(1/0,"fallback")"#),
        (8, r#"=IFERROR("ok",0)"#),
        (9, r#"=1+"3""#),
        (10, r#"="a"="A""#),
        (11, r#"="a"<TRUE"#),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 1, src, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 1), 3.5);
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("#VALUE!"));
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("yes"));
    assert_close(number(&store, sheet, 3, 1), 2.0);
    for row in 4..=6 {
        assert_eq!(store.get_cell(sheet, row, 1).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, row, 1), 1.0);
    }
    assert_eq!(string(&store, sheet, 7, 1).as_deref(), Some("fallback"));
    assert_eq!(string(&store, sheet, 8, 1).as_deref(), Some("ok"));
    assert_close(number(&store, sheet, 9, 1), 4.0);
    for row in 10..=11 {
        assert_eq!(store.get_cell(sheet, row, 1).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, row, 1), 1.0);
    }
}

#[test]
fn aggregate_functions_distinguish_direct_values_from_range_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 8);
    store.set_number(sheet, 0, 0, 2.0, 0);
    store.set_string(sheet, 1, 0, "3", 0);
    store.set_string(sheet, 2, 0, "x", 0);
    store.set_formula(sheet, 3, 0, "=TRUE", 0);

    let formulas = [
        (0, "=SUM(A1:A4)"),
        (1, r#"=SUM("3")"#),
        (2, r#"=SUM("x")"#),
        (3, "=COUNT(A1:A4)"),
        (4, "=COUNTA(A1:A5)"),
        (5, "=COUNTA(A5)"),
        (6, "=LEN(A5)"),
        (7, "=A5+1"),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 1, src, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 1, 1), 3.0);
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("#VALUE!"));
    assert_close(number(&store, sheet, 3, 1), 1.0);
    assert_close(number(&store, sheet, 4, 1), 4.0);
    assert_close(number(&store, sheet, 5, 1), 0.0);
    assert_close(number(&store, sheet, 6, 1), 0.0);
    assert_close(number(&store, sheet, 7, 1), 1.0);
}

#[test]
fn value_results_feed_dependencies_and_windows() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 1);
    store.set_formula(sheet, 0, 0, r#"="hello""#, 3);
    store.set_formula(sheet, 0, 1, "=LEN(A1)", 4);
    store.set_formula(sheet, 0, 2, "=TRUE", 5);
    store.set_formula(sheet, 0, 3, "=NOT(C1)", 6);
    store.recompute(sheet);

    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("hello"));
    assert_close(number(&store, sheet, 0, 1), 5.0);
    assert_eq!(store.get_cell(sheet, 0, 2).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 0, 2), 1.0);
    assert_eq!(store.get_cell(sheet, 0, 3).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 0, 3), 0.0);

    let mut view = store.get_window(sheet, 0, 1, &[0, 1, 2, 3]);
    let kinds = view.take_kinds();
    let string_ids = view.take_string_ids();
    let pooled = store.pool_strings(&string_ids);
    assert_eq!(kinds, vec![KIND_STRING, KIND_NUMBER, KIND_BOOL, KIND_BOOL]);
    assert_eq!(pooled[0], "hello");

    store.set_formula(sheet, 0, 0, r#"="world""#, 3);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("world"));
    assert_close(number(&store, sheet, 0, 1), 5.0);
}

#[test]
fn formula_errors_surface_as_sentinels() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_formula(sheet, 0, 0, "=B1", 0);
    store.set_formula(sheet, 0, 1, "=A1", 0);
    store.set_formula(sheet, 1, 0, "=1/0", 0);
    store.set_formula(sheet, 1, 1, "=MOD(1,0)", 0);
    store.set_formula(sheet, 2, 0, "=Z99", 0);
    store.set_formula(sheet, 2, 1, "=SUM(Z99:Z100)", 0);
    store.set_formula(sheet, 3, 0, "=SUM(", 0);
    store.set_formula(sheet, 3, 1, r#"=1+"x""#, 0);
    store.recompute(sheet);

    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#CYCLE!"));
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("#DIV/0!"));
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("#DIV/0!"));
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("#VALUE!"));
    assert_eq!(string(&store, sheet, 3, 1).as_deref(), Some("#VALUE!"));
}

#[test]
fn builtin_argument_errors_and_numeric_boundaries_propagate_without_panics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 1);
    let error_formulas = [
        ("=ROUND(\"x\",2)", "#VALUE!"),
        ("=ROUND(1,\"x\")", "#VALUE!"),
        ("=ROUND(1,400)", "#NUM!"),
        ("=MOD(\"x\",2)", "#VALUE!"),
        ("=MOD(1,\"x\")", "#VALUE!"),
        ("=POW(\"x\",2)", "#VALUE!"),
        ("=POW(2,\"x\")", "#VALUE!"),
        ("=FLOOR(\"x\",1)", "#VALUE!"),
        ("=FLOOR(1,\"x\")", "#VALUE!"),
        ("=FLOOR(1,0)", "#DIV/0!"),
        ("=CEILING(\"x\",1)", "#VALUE!"),
        ("=CEILING(1,\"x\")", "#VALUE!"),
        ("=CEILING(1,0)", "#DIV/0!"),
        ("=TRUNC(\"x\",1)", "#VALUE!"),
        ("=TRUNC(1,\"x\")", "#VALUE!"),
        ("=TRUNC(1,400)", "#NUM!"),
        ("=AND(TRUE,\"not-bool\")", "#VALUE!"),
        ("=OR(FALSE,\"not-bool\")", "#VALUE!"),
        ("=NOT(\"not-bool\")", "#VALUE!"),
        ("=LEN(1/0)", "#DIV/0!"),
        ("=LEFT(\"abc\",-1)", "#VALUE!"),
        ("=RIGHT(\"abc\",-1)", "#VALUE!"),
        ("=MID(\"abc\",0,1)", "#VALUE!"),
        ("=MID(\"abc\",1,-1)", "#VALUE!"),
        ("=CONCAT(\"ok\",1/0)", "#DIV/0!"),
        ("=UPPER(1/0)", "#DIV/0!"),
        ("=LOWER(1/0)", "#DIV/0!"),
        ("=TRIM(1/0)", "#DIV/0!"),
        ("=TEXT(1,1/0)", "#DIV/0!"),
        ("=DATE(\"x\",1,1)", "#VALUE!"),
        ("=DATE(2024,\"x\",1)", "#VALUE!"),
        ("=DATE(2024,1,\"x\")", "#VALUE!"),
        ("=DATEVALUE(\"not-a-date\")", "#VALUE!"),
        ("=DAY(1/0)", "#DIV/0!"),
        ("=EXACT(1/0,\"x\")", "#DIV/0!"),
        ("=EXACT(\"x\",1/0)", "#DIV/0!"),
    ];
    for (col, (formula, _)) in error_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, col, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=AVG()", 0);
    store.set_formula(sheet, 0, 37, "=MIN()", 0);
    store.set_formula(sheet, 0, 38, "=MAX()", 0);
    store.set_formula(sheet, 0, 39, "=SIGN(9)", 0);
    store.set_formula(sheet, 0, 40, "=SIGN(0)", 0);
    store.recompute(sheet);

    for (col, (formula, expected)) in error_formulas.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, col).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    for col in 36..=38 {
        assert_close(number(&store, sheet, 0, col), 0.0);
    }
    assert_close(number(&store, sheet, 0, 39), 1.0);
    assert_close(number(&store, sheet, 0, 40), 0.0);
}

#[test]
fn date_time_functions_use_excel_serials_and_controlled_volatile_inputs() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(13, 1);
    let formulas = [
        (0, "=DATE(2024,2,29)"),
        (1, "=DATEVALUE(\"2024-02-29\")"),
        (2, "=DAY(A1)"),
        (3, "=MONTH(A1)"),
        (4, "=YEAR(A1)"),
        (5, "=TEXT(A1,\"yyyy-mm-dd\")"),
        (6, "=TODAY()"),
        (7, "=NOW()"),
        (8, "=DATE(1900,1,1)"),
        (9, "=DATE(1900,2,29)"),
        (10, "=DATE(1900,3,1)"),
        (11, "=DATE(2024,13,1)"),
        (12, "=DATE(1900,1,60)"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col, source, 0);
    }
    store.recompute_volatile(46_000.75);

    assert_close(number(&store, sheet, 0, 0), 45_351.0);
    assert_close(number(&store, sheet, 0, 1), 45_351.0);
    assert_close(number(&store, sheet, 0, 2), 29.0);
    assert_close(number(&store, sheet, 0, 3), 2.0);
    assert_close(number(&store, sheet, 0, 4), 2024.0);
    assert_eq!(string(&store, sheet, 0, 5).as_deref(), Some("2024-02-29"));
    assert_close(number(&store, sheet, 0, 6), 46_000.0);
    assert_close(number(&store, sheet, 0, 7), 46_000.75);
    assert_close(number(&store, sheet, 0, 8), 1.0);
    assert_close(number(&store, sheet, 0, 9), 60.0);
    assert_close(number(&store, sheet, 0, 10), 61.0);
    assert_close(number(&store, sheet, 0, 11), 45_658.0);
    assert_close(number(&store, sheet, 0, 12), 60.0);
}

#[test]
fn criteria_families_apply_wildcards_shapes_and_error_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(10, 5);
    for (row, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    store.set_string(sheet, 4, 0, "alpha", 0);
    for (row, value) in [10.0, 20.0, 30.0, 40.0, 50.0].into_iter().enumerate() {
        store.set_number(sheet, row, 1, value, 0);
    }
    let formulas = [
        (0, "=COUNTIF(A1:A4,\">2\")"),
        (1, "=SUMIF(A1:A4,\">2\",B1:B4)"),
        (2, "=COUNTIFS(A1:A4,\">1\",B1:B4,\"<=30\")"),
        (3, "=SUMIFS(B1:B4,A1:A4,\">1\",A1:A4,\"<4\")"),
        (4, "=AVERAGEIF(A1:A4,\">2\",B1:B4)"),
        (5, "=AVERAGEIFS(B1:B4,A1:A4,\">2\")"),
        (6, "=COUNTIF(A1:A5,\"a*\")"),
        (7, "=SUMIFS(B1:B3,A1:A4,\">0\")"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col + 2, source, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 2), 2.0);
    assert_close(number(&store, sheet, 0, 3), 70.0);
    assert_close(number(&store, sheet, 0, 4), 2.0);
    assert_close(number(&store, sheet, 0, 5), 50.0);
    assert_close(number(&store, sheet, 0, 6), 35.0);
    assert_close(number(&store, sheet, 0, 7), 35.0);
    assert_close(number(&store, sheet, 0, 8), 1.0);
    assert_eq!(string(&store, sheet, 0, 9).as_deref(), Some("#VALUE!"));
}

#[test]
fn lookup_functions_cover_exact_approximate_reverse_and_not_found_paths() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(11, 6);
    for (row, (key, value)) in [(1.0, 10.0), (2.0, 20.0), (3.0, 30.0)]
        .into_iter()
        .enumerate()
    {
        store.set_number(sheet, row, 0, key, 0);
        store.set_number(sheet, row, 1, value, 0);
    }
    for (col, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, 4, col, value, 0);
        store.set_number(sheet, 5, col, value * 10.0, 0);
    }
    let formulas = [
        (2, "=INDEX(A1:B3,2,2)"),
        (3, "=MATCH(2.5,A1:A3,1)"),
        (4, "=VLOOKUP(2.5,A1:B3,2,TRUE)"),
        (5, "=HLOOKUP(2.5,A5:C6,2,TRUE)"),
        (6, "=XLOOKUP(2,A1:A3,B1:B3,\"missing\")"),
        (7, "=XLOOKUP(9,A1:A3,B1:B3,\"missing\")"),
        (8, "=MATCH(9,A1:A3,0)"),
        (9, "=XLOOKUP(2.5,A1:A3,B1:B3,,1,-1)"),
        (10, "=XLOOKUP(9,A1:A3,B1:B3,,0)"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col, source, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 2), 20.0);
    assert_close(number(&store, sheet, 0, 3), 2.0);
    assert_close(number(&store, sheet, 0, 4), 20.0);
    assert_close(number(&store, sheet, 0, 5), 20.0);
    assert_close(number(&store, sheet, 0, 6), 20.0);
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("missing"));
    assert_eq!(string(&store, sheet, 0, 8).as_deref(), Some("#N/A"));
    assert_close(number(&store, sheet, 0, 9), 30.0);
    assert_eq!(string(&store, sheet, 0, 10).as_deref(), Some("#N/A"));
}

#[test]
fn criteria_and_lookup_validation_preserves_error_precedence_and_shapes() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 3);
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    let errors = [
        ("=TODAY(1)", "#VALUE!"),
        ("=COUNTIF(A1:A2)", "#VALUE!"),
        ("=COUNTIF(1,\">0\")", "#VALUE!"),
        ("=COUNTIF(A1:A2,1/0)", "#DIV/0!"),
        ("=COUNTIFS()", "#VALUE!"),
        ("=COUNTIFS(A1:A2,\">0\",B1:B3,\">0\")", "#VALUE!"),
        ("=SUMIF(A1:A2)", "#VALUE!"),
        ("=SUMIF(1,\">0\")", "#VALUE!"),
        ("=SUMIF(A1:A2,\">0\",B1:B3)", "#VALUE!"),
        ("=SUMIFS(A1:A2)", "#VALUE!"),
        ("=SUMIFS(A1:A2,B1:B3,\">0\")", "#VALUE!"),
        ("=AVERAGEIF(A1:A2,\">9\")", "#DIV/0!"),
        ("=INDEX(A1:B2)", "#VALUE!"),
        ("=INDEX(A1:B2,0,1)", "#VALUE!"),
        ("=INDEX(A1:B2,1)", "#VALUE!"),
        ("=INDEX(A1:B2,9,1)", "#REF!"),
        ("=MATCH(1,A1:B2,0)", "#N/A"),
        ("=MATCH(1,A1:A2,9)", "#VALUE!"),
        ("=MATCH(1/0,A1:A2)", "#DIV/0!"),
        ("=MATCH(1,1)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2)", "#VALUE!"),
        ("=VLOOKUP(1/0,A1:B2,2)", "#DIV/0!"),
        ("=VLOOKUP(1,1,2)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,0)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,2,\"bad\")", "#VALUE!"),
        ("=VLOOKUP(9,A1:B2,2,FALSE)", "#N/A"),
        ("=VLOOKUP(1,A1:B2,9,FALSE)", "#REF!"),
        ("=XLOOKUP(1,A1:A2)", "#VALUE!"),
        ("=XLOOKUP(1/0,A1:A2,B1:B2)", "#DIV/0!"),
        ("=XLOOKUP(1,1,B1:B2)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B3)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,9)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,,0)", "#VALUE!"),
        ("=XLOOKUP(9,A1:A2,B1:B2)", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 2, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=IF(FALSE,1)", 0);
    store.set_formula(sheet, 0, 37, "=IFERROR(1/0)", 0);
    store.recompute(sheet);

    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, offset + 2).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    assert_close(number(&store, sheet, 0, 36), 0.0);
    assert_close(number(&store, sheet, 0, 37), 0.0);
}
#[test]
fn criteria_wildcards_approximate_lookup_and_empty_logic_follow_spreadsheet_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 4);
    for (row, value) in ["Alpha", "a*", "ax", "a~b"].into_iter().enumerate() {
        store.set_string(sheet, row, 0, value, 0);
    }
    for (row, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        store.set_number(sheet, row, 1, value, 0);
        store.set_number(sheet, row, 2, 4.0 - row as f64, 0);
    }
    let numeric_formulas = [
        "=COUNTIF(A1:A4,\"a?\")",
        "=COUNTIF(A1:A4,\"a~*\")",
        "=COUNTIF(A1:A4,\"a~b\")",
        "=COUNTIF(B1:B4,\">=2\")",
        "=COUNTIF(B1:B4,\"<=2\")",
        "=COUNTIF(B1:B4,\"<>2\")",
        "=COUNTIF(B1:B4,\"=2\")",
        "=SUMIF(B1:B4,\">2\")",
        "=XLOOKUP(\"a*\",A1:A4,B1:B4,,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,-1,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,1,2)",
        "=MATCH(2.5,C1:C4,-1)",
        "=AND()",
        "=OR()",
    ];
    for (offset, formula) in numeric_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 3, formula, 0);
    }
    let errors = [
        ("=AVG(\"x\")", "#VALUE!"),
        ("=MIN(\"x\")", "#VALUE!"),
        ("=MAX(\"x\")", "#VALUE!"),
        ("=LEFT(1/0,1)", "#DIV/0!"),
        ("=RIGHT(1/0,1)", "#DIV/0!"),
        ("=MID(1/0,1,1)", "#DIV/0!"),
        ("=MID(\"x\",1,1/0)", "#DIV/0!"),
        ("=NA()", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 1, offset + 3, formula, 0);
    }
    store.recompute(sheet);

    let expected = [
        2.0, 1.0, 1.0, 3.0, 2.0, 3.0, 1.0, 7.0, 1.0, 2.0, 3.0, 2.0, 1.0, 0.0,
    ];
    for (offset, value) in expected.into_iter().enumerate() {
        let actual = number(&store, sheet, 0, offset + 3);
        assert!(
            (actual - value).abs() < 1e-9,
            "{} expected {value}, got {actual}",
            numeric_formulas[offset]
        );
    }
    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 1, offset + 3).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
}

#[test]
fn named_ranges_resolve_scope_rebase_delete_cycle_and_preserve_unknown_sources() {
    let mut store = CellStore::new();

    let data = store.add_sheet(2, 4);
    let summary = store.add_sheet(4, 2);
    let other = store.add_sheet(1, 1);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_sheet_name(other, "other", "Other");
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(data, row, 0, value, 0);
        store.set_number(data, row, 1, value * 10.0, 0);
    }
    store.set_formula(summary, 0, 0, "=SUM(Values)", 0);
    store.set_formula(other, 0, 0, "=SUM(Values)", 0);
    assert!(store.set_named_range("Values", -1, data, 0, 0, 2, 0));
    assert!(store.set_named_range("Values", summary as i32, data, 0, 1, 2, 1));
    assert_close(number(&store, summary, 0, 0), 60.0);
    assert_close(number(&store, other, 0, 0), 6.0);

    assert!(store.set_named_range("Self", summary as i32, summary, 0, 1, 0, 1));
    store.set_formula(summary, 0, 1, "=SUM(Self)", 0);
    store.set_formula(summary, 0, 2, "=UNSUPPORTED(A1)", 0);
    store.recompute(summary);
    assert_eq!(string(&store, summary, 0, 1).as_deref(), Some("#CYCLE!"));
    assert_eq!(string(&store, summary, 0, 2).as_deref(), Some("#NAME?"));
    assert_eq!(
        store.formula_source(summary, 0, 2).as_deref(),
        Some("=UNSUPPORTED(A1)")
    );

    store.add_rows(data, 1, 1);
    store.recompute(other);
    assert_close(number(&store, other, 0, 0), 6.0);
    store.remove_rows(data, 0, 4);
    store.recompute(other);
    assert_eq!(string(&store, other, 0, 0).as_deref(), Some("#NAME?"));
}

#[test]
fn cross_sheet_formula_refs_evaluate_and_recompute() {
    let mut store = CellStore::new();
    let sales = store.add_sheet(5, 4);
    let summary = store.add_sheet(3, 4);
    store.set_sheet_name(sales, "sales", "Sales");
    store.set_sheet_name(summary, "summary", "Summary");

    store.set_number(sales, 1, 4, 7.0, 0);
    store.set_number(sales, 2, 4, 3.0, 0);
    store.set_formula(summary, 0, 0, "=Sales!E2 * 2", 0);
    store.set_formula(summary, 1, 0, "=SUM(Sales!E2:E3)", 0);
    store.recompute(summary);

    assert_close(number(&store, summary, 0, 0), 14.0);
    assert_close(number(&store, summary, 1, 0), 10.0);

    store.set_number(sales, 1, 4, 11.0, 0);
    store.recompute(sales);
    assert_close(number(&store, summary, 0, 0), 22.0);
    assert_close(number(&store, summary, 1, 0), 14.0);
}

#[test]
fn quoted_sheet_names_work_in_formulas() {
    let mut store = CellStore::new();
    let sales = store.add_sheet(5, 3);
    let summary = store.add_sheet(2, 2);
    store.set_sheet_name(sales, "sales_2026", "Sales 2026");
    store.set_sheet_name(summary, "summary", "Summary");

    store.set_number(sales, 1, 4, 9.0, 0);
    store.set_formula(summary, 0, 0, "='Sales 2026'!E2 + 1", 0);
    store.recompute(summary);

    assert_close(number(&store, summary, 0, 0), 10.0);
}

#[test]
fn rename_sheet_rewrites_canonical_sources_and_quoting_without_changing_handles() {
    let mut store = CellStore::new();
    let source = store.add_sheet(1, 2);
    let summary = store.add_sheet(2, 2);
    store.set_sheet_name(source, "sales", "Sales");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 0, 0, 4.0, 0);
    store.set_number(source, 1, 0, 6.0, 0);
    store.set_formula(summary, 0, 0, "=Sales!A1+1", 0);
    store.set_formula(summary, 0, 1, "=SUM(Sales!A1:A2)", 0);
    store.recompute(summary);

    assert!(store.rename_sheet(source, "sales", "Sales Data"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=('Sales Data'!A1+1)")
    );
    assert_eq!(
        store.formula_source(summary, 0, 1).as_deref(),
        Some("=SUM('Sales Data'!A1:A2)")
    );
    assert_close(number(&store, summary, 0, 0), 5.0);
    assert_close(number(&store, summary, 0, 1), 10.0);

    assert!(store.rename_sheet(source, "sales", "O'Brien"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=('O''Brien'!A1+1)")
    );
    assert!(store.is_sheet_alive(source));
    assert!(store.is_sheet_alive(summary));
}

#[test]
fn remove_sheet_tombstones_handle_and_invalidates_transitive_formula_dependencies() {
    let mut store = CellStore::new();
    let source = store.add_sheet(1, 2);
    let summary = store.add_sheet(3, 2);
    store.set_sheet_name(source, "source", "Source");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 0, 0, 4.0, 0);
    store.set_formula(summary, 0, 0, "=Source!A1+1", 0);
    store.set_formula(summary, 0, 1, "=A1+1", 0);
    store.recompute(summary);
    assert_close(number(&store, summary, 0, 1), 6.0);

    store.set_formula(summary, 0, 2, "=SUM(Source!A1:A2)", 0);
    assert!(store.remove_sheet(source));

    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=(#REF!+1)")
    );
    assert_eq!(string(&store, summary, 0, 0).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, summary, 0, 1).as_deref(), Some("#REF!"));
    assert!(!store.is_sheet_alive(source));
    assert!(store.is_sheet_alive(summary));
    assert_eq!(store.row_count(source), 0);

    let replacement = store.add_sheet(1, 1);
    assert_eq!(
        store.formula_source(summary, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, summary, 0, 2).as_deref(), Some("#REF!"));
    assert_eq!(replacement, 2);
    assert!(store.is_sheet_alive(replacement));
    assert!(!store.remove_sheet(source));
}

#[test]
fn oversized_range_returns_num_without_expansion() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, RANGE_CELL_LIMIT as usize + 1);
    store.set_formula(sheet, 0, 1, "=SUM(A1:A1000001)", 0);
    store.recompute(sheet);

    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#NUM!"));
}

#[test]
fn deep_formula_evaluation_returns_num_error() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, FORMULA_RECURSION_LIMIT + 5);
    store.set_number(sheet, 0, 0, 1.0, 0);
    for row in 1..FORMULA_RECURSION_LIMIT + 4 {
        let src = format!("=A{}+1", row);
        store.set_formula(sheet, row, 0, &src, 0);
    }
    store.recompute(sheet);

    assert_eq!(
        string(&store, sheet, FORMULA_RECURSION_LIMIT + 3, 0).as_deref(),
        Some("#NUM!")
    );
}

#[test]
fn public_api_bounds_checks_do_not_panic() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let snapshot = store.capture_range(sheet, 0, 0, 1, 1).unwrap();
        store.set_number(99, 0, 0, 1.0, 0);
        store.set_number(sheet, 9, 0, 1.0, 0);
        store.set_string(sheet, 0, 9, "x", 0);
        store.clear_cell(sheet, 9, 9, 0);
        store.set_formula(sheet, 9, 0, "=A1", 0);
        store.set_column_numbers(sheet, 9, 0, &[1.0, 2.0], 0);
        store.set_column_strings(sheet, 9, 0, vec!["x".to_string()], 0);
        store.add_rows(99, 0, 1);
        store.remove_rows(99, 0, 1);

        assert_eq!(store.get_cell(99, 0, 0).kind(), KIND_EMPTY);
        store.insert_cols(99, 0, 1);
        store.remove_cols(99, 0, 1);
        store.set_sheet_name(99, "missing", "Missing");
        store.mark_range_clean(99, 0, 1, 0, 1);
        store.pin_range(99, 0, 1, &[0]);
        store.set_bool(99, 0, 0, true, 0);
        store.set_conditional_rules(99, &[], &[], &[], Vec::new(), &[]);
        store.end_page_load();

        assert!(!store.is_paged(99));
        assert_eq!(store.paged_stats(99), vec![0.0; 5]);
        assert_eq!(store.paged_stats(sheet), vec![0.0, 0.0, 0.0, 0.0, 1.0]);
        assert_eq!(store.cell_state(99, 0, 0), 0);
        assert_eq!(store.cell_state(sheet, 9, 9), 0);
        assert!(!store.is_fully_loaded(99));
        assert!(store.is_fully_loaded(sheet));
        assert!(!store.range_fully_loaded(99, 0, 0, 0, 0));
        assert_eq!(store.row_count(99), 0);
        assert_eq!(store.col_count(99), 0);
        assert_eq!(store.style_id_at(99, 0, 0), 0);
        assert_eq!(store.style_id_at(sheet, 9, 9), 0);
        assert!(!store.set_block(
            99,
            0,
            0,
            1,
            1,
            &[KIND_EMPTY],
            &[0.0],
            vec![String::new()],
            &[0],
        ));
        assert!(!store.clear_range(99, 0, 0, 0, 0, true, true));
        assert!(store.range_style_ids(99, 0, 0, 0, 0).is_empty());
        assert!(!store.remap_range_styles(99, 0, 0, 0, 0, &[], &[]));
        assert!(store.capture_range(99, 0, 0, 1, 1).is_none());
        assert!(!store.restore_range(99, 0, 0, &snapshot));
        assert!(!store.rename_sheet(99, "missing", "Missing"));
        assert!(!store.remove_sheet(99));
        assert!(!store.set_named_range("", -1, sheet, 0, 0, 0, 0));
        assert!(!store.remove_named_range("missing", -1));
        assert!(!store.recompute_volatile(f64::NAN));
        assert!(store.set_formula(99, 0, 0, "=1", 0).is_nan());
        assert_eq!(store.formula_source(99, 0, 0), None);
        assert_eq!(
            store.pool_strings(&[NO_STRING, u32::MAX]),
            vec![String::new(), String::new()]
        );
        assert_eq!(store.get_cell(sheet, 9, 0).kind(), KIND_EMPTY);
        assert_eq!(store.aggregate(99, 0, 0), 0.0);
        assert_eq!(store.aggregate(sheet, 9, 0), 0.0);
        assert!(store.sort_rows(99, 0, true).is_empty());
        assert!(store.sort_rows(sheet, 9, true).is_empty());
        assert!(store.filter_rows(99, 0, "x").is_empty());
        assert!(store.filter_rows(sheet, 9, "x").is_empty());
        assert!(store.search(99, &[0], "x", true, false).is_empty());
        assert_eq!(store.get_window(99, 0, 1, &[0]).n_rows(), 0);
    }));

    assert!(result.is_ok());
}

#[test]
fn recompute_is_batched_scoped_and_updates_chain_and_diamond() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(5, 1);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.set_formula(sheet, 0, 1, "=A1+1", 0);
    store.set_formula(sheet, 0, 2, "=B1+1", 0);
    store.set_formula(sheet, 0, 3, "=B1+C1", 0);
    store.set_formula(sheet, 0, 4, "=D1+B1", 0);
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 0, 2), 3.0);
    assert_close(number(&store, sheet, 0, 3), 5.0);
    assert_close(number(&store, sheet, 0, 4), 7.0);

    store.set_number(sheet, 0, 0, 10.0, 0);
    assert_close(number(&store, sheet, 0, 4), 7.0);

    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 11.0);
    assert_close(number(&store, sheet, 0, 2), 12.0);
    assert_close(number(&store, sheet, 0, 3), 23.0);
    assert_close(number(&store, sheet, 0, 4), 34.0);
}

#[test]
fn window_view_uses_error_strings_and_consuming_reads() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 1);
    store.set_string(sheet, 0, 0, "hello", 7);
    store.set_formula(sheet, 0, 1, "=1/0", 9);
    store.recompute(sheet);

    let mut view = store.get_window(sheet, 0, 1, &[0, 1]);
    assert_eq!(view.n_rows(), 1);
    assert_eq!(view.n_cols(), 2);

    let kinds = view.take_kinds();
    let numbers = view.take_numbers();
    let string_index = view.take_string_index();
    let string_ids = view.take_string_ids();
    let style_index = view.take_style_index();
    let style_dict = view.take_style_dict();
    let strings = view.take_strings();
    let pooled = store.pool_strings(&string_ids);

    assert_eq!(kinds, vec![KIND_STRING, KIND_STRING]);
    assert_eq!(numbers, vec![0.0, 0.0]);
    assert_eq!(style_index, vec![0, 1]);
    assert_eq!(style_dict, vec![7, 9]);
    assert_eq!(pooled[0], "hello");
    assert_eq!(strings[string_index[1] as usize], "#DIV/0!");
    assert!(view.take_kinds().is_empty());
}

#[test]
fn text_match_case_insensitive_ascii_path_and_unicode_fallback() {
    // ASCII fast path (allocation-free): case-insensitive substring + whole-cell.
    assert!(matches_needle("Tokyo", "tokyo", true, false));
    assert!(matches_needle("Tokyo", "tokyo", true, true));
    assert!(matches_needle("New Tokyo City", "tokyo", true, false));
    assert!(!matches_needle("Berlin", "tokyo", true, false));
    assert!(!matches_needle("Tok", "tokyo", true, false));
    assert!(matches_needle("anything", "", true, false));

    // Case-sensitive path is unchanged.
    assert!(matches_needle("Tokyo", "Tok", false, false));
    assert!(!matches_needle("Tokyo", "tok", false, false));

    // Unicode fallback matches `to_lowercase` semantics (needle pre-lowercased).
    assert!(matches_needle("CAFÉ", "café", true, false));
    assert!(matches_needle("Straße", "straße", true, true));
    assert!(!matches_needle("Straße", "strasse", true, false));
}

#[test]
fn filter_and_search_match_strings_and_numbers() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_string(sheet, 0, 0, "Tokyo", 0);
    store.set_string(sheet, 1, 0, "Berlin", 0);
    store.set_string(sheet, 2, 0, "New Tokyo", 0);
    store.set_number(sheet, 0, 1, 1234.5, 0);
    store.set_number(sheet, 1, 1, 42.0, 0);

    // Case-insensitive substring filter over a string column.
    assert_eq!(store.filter_rows(sheet, 0, "tokyo"), vec![0, 2]);
    assert_eq!(store.filter_rows(sheet, 0, "BERLIN"), vec![1]);
    assert!(store.filter_rows(sheet, 0, "paris").is_empty());

    // Numeric cells match on their textual form (no per-cell allocation).
    assert_eq!(store.filter_rows(sheet, 1, "234"), vec![0]);
    assert_eq!(store.filter_rows(sheet, 1, "42"), vec![1]);

    // search returns flat [row, col, ...] sorted row-major.
    assert_eq!(
        store.search(sheet, &[0, 1], "tokyo", true, false),
        vec![0, 0, 2, 0]
    );
}

#[test]
fn match_cache_handles_repeats_eviction_and_collisions() {
    let mut store = CellStore::new();
    // More distinct values than MATCH_CACHE_SLOTS (1024) so str_ids collide
    // mod slot count and evict each other mid-scan.
    let rows = 3000usize;
    let sheet = store.add_sheet(2, rows);
    for r in 0..rows {
        store.set_string(sheet, r, 0, &format!("item{r}"), 0);
        store.set_string(sheet, r, 1, if r % 3 == 0 { "Tokyo" } else { "Berlin" }, 0);
    }

    // Unique column: a colliding/evicting cache must still equal a brute scan.
    let expected: Vec<u32> = (0..rows)
        .filter(|r| format!("item{r}").contains('7'))
        .map(|r| r as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "7"), expected);

    // Low-cardinality column: heavy cache reuse, every third row matches.
    let tokyo: Vec<u32> = (0..rows).step_by(3).map(|r| r as u32).collect();
    assert_eq!(store.filter_rows(sheet, 1, "tokyo"), tokyo);
}

#[test]
fn packed_string_column_load_matches_per_row_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 4);

    // ASCII fast path: byte offsets equal UTF-16 lengths.
    store.set_column_strings_packed(sheet, 0, 0, "abdefg".to_string(), &[2, 0, 2, 2], 7);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("ab"));
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some(""));
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("de"));
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("fg"));

    // Non-ASCII path: "é" is 1 UTF-16 unit / 2 UTF-8 bytes, "𝄞" is 2
    // UTF-16 units / 4 UTF-8 bytes.
    store.set_column_strings_packed(sheet, 1, 0, "éx𝄞ab".to_string(), &[2, 2, 2], 0);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("éx"));
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("𝄞"));
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("ab"));

    // Bulk load flags the sheet dirty exactly like the per-row loader.
    assert!(store.sheets[sheet].all_dirty);
}

#[test]
fn numeric_sort_orders_finite_numbers_and_keeps_equal_rows_stable() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 8);
    for (row, value) in [3.0, -2.0, 0.0, -0.0, 1.5, 3.0, -10.0, 2.0]
        .into_iter()
        .enumerate()
    {
        store.set_number(sheet, row, 0, value, 0);
    }

    assert_eq!(
        store.sort_rows(sheet, 0, true),
        vec![6, 1, 2, 3, 4, 7, 0, 5]
    );
    assert_eq!(
        store.sort_rows(sheet, 0, false),
        vec![0, 5, 7, 4, 2, 3, 1, 6]
    );
}

#[test]
fn small_numeric_sort_matches_total_order_for_one_thousand_rows() {
    let mut store = CellStore::new();
    let rows = 1_000usize;
    let sheet = store.add_sheet(1, rows);
    let values: Vec<f64> = (0..rows)
        .map(|row| {
            let mixed = (row as u64).wrapping_mul(6_364_136_223_846_793_005);
            let magnitude = ((mixed >> 24) % 20_001) as i64 - 10_000;
            magnitude as f64 / 8.0
        })
        .collect();
    for (row, &value) in values.iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }

    let mut expected: Vec<u32> = (0..rows as u32).collect();
    expected.sort_unstable_by(|&left, &right| {
        values[left as usize]
            .partial_cmp(&values[right as usize])
            .unwrap()
            .then_with(|| left.cmp(&right))
    });
    assert_eq!(store.sort_rows(sheet, 0, true), expected);

    expected.sort_unstable_by(|&left, &right| {
        values[right as usize]
            .partial_cmp(&values[left as usize])
            .unwrap()
            .then_with(|| left.cmp(&right))
    });
    assert_eq!(store.sort_rows(sheet, 0, false), expected);
}

#[test]
fn numeric_sort_radix_boundary_matches_comparison_contract() {
    let mut store = CellStore::new();
    let rows = 4_096usize;
    let sheet = store.add_sheet(1, rows);
    let values: Vec<f64> = (0..rows)
        .map(|row| match row % 8 {
            0 => -0.0,
            1 => 0.0,
            2 => f64::MIN_POSITIVE,
            3 => -f64::MIN_POSITIVE,
            4 => f64::MAX,
            5 => -f64::MAX,
            _ => (row as i64 - 2_048) as f64,
        })
        .collect();
    for (row, &value) in values.iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }

    let mut expected: Vec<u32> = (0..rows as u32).collect();
    expected.sort_unstable_by(|&left, &right| {
        values[left as usize]
            .partial_cmp(&values[right as usize])
            .unwrap()
            .then_with(|| left.cmp(&right))
    });
    assert_eq!(store.sort_rows(sheet, 0, true), expected);
}

#[test]
fn pure_string_filter_fast_path_matches_mixed_and_unicode_fallbacks() {
    let mut store = CellStore::new();
    let rows = 5_000usize;
    let sheet = store.add_sheet(3, rows);
    for row in 0..rows {
        let text = if row % 11 == 0 {
            "Needle"
        } else if row % 17 == 0 {
            "CAFÉ"
        } else {
            "haystack"
        };
        store.set_string(sheet, row, 0, text, 0);
        if row % 5 == 0 {
            store.set_number(sheet, row, 1, 12_345.0, 0);
        } else {
            store.set_string(sheet, row, 1, text, 0);
        }
        store.set_string(sheet, row, 2, text, 0);
    }

    let needle: Vec<u32> = (0..rows)
        .filter(|row| row % 11 == 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "needle"), needle);
    assert_eq!(store.filter_rows(sheet, 2, "NEEDLE"), needle);

    let mixed: Vec<u32> = (0..rows)
        .filter(|row| row % 5 != 0 && row % 11 == 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 1, "needle"), mixed);

    let unicode: Vec<u32> = (0..rows)
        .filter(|row| row % 17 == 0 && row % 11 != 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "café"), unicode);
}

#[test]
fn string_pool_reuses_ids_without_duplicate_pool_entries() {
    let mut store = CellStore::new();
    let a = store.intern("repeated");
    let b = store.intern("repeated");
    let c = store.intern("other");

    assert_eq!(a, b);
    assert_ne!(a, c);
    assert_eq!(store.strings.len(), 2);
    assert_eq!(store.string_lookup.len(), 2);
}

#[test]
fn data_edge_follows_google_ctrl_arrow_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 12);
    // Column 0 occupancy: rows 0-2 run, gap, rows 6-7 run, gap to the edge.
    for row in [0, 1, 2, 6, 7] {
        store.set_string(sheet, row, 0, "x", 0);
    }
    // Row 1 occupancy across columns: 0 (from above), 2.
    store.set_number(sheet, 1, 2, 1.0, 0);

    // Inside a run → end of the run.
    assert_eq!(store.data_edge(sheet, 0, 0, 1, 0), 2);
    assert_eq!(store.data_edge(sheet, 7, 0, -1, 0), 6);
    // At a run end (next is empty) → next non-empty cell.
    assert_eq!(store.data_edge(sheet, 2, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 6, 0, -1, 0), 2);
    // From an empty cell → next non-empty cell.
    assert_eq!(store.data_edge(sheet, 4, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 4, 0, -1, 0), 2);
    // Nothing ahead → sheet edge.
    assert_eq!(store.data_edge(sheet, 7, 0, 1, 0), 11);
    assert_eq!(store.data_edge(sheet, 0, 0, -1, 0), 0);

    // Horizontal: from (1,0) right lands on the lone occupied col 2, then edge.
    assert_eq!(store.data_edge(sheet, 1, 0, 0, 1), 2);
    assert_eq!(store.data_edge(sheet, 1, 2, 0, 1), 2);
    // Out-of-range inputs bail to 0 without panicking.
    assert_eq!(store.data_edge(99, 0, 0, 1, 0), 0);
    assert_eq!(store.data_edge(sheet, 50, 0, 1, 0), 0);
}

#[test]
fn structural_deletes_invalidate_cells_and_contract_ranges_with_row_column_parity() {
    let mut rows = CellStore::new();
    let sheet = rows.add_sheet(3, 7);
    for (row, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        rows.set_number(sheet, row, 0, value, 0);
    }
    rows.set_formula(sheet, 4, 1, "=A2", 0);
    rows.set_formula(sheet, 5, 1, "=SUM(A1:A4)", 0);
    rows.set_formula(sheet, 6, 1, "=SUM(A2:A3)", 0);
    rows.remove_rows(sheet, 1, 2);
    rows.recompute(sheet);

    assert_eq!(string(&rows, sheet, 2, 1).as_deref(), Some("#REF!"));
    assert_eq!(rows.formula_source(sheet, 2, 1).as_deref(), Some("=#REF!"));
    assert_close(number(&rows, sheet, 3, 1), 5.0);
    assert_eq!(
        rows.formula_source(sheet, 3, 1).as_deref(),
        Some("=SUM(A1:A2)")
    );
    assert_eq!(string(&rows, sheet, 4, 1).as_deref(), Some("#REF!"));
    assert_eq!(
        rows.formula_source(sheet, 4, 1).as_deref(),
        Some("=SUM(#REF!)")
    );

    let mut cols = CellStore::new();
    let sheet = cols.add_sheet(7, 3);
    for (col, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        cols.set_number(sheet, 0, col, value, 0);
    }
    cols.set_formula(sheet, 1, 4, "=B1", 0);
    cols.set_formula(sheet, 1, 5, "=SUM(A1:D1)", 0);
    cols.set_formula(sheet, 1, 6, "=SUM(B1:C1)", 0);
    cols.remove_cols(sheet, 1, 2);
    cols.recompute(sheet);

    assert_eq!(string(&cols, sheet, 1, 2).as_deref(), Some("#REF!"));
    assert_eq!(cols.formula_source(sheet, 1, 2).as_deref(), Some("=#REF!"));
    assert_close(number(&cols, sheet, 1, 3), 5.0);
    assert_eq!(
        cols.formula_source(sheet, 1, 3).as_deref(),
        Some("=SUM(A1:B1)")
    );
    assert_eq!(string(&cols, sheet, 1, 4).as_deref(), Some("#REF!"));
    assert_eq!(
        cols.formula_source(sheet, 1, 4).as_deref(),
        Some("=SUM(#REF!)")
    );
}

#[test]
fn structural_edits_rewrite_cross_sheet_targets_and_preserve_qualifiers() {
    let mut store = CellStore::new();
    let source = store.add_sheet(2, 5);
    let other = store.add_sheet(2, 5);
    let summary = store.add_sheet(3, 5);
    store.set_sheet_name(source, "source", "Source Data");
    store.set_sheet_name(other, "other", "Other");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 1, 0, 9.0, 0);
    store.set_number(other, 0, 0, 7.0, 0);
    store.set_formula(summary, 0, 0, "='Source Data'!$A$2", 0);
    store.set_formula(summary, 1, 0, "=Other!A1", 0);
    store.recompute(summary);

    store.add_rows(source, 1, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_close(number(&store, summary, 0, 0), 9.0);
    assert_close(number(&store, summary, 1, 0), 7.0);
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("='Source Data'!$A$3")
    );
    assert_eq!(
        store.formula_source(summary, 1, 0).as_deref(),
        Some("=Other!A1")
    );

    store.remove_rows(source, 2, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_eq!(string(&store, summary, 0, 0).as_deref(), Some("#REF!"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=#REF!")
    );
    assert_close(number(&store, summary, 1, 0), 7.0);
}

#[test]
fn cross_sheet_column_edits_rewrite_only_the_edited_target() {
    let mut store = CellStore::new();
    let source = store.add_sheet(5, 3);
    let other = store.add_sheet(5, 3);
    let summary = store.add_sheet(2, 3);
    store.set_sheet_name(source, "source", "Source Data");
    store.set_sheet_name(other, "other", "Other");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 0, 2, 11.0, 0);
    store.set_number(other, 0, 2, 13.0, 0);
    store.set_formula(summary, 0, 0, "='Source Data'!$C$1", 0);
    store.set_formula(summary, 1, 0, "=Other!C1", 0);
    store.recompute(summary);

    store.insert_cols(source, 1, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_close(number(&store, summary, 0, 0), 11.0);
    assert_close(number(&store, summary, 1, 0), 13.0);
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("='Source Data'!$D$1")
    );
    assert_eq!(
        store.formula_source(summary, 1, 0).as_deref(),
        Some("=Other!C1")
    );

    store.remove_cols(source, 3, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_eq!(string(&store, summary, 0, 0).as_deref(), Some("#REF!"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=#REF!")
    );
    assert_close(number(&store, summary, 1, 0), 13.0);
}

#[test]
fn string_pool_round_trips_unicode_and_dedups_across_widths() {
    let mut store = CellStore::new();
    let long = "x".repeat(500);
    let samples: [&str; 7] = ["", "a", "é", "𝄞", "aé𝄞漢", "  ", &long];
    let ids: Vec<u32> = samples.iter().map(|value| store.intern(value)).collect();
    for (&id, &value) in ids.iter().zip(samples.iter()) {
        assert_eq!(string_from_pool_ref(&store.strings, id), Some(value));
    }
    let pool_len = store.strings.len();
    for (&id, &value) in ids.iter().zip(samples.iter()) {
        assert_eq!(store.intern(value), id);
    }
    assert_eq!(store.strings.len(), pool_len);
}

#[test]
fn packed_string_loader_survives_hostile_utf16_lengths() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 6);
    store.set_column_strings_packed(sheet, 0, 0, "abc".to_string(), &[2, 5, 3], 0);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("ab"));
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("c"));
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some(""));
    store.set_column_strings_packed(sheet, 1, 0, "abcdef".to_string(), &[2, 1], 0);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("ab"));
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("c"));
    assert_eq!(string(&store, sheet, 2, 1), None);
    store.set_column_strings_packed(sheet, 2, 0, "𝄞x".to_string(), &[1, 1], 0);
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("𝄞"));
    assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("x"));
    store.set_column_strings_packed(sheet, 3, 0, "é漢z".to_string(), &[1, 1, 1], 0);
    assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("é"));
    assert_eq!(string(&store, sheet, 1, 3).as_deref(), Some("漢"));
    assert_eq!(string(&store, sheet, 2, 3).as_deref(), Some("z"));
}

#[test]
fn structural_edits_interleaved_with_queries_stay_consistent() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 5);
    for (row, value) in [10.0, 20.0, 30.0, 40.0, 50.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    store.set_string(sheet, 0, 1, "top", 0);
    store.add_rows(sheet, 0, 0);
    store.remove_rows(sheet, 99, 3);
    store.add_rows(sheet, 2, usize::MAX);
    assert_eq!(store.row_count(sheet), 5);
    store.add_rows(sheet, 2, 2);
    assert_eq!(store.row_count(sheet), 7);
    assert_close(number(&store, sheet, 4, 0), 30.0);
    store.remove_rows(sheet, 0, 3);
    assert_close(store.aggregate(sheet, 0, 0), 120.0);
    store.insert_cols(sheet, 0, 1);
    assert_close(store.aggregate(sheet, 1, 0), 120.0);
    store.remove_cols(sheet, 0, 1);
    assert_close(store.aggregate(sheet, 0, 0), 120.0);
    let rows = store.row_count(sheet);
    store.remove_rows(sheet, 0, rows);
    assert_eq!(store.get_window(sheet, 0, 10, &[0]).n_rows(), 0);
}

#[test]
fn bulk_column_load_recomputes_same_and_cross_sheet_formulas() {
    let mut store = CellStore::new();
    let source = store.add_sheet(2, 3);
    let dependent = store.add_sheet(2, 3);
    store.set_sheet_name(source, "source", "Source");
    store.set_sheet_name(dependent, "dependent", "Dependent");
    store.set_number(source, 0, 0, 2.0, 0);
    store.set_formula(source, 0, 1, "=A1*2", 0);
    store.set_formula(dependent, 0, 0, "=Source!A1+1", 0);
    store.set_formula(dependent, 0, 1, "=SUM(Source!A1:A3)", 0);
    store.recompute(source);
    store.recompute(dependent);
    assert_close(number(&store, source, 0, 1), 4.0);
    assert_close(number(&store, dependent, 0, 0), 3.0);

    store.set_column_numbers(source, 0, 0, &[10.0, 20.0, 30.0], 0);
    store.recompute(source);

    assert_close(number(&store, source, 0, 1), 20.0);
    assert_close(number(&store, dependent, 0, 0), 11.0);
    assert_close(number(&store, dependent, 0, 1), 60.0);
}

#[test]
fn nan_box_canonicalizes_hostile_string_tag_patterns() {
    let hostile = [
        0xFFFC_0000_0000_0000,
        0xFFFC_0000_0000_0001,
        0xFFFC_0000_FFFF_FFFE,
        0xFFFC_FFFF_1234_5678,
    ];
    let mut sheet = SheetData::new(1, hostile.len());
    for (row, bits) in hostile.into_iter().enumerate() {
        let value = f64::from_bits(bits);
        assert!(value.is_nan());
        put_number(&mut sheet, row, 0, value);
        let index = sheet.idx(row, 0);
        assert_eq!(sheet.payload[index], encode_num(f64::NAN));
        assert!(!payload_is_str(sheet.payload[index]));
        assert_eq!(sheet.str_id_at(index), NO_STRING);
        assert!(sheet.num_at(index).is_nan());
    }
}

#[test]
fn malformed_query_and_window_inputs_fail_closed_without_panicking() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.set_string(sheet, 1, 0, "x", 0);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        assert_eq!(store.get_window(sheet, 2, 1, &[0]).n_rows(), 0);
        assert_eq!(
            store
                .get_window(sheet, 0, usize::MAX, &[0, u32::MAX])
                .n_rows(),
            3
        );
        let explicit = store.get_window_rows(sheet, &[0, u32::MAX, 2], &[0, u32::MAX]);
        assert_eq!(explicit.n_rows(), 3);
        assert_eq!(explicit.n_cols(), 2);

        assert!(store.sort_rows_multi(99, &[0], &[1], &[]).is_empty());
        assert!(store
            .sort_rows_multi(sheet, &[u32::MAX], &[1], &[])
            .is_empty());
        assert_eq!(
            store.sort_rows_multi(sheet, &[], &[], &[2, u32::MAX]),
            vec![2, u32::MAX]
        );
        assert!(store
            .filter_rows_multi(sheet, &[0], &[], &[], &[], &[], &[], &[], Vec::new())
            .is_empty());
        assert!(store
            .filter_rows_multi(99, &[], &[], &[], &[], &[], &[], &[], Vec::new())
            .is_empty());

        let mut distinct = store.distinct_values(99, 0, usize::MAX);
        assert!(distinct.take_kinds().is_empty());
        let mut bad_col = store.distinct_values(sheet, usize::MAX, 0);
        assert!(bad_col.take_kinds().is_empty());
        assert_eq!(store.data_edge_ordered(99, &[], 0, 0, 1, 0), 0);
        assert_eq!(store.data_edge_ordered(sheet, &[u32::MAX], 0, 0, 1, 0), 0);
        assert_eq!(store.data_edge_ordered(sheet, &[0], usize::MAX, 0, 1, 0), 0);
    }));

    assert!(result.is_ok());
}

#[test]
fn conditional_format_window_masks_match_numeric_text_and_bounds() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_number(sheet, 1, 0, 10.0, 0);
    store.set_number(sheet, 2, 0, 20.0, 0);
    store.set_string(sheet, 0, 1, "Tokyo", 0);
    store.set_string(sheet, 1, 1, "Kyoto", 0);
    store.set_string(sheet, 2, 1, "TOKYO", 0);
    store.set_conditional_rules(
        sheet,
        &[0, 5],
        &[0, 0, 1, 0, 0, 1, 2, 1],
        &[7.0, 0.0],
        vec![String::new(), "tokyo".to_string()],
        &[0, 0],
    );

    let mut view = store.get_window(sheet, 0, 3, &[0, 1]);
    assert_eq!(view.take_cond_matches(), vec![0, 2, 1, 0, 0, 2]);
    assert!(view.take_cond_matches().is_empty());
}

#[test]
fn multi_query_entry_points_preserve_order_filters_distinctness_and_edges() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 5);
    for (row, value) in [2.0, 1.0, 2.0, 1.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    for (row, value) in ["x", "x", "y", "x", "y"].into_iter().enumerate() {
        store.set_string(sheet, row, 1, value, 0);
    }
    for (row, value) in [9.0, 8.0, 7.0, 6.0, 5.0].into_iter().enumerate() {
        store.set_number(sheet, row, 2, value, 0);
    }

    assert_eq!(
        store.sort_rows_multi(sheet, &[0, 2], &[1, 0], &[]),
        vec![1, 3, 0, 2, 4]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[1],
            &[1],
            &[0],
            &[0.0],
            &[0],
            &[1],
            &[],
            vec!["x".to_string()],
        ),
        vec![0, 1, 3]
    );

    let mut distinct = store.distinct_values(sheet, 0, 2);
    assert_eq!(distinct.take_kinds(), vec![1, 1]);
    assert_eq!(distinct.take_numbers(), vec![2.0, 1.0]);
    assert!(distinct.take_texts().is_empty());

    let order = [1, 3, 0, 2, 4];
    assert_eq!(store.data_edge_ordered(sheet, &order, 0, 0, 1, 0), 4);
    assert_eq!(store.data_edge_ordered(sheet, &order, 4, 0, -1, 0), 0);
}

#[test]
fn boolean_queries_sort_filter_search_and_distinct_without_becoming_blanks() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 6);
    store.set_bool(sheet, 0, 0, false, 0);
    store.set_bool(sheet, 1, 0, true, 0);
    store.set_formula(sheet, 2, 0, "=1=1", 0);
    store.set_formula(sheet, 3, 0, "=1=2", 0);
    store.set_number(sheet, 4, 0, 7.0, 0);
    store.recompute(sheet);

    assert_eq!(store.sort_rows(sheet, 0, true), vec![4, 0, 3, 1, 2, 5]);
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[0],
            &[0.0],
            &[0],
            &[1],
            &[],
            vec!["\0TRUE".to_string()],
        ),
        vec![1, 2]
    );
    assert_eq!(store.filter_rows(sheet, 0, "true"), vec![1, 2]);
    assert_eq!(
        store.search(sheet, &[0], "TRUE", true, true),
        vec![1, 0, 2, 0]
    );

    let mut distinct = store.distinct_values(sheet, 0, 0);
    assert_eq!(distinct.take_kinds(), vec![3, 3, 1, 0]);
    assert_eq!(distinct.take_numbers(), vec![0.0, 1.0, 7.0]);
    assert!(distinct.take_texts().is_empty());
}

#[test]
fn mixed_formula_queries_order_errors_text_booleans_and_empty_aggregates() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 6);
    store.set_formula(sheet, 0, 0, "=1/0", 0);
    store.set_formula(sheet, 1, 0, "=\"beta\"", 0);
    store.set_formula(sheet, 2, 0, "=TRUE", 0);
    store.set_string(sheet, 3, 0, "alpha", 0);
    store.set_number(sheet, 4, 0, 7.0, 0);

    store.set_formula(sheet, 0, 1, "=1/0", 0);
    store.set_formula(sheet, 1, 1, "=2+3", 0);
    store.set_number(sheet, 2, 1, 7.0, 0);
    store.recompute(sheet);

    assert_eq!(store.sort_rows(sheet, 0, true), vec![4, 0, 3, 1, 2, 5]);
    assert_eq!(store.sort_rows(sheet, 0, false), vec![5, 2, 1, 3, 0, 4]);
    assert_close(store.aggregate(sheet, 1, 0), 12.0);
    assert_close(store.aggregate(sheet, 1, 1), 6.0);
    assert_close(store.aggregate(sheet, 1, 2), 5.0);
    assert_eq!(
        store.search(sheet, &[0], "#DIV/0!", false, true),
        vec![0, 0]
    );
    assert_eq!(store.search(sheet, &[0], "beta", false, true), vec![1, 0]);
    assert!(store
        .search(sheet, &[u32::MAX], "x", true, false)
        .is_empty());
    assert!(store.search(sheet, &[0], "", true, false).is_empty());
    assert_close(store.aggregate(sheet, 1, 3), 7.0);
    assert_close(store.aggregate(sheet, 1, 4), 2.0);
    for op in 0..=4 {
        assert_close(store.aggregate(sheet, 2, op), 0.0);
    }
}

#[test]
fn range_native_block_clear_and_style_remap_preserve_column_major_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    assert!(store.set_block(
        sheet,
        0,
        0,
        3,
        2,
        &[1, 2, 0, 1, 2, 1],
        &[1.0, 0.0, 0.0, 4.0, 0.0, 6.0],
        vec![
            String::new(),
            "two".to_string(),
            String::new(),
            String::new(),
            "five".to_string(),
            String::new(),
        ],
        &[7, 8, 7, 8, 7, 8],
    ));

    assert_close(number(&store, sheet, 0, 0), 1.0);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("two"));
    assert_eq!(store.get_cell(sheet, 1, 0).kind(), KIND_EMPTY);
    assert_close(number(&store, sheet, 2, 1), 6.0);
    assert_eq!(store.range_style_ids(sheet, 0, 0, 2, 1), vec![7, 8]);
    assert!(store.remap_range_styles(sheet, 0, 0, 2, 1, &[7, 8], &[70, 80]));
    assert_eq!(store.style_id_at(sheet, 0, 0), 70);
    assert_eq!(store.style_id_at(sheet, 0, 1), 80);

    assert!(store.clear_range(sheet, 0, 0, 2, 0, true, false));
    assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_EMPTY);
    assert_eq!(store.style_id_at(sheet, 0, 0), 70);
    assert_close(number(&store, sheet, 2, 1), 6.0);
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), None);
}

#[test]
fn range_style_remap_bounds_output_by_distinct_ids_and_rejects_invalid_tables() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 4);
    for row in 0..4 {
        store.set_number(sheet, row, 0, row as f64, 4);
        store.set_number(sheet, row, 1, row as f64, if row % 2 == 0 { 7 } else { 4 });
        store.set_number(sheet, row, 2, row as f64, 7);
    }

    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![4, 7]);
    assert!(store.remap_range_styles(sheet, 0, 0, 3, 2, &[4, 7], &[40, 70]));
    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![40, 70]);
    assert!(store.remap_range_styles(sheet, 0, 0, 3, 2, &[40, 70], &[0, 0]));
    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![0]);

    assert!(store.range_style_ids(sheet, 2, 0, 1, 2).is_empty());
    assert!(store.range_style_ids(sheet + 1, 0, 0, 0, 0).is_empty());
    assert!(!store.remap_range_styles(sheet, 2, 0, 1, 2, &[0], &[1]));
    assert!(!store.remap_range_styles(sheet, 0, 0, 3, 2, &[0], &[]));
    assert!(!store.remap_range_styles(sheet, 0, 0, 4, 2, &[0], &[1]));
}

#[test]
fn range_style_remap_scans_only_loaded_paged_cells() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 8, 4, 1_000_000);
    store.begin_page_load();
    store.set_number(sheet, 3, 1, 12.0, 9);
    store.end_page_load();

    assert_eq!(store.range_style_ids(sheet, 0, 0, 7, 1), vec![9]);
    assert!(store.remap_range_styles(sheet, 0, 0, 7, 1, &[9], &[11]));
    assert_eq!(store.style_id_at(sheet, 3, 1), 11);
    assert_eq!(store.style_id_at(sheet, 0, 0), 0);
}

#[test]
fn opaque_range_snapshot_restores_values_formulas_and_styles() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_number(sheet, 0, 0, 5.0, 11);
    store.set_formula(sheet, 1, 0, "=A1+1", 12);
    store.set_string(sheet, 2, 1, "tail", 13);
    store.recompute(sheet);

    let snapshot = store.capture_range(sheet, 0, 0, 3, 2).unwrap();
    assert_eq!(snapshot.formula_offsets(), vec![1, 0]);
    assert_eq!(snapshot.formula_sources(), vec!["=(A1+1)"]);
    assert_eq!(snapshot.kinds().len(), 6);
    assert_eq!(snapshot.style_ids(), vec![11, 12, 0, 0, 0, 13]);
    assert!(snapshot.byte_length() >= 6 * (1 + std::mem::size_of::<u64>()));
    let snapshot_numbers = store.snapshot_numbers(&snapshot);
    let snapshot_texts = store.snapshot_texts(&snapshot);
    assert_close(snapshot_numbers[0], 5.0);
    assert_eq!(snapshot_texts[5], "tail");
    let first = store.get_cell(sheet, 0, 0);
    assert_close(first.num(), 5.0);
    assert_eq!(first.style(), 11);
    assert_eq!(first.string(), None);
    assert_eq!(CellStore::default().row_count(0), 0);
    assert!(store.clear_range(sheet, 0, 0, 2, 1, true, true));
    assert!(store.restore_range(sheet, 0, 0, &snapshot));
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 0), 5.0);
    assert_close(number(&store, sheet, 1, 0), 6.0);
    assert_eq!(
        store.formula_source(sheet, 1, 0).as_deref(),
        Some("=(A1+1)")
    );
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("tail"));
    assert_eq!(store.style_id_at(sheet, 0, 0), 11);
    assert_eq!(store.style_id_at(sheet, 1, 0), 12);
    assert_eq!(store.style_id_at(sheet, 2, 1), 13);
}

#[test]
fn paged_sheet_allocates_lazily_and_evicts_only_clean_chunks() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 1_000_000, 4096, 110_000);
    assert_eq!(store.paged_stats(sheet), vec![0.0, 0.0, 0.0, 0.0, 0.0]);
    assert_eq!(store.cell_state(sheet, 0, 0), 0);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#LOADING!"));

    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0], 0);
    store.set_column_numbers(sheet, 0, 4096, &[2.0], 0);
    store.end_page_load();
    let loaded = store.paged_stats(sheet);
    assert_eq!(loaded[0], 2.0);
    assert_eq!(loaded[1], 2.0);
    assert_eq!(loaded[2], 0.0);

    // A local edit dirties and pins chunk 0. Loading two more clean chunks
    // evicts the older clean chunk, never the dirty edit.
    store.set_number(sheet, 0, 0, 10.0, 0);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 8192, &[3.0], 0);
    store.set_column_numbers(sheet, 0, 12288, &[4.0], 0);
    store.end_page_load();
    let evicted = store.paged_stats(sheet);
    assert_eq!(evicted[0], 2.0);
    assert_eq!(evicted[2], 1.0);
    assert_close(number(&store, sheet, 0, 0), 10.0);
    assert_eq!(store.cell_state(sheet, 4096, 0), 0);

    store.mark_range_clean(sheet, 0, 1, 0, 1);
    assert_eq!(store.paged_stats(sheet)[2], 0.0);
}

#[test]
fn paged_formulas_propagate_loading_until_dependencies_arrive() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 6000, 4096, 1_000_000);
    store.set_formula(sheet, 0, 1, "=A5001+1", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#LOADING!"));

    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 5000, &[41.0], 0);
    store.end_page_load();
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 42.0);
}

#[test]
fn fully_loaded_paged_queries_match_dense_query_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 3, 4, 1_000_000);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[3.0, 1.0, 2.0], 0);
    store.set_column_strings(
        sheet,
        1,
        0,
        vec![
            "alpha".to_string(),
            "beta".to_string(),
            "alphabet".to_string(),
        ],
        0,
    );
    store.end_page_load();

    assert!(store.is_fully_loaded(sheet));
    assert_close(store.aggregate(sheet, 0, 0), 6.0);
    assert_eq!(store.sort_rows(sheet, 0, true), vec![1, 2, 0]);
    assert_eq!(store.filter_rows(sheet, 1, "alpha"), vec![0, 2]);
    assert_eq!(store.search(sheet, &[1], "beta", true, false), vec![1, 1]);
}

#[test]
fn paged_structural_edits_remap_loaded_cells_without_dense_allocation() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 6, 4, 1_000_000);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0], 0);
    store.set_column_strings(
        sheet,
        1,
        0,
        (0..6).map(|row| format!("r{row}")).collect(),
        0,
    );
    store.end_page_load();
    assert!(store.is_fully_loaded(sheet));

    store.add_rows(sheet, 2, 2);
    assert_eq!(store.row_count(sheet), 8);
    assert_eq!(store.cell_state(sheet, 2, 0), 0);
    assert_close(number(&store, sheet, 4, 0), 3.0);
    assert_eq!(string(&store, sheet, 4, 1).as_deref(), Some("r2"));

    store.remove_rows(sheet, 1, 2);
    assert_eq!(store.row_count(sheet), 6);
    assert_eq!(store.cell_state(sheet, 1, 0), 0);
    assert_close(number(&store, sheet, 2, 0), 3.0);

    store.insert_cols(sheet, 1, 1);
    assert_eq!(store.col_count(sheet), 3);
    assert_eq!(store.cell_state(sheet, 2, 1), 0);
    assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("r2"));

    store.remove_cols(sheet, 0, 1);
    assert_eq!(store.col_count(sheet), 2);
    assert_eq!(store.cell_state(sheet, 2, 0), 0);
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("r2"));
}

#[test]
fn formula_ast_boundaries_preserve_blank_comparison_and_named_cell_semantics() {
    let mut no_formulas = CellStore::new();
    let empty_sheet = no_formulas.add_sheet(1, 1);
    no_formulas.set_number(empty_sheet, 0, 0, 1.0, 0);
    no_formulas.recompute(empty_sheet);
    no_formulas.recompute(empty_sheet);
    no_formulas.recompute(99);

    let mut store = CellStore::new();
    let sheet = store.add_sheet(20, 2);
    store.set_number(sheet, 0, 0, 5.0, 0);
    assert!(store.set_named_range("Single", -1, sheet, 0, 0, 0, 0));
    let numeric_formulas = [
        "=5-2",
        "=3*4",
        "=8/2",
        "=1<>2",
        "=1<=1",
        "=2>=1",
        "=SUM(A1)",
        "=Single",
        "=IF(TRUE,,1)",
        "=IFERROR()",
    ];
    for (offset, formula) in numeric_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 2, formula, 0);
    }
    let errors = [
        ("=A1:A2", "#VALUE!"),
        ("=-(1/0)", "#DIV/0!"),
        ("=IF()", "#VALUE!"),
        ("=IF(1/0,1,2)", "#DIV/0!"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 1, offset + 2, formula, 0);
    }
    store.recompute(sheet);

    let expected = [3.0, 12.0, 4.0, 1.0, 1.0, 1.0, 5.0, 5.0, 0.0, 0.0];
    for (offset, value) in expected.into_iter().enumerate() {
        assert_close(number(&store, sheet, 0, offset + 2), value);
    }
    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 1, offset + 2).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
}

#[test]
fn multi_filter_kinds_and_numeric_operators_match_resolved_cell_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 6);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.set_number(sheet, 1, 0, 2.0, 0);
    store.set_string(sheet, 2, 0, "Alpha", 0);
    store.set_bool(sheet, 3, 0, true, 0);
    store.set_formula(sheet, 5, 0, "=1/0", 0);
    store.recompute(sheet);

    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[0], &[0], &[], &[1], &[0], &[2.0], vec![]),
        vec![1]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["Alpha".to_string()],
        ),
        vec![2]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["\0TRUE".to_string()],
        ),
        vec![3]
    );
    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[0], &[1], &[], &[0], &[0], &[], vec![]),
        vec![4]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[1],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["div/0".to_string()],
        ),
        vec![5]
    );

    let numeric =
        |flag| store.filter_rows_multi(sheet, &[0], &[2], &[flag], &[1.0], &[0], &[0], &[], vec![]);
    assert_eq!(numeric(0), vec![1]);
    assert_eq!(numeric(1), vec![0, 1]);
    assert!(numeric(2).is_empty());
    assert_eq!(numeric(3), vec![0]);
    assert_eq!(numeric(4), vec![0]);
    assert_eq!(numeric(5), vec![1]);
    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[3], &[], &[], &[], &[], &[], vec![]),
        vec![4]
    );
    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[4], &[], &[], &[], &[], &[], vec![]),
        vec![0, 1, 2, 3, 5]
    );
    assert!(store
        .filter_rows_multi(sheet, &[0], &[99], &[], &[], &[], &[], &[], vec![])
        .is_empty());

    let mut limited = store.distinct_values(sheet, 0, 2);
    assert_eq!(limited.take_kinds().len(), 2);
    assert_eq!(
        store.sort_rows_multi(sheet, &[0], &[], &[u32::MAX, 1, 0]),
        vec![0, 1]
    );
    assert_eq!(store.data_edge_ordered(sheet, &[0, 1], 0, 0, 0, 1), 0);
}
