//! Financial function family dispatch.

use crate::calc::Func;
use crate::types::EvalResult;

use super::functions::FuncAccumulator;

pub(super) fn apply(_func: Func, _values: &FuncAccumulator) -> Option<EvalResult> {
    None
}
