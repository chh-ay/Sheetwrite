//! Arithmetic formula parser for the optional calc tier (M5).
//!
//! Grammar (A1 references with optional sheet qualifiers):
//!   expr   := additive (comparison additive)?
//!   additive := term (('+' | '-') term)*
//!   term   := factor (('*' | '/') factor)*
//!   factor := '-' factor | primary
//!   primary:= number | '(' expr ')' | func '(' args ')' | range | cell
//!   cell   := A1 | Sheet!A1 | 'Sheet Name'!A1
//!   range  := cell ':' cell
//!
//! Cell references accept optional absolute markers (`$A$1`, `A$1`, `$A1`).
//! Sheet-qualified references keep the sheet name until `CellStore` resolves it
//! to a sheet handle at formula-ingest time.
//!
//! The evaluator lives on `CellStore` (it needs cell access); this module is the
//! pure parse layer plus reference shifting for row/column insert/delete rewriting.

const PARSE_RECURSION_LIMIT: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Op {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Func {
    Sum,
    Avg,
    Min,
    Max,
    Count,
    If,
    Abs,
    Round,
    Sqrt,
    Mod,
    Pow,
    And,
    Or,
    Not,
    Floor,
    Ceiling,
    Int,
    Trunc,
    Sign,
    Pi,
    IfError,
    CountA,
    Len,
    Left,
    Right,
    Mid,
    Concat,
    Concatenate,
    Upper,
    Lower,
    Trim,
    Text,
    Exact,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CmpOp {
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RefFlags {
    pub row_abs: bool,
    pub col_abs: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SheetRef {
    pub handle: u32,
    pub name: String,
    pub quoted: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnresolvedSheetRef {
    pub name: String,
    pub quoted: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RangeFlags {
    pub start: RefFlags,
    pub end: RefFlags,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Ast {
    Num(f64),
    Str(String),
    Bool(bool),
    Cell(u32, u32, RefFlags),
    SheetCell(UnresolvedSheetRef, u32, u32, RefFlags),
    AbsCell(SheetRef, u32, u32, RefFlags),
    Range(u32, u32, u32, u32, RangeFlags),
    SheetRange(UnresolvedSheetRef, u32, u32, u32, u32, RangeFlags),
    AbsRange(SheetRef, u32, u32, u32, u32, RangeFlags),
    InvalidRef,
    Func(Func, Vec<Ast>),
    Bin(Op, Box<Ast>, Box<Ast>),
    Cmp(CmpOp, Box<Ast>, Box<Ast>),
    Neg(Box<Ast>),
}

/// Parse column letters (A, B, ..., Z, AA, ...) to a 0-based column index.
fn parse_col(letters: &str) -> Option<u32> {
    if letters.is_empty() {
        return None;
    }

    let mut col: u32 = 0;
    for ch in letters.chars() {
        if !ch.is_ascii_alphabetic() {
            return None;
        }
        col = col
            .checked_mul(26)?
            .checked_add((ch.to_ascii_uppercase() as u32) - ('A' as u32) + 1)?;
    }
    Some(col - 1)
}

/// Parse an A1 token like `B12` or `$B$12`, preserving absolute markers.
fn parse_a1(token: &str) -> Option<(u32, u32, RefFlags)> {
    let col_abs = token.starts_with('$');
    let token = token.strip_prefix('$').unwrap_or(token);

    let mut letters_end = 0;
    for (idx, ch) in token.char_indices() {
        if !ch.is_ascii_alphabetic() {
            break;
        }
        letters_end = idx + ch.len_utf8();
    }

    if letters_end == 0 {
        return None;
    }

    let letters = &token[..letters_end];
    let row_token = &token[letters_end..];
    let row_abs = row_token.starts_with('$');
    let digits = row_token.strip_prefix('$').unwrap_or(row_token);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let col = parse_col(letters)?;
    let row: u32 = digits.parse().ok()?;
    if row == 0 {
        return None;
    }
    Some((row - 1, col, RefFlags { row_abs, col_abs }))
}

fn normalize_range(
    row: u32,
    col: u32,
    flags: RefFlags,
    end_row: u32,
    end_col: u32,
    end_flags: RefFlags,
) -> (u32, u32, u32, u32, RangeFlags) {
    let start_flags = RefFlags {
        row_abs: if row <= end_row {
            flags.row_abs
        } else {
            end_flags.row_abs
        },
        col_abs: if col <= end_col {
            flags.col_abs
        } else {
            end_flags.col_abs
        },
    };
    let normalized_end_flags = RefFlags {
        row_abs: if row <= end_row {
            end_flags.row_abs
        } else {
            flags.row_abs
        },
        col_abs: if col <= end_col {
            end_flags.col_abs
        } else {
            flags.col_abs
        },
    };
    (
        row.min(end_row),
        col.min(end_col),
        row.max(end_row),
        col.max(end_col),
        RangeFlags {
            start: start_flags,
            end: normalized_end_flags,
        },
    )
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Str(String),
    Ident(String, bool),
    Op(char),
    LParen,
    RParen,
    Comma,
    Colon,
    Bang,
    Cmp(CmpOp),
    InvalidRef,
}

fn tokenize(src: &str) -> Result<Vec<Tok>, String> {
    let mut toks = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c == '"' {
            i += 1;
            let mut value = String::new();
            loop {
                let Some(&ch) = chars.get(i) else {
                    return Err("unterminated string literal".into());
                };
                if ch == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        value.push('"');
                        i += 2;
                    } else {
                        i += 1;
                        break;
                    }
                } else {
                    value.push(ch);
                    i += 1;
                }
            }
            toks.push(Tok::Str(value));
        } else if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let s: String = chars[start..i].iter().collect();
            toks.push(Tok::Num(s.parse().map_err(|_| format!("bad number: {s}"))?));
        } else if c == '\'' {
            i += 1;
            let mut value = String::new();
            loop {
                let Some(&ch) = chars.get(i) else {
                    return Err("unterminated sheet name".into());
                };
                if ch == '\'' {
                    if chars.get(i + 1) == Some(&'\'') {
                        value.push('\'');
                        i += 2;
                    } else {
                        i += 1;
                        break;
                    }
                } else {
                    value.push(ch);
                    i += 1;
                }
            }
            toks.push(Tok::Ident(value, true));
        } else if chars[i..].starts_with(&['#', 'R', 'E', 'F', '!']) {
            toks.push(Tok::InvalidRef);
            i += 5;
        } else if c == '$' || c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '$') {
                i += 1;
            }
            toks.push(Tok::Ident(chars[start..i].iter().collect(), false));
        } else if c == '!' {
            toks.push(Tok::Bang);
            i += 1;
        } else if c == '<' || c == '>' || c == '=' {
            let next = chars.get(i + 1).copied();
            let (op, len) = match (c, next) {
                ('<', Some('=')) => (CmpOp::Le, 2),
                ('>', Some('=')) => (CmpOp::Ge, 2),
                ('<', Some('>')) => (CmpOp::Ne, 2),
                ('=', _) => (CmpOp::Eq, 1),
                ('<', _) => (CmpOp::Lt, 1),
                _ => (CmpOp::Gt, 1),
            };
            toks.push(Tok::Cmp(op));
            i += len;
        } else {
            match c {
                '+' | '-' | '*' | '/' => toks.push(Tok::Op(c)),
                '(' => toks.push(Tok::LParen),
                ')' => toks.push(Tok::RParen),
                ',' => toks.push(Tok::Comma),
                ':' => toks.push(Tok::Colon),
                _ => return Err(format!("unexpected char: {c}")),
            }
            i += 1;
        }
    }

    Ok(toks)
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn next(&mut self) -> Option<Tok> {
        if self.pos >= self.toks.len() {
            return None;
        }
        let token = self.toks[self.pos].clone();
        self.pos += 1;
        Some(token)
    }

    fn guard_depth(depth: usize) -> Result<(), String> {
        if depth > PARSE_RECURSION_LIMIT {
            Err("formula nesting is too deep".into())
        } else {
            Ok(())
        }
    }

    fn expr(&mut self) -> Result<Ast, String> {
        self.expr_at(0)
    }

    fn expr_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let left = self.additive_at(depth)?;
        if let Some(Tok::Cmp(op)) = self.peek() {
            let op = *op;
            self.pos += 1;
            let right = self.additive_at(depth)?;
            return Ok(Ast::Cmp(op, Box::new(left), Box::new(right)));
        }
        Ok(left)
    }

    fn additive_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.term_at(depth)?;
        while let Some(Tok::Op(c @ ('+' | '-'))) = self.peek() {
            let op = if *c == '+' { Op::Add } else { Op::Sub };
            self.pos += 1;
            let right = self.term_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn term_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.factor_at(depth)?;
        while let Some(Tok::Op(c @ ('*' | '/'))) = self.peek() {
            let op = if *c == '*' { Op::Mul } else { Op::Div };
            self.pos += 1;
            let right = self.factor_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn factor_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Op('-')) = self.peek() {
            self.pos += 1;
            return Ok(Ast::Neg(Box::new(self.factor_at(depth + 1)?)));
        }
        self.primary_at(depth)
    }

    fn primary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        match self.next() {
            Some(Tok::Num(n)) => Ok(Ast::Num(n)),
            Some(Tok::Str(value)) => Ok(Ast::Str(value)),
            Some(Tok::LParen) => {
                let e = self.expr_at(depth + 1)?;
                match self.next() {
                    Some(Tok::RParen) => Ok(e),
                    _ => Err("expected )".into()),
                }
            }
            Some(Tok::Ident(name, quoted)) => self.ident_at(name, quoted, depth),
            Some(Tok::InvalidRef) => Ok(Ast::InvalidRef),
            other => Err(if other.is_some() {
                "unexpected token".into()
            } else {
                "unexpected end".into()
            }),
        }
    }

    fn ident_at(&mut self, name: String, quoted: bool, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Bang) = self.peek() {
            self.pos += 1;
            return self.sheet_ref_at(name, quoted);
        }

        if let Some(Tok::LParen) = self.peek() {
            self.pos += 1;
            let func = match name.to_ascii_uppercase().as_str() {
                "SUM" => Func::Sum,
                "AVG" | "AVERAGE" => Func::Avg,
                "MIN" => Func::Min,
                "MAX" => Func::Max,
                "COUNT" => Func::Count,
                "IF" => Func::If,
                "ABS" => Func::Abs,
                "ROUND" => Func::Round,
                "SQRT" => Func::Sqrt,
                "MOD" => Func::Mod,
                "POW" => Func::Pow,
                "AND" => Func::And,
                "OR" => Func::Or,
                "NOT" => Func::Not,
                "FLOOR" => Func::Floor,
                "CEILING" => Func::Ceiling,
                "INT" => Func::Int,
                "TRUNC" => Func::Trunc,
                "SIGN" => Func::Sign,
                "PI" => Func::Pi,
                "IFERROR" => Func::IfError,
                "COUNTA" => Func::CountA,
                "LEN" => Func::Len,
                "LEFT" => Func::Left,
                "RIGHT" => Func::Right,
                "MID" => Func::Mid,
                "CONCAT" => Func::Concat,
                "CONCATENATE" => Func::Concatenate,
                "UPPER" => Func::Upper,
                "LOWER" => Func::Lower,
                "TRIM" => Func::Trim,
                "TEXT" => Func::Text,
                "EXACT" => Func::Exact,
                _ => return Err(format!("unknown function: {name}")),
            };
            let mut args = Vec::new();
            if self.peek() != Some(&Tok::RParen) {
                loop {
                    args.push(self.expr_at(depth + 1)?);
                    match self.peek() {
                        Some(Tok::Comma) => {
                            self.pos += 1;
                        }
                        _ => break,
                    }
                }
            }
            match self.next() {
                Some(Tok::RParen) => Ok(Ast::Func(func, args)),
                _ => Err("expected )".into()),
            }
        } else {
            match name.to_ascii_uppercase().as_str() {
                "TRUE" => return Ok(Ast::Bool(true)),
                "FALSE" => return Ok(Ast::Bool(false)),
                _ => {}
            }

            let (row, col, flags) =
                parse_a1(&name).ok_or_else(|| format!("bad cell ref: {name}"))?;
            if let Some(Tok::Colon) = self.peek() {
                self.pos += 1;
                match self.next() {
                    Some(Tok::Ident(end, _)) => {
                        let (r1, c1, end_flags) =
                            parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
                        let (r0, c0, r1, c1, range_flags) =
                            normalize_range(row, col, flags, r1, c1, end_flags);
                        Ok(Ast::Range(r0, c0, r1, c1, range_flags))
                    }
                    _ => Err("expected cell after :".into()),
                }
            } else {
                Ok(Ast::Cell(row, col, flags))
            }
        }
    }

    fn sheet_ref_at(&mut self, sheet_name: String, quoted: bool) -> Result<Ast, String> {
        let Some(Tok::Ident(start, _)) = self.next() else {
            return Err("expected cell after !".into());
        };
        let (row, col, flags) = parse_a1(&start).ok_or_else(|| format!("bad cell ref: {start}"))?;
        let qualifier = UnresolvedSheetRef {
            name: sheet_name.clone(),
            quoted,
        };

        if let Some(Tok::Colon) = self.peek() {
            self.pos += 1;
            let (end_sheet, r1, c1, end_flags) = self.sheet_range_end(&sheet_name)?;
            if end_sheet != sheet_name {
                return Err("cross-sheet ranges must stay on one sheet".into());
            }
            let (r0, c0, r1, c1, range_flags) = normalize_range(row, col, flags, r1, c1, end_flags);
            return Ok(Ast::SheetRange(qualifier, r0, c0, r1, c1, range_flags));
        }

        Ok(Ast::SheetCell(qualifier, row, col, flags))
    }

    fn sheet_range_end(
        &mut self,
        sheet_name: &str,
    ) -> Result<(String, u32, u32, RefFlags), String> {
        let Some(Tok::Ident(first, _)) = self.next() else {
            return Err("expected cell after :".into());
        };

        if let Some(Tok::Bang) = self.peek() {
            self.pos += 1;
            let Some(Tok::Ident(end, _)) = self.next() else {
                return Err("expected cell after !".into());
            };
            let (row, col, flags) = parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
            return Ok((first, row, col, flags));
        }

        let (row, col, flags) = parse_a1(&first).ok_or_else(|| format!("bad cell ref: {first}"))?;
        Ok((sheet_name.to_string(), row, col, flags))
    }
}

/// Parse a formula source (with or without a leading `=`) into an AST.
pub fn parse(src: &str) -> Result<Ast, String> {
    let trimmed = src.trim().strip_prefix('=').unwrap_or(src.trim());
    let toks = tokenize(trimmed)?;
    let mut parser = Parser { toks, pos: 0 };
    let ast = parser.expr()?;
    if parser.pos != parser.toks.len() {
        return Err("trailing tokens".into());
    }
    Ok(ast)
}

/// Resolve sheet-qualified refs to numeric sheet handles once, at formula ingest.
pub fn resolve_sheet_refs<F>(ast: Ast, resolve: &F) -> Result<Ast, String>
where
    F: Fn(&str) -> Option<u32>,
{
    match ast {
        Ast::SheetCell(sheet_ref, row, col, flags) => resolve(&sheet_ref.name)
            .map(|handle| {
                Ast::AbsCell(
                    SheetRef {
                        handle,
                        name: sheet_ref.name.clone(),
                        quoted: sheet_ref.quoted,
                    },
                    row,
                    col,
                    flags,
                )
            })
            .ok_or_else(|| format!("unknown sheet: {}", sheet_ref.name)),
        Ast::SheetRange(sheet_ref, r0, c0, r1, c1, flags) => resolve(&sheet_ref.name)
            .map(|handle| {
                Ast::AbsRange(
                    SheetRef {
                        handle,
                        name: sheet_ref.name.clone(),
                        quoted: sheet_ref.quoted,
                    },
                    r0,
                    c0,
                    r1,
                    c1,
                    flags,
                )
            })
            .ok_or_else(|| format!("unknown sheet: {}", sheet_ref.name)),
        Ast::Func(func, args) => {
            let resolved = args
                .into_iter()
                .map(|arg| resolve_sheet_refs(arg, resolve))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Ast::Func(func, resolved))
        }
        Ast::Bin(op, left, right) => Ok(Ast::Bin(
            op,
            Box::new(resolve_sheet_refs(*left, resolve)?),
            Box::new(resolve_sheet_refs(*right, resolve)?),
        )),
        Ast::Cmp(op, left, right) => Ok(Ast::Cmp(
            op,
            Box::new(resolve_sheet_refs(*left, resolve)?),
            Box::new(resolve_sheet_refs(*right, resolve)?),
        )),
        Ast::Neg(inner) => Ok(Ast::Neg(Box::new(resolve_sheet_refs(*inner, resolve)?))),
        other => Ok(other),
    }
}

#[derive(Clone, Copy)]
enum Axis {
    Row,
    Col,
}

/// Rewrite row references affected by an edit on `edited_sheet`.
pub fn shift_rows(ast: &mut Ast, at: u32, delta: i64, formula_sheet: u32, edited_sheet: u32) {
    rewrite_axis(ast, Axis::Row, at, delta, formula_sheet, edited_sheet);
}

/// Rewrite column references affected by an edit on `edited_sheet`.
pub fn shift_cols(ast: &mut Ast, at: u32, delta: i64, formula_sheet: u32, edited_sheet: u32) {
    rewrite_axis(ast, Axis::Col, at, delta, formula_sheet, edited_sheet);
}

fn rewrite_axis(
    ast: &mut Ast,
    axis: Axis,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) {
    match ast {
        Ast::Cell(row, col, _) if formula_sheet == edited_sheet => {
            let coord = match axis {
                Axis::Row => row,
                Axis::Col => col,
            };
            if let Some(shifted) = shift_index(*coord, at, delta) {
                *coord = shifted;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::AbsCell(sheet, row, col, _) if sheet.handle == edited_sheet => {
            let coord = match axis {
                Axis::Row => row,
                Axis::Col => col,
            };
            if let Some(shifted) = shift_index(*coord, at, delta) {
                *coord = shifted;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::Range(r0, c0, r1, c1, _) if formula_sheet == edited_sheet => {
            let (start, end) = match axis {
                Axis::Row => (r0, r1),
                Axis::Col => (c0, c1),
            };
            if let Some((shifted_start, shifted_end)) = shift_range(*start, *end, at, delta) {
                *start = shifted_start;
                *end = shifted_end;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) if sheet.handle == edited_sheet => {
            let (start, end) = match axis {
                Axis::Row => (r0, r1),
                Axis::Col => (c0, c1),
            };
            if let Some((shifted_start, shifted_end)) = shift_range(*start, *end, at, delta) {
                *start = shifted_start;
                *end = shifted_end;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::Func(_, args) => {
            for arg in args {
                rewrite_axis(arg, axis, at, delta, formula_sheet, edited_sheet);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            rewrite_axis(left, axis, at, delta, formula_sheet, edited_sheet);
            rewrite_axis(right, axis, at, delta, formula_sheet, edited_sheet);
        }
        Ast::Neg(inner) => {
            rewrite_axis(inner, axis, at, delta, formula_sheet, edited_sheet);
        }
        _ => {}
    }
}

/// Shift one coordinate. Deleting its target produces an explicit invalid ref.
fn shift_index(index: u32, at: u32, delta: i64) -> Option<u32> {
    if index < at {
        return Some(index);
    }
    if delta < 0 && index < at.saturating_add((-delta) as u32) {
        return None;
    }
    Some(clamp_index(i64::from(index) + delta))
}

/// Shift or contract an inclusive range; deleting every target invalidates it.
fn shift_range(start: u32, end: u32, at: u32, delta: i64) -> Option<(u32, u32)> {
    if delta >= 0 {
        let start = if start >= at {
            clamp_index(i64::from(start) + delta)
        } else {
            start
        };
        let end = if end >= at {
            clamp_index(i64::from(end) + delta)
        } else {
            end
        };
        return Some((start, end));
    }

    let count = (-delta) as u32;
    let deleted_end = at.saturating_add(count);
    if end < at {
        return Some((start, end));
    }
    if start >= deleted_end {
        return Some((start - count, end - count));
    }

    match (start < at, end >= deleted_end) {
        (true, true) => Some((start, end - count)),
        (true, false) => Some((start, at.saturating_sub(1))),
        (false, true) => Some((at, end - count)),
        (false, false) => None,
    }
}

fn clamp_index(shifted: i64) -> u32 {
    if shifted <= 0 {
        0
    } else if shifted >= i64::from(u32::MAX) {
        u32::MAX
    } else {
        shifted as u32
    }
}

/// Serialize the authoritative AST into parseable formula source.
pub fn serialize(ast: &Ast) -> String {
    let mut out = String::from("=");
    write_ast(ast, &mut out);
    out
}

fn sheet_name_needs_quotes(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return true;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return true;
    }
    if chars.any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_')) {
        return true;
    }
    parse_a1(name).is_some()
}

/// Rewrite resolved references by stable numeric handle and regenerate quoting metadata.
pub(crate) fn rename_sheet_refs(ast: &mut Ast, handle: u32, name: &str) -> bool {
    let mut changed = false;
    match ast {
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle => {
            sheet.name = name.to_string();
            sheet.quoted = sheet_name_needs_quotes(name);
            changed = true;
        }
        Ast::Func(_, args) => {
            for arg in args {
                changed |= rename_sheet_refs(arg, handle, name);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= rename_sheet_refs(left, handle, name);
            changed |= rename_sheet_refs(right, handle, name);
        }
        Ast::Neg(inner) => changed |= rename_sheet_refs(inner, handle, name),
        _ => {}
    }
    changed
}

/// Replace every resolved cell/range reference to a removed stable handle with `#REF!`.
pub(crate) fn invalidate_sheet_refs(ast: &mut Ast, handle: u32) -> bool {
    let invalid = matches!(
        ast,
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle
    );
    if invalid {
        *ast = Ast::InvalidRef;
        return true;
    }

    let mut changed = false;
    match ast {
        Ast::Func(_, args) => {
            for arg in args {
                changed |= invalidate_sheet_refs(arg, handle);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= invalidate_sheet_refs(left, handle);
            changed |= invalidate_sheet_refs(right, handle);
        }
        Ast::Neg(inner) => changed |= invalidate_sheet_refs(inner, handle),
        _ => {}
    }
    changed
}

fn write_ast(ast: &Ast, out: &mut String) {
    match ast {
        Ast::Num(value) => out.push_str(&value.to_string()),
        Ast::Str(value) => {
            out.push('"');
            out.push_str(&value.replace('"', "\"\""));
            out.push('"');
        }
        Ast::Bool(value) => out.push_str(if *value { "TRUE" } else { "FALSE" }),
        Ast::Cell(row, col, flags) => write_a1(*row, *col, *flags, out),
        Ast::SheetCell(sheet, row, col, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::AbsCell(sheet, row, col, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::Range(r0, c0, r1, c1, flags) => {
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::SheetRange(sheet, r0, c0, r1, c1, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::InvalidRef => out.push_str("#REF!"),
        Ast::Func(func, args) => {
            out.push_str(func_name(*func));
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast(arg, out);
            }
            out.push(')');
        }
        Ast::Bin(op, left, right) => {
            out.push('(');
            write_ast(left, out);
            out.push(match op {
                Op::Add => '+',
                Op::Sub => '-',
                Op::Mul => '*',
                Op::Div => '/',
            });
            write_ast(right, out);
            out.push(')');
        }
        Ast::Cmp(op, left, right) => {
            out.push('(');
            write_ast(left, out);
            out.push_str(match op {
                CmpOp::Eq => "=",
                CmpOp::Ne => "<>",
                CmpOp::Lt => "<",
                CmpOp::Le => "<=",
                CmpOp::Gt => ">",
                CmpOp::Ge => ">=",
            });
            write_ast(right, out);
            out.push(')');
        }
        Ast::Neg(inner) => {
            out.push_str("-(");
            write_ast(inner, out);
            out.push(')');
        }
    }
}

fn write_sheet_name(name: &str, quoted: bool, out: &mut String) {
    if quoted {
        out.push('\'');
        out.push_str(&name.replace('\'', "''"));
        out.push('\'');
    } else {
        out.push_str(name);
    }
}

fn write_a1(row: u32, col: u32, flags: RefFlags, out: &mut String) {
    if flags.col_abs {
        out.push('$');
    }
    write_col(col, out);
    if flags.row_abs {
        out.push('$');
    }
    out.push_str(&(u64::from(row) + 1).to_string());
}

fn write_col(mut col: u32, out: &mut String) {
    let mut letters = [0u8; 7];
    let mut index = letters.len();
    loop {
        index -= 1;
        letters[index] = b'A' + (col % 26) as u8;
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    out.push_str(std::str::from_utf8(&letters[index..]).expect("ASCII column letters"));
}

fn func_name(func: Func) -> &'static str {
    match func {
        Func::Sum => "SUM",
        Func::Avg => "AVG",
        Func::Min => "MIN",
        Func::Max => "MAX",
        Func::Count => "COUNT",
        Func::If => "IF",
        Func::Abs => "ABS",
        Func::Round => "ROUND",
        Func::Sqrt => "SQRT",
        Func::Mod => "MOD",
        Func::Pow => "POW",
        Func::And => "AND",
        Func::Or => "OR",
        Func::Not => "NOT",
        Func::Floor => "FLOOR",
        Func::Ceiling => "CEILING",
        Func::Int => "INT",
        Func::Trunc => "TRUNC",
        Func::Sign => "SIGN",
        Func::Pi => "PI",
        Func::IfError => "IFERROR",
        Func::CountA => "COUNTA",
        Func::Len => "LEN",
        Func::Left => "LEFT",
        Func::Right => "RIGHT",
        Func::Mid => "MID",
        Func::Concat => "CONCAT",
        Func::Concatenate => "CONCATENATE",
        Func::Upper => "UPPER",
        Func::Lower => "LOWER",
        Func::Trim => "TRIM",
        Func::Text => "TEXT",
        Func::Exact => "EXACT",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_a1_accepts_absolute_markers() {
        assert_eq!(parse_a1("A1"), Some((0, 0, RefFlags::default())));
        assert_eq!(
            parse_a1("$A1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: false,
                    col_abs: true
                }
            ))
        );
        assert_eq!(
            parse_a1("A$1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: true,
                    col_abs: false
                }
            ))
        );
        assert_eq!(
            parse_a1("$A$1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: true,
                    col_abs: true
                }
            ))
        );
        assert_eq!(
            parse_a1("aa$10"),
            Some((
                9,
                26,
                RefFlags {
                    row_abs: true,
                    col_abs: false
                }
            ))
        );

        assert_eq!(parse_a1("A0"), None);
        assert_eq!(parse_a1("$1"), None);
        assert_eq!(parse_a1("A$"), None);
    }

    #[test]
    fn formula_source_preserves_absolute_references() {
        let parsed = parse("=$A$1 + A$1 + $A1").expect("formula should parse");
        assert_eq!(serialize(&parsed), "=(($A$1+A$1)+$A1)");
        assert_eq!(parse(&serialize(&parsed)), Ok(parsed));
    }

    #[test]
    fn reversed_range_keeps_markers_on_their_normalized_coordinates() {
        let parsed = parse("=$C$3:A1").expect("reversed range should parse");
        assert_eq!(serialize(&parsed), "=A1:$C$3");
        assert_eq!(parse(&serialize(&parsed)), Ok(parsed));
    }

    #[test]
    fn invalid_reference_source_round_trips() {
        let parsed = parse("=#REF!").expect("invalid ref source should parse");
        assert_eq!(parsed, Ast::InvalidRef);
        assert_eq!(serialize(&parsed), "=#REF!");
    }

    #[test]
    fn parse_string_literals_and_boolean_identifiers() {
        assert_eq!(
            parse(r#"="a ""quoted"" word""#),
            Ok(Ast::Str("a \"quoted\" word".into()))
        );
        assert_eq!(parse("=TRUE"), Ok(Ast::Bool(true)));
        assert_eq!(parse("=FALSE"), Ok(Ast::Bool(false)));
    }

    #[test]
    fn parse_rejects_deeply_nested_parentheses() {
        let mut src = String::new();
        for _ in 0..=PARSE_RECURSION_LIMIT {
            src.push('(');
        }
        src.push('1');
        for _ in 0..=PARSE_RECURSION_LIMIT {
            src.push(')');
        }

        assert!(parse(&src).is_err());
    }

    #[test]
    fn shift_rows_updates_cells_ranges_and_nested_expressions() {
        let mut ast = Ast::Func(
            Func::Sum,
            vec![
                Ast::Cell(1, 0, RefFlags::default()),
                Ast::Range(0, 0, 2, 1, RangeFlags::default()),
                Ast::Neg(Box::new(Ast::Cell(3, 2, RefFlags::default()))),
            ],
        );

        shift_rows(&mut ast, 1, 2, 0, 0);

        assert_eq!(
            ast,
            Ast::Func(
                Func::Sum,
                vec![
                    Ast::Cell(3, 0, RefFlags::default()),
                    Ast::Range(0, 0, 4, 1, RangeFlags::default()),
                    Ast::Neg(Box::new(Ast::Cell(5, 2, RefFlags::default()))),
                ],
            )
        );
    }
}
