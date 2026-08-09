//! Columnar cell store for Sheetwrite, resident in WASM linear memory.
//!
//! Layout decisions:
//! - Values are stored **column-major** (each column is a contiguous run) so
//!   whole-column scans (sort/filter/aggregate) stay cache-local.
//! - A cell value is a tagged scalar: empty, number (`f64`), interned string,
//!   or formula. Strings are dictionary-encoded in a per-store pool so repeated
//!   text costs one `u32` per cell, not a heap allocation.
//! - Styles are *not* held here as objects; the host owns the small style
//!   dictionary and the store keeps only a `u32` style id per cell. That keeps
//!   the large per-cell array in linear memory and the tiny dictionary in JS.
//! - The render loop never reads a single cell across the boundary: it asks for
//!   a whole visible window in one call (`get_window`) and receives one packed
//!   fixed-width payload plus the window's unique strings.

#[cfg(not(feature = "formula-engine"))]
compile_error!(
    "SHEETWRITE_STORE_ONLY_BLOCKED: formula-entry-ast,dependency-index; \
     the store-only boundary must replace FormulaEntry::ast and CellStore::dep_index"
);

#[cfg(feature = "formula-engine")]
mod calc;
#[cfg(feature = "formula-engine")]
mod eval;
#[cfg(feature = "formula-engine")]
mod memory;
#[cfg(feature = "formula-engine")]
mod query;
#[cfg(feature = "formula-engine")]
mod sheet;
#[cfg(feature = "formula-engine")]
mod store;
#[cfg(feature = "formula-engine")]
mod types;
#[cfg(feature = "formula-engine")]
mod window;

#[cfg(all(test, feature = "formula-engine"))]
mod tests;

#[cfg(feature = "formula-engine")]
pub use store::{CellOut, CellStore};
#[cfg(feature = "formula-engine")]
pub use window::WindowView;

// Test-only preludes: `tests.rs` reaches the whole crate through `use super::*`.
#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use calc::parse;
#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use query::*;
#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use sheet::*;
#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use types::*;
