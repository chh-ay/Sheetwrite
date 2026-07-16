//! Whole-column queries: sort, filter, search, aggregate — cache-local scans.

use std::cell::Cell;
use std::cmp::Ordering;
use std::collections::HashSet;

use wasm_bindgen::prelude::*;

use crate::sheet::{formula_error_at, payload_is_str, payload_num, payload_str_id, SheetData};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, CellKey, FormulaError, FormulaValueKind, StringPool, KIND_BOOL,
    KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

#[derive(Hash, Eq, PartialEq)]
enum DistinctKey<'a> {
    Blank,
    Number(u64),
    Bool(bool),
    Text(&'a str),
}

thread_local! {
    static QUERY_STATS: Cell<[u64; 2]> = const { Cell::new([0, 0]) };
}

#[wasm_bindgen]
impl CellStore {
    /// `[contains cache constructions, owned distinct strings]`.
    #[wasm_bindgen(js_name = queryResourceStats)]
    pub fn query_resource_stats(&self) -> Vec<f64> {
        QUERY_STATS.with(|stats| stats.get().into_iter().map(|value| value as f64).collect())
    }

    #[wasm_bindgen(js_name = resetQueryResourceStats)]
    pub fn reset_query_resource_stats(&self) {
        QUERY_STATS.with(|stats| stats.set([0, 0]));
    }
    /// Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.
    #[wasm_bindgen(js_name = aggregate)]
    pub fn aggregate(&self, sheet: usize, col: usize, op: u8) -> f64 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0.0;
        };
        if col >= s.n_cols {
            return 0.0;
        }

        let base = col * s.row_count;
        let mut sum = 0.0;
        let mut count = 0u32;
        let mut min = f64::INFINITY;
        let mut max = f64::NEG_INFINITY;
        if s.is_paged() {
            for row in 0..s.row_count {
                if let Some(value) = numeric_cell_value(s, base + row) {
                    sum += value;
                    count += 1;
                    min = min.min(value);
                    max = max.max(value);
                }
            }
        } else {
            // The dense aggregate keeps its proven unchecked contiguous loop.
            for row in 0..s.row_count {
                let i = base + row;
                // SAFETY: `col < n_cols`, `row < row_count`, and all dense cell
                // vectors have the same `n_cols * row_count` length.
                let stored_kind = unsafe { *s.kind.get_unchecked(i) };
                let value = match stored_kind {
                    KIND_NUMBER => Some(f64::from_bits(unsafe { s.payload_unchecked(i) })),
                    KIND_FORMULA => {
                        let bits = unsafe { s.payload_unchecked(i) };
                        if !payload_is_str(bits)
                            && key_for_index(s, i)
                                .is_some_and(|key| formula_error_at(s, key).is_none())
                        {
                            Some(f64::from_bits(bits))
                        } else {
                            None
                        }
                    }
                    _ => None,
                };
                if let Some(value) = value {
                    sum += value;
                    count += 1;
                    min = min.min(value);
                    max = max.max(value);
                }
            }
        }
        match op {
            0 => sum,
            1 => {
                if count > 0 {
                    sum / f64::from(count)
                } else {
                    0.0
                }
            }
            2 => {
                if count > 0 {
                    min
                } else {
                    0.0
                }
            }
            3 => {
                if count > 0 {
                    max
                } else {
                    0.0
                }
            }
            _ => f64::from(count),
        }
    }

    /// Stable row order sorted by a column. Returns a data-row permutation.
    #[wasm_bindgen(js_name = sortRows)]
    pub fn sort_rows(&self, sheet: usize, col: usize, ascending: bool) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.n_cols {
            return Vec::new();
        }

        let base = col * s.row_count;

        if let Some(order) = if s.row_count >= MIN_RADIX_SORT_ROWS {
            sort_finite_number_column_radix(s, base, ascending)
        } else {
            sort_finite_number_column_comparison(s, base, ascending)
        } {
            return order;
        }

        // Decorate-sort-undecorate: materialize each row's comparison key ONCE
        // (one pool deref per row) instead of rebuilding both operands inside
        // the comparator — a comparison sort would otherwise reconstruct keys
        // ~2·n·log2(n) times, each a scattered heap deref for text cells.
        let mut keys: Vec<ComparableCell> = Vec::with_capacity(s.row_count);
        for row in 0..s.row_count {
            let index = base + row;
            keys.push(if s.is_paged() {
                ComparableCell::from_cell(s, &self.strings, index)
            } else {
                // SAFETY: the dense column index is in bounds.
                unsafe { ComparableCell::from_cell_unchecked(s, &self.strings, index) }
            });
        }

        let mut order: Vec<u32> = (0..s.row_count as u32).collect();
        order.sort_unstable_by(|&a, &b| {
            // SAFETY: `order` holds only rows from `0..row_count` and `keys`
            // has exactly `row_count` entries.
            let ka = unsafe { keys.get_unchecked(a as usize) };
            // SAFETY: as above.
            let kb = unsafe { keys.get_unchecked(b as usize) };
            let ord = ka.cmp(kb);
            let ord = if ascending { ord } else { ord.reverse() };
            if ord == Ordering::Equal {
                a.cmp(&b)
            } else {
                ord
            }
        });
        order
    }

    /// Data-row indices whose column text contains `needle` (case-insensitive).
    #[wasm_bindgen(js_name = filterRows)]
    pub fn filter_rows(&self, sheet: usize, col: usize, needle: &str) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.n_cols {
            return Vec::new();
        }

        let base = col * s.row_count;
        let needle = needle.to_lowercase();
        let mut out: Vec<u32> = Vec::with_capacity(s.row_count.min(1024));
        let mut cache = MatchCache::new();

        if s.is_paged() {
            for row in 0..s.row_count {
                let index = base + row;
                if cell_matches_text(s, &self.strings, index, &needle, true, false, &mut cache) {
                    out.push(row as u32);
                }
            }
        } else {
            // Dense string columns keep the slice-based bounds-check-free path.
            let kinds = &s.kind[base..base + s.row_count];
            let payloads = &s.payload[base..base + s.row_count];
            for (row, (&kind, &bits)) in kinds.iter().zip(payloads.iter()).enumerate() {
                let matched = if kind == KIND_STRING {
                    cache.matches(&self.strings, payload_str_id(bits), &needle, true, false)
                } else if kind == KIND_EMPTY {
                    false
                } else {
                    cell_matches_text(
                        s,
                        &self.strings,
                        base + row,
                        &needle,
                        true,
                        false,
                        &mut cache,
                    )
                };
                if matched {
                    out.push(row as u32);
                }
            }
        }
        out
    }

    /// Ctrl+Arrow destination: from `(row, col)` stepping by `(d_row, d_col)`
    /// (exactly one of them ±1), return the destination row (vertical moves) or
    /// column (horizontal moves), Google Sheets semantics:
    ///
    /// - current and adjacent cell non-empty → end of the contiguous non-empty
    ///   run;
    /// - otherwise → the next non-empty cell in that direction;
    /// - nothing ahead → the sheet edge.
    #[wasm_bindgen(js_name = dataEdge)]
    pub fn data_edge(&self, sheet: usize, row: usize, col: usize, d_row: i32, d_col: i32) -> u32 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0;
        };
        if row >= s.row_count || col >= s.n_cols || s.row_count == 0 || s.n_cols == 0 {
            return 0;
        }

        let vertical = d_row != 0;
        let (pos, limit, step) = if vertical {
            (row, s.row_count, d_row.signum() as isize)
        } else {
            (col, s.n_cols, d_col.signum() as isize)
        };

        // Column-major layout: vertical scans walk a contiguous column slice,
        // horizontal scans stride by `row_count`.
        let index_of = |p: usize| -> usize {
            if vertical {
                col * s.row_count + p
            } else {
                p * s.row_count + row
            }
        };
        let occupied = |p: usize| -> bool { s.kind_at(index_of(p)) != KIND_EMPTY };

        let last = limit - 1;
        let next = pos as isize + step;
        if next < 0 || next as usize > last {
            return if step < 0 { 0 } else { last as u32 };
        }
        let next = next as usize;

        if occupied(pos) && occupied(next) {
            // Inside a run: land on its last non-empty cell.
            let mut p = next;
            loop {
                let ahead = p as isize + step;
                if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                    return p as u32;
                }
                p = ahead as usize;
            }
        }

        // In a gap (or leaving a lone cell): land on the next non-empty cell,
        // falling back to the sheet edge.
        let mut p = next as isize;
        while p >= 0 && p as usize <= last {
            if occupied(p as usize) {
                return p as u32;
            }
            p += step;
        }
        if step < 0 {
            0
        } else {
            last as u32
        }
    }

    /// Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
    /// list. Scans the requested columns column-major (cache-local), then sorts
    /// row-major so search navigation runs top-to-bottom, left-to-right.
    #[wasm_bindgen(js_name = search)]
    pub fn search(
        &self,
        sheet: usize,
        cols: &[u32],
        query: &str,
        case_insensitive: bool,
        whole_cell: bool,
    ) -> Vec<u32> {
        let needle = if case_insensitive {
            query.to_lowercase()
        } else {
            query.to_string()
        };
        if needle.is_empty() {
            return Vec::new();
        }

        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let mut pairs: Vec<(u32, u32)> = Vec::new();
        let mut cache = MatchCache::new();

        for &col_u in cols {
            let col = col_u as usize;
            if col >= s.n_cols {
                continue;
            }

            // 2026-06 release harness: unchecked search scanning was 1.03x here,
            // below the 2x threshold; keep the safe indexing.
            let base = col * s.row_count;
            for row in 0..s.row_count {
                let i = base + row;
                if cell_matches_text(
                    s,
                    &self.strings,
                    i,
                    &needle,
                    case_insensitive,
                    whole_cell,
                    &mut cache,
                ) {
                    pairs.push((row as u32, col_u));
                }
            }
        }

        pairs.sort_unstable();

        let mut out = Vec::with_capacity(pairs.len() * 2);
        for (row, col) in pairs {
            out.push(row);
            out.push(col);
        }
        out
    }
}

#[wasm_bindgen]
impl CellStore {
    #[wasm_bindgen(js_name = sortRowsMulti)]
    pub fn sort_rows_multi(
        &self,
        sheet: usize,
        cols: &[u32],
        ascending: &[u8],
        candidates: &[u32],
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if cols.is_empty() {
            return candidates.to_vec();
        }
        if cols.len() == 1 && candidates.is_empty() {
            return self.sort_rows(
                sheet,
                cols[0] as usize,
                ascending.first().copied().unwrap_or(1) != 0,
            );
        }
        if cols.iter().any(|&col| col as usize >= data.n_cols) {
            return Vec::new();
        }
        let mut rows: Vec<u32> = if candidates.is_empty() {
            (0..data.row_count as u32).collect()
        } else {
            candidates
                .iter()
                .copied()
                .filter(|&row| (row as usize) < data.row_count)
                .collect()
        };
        rows.sort_by(|&left, &right| {
            for (key, &col) in cols.iter().enumerate() {
                let base = col as usize * data.row_count;
                let a = ComparableCell::from_cell(data, &self.strings, base + left as usize);
                let b = ComparableCell::from_cell(data, &self.strings, base + right as usize);
                let order = if ascending.get(key).copied().unwrap_or(1) != 0 {
                    a.cmp(&b)
                } else {
                    b.cmp(&a)
                };
                if order != Ordering::Equal {
                    return order;
                }
            }
            left.cmp(&right)
        });
        rows
    }

    #[allow(clippy::too_many_arguments)]
    #[wasm_bindgen(js_name = filterRowsMulti)]
    pub fn filter_rows_multi(
        &self,
        sheet: usize,
        cols: &[u32],
        kinds: &[u8],
        flags: &[u8],
        nums: &[f64],
        num_counts: &[u32],
        text_counts: &[u32],
        value_nums: &[f64],
        value_texts: Vec<String>,
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if cols.len() != kinds.len() || cols.iter().any(|&col| col as usize >= data.n_cols) {
            return Vec::new();
        }
        let mut num_offsets = Vec::with_capacity(cols.len());
        let mut text_offsets = Vec::with_capacity(cols.len());
        let (mut no, mut to) = (0usize, 0usize);
        for i in 0..cols.len() {
            num_offsets.push(no);
            text_offsets.push(to);
            no = no.saturating_add(num_counts.get(i).copied().unwrap_or(0) as usize);
            to = to.saturating_add(text_counts.get(i).copied().unwrap_or(0) as usize);
        }
        let mut cache_index = vec![usize::MAX; kinds.len()];
        let mut match_caches = Vec::with_capacity(kinds.iter().filter(|&&kind| kind == 1).count());
        for (index, &kind) in kinds.iter().enumerate() {
            if kind != 1 {
                continue;
            }
            cache_index[index] = match_caches.len();
            match_caches.push(MatchCache::new());
        }
        QUERY_STATS.with(|stats| {
            let mut current = stats.get();
            current[0] = current[0].saturating_add(match_caches.len() as u64);
            stats.set(current);
        });
        let mut out = Vec::new();
        'rows: for row in 0..data.row_count {
            for i in 0..cols.len() {
                let index = cols[i] as usize * data.row_count + row;
                let kind = resolved_kind(data, index);
                let matches = match kinds[i] {
                    0 => {
                        let mut hit = kind == 0 && flags.get(i).copied().unwrap_or(0) & 1 != 0;
                        let nc = num_counts.get(i).copied().unwrap_or(0) as usize;
                        let tc = text_counts.get(i).copied().unwrap_or(0) as usize;
                        if kind == 1 {
                            if let Some(value) = numeric_cell_value(data, index) {
                                hit |= value_nums
                                    .get(num_offsets[i]..num_offsets[i] + nc)
                                    .unwrap_or(&[])
                                    .contains(&value);
                            }
                        } else if kind == 2 {
                            if let Some(text) = resolved_text(data, &self.strings, index) {
                                hit |= value_texts
                                    .get(text_offsets[i]..text_offsets[i] + tc)
                                    .unwrap_or(&[])
                                    .iter()
                                    .any(|v| v == text);
                            }
                        } else if kind == 3 {
                            if let Some(value) = boolean_cell_value(data, index) {
                                let expected = if value { "\0TRUE" } else { "\0FALSE" };
                                hit |= value_texts
                                    .get(text_offsets[i]..text_offsets[i] + tc)
                                    .unwrap_or(&[])
                                    .iter()
                                    .any(|candidate| candidate == expected);
                            }
                        }
                        hit
                    }
                    1 => {
                        let needle = value_texts
                            .get(text_offsets[i])
                            .map(String::as_str)
                            .unwrap_or("");
                        cell_matches_text(
                            data,
                            &self.strings,
                            index,
                            needle,
                            flags.get(i).copied().unwrap_or(0) == 0,
                            false,
                            &mut match_caches[cache_index[i]],
                        )
                    }
                    2 => numeric_cell_value(data, index).is_some_and(|value| {
                        match flags.get(i).copied().unwrap_or(0) {
                            0 => value > nums.get(i).copied().unwrap_or(0.0),
                            1 => value >= nums.get(i).copied().unwrap_or(0.0),
                            2 => value < nums.get(i).copied().unwrap_or(0.0),
                            3 => value <= nums.get(i).copied().unwrap_or(0.0),
                            4 => value == nums.get(i).copied().unwrap_or(0.0),
                            _ => value != nums.get(i).copied().unwrap_or(0.0),
                        }
                    }),
                    3 => kind == 0,
                    4 => kind != 0,
                    _ => false,
                };
                if !matches {
                    continue 'rows;
                }
            }
            out.push(row as u32);
        }
        out
    }

    #[wasm_bindgen(js_name = distinctValues)]
    pub fn distinct_values(&self, sheet: usize, col: usize, limit: usize) -> DistinctColumn {
        let mut out = DistinctColumn::default();
        let Some(data) = self.sheets.get(sheet) else {
            return out;
        };
        if col >= data.n_cols {
            return out;
        }
        let mut seen: HashSet<DistinctKey<'_>> = HashSet::new();
        for row in 0..data.row_count {
            let index = col * data.row_count + row;
            let kind = resolved_kind(data, index);
            let text = if kind == 2 {
                resolved_text(data, &self.strings, index).unwrap_or("")
            } else {
                ""
            };
            let key = match kind {
                1 => DistinctKey::Number(numeric_cell_value(data, index).unwrap_or(0.0).to_bits()),
                2 => DistinctKey::Text(text),
                3 => DistinctKey::Bool(boolean_cell_value(data, index).unwrap_or(false)),
                _ => DistinctKey::Blank,
            };
            if !seen.insert(key) {
                continue;
            }
            out.kinds.push(kind);
            if kind == 1 {
                out.numbers
                    .push(numeric_cell_value(data, index).unwrap_or(0.0));
            } else if kind == 3 {
                out.numbers
                    .push(if boolean_cell_value(data, index).unwrap_or(false) {
                        1.0
                    } else {
                        0.0
                    });
            } else if kind == 2 {
                out.texts.push(text.to_owned());
                QUERY_STATS.with(|stats| {
                    let mut current = stats.get();
                    current[1] = current[1].saturating_add(1);
                    stats.set(current);
                });
            }
            if limit != 0 && out.kinds.len() >= limit {
                break;
            }
        }
        out
    }

    #[wasm_bindgen(js_name = dataEdgeOrdered)]
    pub fn data_edge_ordered(
        &self,
        sheet: usize,
        order: &[u32],
        row: usize,
        col: usize,
        d_row: i32,
        d_col: i32,
    ) -> u32 {
        let Some(data) = self.sheets.get(sheet) else {
            return 0;
        };
        if row >= order.len() || col >= data.n_cols {
            return 0;
        }
        if d_row == 0 {
            return self.data_edge(sheet, order[row] as usize, col, 0, d_col);
        }
        let occupied = |view: usize| {
            order.get(view).is_some_and(|&r| {
                let r = r as usize;
                r < data.row_count && resolved_kind(data, col * data.row_count + r) != 0
            })
        };
        edge_scan(row, order.len(), d_row.signum() as isize, occupied) as u32
    }
}

fn resolved_kind(sheet: &SheetData, index: usize) -> u8 {
    match sheet.kind_at(index) {
        KIND_NUMBER => 1,
        KIND_STRING => 2,
        KIND_BOOL => 3,
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return 0;
            };
            let Some(entry) = sheet.formulas.get(&key) else {
                return 0;
            };
            if formula_error_at(sheet, key).is_some() {
                2
            } else {
                match entry.value_kind {
                    FormulaValueKind::Number => 1,
                    FormulaValueKind::Text => 2,
                    FormulaValueKind::Bool => 3,
                }
            }
        }
        _ => 0,
    }
}

fn boolean_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

fn boolean_cell_value(sheet: &SheetData, index: usize) -> Option<bool> {
    match sheet.kind_at(index) {
        KIND_BOOL => Some(sheet.num_at(index) != 0.0),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            let entry = sheet.formulas.get(&key)?;
            (formula_error_at(sheet, key).is_none() && entry.value_kind == FormulaValueKind::Bool)
                .then(|| sheet.num_at(index) != 0.0)
        }
        _ => None,
    }
}

fn resolved_text<'a>(sheet: &SheetData, strings: &'a StringPool, index: usize) -> Option<&'a str> {
    if let Some(value) = boolean_cell_value(sheet, index) {
        return Some(boolean_text(value));
    }
    match sheet.kind_at(index) {
        KIND_STRING | KIND_FORMULA if sheet.str_id_at(index) != NO_STRING => {
            string_from_pool_ref(strings, sheet.str_id_at(index))
        }
        KIND_FORMULA => key_for_index(sheet, index)
            .and_then(|key| formula_error_at(sheet, key))
            .map(FormulaError::sentinel),
        _ => None,
    }
}

/// Distinct-value scan result for one column: parallel kind/number/text
/// arrays whose buffers are surrendered once through the `take*` accessors.
#[derive(Default)]
#[wasm_bindgen]
pub struct DistinctColumn {
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    texts: Vec<String>,
}

#[wasm_bindgen]
impl DistinctColumn {
    /// Surrenders the per-value kind tags (number/string/boolean codes); the
    /// column keeps an empty buffer afterwards.
    #[wasm_bindgen(js_name = takeKinds)]
    pub fn take_kinds(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.kinds)
    }

    /// Surrenders the numeric values aligned with the `takeKinds` tags.
    #[wasm_bindgen(js_name = takeNumbers)]
    pub fn take_numbers(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.numbers)
    }

    /// Surrenders the distinct strings aligned with the `takeKinds` tags.
    #[wasm_bindgen(js_name = takeTexts)]
    pub fn take_texts(&mut self) -> Vec<String> {
        std::mem::take(&mut self.texts)
    }
}

pub(crate) fn numeric_cell_value(sheet: &SheetData, index: usize) -> Option<f64> {
    match sheet.kind_at(index) {
        KIND_NUMBER => Some(sheet.num_at(index)),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            let entry = sheet.formulas.get(&key)?;
            if formula_error_at(sheet, key).is_none()
                && entry.value_kind == FormulaValueKind::Number
            {
                Some(sheet.num_at(index))
            } else {
                None
            }
        }
        _ => None,
    }
}

pub(crate) fn key_for_index(sheet: &SheetData, index: usize) -> Option<CellKey> {
    if sheet.row_count == 0 {
        return None;
    }
    let row = index % sheet.row_count;
    let col = index / sheet.row_count;
    cell_key(row, col)
}

/// Substring/whole-cell match. `needle` is already lowercased by callers when
/// `case_insensitive`.
///
/// The case-insensitive path is allocation-free for ASCII haystacks — the
/// overwhelmingly common case for sheet text and formatted numbers — folding
/// case byte-by-byte in place. It falls back to a heap `to_lowercase` only for
/// non-ASCII Unicode, where the lowercase mapping can change length and a byte
/// comparison would be unsound.
pub(crate) fn matches_needle(
    hay: &str,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    if !case_insensitive {
        return if whole_cell {
            hay == needle
        } else {
            hay.contains(needle)
        };
    }

    if hay.is_ascii() && needle.is_ascii() {
        let hay = hay.as_bytes();
        let needle = needle.as_bytes();
        return if whole_cell {
            hay.eq_ignore_ascii_case(needle)
        } else {
            ascii_contains_ignore_case(hay, needle)
        };
    }

    let lower = hay.to_lowercase();
    if whole_cell {
        lower == needle
    } else {
        lower.contains(needle)
    }
}

/// Case-insensitive ASCII substring test that never allocates. Anchors on the
/// first needle byte so most positions are rejected with a single comparison.
pub(crate) fn ascii_contains_ignore_case(hay: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if needle.len() > hay.len() {
        return false;
    }

    let first = needle[0].to_ascii_lowercase();
    let last_start = hay.len() - needle.len();
    (0..=last_start).any(|i| {
        hay[i].to_ascii_lowercase() == first
            && hay[i..i + needle.len()].eq_ignore_ascii_case(needle)
    })
}

/// Match a numeric cell's textual form against `needle` without the per-cell
/// `f64::to_string` heap allocation. An `f64`'s `Display` output fits the stack
/// buffer for every magnitude a sheet realistically holds; a pathological
/// exponent overflows it and falls back to an owned string so results stay
/// correct.
pub(crate) fn number_matches_text(
    value: f64,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    use std::fmt::Write as _;

    let mut buf = NumBuf::new();
    if write!(buf, "{value}").is_ok() {
        matches_needle(buf.as_str(), needle, case_insensitive, whole_cell)
    } else {
        matches_needle(&value.to_string(), needle, case_insensitive, whole_cell)
    }
}

/// Fixed stack buffer implementing [`std::fmt::Write`], used to format an `f64`
/// off the heap. Overflow (only very large magnitudes) reports an error so the
/// caller can fall back to an owned string.
pub(crate) struct NumBuf {
    buf: [u8; 32],
    len: usize,
}

impl NumBuf {
    pub(crate) fn new() -> Self {
        Self {
            buf: [0; 32],
            len: 0,
        }
    }

    pub(crate) fn as_str(&self) -> &str {
        // `write_str` only appends ASCII float text, so the bytes are valid UTF-8.
        std::str::from_utf8(&self.buf[..self.len]).unwrap_or("")
    }
}

impl std::fmt::Write for NumBuf {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        let bytes = s.as_bytes();
        let end = self.len + bytes.len();
        if end > self.buf.len() {
            return Err(std::fmt::Error);
        }
        self.buf[self.len..end].copy_from_slice(bytes);
        self.len = end;
        Ok(())
    }
}

/// Number of direct-mapped slots in [`MatchCache`]. A power of two so the slot
/// index is a mask; sized to stay L1-resident while covering the distinct-value
/// count of any realistic categorical column in one scan.
pub(crate) const MATCH_CACHE_SLOTS: usize = 1024;

/// Direct-mapped cache of string-pool match results for one scan.
///
/// Cells are dictionary-encoded (`str_id` into a shared pool), so a
/// low-cardinality column — the common filter target: status, category, city —
/// matches each *distinct* value once instead of once per row. The table is
/// fixed-size and L1-resident: high-cardinality columns simply keep missing and
/// fall through to a direct match, paying only a tag check, so it never
/// allocates per scan nor degrades a unique-valued column into an O(pool) table.
pub(crate) struct MatchCache {
    tag: [u32; MATCH_CACHE_SLOTS],
    hit: [bool; MATCH_CACHE_SLOTS],
}

impl MatchCache {
    pub(crate) fn new() -> Self {
        // `NO_STRING` (u32::MAX) is the empty sentinel: a real pool id never
        // reaches it, so an untouched slot never spuriously reports a hit.
        Self {
            tag: [NO_STRING; MATCH_CACHE_SLOTS],
            hit: [false; MATCH_CACHE_SLOTS],
        }
    }

    /// Match the interned string `id`, reusing a cached result when the slot
    /// still holds this id. `needle`/flags are constant for a given scan.
    pub(crate) fn matches(
        &mut self,
        strings: &StringPool,
        id: u32,
        needle: &str,
        case_insensitive: bool,
        whole_cell: bool,
    ) -> bool {
        let slot = (id as usize) & (MATCH_CACHE_SLOTS - 1);
        if self.tag[slot] == id {
            return self.hit[slot];
        }
        let matched = string_from_pool_ref(strings, id)
            .is_some_and(|text| matches_needle(text, needle, case_insensitive, whole_cell));
        self.tag[slot] = id;
        self.hit[slot] = matched;
        matched
    }
}

pub(crate) fn cell_matches_text(
    sheet: &SheetData,
    strings: &StringPool,
    index: usize,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
    cache: &mut MatchCache,
) -> bool {
    if let Some(value) = boolean_cell_value(sheet, index) {
        return matches_needle(boolean_text(value), needle, case_insensitive, whole_cell);
    }
    match sheet.kind_at(index) {
        KIND_NUMBER => {
            number_matches_text(sheet.num_at(index), needle, case_insensitive, whole_cell)
        }
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return false;
            };
            if let Some(error) = formula_error_at(sheet, key) {
                matches_needle(error.sentinel(), needle, case_insensitive, whole_cell)
            } else if sheet.str_id_at(index) != NO_STRING {
                cache.matches(
                    strings,
                    sheet.str_id_at(index),
                    needle,
                    case_insensitive,
                    whole_cell,
                )
            } else {
                number_matches_text(sheet.num_at(index), needle, case_insensitive, whole_cell)
            }
        }
        KIND_STRING => cache.matches(
            strings,
            sheet.str_id_at(index),
            needle,
            case_insensitive,
            whole_cell,
        ),
        _ => false,
    }
}

const MIN_RADIX_SORT_ROWS: usize = 4096;

type NumericSortPair = (u64, u32);

fn sort_finite_number_column_comparison(
    sheet: &SheetData,
    base: usize,
    ascending: bool,
) -> Option<Vec<u32>> {
    let mut order = Vec::with_capacity(sheet.row_count);
    for row in 0..sheet.row_count {
        let index = base + row;
        let value = if sheet.is_paged() {
            if sheet.kind_at(index) != KIND_NUMBER {
                return None;
            }
            sheet.num_at(index)
        } else {
            // SAFETY: caller supplied an in-bounds dense column.
            if unsafe { *sheet.kind.get_unchecked(index) } != KIND_NUMBER {
                return None;
            }
            f64::from_bits(unsafe { sheet.payload_unchecked(index) })
        };
        if !value.is_finite() {
            return None;
        }
        order.push(row as u32);
    }

    order.sort_unstable_by(|&a, &b| {
        // SAFETY: `order` holds only rows from `0..row_count`, and the scan
        // above proved every value in this column is a finite number.
        let va = sheet.num_at(base + a as usize);
        let vb = sheet.num_at(base + b as usize);
        let ord = va.partial_cmp(&vb).unwrap_or(Ordering::Equal);
        let ord = if ascending { ord } else { ord.reverse() };
        if ord == Ordering::Equal {
            a.cmp(&b)
        } else {
            ord
        }
    });
    Some(order)
}

fn sort_finite_number_column_radix(
    sheet: &SheetData,
    base: usize,
    ascending: bool,
) -> Option<Vec<u32>> {
    let mut pairs = Vec::with_capacity(sheet.row_count);
    for row in 0..sheet.row_count {
        let index = base + row;
        let value = if sheet.is_paged() {
            if sheet.kind_at(index) != KIND_NUMBER {
                return None;
            }
            sheet.num_at(index)
        } else {
            // SAFETY: caller supplied an in-bounds dense column.
            if unsafe { *sheet.kind.get_unchecked(index) } != KIND_NUMBER {
                return None;
            }
            f64::from_bits(unsafe { sheet.payload_unchecked(index) })
        };
        let key = finite_number_sort_key(value)?;
        pairs.push((if ascending { key } else { !key }, row as u32));
    }

    radix_sort_numeric_pairs(&mut pairs);
    Some(pairs.into_iter().map(|(_, row)| row).collect())
}

fn finite_number_sort_key(value: f64) -> Option<u64> {
    if !value.is_finite() {
        return None;
    }

    let normalized = if value == 0.0 { 0.0 } else { value };
    let bits = normalized.to_bits();
    const SIGN: u64 = 1 << 63;
    Some(if bits & SIGN == 0 { bits ^ SIGN } else { !bits })
}

fn radix_sort_numeric_pairs(pairs: &mut [NumericSortPair]) {
    const BUCKETS: usize = 256;
    const PASSES: usize = 8;
    let n = pairs.len();
    if n <= 1 {
        return;
    }

    // One read pass builds all eight histograms, so skippable passes are known
    // up front and keys are scanned once instead of once per pass.
    let mut counts = [[0usize; BUCKETS]; PASSES];
    for &(key, _) in pairs.iter() {
        for (pass, histogram) in counts.iter_mut().enumerate() {
            histogram[((key >> (pass * 8)) & 0xff) as usize] += 1;
        }
    }

    let mut scratch = vec![(0, 0); n];
    let mut src_is_pairs = true;

    for (pass, histogram) in counts.iter().enumerate() {
        // Every key shares this byte (sheet data is rarely full-range f64:
        // money/ids/dates leave most high bytes constant) — nothing to move.
        if histogram.iter().any(|&count| count == n) {
            continue;
        }

        let mut offsets = [0usize; BUCKETS];
        let mut running = 0usize;
        for (offset, &count) in offsets.iter_mut().zip(histogram.iter()) {
            *offset = running;
            running += count;
        }

        // Ping-pong between the two buffers instead of copying back per pass.
        let (src, dst): (&[NumericSortPair], &mut [NumericSortPair]) = if src_is_pairs {
            (&*pairs, &mut scratch)
        } else {
            (&scratch, pairs)
        };
        let shift = pass * 8;
        for &pair in src {
            let bucket = ((pair.0 >> shift) & 0xff) as usize;
            dst[offsets[bucket]] = pair;
            offsets[bucket] += 1;
        }
        src_is_pairs = !src_is_pairs;
    }

    if !src_is_pairs {
        pairs.copy_from_slice(&scratch);
    }
}

fn edge_scan(mut pos: usize, limit: usize, step: isize, occupied: impl Fn(usize) -> bool) -> usize {
    if limit == 0 || step == 0 {
        return pos.min(limit.saturating_sub(1));
    }
    let last = limit - 1;
    let next = pos as isize + step;
    if next < 0 || next as usize > last {
        return if step < 0 { 0 } else { last };
    }
    let next = next as usize;
    if occupied(pos) && occupied(next) {
        pos = next;
        loop {
            let ahead = pos as isize + step;
            if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                return pos;
            }
            pos = ahead as usize;
        }
    }
    let mut candidate = next as isize;
    while candidate >= 0 && candidate as usize <= last {
        if occupied(candidate as usize) {
            return candidate as usize;
        }
        candidate += step;
    }
    if step < 0 {
        0
    } else {
        last
    }
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum ComparableCell<'a> {
    Number(OrderedNumber),
    Bool(bool),
    Text(&'a str),
    Empty,
}

impl<'a> ComparableCell<'a> {
    pub(crate) fn from_cell(sheet: &'a SheetData, strings: &'a StringPool, index: usize) -> Self {
        match sheet.kind_at(index) {
            KIND_NUMBER => ComparableCell::Number(OrderedNumber(sheet.num_at(index))),
            KIND_BOOL => ComparableCell::Bool(sheet.num_at(index) != 0.0),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    ComparableCell::Text(error.sentinel())
                } else if sheet
                    .formulas
                    .get(&key)
                    .is_some_and(|entry| entry.value_kind == FormulaValueKind::Bool)
                {
                    ComparableCell::Bool(sheet.num_at(index) != 0.0)
                } else if let Some(text) = string_from_pool_ref(strings, sheet.str_id_at(index)) {
                    ComparableCell::Text(text)
                } else {
                    ComparableCell::Number(OrderedNumber(sheet.num_at(index)))
                }
            }
            KIND_STRING => string_from_pool_ref(strings, sheet.str_id_at(index))
                .map_or(ComparableCell::Empty, ComparableCell::Text),
            _ => ComparableCell::Empty,
        }
    }

    pub(crate) unsafe fn from_cell_unchecked(
        sheet: &'a SheetData,
        strings: &'a StringPool,
        index: usize,
    ) -> Self {
        // SAFETY: caller guarantees `index` is a valid cell-vector index.
        let stored_kind = unsafe { *sheet.kind.get_unchecked(index) };
        match stored_kind {
            // SAFETY: caller guarantees `index` is valid for all cell vectors;
            // NUMBER and BOOL payloads are canonical f64 bits.
            KIND_NUMBER => ComparableCell::Number(OrderedNumber(f64::from_bits(unsafe {
                sheet.payload_unchecked(index)
            }))),
            KIND_BOOL => {
                ComparableCell::Bool(payload_num(unsafe { sheet.payload_unchecked(index) }) != 0.0)
            }
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    ComparableCell::Text(error.sentinel())
                } else {
                    // SAFETY: caller guarantees `index` is valid for all cell vectors.
                    let bits = unsafe { sheet.payload_unchecked(index) };
                    if sheet
                        .formulas
                        .get(&key)
                        .is_some_and(|entry| entry.value_kind == FormulaValueKind::Bool)
                    {
                        ComparableCell::Bool(payload_num(bits) != 0.0)
                    } else if let Some(text) = string_from_pool_ref(strings, payload_str_id(bits)) {
                        ComparableCell::Text(text)
                    } else {
                        ComparableCell::Number(OrderedNumber(payload_num(bits)))
                    }
                }
            }
            KIND_STRING => {
                // SAFETY: caller guarantees `index` is valid for all cell vectors.
                let bits = unsafe { sheet.payload_unchecked(index) };
                string_from_pool_ref(strings, payload_str_id(bits))
                    .map_or(ComparableCell::Empty, ComparableCell::Text)
            }
            _ => ComparableCell::Empty,
        }
    }
}

impl Ord for ComparableCell<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (ComparableCell::Empty, ComparableCell::Empty) => Ordering::Equal,
            (ComparableCell::Empty, _) => Ordering::Greater,
            (_, ComparableCell::Empty) => Ordering::Less,
            (ComparableCell::Number(a), ComparableCell::Number(b)) => a.cmp(b),
            (ComparableCell::Text(a), ComparableCell::Text(b)) => a.cmp(b),
            (ComparableCell::Bool(a), ComparableCell::Bool(b)) => a.cmp(b),
            (ComparableCell::Number(_), _) => Ordering::Less,
            (_, ComparableCell::Number(_)) => Ordering::Greater,
            (ComparableCell::Text(_), ComparableCell::Bool(_)) => Ordering::Less,
            (ComparableCell::Bool(_), ComparableCell::Text(_)) => Ordering::Greater,
        }
    }
}

impl PartialOrd for ComparableCell<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct OrderedNumber(f64);

impl Eq for OrderedNumber {}

impl Ord for OrderedNumber {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for OrderedNumber {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
