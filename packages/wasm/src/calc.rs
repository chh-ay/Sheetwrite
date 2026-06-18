//! Arithmetic formula parser for the optional calc tier (M5).
//!
//! Grammar (same-sheet A1 references):
//!   expr   := term (('+' | '-') term)*
//!   term   := factor (('*' | '/') factor)*
//!   factor := '-' factor | primary
//!   primary:= number | '(' expr ')' | func '(' args ')' | range | cell
//!   range  := cell ':' cell
//! Functions: SUM, AVG, MIN, MAX, COUNT.
//!
//! The evaluator lives on `CellStore` (it needs cell access); this module is the
//! pure parse layer plus reference shifting for row insert/delete rewriting.

#[derive(Clone, Copy, PartialEq)]
pub enum Op {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Clone, Copy, PartialEq)]
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
}

#[derive(Clone, Copy, PartialEq)]
pub enum CmpOp {
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
}

#[derive(Clone)]
pub enum Ast {
    Num(f64),
    Cell(u32, u32),            // row, col
    Range(u32, u32, u32, u32), // r0, c0, r1, c1 (normalized)
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

/// Parse an A1 token like "B12" into (row, col), both 0-based.
fn parse_a1(token: &str) -> Option<(u32, u32)> {
    let split = token.find(|c: char| c.is_ascii_digit())?;
    let (letters, digits) = token.split_at(split);
    let col = parse_col(letters)?;
    let row: u32 = digits.parse().ok()?;
    if row == 0 {
        return None;
    }
    Some((row - 1, col))
}

#[derive(Clone, PartialEq)]
enum Tok {
    Num(f64),
    Ident(String),
    Op(char),
    LParen,
    RParen,
    Comma,
    Colon,
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
        } else if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let s: String = chars[start..i].iter().collect();
            toks.push(Tok::Num(s.parse().map_err(|_| format!("bad number: {s}"))?));
        } else if c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphanumeric() {
                i += 1;
            }
            toks.push(Tok::Ident(chars[start..i].iter().collect()));
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
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }

    fn expr(&mut self) -> Result<Ast, String> {
        let left = self.additive()?;
        if let Some(Tok::Cmp(op)) = self.peek() {
            let op = *op;
            self.pos += 1;
            let right = self.additive()?;
            return Ok(Ast::Cmp(op, Box::new(left), Box::new(right)));
        }
        Ok(left)
    }

    fn additive(&mut self) -> Result<Ast, String> {
        let mut left = self.term()?;
        while let Some(Tok::Op(c @ ('+' | '-'))) = self.peek() {
            let op = if *c == '+' { Op::Add } else { Op::Sub };
            self.pos += 1;
            let right = self.term()?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn term(&mut self) -> Result<Ast, String> {
        let mut left = self.factor()?;
        while let Some(Tok::Op(c @ ('*' | '/'))) = self.peek() {
            let op = if *c == '*' { Op::Mul } else { Op::Div };
            self.pos += 1;
            let right = self.factor()?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn factor(&mut self) -> Result<Ast, String> {
        if let Some(Tok::Op('-')) = self.peek() {
            self.pos += 1;
            return Ok(Ast::Neg(Box::new(self.factor()?)));
        }
        self.primary()
    }

    fn primary(&mut self) -> Result<Ast, String> {
        match self.next() {
            Some(Tok::Num(n)) => Ok(Ast::Num(n)),
            Some(Tok::LParen) => {
                let e = self.expr()?;
                match self.next() {
                    Some(Tok::RParen) => Ok(e),
                    _ => Err("expected )".into()),
                }
            }
            Some(Tok::Ident(name)) => self.ident(name),
            other => Err(if other.is_some() { "unexpected token".into() } else { "unexpected end".into() }),
        }
    }

    fn ident(&mut self, name: String) -> Result<Ast, String> {
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
                _ => return Err(format!("unknown function: {name}")),
            };
            let mut args = Vec::new();
            if self.peek() != Some(&Tok::RParen) {
                loop {
                    args.push(self.expr()?);
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
            let (row, col) = parse_a1(&name).ok_or_else(|| format!("bad cell ref: {name}"))?;
            if let Some(Tok::Colon) = self.peek() {
                self.pos += 1;
                match self.next() {
                    Some(Tok::Ident(end)) => {
                        let (r1, c1) = parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
                        Ok(Ast::Range(row.min(r1), col.min(c1), row.max(r1), col.max(c1)))
                    }
                    _ => Err("expected cell after :".into()),
                }
            } else {
                Ok(Ast::Cell(row, col))
            }
        }
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

/// Shift row references at/after `at` by `delta` (row insert/delete rewriting).
pub fn shift_rows(ast: &mut Ast, at: u32, delta: i64) {
    let shift = |r: u32| -> u32 {
        if r >= at {
            (i64::from(r) + delta).max(0) as u32
        } else {
            r
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
        Ast::Num(_) => {}
    }
}
