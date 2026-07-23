//! Formula dependency indexes, affected-set growth, and depth/cycle checks.

use std::collections::{HashMap, HashSet, VecDeque};

use crate::memory::MemoryOwnerStats;
use crate::sheet::SheetData;
use crate::types::{
    AbsCellKey, CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT,
};

use super::array::ast_produces_array;

pub(crate) struct DepIndex {
    exact_dependents: HashMap<AbsCellKey, Vec<AbsCellKey>>,
    range_groups: Vec<RangeGroup>,
    range_sheets: Vec<RangeSheetIndex>,
    pub(super) epoch: u64,
    pub(super) has_dynamic_arrays: bool,
    has_formula_dependencies: bool,
}

impl DepIndex {
    fn collect_matching_range_groups(
        &self,
        cell: AbsCellKey,
        matches: &mut Vec<usize>,
        row_matches: &mut Vec<usize>,
        marks: &mut [u32],
        stamp: &mut u32,
    ) {
        matches.clear();
        row_matches.clear();

        let Some(sheet) = self.range_sheets.get(cell.sheet as usize) else {
            return;
        };

        collect_interval_matches(&sheet.col_intervals, cell.col, matches);
        if matches.is_empty() {
            return;
        }

        collect_interval_matches(&sheet.row_intervals, cell.row, row_matches);
        if row_matches.is_empty() {
            matches.clear();
            return;
        }

        let current = next_match_stamp(marks, stamp);
        if matches.len() <= row_matches.len() {
            for &group in matches.iter() {
                marks[group] = current;
            }
            matches.clear();
            for &group in row_matches.iter() {
                if marks[group] == current {
                    matches.push(group);
                }
            }
        } else {
            for &group in row_matches.iter() {
                marks[group] = current;
            }
            matches.retain(|group| marks[*group] == current);
        }
    }

    pub(crate) fn memory_stats(&self) -> (MemoryOwnerStats, MemoryOwnerStats) {
        let mut nodes = MemoryOwnerStats::default();
        let mut edges = MemoryOwnerStats::default();
        nodes.add_hash_table::<AbsCellKey, Vec<AbsCellKey>>(
            self.exact_dependents.len(),
            self.exact_dependents.capacity(),
        );
        for dependents in self.exact_dependents.values() {
            edges.add_vec::<AbsCellKey>(dependents.len(), dependents.capacity());
        }

        nodes.add_vec::<RangeGroup>(self.range_groups.len(), self.range_groups.capacity());
        for group in &self.range_groups {
            edges.add_vec::<AbsCellKey>(group.dependents.len(), group.dependents.capacity());
        }
        nodes.add_vec::<RangeSheetIndex>(self.range_sheets.len(), self.range_sheets.capacity());
        for sheet in &self.range_sheets {
            nodes.add_vec::<RangeInterval>(
                sheet.row_intervals.len(),
                sheet.row_intervals.capacity(),
            );
            nodes.add_vec::<RangeInterval>(
                sheet.col_intervals.len(),
                sheet.col_intervals.capacity(),
            );
        }
        (nodes, edges)
    }
}

struct RangeGroup {
    range: CellRange,
    dependents: Vec<AbsCellKey>,
}

#[derive(Default)]
struct RangeSheetIndex {
    row_intervals: Vec<RangeInterval>,
    col_intervals: Vec<RangeInterval>,
}

impl RangeSheetIndex {
    fn finish(&mut self) {
        prepare_interval_index(&mut self.row_intervals);
        prepare_interval_index(&mut self.col_intervals);
    }
}

#[derive(Clone, Copy)]
struct RangeInterval {
    start: u32,
    end: u32,
    group: usize,
    max_end: u32,
}

impl RangeInterval {
    fn new(start: u32, end: u32, group: usize) -> Self {
        Self {
            start,
            end,
            group,
            max_end: end,
        }
    }
}

pub(super) fn build_dep_index(sheets: &[SheetData], epoch: u64) -> DepIndex {
    let mut exact_dependents: HashMap<AbsCellKey, Vec<AbsCellKey>> = HashMap::new();
    let mut range_dependents: HashMap<CellRange, Vec<AbsCellKey>> = HashMap::new();
    let mut has_dynamic_arrays = false;
    let formula_cells: HashSet<AbsCellKey> = sheets
        .iter()
        .enumerate()
        .flat_map(|(sheet, data)| {
            data.formulas
                .keys()
                .map(move |&cell| AbsCellKey::from_local(sheet, cell))
        })
        .collect();
    let mut has_formula_dependencies = false;

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        for (&formula_cell, entry) in &sheet.formulas {
            has_dynamic_arrays |= entry.ast.as_ref().is_some_and(ast_produces_array);
            let formula_abs = AbsCellKey::from_local(sheet_index, formula_cell);
            for &cell in &entry.reads.cells {
                exact_dependents.entry(cell).or_default().push(formula_abs);
            }
            for &range in &entry.reads.ranges {
                range_dependents.entry(range).or_default().push(formula_abs);
            }
            has_formula_dependencies |= entry
                .reads
                .cells
                .iter()
                .any(|cell| formula_cells.contains(cell));
            has_formula_dependencies |= !entry.reads.ranges.is_empty();
        }
    }

    let mut range_groups = Vec::with_capacity(range_dependents.len());
    let mut range_sheets: Vec<RangeSheetIndex> = (0..sheets.len())
        .map(|_| RangeSheetIndex::default())
        .collect();
    for (range, dependents) in range_dependents {
        let group = range_groups.len();
        range_groups.push(RangeGroup { range, dependents });
        if let Some(sheet) = range_sheets.get_mut(range.sheet as usize) {
            sheet
                .row_intervals
                .push(RangeInterval::new(range.row_start, range.row_end, group));
            sheet
                .col_intervals
                .push(RangeInterval::new(range.col_start, range.col_end, group));
        }
    }
    for sheet in &mut range_sheets {
        sheet.finish();
    }

    DepIndex {
        exact_dependents,
        range_groups,
        range_sheets,
        epoch,
        has_dynamic_arrays,
        has_formula_dependencies,
    }
}

fn prepare_interval_index(intervals: &mut [RangeInterval]) {
    intervals.sort_unstable_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| a.end.cmp(&b.end))
            .then_with(|| a.group.cmp(&b.group))
    });
    let mut max_end = 0;
    for interval in intervals {
        max_end = max_end.max(interval.end);
        interval.max_end = max_end;
    }
}

fn collect_interval_matches(intervals: &[RangeInterval], point: u32, out: &mut Vec<usize>) {
    out.clear();
    let mut cursor = intervals.partition_point(|interval| interval.start <= point);
    while cursor > 0 {
        cursor -= 1;
        let interval = intervals[cursor];
        if interval.max_end < point {
            break;
        }
        if interval.end >= point {
            out.push(interval.group);
        }
    }
}

fn next_match_stamp(marks: &mut [u32], stamp: &mut u32) -> u32 {
    if *stamp == u32::MAX {
        marks.fill(0);
        *stamp = 1;
    }
    let current = *stamp;
    *stamp += 1;
    current
}

pub(super) fn collect_affected_formulas(
    sheets: &[SheetData],
    seed_sheet: usize,
    index: &DepIndex,
) -> HashSet<AbsCellKey> {
    let mut affected: HashSet<AbsCellKey> = HashSet::new();
    let mut queue: VecDeque<AbsCellKey> = VecDeque::new();
    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    if let Some(sheet) = sheets.get(seed_sheet) {
        for &cell in &sheet.dirty_cells {
            let abs = AbsCellKey::from_local(seed_sheet, cell);
            if formula_exists(sheets, abs) {
                affected.insert(abs);
            }
            queue.push_back(abs);
        }
        if sheet.all_dirty {
            // A bulk load or structural rewrite touched (potentially) every
            // cell on this sheet. Seed every formula on the sheet plus every
            // formula registered as reading any of its cells or ranges; the
            // BFS below grows transitive dependents as usual. This is bounded
            // by formula/read-set counts, never by row count.
            let seed = seed_sheet as u32;
            for &cell in sheet.formulas.keys() {
                let abs = AbsCellKey::from_local(seed_sheet, cell);
                if affected.insert(abs) {
                    queue.push_back(abs);
                }
            }
            for (&cell, dependents) in &index.exact_dependents {
                if cell.sheet != seed {
                    continue;
                }
                for &dependent in dependents {
                    if affected.insert(dependent) {
                        queue.push_back(dependent);
                    }
                }
            }
            for group in &index.range_groups {
                if group.range.sheet != seed {
                    continue;
                }
                for &dependent in &group.dependents {
                    if affected.insert(dependent) {
                        queue.push_back(dependent);
                    }
                }
            }
        }
    }

    while let Some(cell) = queue.pop_front() {
        if formula_exists(sheets, cell) {
            affected.insert(cell);
        }

        if let Some(dependents) = index.exact_dependents.get(&cell) {
            for &dependent in dependents {
                if affected.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }

        index.collect_matching_range_groups(
            cell,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            let range_group = &index.range_groups[group];
            debug_assert!(range_group.range.contains(cell));
            for &dependent in &range_group.dependents {
                if affected.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }
    }

    affected
}

fn formula_exists(sheets: &[SheetData], key: AbsCellKey) -> bool {
    sheets
        .get(key.sheet as usize)
        .is_some_and(|sheet| sheet.formulas.contains_key(&key.local()))
}

pub(super) fn seed_dependency_depth_errors(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
    index: &DepIndex,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
) {
    if !index.has_formula_dependencies {
        return;
    }
    let dependencies = collect_formula_dependencies(sheets, affected, index);
    let mut depth_memo: HashMap<AbsCellKey, Result<usize, FormulaError>> =
        HashMap::with_capacity(affected.len());
    let mut visiting: HashSet<AbsCellKey> = HashSet::new();

    for &key in affected {
        if let Err(error) =
            formula_dependency_depth(key, &dependencies, &mut depth_memo, &mut visiting)
        {
            memo.insert(key, Value::Error(error));
        }
    }
}

const LINEAR_DEPENDENCY_DEDUP_LIMIT: usize = 8;

fn collect_formula_dependencies(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
    index: &DepIndex,
) -> HashMap<AbsCellKey, Vec<AbsCellKey>> {
    let formula_cells: Vec<AbsCellKey> = affected
        .iter()
        .copied()
        .filter(|key| formula_exists(sheets, *key))
        .collect();
    let formula_set: HashSet<AbsCellKey> = formula_cells.iter().copied().collect();
    let mut dependencies: HashMap<AbsCellKey, Vec<AbsCellKey>> =
        HashMap::with_capacity(formula_cells.len());
    let mut seen_dependencies: HashMap<AbsCellKey, HashSet<AbsCellKey>> = HashMap::new();

    for &formula_cell in &formula_cells {
        dependencies.entry(formula_cell).or_default();
    }

    for &formula_cell in &formula_cells {
        let Some(entry) = sheets
            .get(formula_cell.sheet as usize)
            .and_then(|sheet| sheet.formulas.get(&formula_cell.local()))
        else {
            continue;
        };

        for &cell in &entry.reads.cells {
            if formula_set.contains(&cell) {
                push_unique_dependency(
                    &mut dependencies,
                    &mut seen_dependencies,
                    formula_cell,
                    cell,
                );
            }
        }
    }

    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    for &dependency in &formula_cells {
        index.collect_matching_range_groups(
            dependency,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            let range_group = &index.range_groups[group];
            debug_assert!(range_group.range.contains(dependency));
            for &dependent in &range_group.dependents {
                if formula_set.contains(&dependent) {
                    push_unique_dependency(
                        &mut dependencies,
                        &mut seen_dependencies,
                        dependent,
                        dependency,
                    );
                }
            }
        }
    }

    dependencies
}

fn push_unique_dependency(
    dependencies: &mut HashMap<AbsCellKey, Vec<AbsCellKey>>,
    seen_dependencies: &mut HashMap<AbsCellKey, HashSet<AbsCellKey>>,
    formula_cell: AbsCellKey,
    dependency: AbsCellKey,
) {
    let formula_dependencies = dependencies.entry(formula_cell).or_default();
    if let Some(seen) = seen_dependencies.get_mut(&formula_cell) {
        if seen.insert(dependency) {
            formula_dependencies.push(dependency);
        }
        return;
    }
    if formula_dependencies.contains(&dependency) {
        return;
    }
    if formula_dependencies.len() < LINEAR_DEPENDENCY_DEDUP_LIMIT {
        formula_dependencies.push(dependency);
        return;
    }

    let mut seen = HashSet::with_capacity(formula_dependencies.len() + 1);
    seen.extend(formula_dependencies.iter().copied());
    let inserted = seen.insert(dependency);
    seen_dependencies.insert(formula_cell, seen);
    if inserted {
        formula_dependencies.push(dependency);
    }
}

fn formula_dependency_depth(
    key: AbsCellKey,
    dependencies: &HashMap<AbsCellKey, Vec<AbsCellKey>>,
    depth_memo: &mut HashMap<AbsCellKey, Result<usize, FormulaError>>,
    visiting: &mut HashSet<AbsCellKey>,
) -> Result<usize, FormulaError> {
    if let Some(result) = depth_memo.get(&key) {
        return *result;
    }
    if !visiting.insert(key) {
        let result = Err(FormulaError::Cycle);
        depth_memo.insert(key, result);
        return result;
    }

    let mut max_dependency_depth = 0;
    let mut result = Ok(1);
    if let Some(deps) = dependencies.get(&key) {
        for &dependency in deps {
            match formula_dependency_depth(dependency, dependencies, depth_memo, visiting) {
                Ok(depth) => max_dependency_depth = max_dependency_depth.max(depth),
                Err(error) => {
                    result = Err(error);
                    break;
                }
            }
        }
    }

    if result.is_ok() {
        let depth = max_dependency_depth + 1;
        result = if depth > FORMULA_RECURSION_LIMIT {
            Err(FormulaError::Num)
        } else {
            Ok(depth)
        };
    }

    visiting.remove(&key);
    depth_memo.insert(key, result);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::CellStore;

    #[test]
    fn dependency_index_is_authoritative_for_direct_and_nested_array_producers() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 32);
        store.set_formula(sheet, 0, 0, "=SUM(B1:B2)", 0);
        let scalar_index = build_dep_index(&store.sheets, store.formula_epoch);
        assert!(!scalar_index.has_dynamic_arrays);
        assert!(store.set_named_range("Rows", -1, sheet, 0, 1, 1, 1));

        for (row, source) in [
            "=B1:B2",
            "=$B$1:$B$2",
            "=Rows",
            "=FILTER(B1:B2,B1:B2)",
            "=SORT(B1:B2)",
            "=UNIQUE(B1:B2)",
            "=SEQUENCE(2)",
            "=TRANSPOSE(B1:B2)",
            "=TAKE(B1:B2,1)",
            "=DROP(B1:B2,1)",
            "=CHOOSECOLS(B1:C2,1)",
            "=CHOOSEROWS(B1:B2,1)",

            "=LET(x,B1:B2,x)",
            "=CHOOSE(1,B1:B2,SEQUENCE(2))",
            "=LET(x,CHOOSE(1,SEQUENCE(2),B1:B2),x)",
        ]
        .into_iter()
        .enumerate()
        {
            store.set_formula(sheet, row + 1, 0, source, 0);
            assert_ne!(scalar_index.epoch, store.formula_epoch);
            let index = build_dep_index(&store.sheets, store.formula_epoch);
            assert!(index.has_dynamic_arrays, "missed array producer {source}");
        }
    }

    #[test]
    fn dependency_collection_deduplicates_repeated_overlapping_and_high_degree_edges() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 32);
        for row in 0..16 {
            store.set_formula(sheet, row, 1, "=1", 0);
        }
        store.set_formula(
            sheet,
            0,
            0,
            "=B1+B1+SUM(B1:B16)+SUM(B1:B2)+SUM(B8:B16)",
            0,
        );
        let dependent = AbsCellKey::new(sheet, 0, 0);
        let mut affected: HashSet<_> = (0..16)
            .map(|row| AbsCellKey::new(sheet, row, 1))
            .collect();
        affected.insert(dependent);

        let index = build_dep_index(&store.sheets, store.formula_epoch);
        let dependencies = collect_formula_dependencies(&store.sheets, &affected, &index);
        let collected = dependencies.get(&dependent).expect("dependent formula");
        assert_eq!(collected.len(), 16);
        let unique: HashSet<_> = collected.iter().copied().collect();
        assert_eq!(unique.len(), collected.len());
        for row in 0..16 {
            assert!(unique.contains(&AbsCellKey::new(sheet, row, 1)));
        }
    }

    #[test]
    fn duplicate_direct_and_range_edges_preserve_cycle_error_propagation() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_formula(sheet, 0, 0, "=B1+B1+SUM(B1:B1)", 0);
        store.set_formula(sheet, 0, 1, "=A1+SUM(A1:A1)", 0);
        let left = AbsCellKey::new(sheet, 0, 0);
        let right = AbsCellKey::new(sheet, 0, 1);
        let affected = HashSet::from([left, right]);
        let index = build_dep_index(&store.sheets, store.formula_epoch);
        let dependencies = collect_formula_dependencies(&store.sheets, &affected, &index);
        assert_eq!(dependencies.get(&left), Some(&vec![right]));
        assert_eq!(dependencies.get(&right), Some(&vec![left]));

        let mut memo = HashMap::new();
        seed_dependency_depth_errors(&store.sheets, &affected, &index, &mut memo);
        assert!(matches!(
            memo.get(&left),
            Some(Value::Error(FormulaError::Cycle))
        ));
        assert!(matches!(
            memo.get(&right),
            Some(Value::Error(FormulaError::Cycle))
        ));
    }
}
