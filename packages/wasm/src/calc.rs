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
//! pure parse layer plus reference shifting for row insert/delete rewriting.

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

#[derive(Clone, Debug, PartialEq)]
pub enum Ast {
    Num(f64),
    Str(String),
    Bool(bool),
    Cell(u32, u32),                         // row, col on the formula's own sheet
    SheetCell(String, u32, u32),            // sheet name/id, row, col
    AbsCell(u32, u32, u32),                 // sheet handle, row, col
    Range(u32, u32, u32, u32),              // r0, c0, r1, c1 on the formula's own sheet
    SheetRange(String, u32, u32, u32, u32), // sheet name/id, r0, c0, r1, c1
    AbsRange(u32, u32, u32, u32, u32),      // sheet handle, r0, c0, r1, c1
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

/// Parse an A1 token like `B12` or `$B$12` into (row, col), both 0-based.
fn parse_a1(token: &str) -> Option<(u32, u32)> {
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
    let digits = token[letters_end..]
        .strip_prefix('$')
        .unwrap_or(&token[letters_end..]);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let col = parse_col(letters)?;
    let row: u32 = digits.parse().ok()?;
    if row == 0 {
        return None;
    }
    Some((row - 1, col))
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Str(String),
    Ident(String),
    Op(char),
    LParen,
    RParen,
    Comma,
    Colon,
    Bang,
    Cmp(CmpOp),
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
            toks.push(Tok::Ident(value));
        } else if c == '$' || c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '$') {
                i += 1;
            }
            toks.push(Tok::Ident(chars[start..i].iter().collect()));
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
            Some(Tok::Ident(name)) => self.ident_at(name, depth),
            other => Err(if other.is_some() {
                "unexpected token".into()
            } else {
                "unexpected end".into()
            }),
        }
    }

    fn ident_at(&mut self, name: String, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Bang) = self.peek() {
            self.pos += 1;
            return self.sheet_ref_at(name);
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

            let (row, col) = parse_a1(&name).ok_or_else(|| format!("bad cell ref: {name}"))?;
            if let Some(Tok::Colon) = self.peek() {
                self.pos += 1;
                match self.next() {
                    Some(Tok::Ident(end)) => {
                        let (r1, c1) =
                            parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
                        Ok(Ast::Range(
                            row.min(r1),
                            col.min(c1),
                            row.max(r1),
                            col.max(c1),
                        ))
                    }
                    _ => Err("expected cell after :".into()),
                }
            } else {
                Ok(Ast::Cell(row, col))
            }
        }
    }

    fn sheet_ref_at(&mut self, sheet_name: String) -> Result<Ast, String> {
        let Some(Tok::Ident(start)) = self.next() else {
            return Err("expected cell after !".into());
        };
        let (row, col) = parse_a1(&start).ok_or_else(|| format!("bad cell ref: {start}"))?;

        if let Some(Tok::Colon) = self.peek() {
            self.pos += 1;
            let (end_sheet, r1, c1) = self.sheet_range_end(&sheet_name)?;
            if end_sheet != sheet_name {
                return Err("cross-sheet ranges must stay on one sheet".into());
            }
            return Ok(Ast::SheetRange(
                sheet_name,
                row.min(r1),
                col.min(c1),
                row.max(r1),
                col.max(c1),
            ));
        }

        Ok(Ast::SheetCell(sheet_name, row, col))
    }

    fn sheet_range_end(&mut self, sheet_name: &str) -> Result<(String, u32, u32), String> {
        let Some(Tok::Ident(first)) = self.next() else {
            return Err("expected cell after :".into());
        };

        if let Some(Tok::Bang) = self.peek() {
            self.pos += 1;
            let Some(Tok::Ident(end)) = self.next() else {
                return Err("expected cell after !".into());
            };
            let (row, col) = parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
            return Ok((first, row, col));
        }

        let (row, col) = parse_a1(&first).ok_or_else(|| format!("bad cell ref: {first}"))?;
        Ok((sheet_name.to_string(), row, col))
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
        Ast::SheetCell(name, row, col) => resolve(&name)
            .map(|sheet| Ast::AbsCell(sheet, row, col))
            .ok_or_else(|| format!("unknown sheet: {name}")),
        Ast::SheetRange(name, r0, c0, r1, c1) => resolve(&name)
            .map(|sheet| Ast::AbsRange(sheet, r0, c0, r1, c1))
            .ok_or_else(|| format!("unknown sheet: {name}")),
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

/// Shift row references at/after `at` by `delta` (row insert/delete rewriting).
pub fn shift_rows(ast: &mut Ast, at: u32, delta: i64) {
    let shift = |r: u32| -> u32 {
        if r < at {
            return r;
        }

        let shifted = i64::from(r) + delta;
        if shifted <= 0 {
            0
        } else if shifted >= i64::from(u32::MAX) {
            u32::MAX
        } else {
            shifted as u32
        }
    };

    match ast {
        Ast::Cell(r, _) => *r = shift(*r),
        Ast::Range(r0, _, r1, _) => {
            *r0 = shift(*r0);
            *r1 = shift(*r1);
        }
        Ast::Func(_, args) => {
            for a in args {
                shift_rows(a, at, delta);
            }
        }
        Ast::Bin(_, l, r) => {
            shift_rows(l, at, delta);
            shift_rows(r, at, delta);
        }
        Ast::Cmp(_, l, r) => {
            shift_rows(l, at, delta);
            shift_rows(r, at, delta);
        }
        Ast::Neg(e) => shift_rows(e, at, delta),
        Ast::SheetCell(_, _, _)
        | Ast::AbsCell(_, _, _)
        | Ast::SheetRange(_, _, _, _, _)
        | Ast::AbsRange(_, _, _, _, _)
        | Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_) => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_a1_accepts_absolute_markers() {
        assert_eq!(parse_a1("A1"), Some((0, 0)));
        assert_eq!(parse_a1("$A1"), Some((0, 0)));
        assert_eq!(parse_a1("A$1"), Some((0, 0)));
        assert_eq!(parse_a1("$A$1"), Some((0, 0)));
        assert_eq!(parse_a1("aa$10"), Some((9, 26)));

        assert_eq!(parse_a1("A0"), None);
        assert_eq!(parse_a1("$1"), None);
        assert_eq!(parse_a1("A$"), None);
    }

    #[test]
    fn parse_formula_collapses_absolute_references() {
        let parsed = parse("=$A$1 + A$1 + $A1").expect("formula should parse");
        let Ast::Bin(Op::Add, left, right) = parsed else {
            panic!("expected left-associated addition tree");
        };
        assert_eq!(*right, Ast::Cell(0, 0));

        let Ast::Bin(Op::Add, left_left, left_right) = *left else {
            panic!("expected nested addition tree");
        };
        assert_eq!(*left_left, Ast::Cell(0, 0));
        assert_eq!(*left_right, Ast::Cell(0, 0));
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
                Ast::Cell(1, 0),
                Ast::Range(0, 0, 2, 1),
                Ast::Neg(Box::new(Ast::Cell(3, 2))),
            ],
        );

        shift_rows(&mut ast, 1, 2);

        assert_eq!(
            ast,
            Ast::Func(
                Func::Sum,
                vec![
                    Ast::Cell(3, 0),
                    Ast::Range(0, 0, 4, 1),
                    Ast::Neg(Box::new(Ast::Cell(5, 2))),
                ],
            )
        );
    }
}
