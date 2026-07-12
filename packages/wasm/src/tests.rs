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

#[derive(Clone, Copy)]
struct LoopMeasurement {
    name: &'static str,
    safe_ms: f64,
    unchecked_ms: f64,
    ratio: f64,
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
    assert_eq!(string(&store, sheet, 11, 0).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 12, 0).as_deref(), Some("FALSE"));
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
    assert_eq!(string(&store, sheet, 4, 1).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 5, 1).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 6, 1).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 7, 1).as_deref(), Some("fallback"));
    assert_eq!(string(&store, sheet, 8, 1).as_deref(), Some("ok"));
    assert_close(number(&store, sheet, 9, 1), 4.0);
    assert_eq!(string(&store, sheet, 10, 1).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 11, 1).as_deref(), Some("TRUE"));
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
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("TRUE"));
    assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("FALSE"));

    let mut view = store.get_window(sheet, 0, 1, &[0, 1, 2, 3]);
    let kinds = view.take_kinds();
    let string_ids = view.take_string_ids();
    let pooled = store.pool_strings(&string_ids);
    assert_eq!(
        kinds,
        vec![KIND_STRING, KIND_NUMBER, KIND_STRING, KIND_STRING]
    );
    assert_eq!(pooled[0], "hello");
    assert_eq!(pooled[2], "TRUE");
    assert_eq!(pooled[3], "FALSE");

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
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("#ERROR!"));
    assert_eq!(string(&store, sheet, 3, 1).as_deref(), Some("#VALUE!"));
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
    assert_eq!(store.search(sheet, &[0, 1], "tokyo", true, false), vec![0, 0, 2, 0]);
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

        assert_eq!(store.sort_rows(sheet, 0, true), vec![6, 1, 2, 3, 4, 7, 0, 5]);
        assert_eq!(store.sort_rows(sheet, 0, false), vec![0, 5, 7, 4, 2, 3, 1, 6]);
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
