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
//!   a whole visible window in one call (`get_window`) and receives contiguous
//!   typed arrays plus the window's unique strings.

mod calc;
mod eval;
mod query;
mod sheet;
mod store;
mod types;
mod window;

#[cfg(test)]
mod tests;

pub use store::{CellOut, CellStore};
pub use window::WindowView;

// Test-only preludes: `tests.rs` reaches the whole crate through `use super::*`.
#[cfg(test)]
pub(crate) use calc::parse;
#[cfg(test)]
pub(crate) use query::*;
#[cfg(test)]
pub(crate) use sheet::*;
#[cfg(test)]
pub(crate) use types::*;
