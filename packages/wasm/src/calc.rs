//! Formula parser for the optional calc tier.
//!
//! Grammar (A1 references with optional sheet qualifiers):
//!   expr       := concat (comparison concat)?
//!   concat     := additive ('&' additive)*
//!   additive   := term (('+' | '-') term)*
//!   term       := power (('*' | '/') power)*
//!   power      := postfix ('^' postfix)*
//!   postfix    := unary ('%')*
//!   unary      := ('+' | '-') unary | primary
//!   primary    := number | '(' expr ')' | func '(' args ')' | range | cell
//!   range  := cell ':' cell
//!
//! Cell references accept optional absolute markers (`$A$1`, `A$1`, `$A1`).
//! Sheet-qualified references keep the sheet name until `CellStore` resolves it
//! to a sheet handle at formula-ingest time.
//!
//! The evaluator lives on `CellStore` (it needs cell access); this module is the
//! pure parse layer plus reference shifting for row/column insert/delete rewriting.

use std::{borrow::Cow, cmp::Ordering};
use crate::memory::MemoryOwnerStats;

/// Bounds syntax recursion below the evaluator limit because each parenthesized
/// expression traverses the complete precedence stack.
const PARSE_RECURSION_LIMIT: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Op {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Concat,
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
    IfNa,
    Ifs,
    Switch,
    Xor,
    True,
    False,
    IsBlank,
    IsNumber,
    IsText,
    IsLogical,
    IsError,
    IsErr,
    IsNa,
    Type,
    N,
    T,
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
    Date,
    DateValue,
    Day,
    Month,
    Year,
    Today,
    Now,
    CountIf,
    CountIfs,
    SumIf,
    SumIfs,
    AverageIf,
    AverageIfs,
    Index,
    Match,
    VLookup,
    HLookup,
    XLookup,
    Na,
    Filter,
    Sort,
    Unique,
    Let,
    Product,
    SumProduct,
    Power,
    Exp,
    Ln,
    Log,
    Log10,
    RoundUp,
    RoundDown,
    MRound,
    Even,
    Odd,
    Quotient,
    Gcd,
    Lcm,
    Subtotal,
    TextJoin,
    Substitute,
    Replace,
    Find,
    Search,
    Value,
    Clean,
    Rept,
    Char,
    Code,
    UniChar,
    Unicode,
    Proper,
    NumberValue,
    Time,
    TimeValue,
    Hour,
    Minute,
    Second,
    Days,
    EDate,
    EOMonth,
    Weekday,
    WeekNum,
    Workday,
    NetworkDays,
    YearFrac,
    Days360,
    Median,
    ModeSngl,
    Large,
    Small,
    RankEq,
    PercentileInc,
    QuartileInc,
    StdevS,
    StdevP,
    VarS,
    VarP,
    GeoMean,
    Correl,
    CovarianceS,
    CovarianceP,
    CountBlank,
    MaxIfs,
    MinIfs,
    XMatch,
    Choose,
    Row,
    Rows,
    Column,
    Columns,
    Address,
    Transpose,
    Sequence,
    Take,
    Drop,
    ChooseCols,
    ChooseRows,
    Pv,
    Fv,
    Pmt,
    Npv,
    Irr,
    Rate,
    Ipmt,
    Ppmt,
}

const fn ascii_upper(byte: u8) -> u8 {
    if byte >= b'a' && byte <= b'z' {
        byte - (b'a' - b'A')
    } else {
        byte
    }
}

fn registered_name_cmp(registered: &str, input: &str) -> Ordering {
    let length_order = registered.len().cmp(&input.len());
    if length_order != Ordering::Equal {
        return length_order;
    }

    for (&expected, &actual) in registered.as_bytes().iter().zip(input.as_bytes()) {
        let byte_order = expected.cmp(&ascii_upper(actual));
        if byte_order != Ordering::Equal {
            return byte_order;
        }
    }
    Ordering::Equal
}

macro_rules! define_function_registry {
    (
        canonical { $($variant:ident => $canonical:literal;)+ }
        aliases { $($alias:literal => $alias_variant:ident;)* }
    ) => {
        const FUNCTION_NAMES: &[(&str, Func)] = &[
            $(($canonical, Func::$variant),)+
        ];
        const FUNCTION_ALIASES: &[(&str, Func)] = &[
            $(($alias, Func::$alias_variant),)*
        ];

        #[inline(never)]
        fn lookup_func(name: &str) -> Option<Func> {
            if let Ok(index) = FUNCTION_NAMES
                .binary_search_by(|(registered, _)| registered_name_cmp(registered, name))
            {
                return Some(FUNCTION_NAMES[index].1);
            }
            FUNCTION_ALIASES
                .binary_search_by(|(registered, _)| registered_name_cmp(registered, name))
                .ok()
                .map(|index| FUNCTION_ALIASES[index].1)
        }

        fn func_name(func: Func) -> &'static str {
            match func {
                $(Func::$variant => $canonical,)+
            }
        }
    };
}

define_function_registry! {
    canonical {
        N => "N";
        T => "T";
        Fv => "FV";
        If => "IF";
        Ln => "LN";
        Na => "NA";
        Or => "OR";
        Pi => "PI";
        Pv => "PV";
        Abs => "ABS";
        And => "AND";
        Avg => "AVG";
        Day => "DAY";
        Exp => "EXP";
        Gcd => "GCD";
        Ifs => "IFS";
        Int => "INT";
        Irr => "IRR";
        Lcm => "LCM";
        Len => "LEN";
        Let => "LET";
        Log => "LOG";
        Max => "MAX";
        Mid => "MID";
        Min => "MIN";
        Mod => "MOD";
        Not => "NOT";
        Now => "NOW";
        Npv => "NPV";
        Odd => "ODD";
        Pmt => "PMT";
        Pow => "POW";
        Row => "ROW";
        Sum => "SUM";
        Xor => "XOR";
        Char => "CHAR";
        Code => "CODE";
        Date => "DATE";
        Days => "DAYS";
        Drop => "DROP";
        Even => "EVEN";
        Find => "FIND";
        Hour => "HOUR";
        IfNa => "IFNA";
        Ipmt => "IPMT";
        IsNa => "ISNA";
        Left => "LEFT";
        Ppmt => "PPMT";
        Rate => "RATE";
        Rept => "REPT";
        Rows => "ROWS";
        Sign => "SIGN";
        Sort => "SORT";
        Sqrt => "SQRT";
        Take => "TAKE";
        Text => "TEXT";
        Time => "TIME";
        Trim => "TRIM";
        True => "TRUE";
        Type => "TYPE";
        Year => "YEAR";
        Clean => "CLEAN";
        Count => "COUNT";
        EDate => "EDATE";
        Exact => "EXACT";
        False => "FALSE";
        Floor => "FLOOR";
        Index => "INDEX";
        IsErr => "ISERR";
        Large => "LARGE";
        Log10 => "LOG10";
        Lower => "LOWER";
        Match => "MATCH";
        Month => "MONTH";
        Power => "POWER";
        Right => "RIGHT";
        Round => "ROUND";
        Small => "SMALL";
        SumIf => "SUMIF";
        Today => "TODAY";
        Trunc => "TRUNC";
        Upper => "UPPER";
        Value => "VALUE";
        VarP => "VAR.P";
        VarS => "VAR.S";
        Choose => "CHOOSE";
        Column => "COLUMN";
        Concat => "CONCAT";
        Correl => "CORREL";
        CountA => "COUNTA";
        Filter => "FILTER";
        IsText => "ISTEXT";
        MaxIfs => "MAXIFS";
        Median => "MEDIAN";
        MinIfs => "MINIFS";
        Minute => "MINUTE";
        MRound => "MROUND";
        Proper => "PROPER";
        Search => "SEARCH";
        Second => "SECOND";
        SumIfs => "SUMIFS";
        Switch => "SWITCH";
        Unique => "UNIQUE";
        XMatch => "XMATCH";
        Address => "ADDRESS";
        Ceiling => "CEILING";
        Columns => "COLUMNS";
        CountIf => "COUNTIF";
        Days360 => "DAYS360";
        EOMonth => "EOMONTH";
        GeoMean => "GEOMEAN";
        HLookup => "HLOOKUP";
        IfError => "IFERROR";
        IsBlank => "ISBLANK";
        IsError => "ISERROR";
        Product => "PRODUCT";
        RankEq => "RANK.EQ";
        Replace => "REPLACE";
        RoundUp => "ROUNDUP";
        StdevP => "STDEV.P";
        StdevS => "STDEV.S";
        UniChar => "UNICHAR";
        Unicode => "UNICODE";
        VLookup => "VLOOKUP";
        Weekday => "WEEKDAY";
        WeekNum => "WEEKNUM";
        Workday => "WORKDAY";
        XLookup => "XLOOKUP";
        CountIfs => "COUNTIFS";
        IsNumber => "ISNUMBER";
        Quotient => "QUOTIENT";
        Sequence => "SEQUENCE";
        Subtotal => "SUBTOTAL";
        TextJoin => "TEXTJOIN";
        YearFrac => "YEARFRAC";
        AverageIf => "AVERAGEIF";
        DateValue => "DATEVALUE";
        IsLogical => "ISLOGICAL";
        ModeSngl => "MODE.SNGL";
        RoundDown => "ROUNDDOWN";
        TimeValue => "TIMEVALUE";
        Transpose => "TRANSPOSE";
        AverageIfs => "AVERAGEIFS";
        ChooseCols => "CHOOSECOLS";
        ChooseRows => "CHOOSEROWS";
        CountBlank => "COUNTBLANK";
        Substitute => "SUBSTITUTE";
        SumProduct => "SUMPRODUCT";
        Concatenate => "CONCATENATE";
        NetworkDays => "NETWORKDAYS";
        NumberValue => "NUMBERVALUE";
        CovarianceP => "COVARIANCE.P";
        CovarianceS => "COVARIANCE.S";
        QuartileInc => "QUARTILE.INC";
        PercentileInc => "PERCENTILE.INC";
    }
    aliases {
        "AVERAGE" => Avg;
    }
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
pub struct NamedRangeRef {
    pub name: String,
    pub scope: Option<u32>,
    pub sheet: u32,
    pub row_start: u32,
    pub col_start: u32,
    pub row_end: u32,
    pub col_end: u32,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TableSection {
    Body,
    Headers,
    Totals,
    CurrentRow,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnresolvedStructuredRef {
    pub table_name: Option<String>,
    pub column_name: String,
    pub section: TableSection,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StructuredRef {
    pub table_id: String,
    pub table_name: String,
    pub column_id: String,
    pub column_name: String,
    pub sheet: u32,
    pub row_start: u32,
    pub row_end: u32,
    pub col: u32,
    pub section: TableSection,
    pub qualified: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Ast {
    Num(f64),
    Str(String),
    Bool(bool),
    Missing,
    Name(String),
    NamedRange(NamedRangeRef),
    UnresolvedStructured(UnresolvedStructuredRef),
    Structured(StructuredRef),
    Cell(u32, u32, RefFlags),
    SheetCell(UnresolvedSheetRef, u32, u32, RefFlags),
    AbsCell(SheetRef, u32, u32, RefFlags),
    Range(u32, u32, u32, u32, RangeFlags),
    SheetRange(UnresolvedSheetRef, u32, u32, u32, u32, RangeFlags),
    AbsRange(SheetRef, u32, u32, u32, u32, RangeFlags),
    InvalidRef,
    Func(Func, Vec<Ast>),
    UnknownFunc(String, Vec<Ast>),
    Bin(Op, Box<Ast>, Box<Ast>),
    Cmp(CmpOp, Box<Ast>, Box<Ast>),
    Neg(Box<Ast>),
    Pos(Box<Ast>),
    Percent(Box<Ast>),
}
impl Ast {
    /// Heap payload owned below an inline AST root. The root itself is already
    /// included in its formula hash-table bucket.
    pub(crate) fn heap_memory_stats(&self, out: &mut MemoryOwnerStats) {
        match self {
            Ast::Str(value) | Ast::Name(value) => add_string_memory(value, out),
            Ast::NamedRange(value) => add_string_memory(&value.name, out),
            Ast::UnresolvedStructured(value) => {
                if let Some(name) = &value.table_name {
                    add_string_memory(name, out);
                }
                add_string_memory(&value.column_name, out);
            }
            Ast::Structured(value) => {
                add_string_memory(&value.table_id, out);
                add_string_memory(&value.table_name, out);
                add_string_memory(&value.column_id, out);
                add_string_memory(&value.column_name, out);
            }
            Ast::SheetCell(sheet, ..) | Ast::SheetRange(sheet, ..) => {
                add_string_memory(&sheet.name, out);
            }
            Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) => {
                add_string_memory(&sheet.name, out);
            }
            Ast::Func(_, args) => add_ast_vec_memory(args, out),
            Ast::UnknownFunc(name, args) => {
                add_string_memory(name, out);
                add_ast_vec_memory(args, out);
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                add_boxed_ast_memory(left, out);
                add_boxed_ast_memory(right, out);
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                add_boxed_ast_memory(inner, out);
            }
            Ast::Num(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Cell(..)
            | Ast::Range(..)
            | Ast::InvalidRef => {}
        }
    }
}

fn add_string_memory(value: &String, out: &mut MemoryOwnerStats) {
    out.add_payload(value.len(), value.capacity());
}

fn add_ast_vec_memory(values: &Vec<Ast>, out: &mut MemoryOwnerStats) {
    out.add_payload(
        values.len().saturating_mul(std::mem::size_of::<Ast>()),
        values.capacity().saturating_mul(std::mem::size_of::<Ast>()),
    );
    for value in values {
        value.heap_memory_stats(out);
    }
}

fn add_boxed_ast_memory(value: &Ast, out: &mut MemoryOwnerStats) {
    out.add_payload(std::mem::size_of::<Ast>(), std::mem::size_of::<Ast>());
    value.heap_memory_stats(out);
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
enum Tok<'a> {
    Num(f64),
    Str(String),
    Ident(Cow<'a, str>, bool),
    Structured(String),
    Op(char),
    LParen,
    RParen,
    Comma,
    Colon,
    Bang,
    Cmp(CmpOp),
    InvalidRef,
}

fn quoted_token(
    src: &str,
    index: &mut usize,
    quote: u8,
    unterminated: &str,
) -> Result<String, String> {
    let bytes = src.as_bytes();
    *index += 1;
    let mut segment = *index;
    let mut value = String::new();
    loop {
        if *index >= bytes.len() {
            return Err(unterminated.into());
        }
        if bytes[*index] != quote {
            *index += 1;
            continue;
        }

        value.push_str(&src[segment..*index]);
        if bytes.get(*index + 1) == Some(&quote) {
            value.push(quote as char);
            *index += 2;
            segment = *index;
        } else {
            *index += 1;
            return Ok(value);
        }
    }
}

fn tokenize(src: &str) -> Result<Vec<Tok<'_>>, String> {
    let mut toks = Vec::new();
    let bytes = src.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_whitespace() {
            i += 1;
        } else if c == b'"' {
            toks.push(Tok::Str(quoted_token(
                src,
                &mut i,
                b'"',
                "unterminated string literal",
            )?));
        } else if c.is_ascii_digit()
            || (c == b'.' && bytes.get(i + 1).is_some_and(u8::is_ascii_digit))
        {
            let start = i;
            let mut saw_decimal = false;
            while i < bytes.len() {
                if bytes[i].is_ascii_digit() {
                    i += 1;
                } else if bytes[i] == b'.' && !saw_decimal {
                    saw_decimal = true;
                    i += 1;
                } else {
                    break;
                }
            }
            let number = &src[start..i];
            toks.push(Tok::Num(
                number
                    .parse()
                    .map_err(|_| format!("bad number: {number}"))?,
            ));
        } else if c == b'\'' {
            toks.push(Tok::Ident(
                Cow::Owned(quoted_token(
                    src,
                    &mut i,
                    b'\'',
                    "unterminated sheet name",
                )?),
                true,
            ));
        } else if bytes[i..].starts_with(b"#REF!") {
            toks.push(Tok::InvalidRef);
            i += 5;
        } else if c == b'[' {
            let start = i;
            let mut depth = 0usize;
            while i < bytes.len() {
                match bytes[i] {
                    b'[' => depth += 1,
                    b']' => {
                        if depth == 0 {
                            return Err("unexpected ]".into());
                        }
                        depth -= 1;
                    }
                    _ => {}
                }
                i += 1;
                if depth == 0 {
                    break;
                }
            }
            if depth != 0 {
                return Err("unterminated structured reference".into());
            }
            toks.push(Tok::Structured(src[start..i].to_string()));
        } else if c == b'$'
            || c == b'_'
            || c == b'\\'
            || c.is_ascii_alphabetic()
            || (!c.is_ascii()
                && src[i..]
                    .chars()
                    .next()
                    .is_some_and(char::is_alphabetic))
        {
            let start = i;
            while i < bytes.len() {
                let ch = src[i..].chars().next().expect("valid UTF-8 source");
                if ch.is_alphanumeric() || matches!(ch, '$' | '_' | '.' | '\\') {
                    i += ch.len_utf8();
                } else {
                    break;
                }
            }
            toks.push(Tok::Ident(Cow::Borrowed(&src[start..i]), false));
        } else if c == b'!' {
            toks.push(Tok::Bang);
            i += 1;
        } else if c == b'<' || c == b'>' || c == b'=' {
            let next = bytes.get(i + 1).copied();
            let (op, len) = match (c, next) {
                (b'<', Some(b'=')) => (CmpOp::Le, 2),
                (b'>', Some(b'=')) => (CmpOp::Ge, 2),
                (b'<', Some(b'>')) => (CmpOp::Ne, 2),
                (b'=', _) => (CmpOp::Eq, 1),
                (b'<', _) => (CmpOp::Lt, 1),
                _ => (CmpOp::Gt, 1),
            };
            toks.push(Tok::Cmp(op));
            i += len;
        } else {
            match c {
                b'+' | b'-' | b'*' | b'/' | b'^' | b'&' | b'%' => {
                    toks.push(Tok::Op(c as char));
                    i += 1;
                }
                b'(' => {
                    toks.push(Tok::LParen);
                    i += 1;
                }
                b')' => {
                    toks.push(Tok::RParen);
                    i += 1;
                }
                b',' => {
                    toks.push(Tok::Comma);
                    i += 1;
                }
                b':' => {
                    toks.push(Tok::Colon);
                    i += 1;
                }
                _ if !c.is_ascii() => {
                    let ch = src[i..].chars().next().expect("valid UTF-8 source");
                    if ch.is_whitespace() {
                        i += ch.len_utf8();
                    } else {
                        return Err(format!("unexpected char: {ch}"));
                    }
                }
                _ => return Err(format!("unexpected char: {}", c as char)),
            }
        }
    }

    Ok(toks)
}

fn parse_structured_ref(raw: String, table_name: Option<String>) -> Result<Ast, String> {
    if !raw.starts_with('[') || !raw.ends_with(']') {
        return Err("malformed structured reference".into());
    }
    let (section, column_name) = if raw.starts_with("[[") && raw.ends_with("]]") {
        let inner = &raw[2..raw.len() - 2];
        let Some((selector, column)) = inner.split_once("],[") else {
            return Err("structured reference requires one section and one column".into());
        };
        let section = if selector.eq_ignore_ascii_case("#Headers") {
            TableSection::Headers
        } else if selector.eq_ignore_ascii_case("#Totals") {
            TableSection::Totals
        } else {
            return Err("unsupported structured-reference section".into());
        };
        (section, column)
    } else {
        let inner = &raw[1..raw.len() - 1];
        if let Some(column) = inner.strip_prefix('@') {
            (TableSection::CurrentRow, column)
        } else {
            (TableSection::Body, inner)
        }
    };
    if column_name.is_empty() {
        return Err("structured reference column is empty".into());
    }
    Ok(Ast::UnresolvedStructured(UnresolvedStructuredRef {
        table_name,
        column_name: column_name.to_string(),
        section,
    }))
}

struct Parser<'a> {
    toks: std::vec::IntoIter<Tok<'a>>,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Tok<'a>> {
        self.toks.as_slice().first()
    }

    fn next(&mut self) -> Option<Tok<'a>> {
        self.toks.next()
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

        let left = self.concat_at(depth)?;
        if let Some(Tok::Cmp(op)) = self.peek() {
            let op = *op;
            let _ = self.next();
            let right = self.concat_at(depth)?;
            return Ok(Ast::Cmp(op, Box::new(left), Box::new(right)));
        }
        Ok(left)
    }

    fn concat_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.additive_at(depth)?;
        while self.peek() == Some(&Tok::Op('&')) {
            let _ = self.next();
            let right = self.additive_at(depth)?;
            left = Ast::Bin(Op::Concat, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn additive_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.term_at(depth)?;
        while let Some(Tok::Op(c @ ('+' | '-'))) = self.peek() {
            let op = if *c == '+' { Op::Add } else { Op::Sub };
            let _ = self.next();
            let right = self.term_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn term_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.power_at(depth)?;
        while let Some(Tok::Op(c @ ('*' | '/'))) = self.peek() {
            let op = if *c == '*' { Op::Mul } else { Op::Div };
            let _ = self.next();
            let right = self.power_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn power_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.postfix_at(depth)?;
        while self.peek() == Some(&Tok::Op('^')) {
            let _ = self.next();
            let right = self.postfix_at(depth)?;
            left = Ast::Bin(Op::Pow, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn postfix_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut value = self.unary_at(depth)?;
        while self.peek() == Some(&Tok::Op('%')) {
            let _ = self.next();
            value = Ast::Percent(Box::new(value));
        }
        Ok(value)
    }

    fn unary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Op(sign @ ('+' | '-'))) = self.peek() {
            let sign = *sign;
            let _ = self.next();
            let inner = Box::new(self.unary_at(depth + 1)?);
            return Ok(if sign == '-' {
                Ast::Neg(inner)
            } else {
                Ast::Pos(inner)
            });
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
            Some(Tok::Structured(raw)) => parse_structured_ref(raw, None),
            Some(Tok::InvalidRef) => Ok(Ast::InvalidRef),
            other => Err(if other.is_some() {
                "unexpected token".into()
            } else {
                "unexpected end".into()
            }),
        }
    }

    fn ident_at(
        &mut self,
        name: Cow<'a, str>,
        quoted: bool,
        depth: usize,
    ) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        if let Some(Tok::Structured(_)) = self.peek() {
            let Some(Tok::Structured(raw)) = self.next() else {
                unreachable!("peeked structured token");
            };
            return parse_structured_ref(raw, Some(name.into_owned()));
        }


        if let Some(Tok::Bang) = self.peek() {
            let _ = self.next();
            return self.sheet_ref_at(name.into_owned(), quoted);
        }

        if let Some(Tok::LParen) = self.peek() {
            let _ = self.next();
            let func = lookup_func(name.as_ref());
            let mut args = Vec::new();
            if self.peek() != Some(&Tok::RParen) {
                loop {
                    if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                        args.push(Ast::Missing);
                    } else {
                        args.push(self.expr_at(depth + 1)?);
                    }
                    match self.peek() {
                        Some(Tok::Comma) => {
                            let _ = self.next();
                        }
                        _ => break,
                    }
                }
            }
            match self.next() {
                Some(Tok::RParen) => Ok(match func {
                    Some(func) => Ast::Func(func, args),
                    None => Ast::UnknownFunc(name.into_owned(), args),
                }),
                _ => Err("expected )".into()),
            }
        } else {
            if name.eq_ignore_ascii_case("TRUE") {
                return Ok(Ast::Bool(true));
            }
            if name.eq_ignore_ascii_case("FALSE") {
                return Ok(Ast::Bool(false));
            }

            let Some((row, col, flags)) = parse_a1(name.as_ref()) else {
                return Ok(Ast::Name(name.into_owned()));
            };
            if let Some(Tok::Colon) = self.peek() {
                let _ = self.next();
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
            let _ = self.next();
            let (end_sheet, r1, c1, end_flags) = self.sheet_range_end(&sheet_name)?;
            if sheet_name_key(&end_sheet) != sheet_name_key(&sheet_name) {
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
            let _ = self.next();
            let Some(Tok::Ident(end, _)) = self.next() else {
                return Err("expected cell after !".into());
            };
            let (row, col, flags) = parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
            return Ok((first.into_owned(), row, col, flags));
        }

        let (row, col, flags) = parse_a1(&first).ok_or_else(|| format!("bad cell ref: {first}"))?;
        Ok((sheet_name.to_string(), row, col, flags))
    }
}

pub(crate) fn sheet_name_key(name: &str) -> String {
    name.chars().flat_map(char::to_lowercase).collect()
}

/// Parse a formula source (with or without a leading `=`) into an AST.
pub fn parse(src: &str) -> Result<Ast, String> {
    let trimmed = src.trim().strip_prefix('=').unwrap_or(src.trim());
    let toks = tokenize(trimmed)?;
    let mut parser = Parser {
        toks: toks.into_iter(),
    };
    let ast = parser.expr()?;
    if parser.peek().is_some() {
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
        Ast::UnknownFunc(name, args) => {
            let resolved = args
                .into_iter()
                .map(|arg| resolve_sheet_refs(arg, resolve))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Ast::UnknownFunc(name, resolved))
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
        Ast::Pos(inner) => Ok(Ast::Pos(Box::new(resolve_sheet_refs(*inner, resolve)?))),
        Ast::Percent(inner) => Ok(Ast::Percent(Box::new(resolve_sheet_refs(*inner, resolve)?))),
        other => Ok(other),
    }
}

/// Resolve workbook/sheet-scoped names after sheet references have stable handles.
pub fn resolve_named_ranges<F>(ast: Ast, formula_sheet: u32, resolve: &F) -> Ast
where
    F: Fn(&str, u32) -> Option<NamedRangeRef>,
{
    resolve_named_ranges_inner(ast, formula_sheet, resolve, &[])
}

fn resolve_named_ranges_inner<F>(
    ast: Ast,
    formula_sheet: u32,
    resolve: &F,
    locals: &[String],
) -> Ast
where
    F: Fn(&str, u32) -> Option<NamedRangeRef>,
{
    match ast {
        Ast::Name(name)
            if locals
                .iter()
                .any(|local| local.eq_ignore_ascii_case(&name)) =>
        {
            Ast::Name(name)
        }
        Ast::Name(name) => resolve(&name, formula_sheet).map_or(Ast::Name(name), Ast::NamedRange),
        Ast::Func(Func::Let, args) if args.len() >= 3 && args.len() % 2 == 1 => {
            let mut scoped = locals.to_vec();
            let mut resolved = Vec::with_capacity(args.len());
            let last = args.len() - 1;
            for (index, arg) in args.into_iter().enumerate() {
                if index == last {
                    resolved.push(resolve_named_ranges_inner(
                        arg,
                        formula_sheet,
                        resolve,
                        &scoped,
                    ));
                } else if index % 2 == 0 {
                    resolved.push(arg);
                } else {
                    resolved.push(resolve_named_ranges_inner(
                        arg,
                        formula_sheet,
                        resolve,
                        &scoped,
                    ));
                    if let Some(Ast::Name(name)) = resolved.get(index - 1) {
                        scoped.push(name.clone());
                    }
                }
            }
            Ast::Func(Func::Let, resolved)
        }
        Ast::Func(func, args) => Ast::Func(
            func,
            args.into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect(),
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name,
            args.into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect(),
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            op,
            Box::new(resolve_named_ranges_inner(
                *left,
                formula_sheet,
                resolve,
                locals,
            )),
            Box::new(resolve_named_ranges_inner(
                *right,
                formula_sheet,
                resolve,
                locals,
            )),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            op,
            Box::new(resolve_named_ranges_inner(
                *left,
                formula_sheet,
                resolve,
                locals,
            )),
            Box::new(resolve_named_ranges_inner(
                *right,
                formula_sheet,
                resolve,
                locals,
            )),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        Ast::Pos(inner) => Ast::Pos(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        Ast::Percent(inner) => Ast::Percent(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        other => other,
    }
}
pub fn resolve_structured_refs<F>(
    ast: Ast,
    formula_sheet: u32,
    formula_row: u32,
    formula_col: u32,
    resolve: &F,
) -> Ast
where
    F: Fn(&UnresolvedStructuredRef, u32, u32, u32) -> Option<StructuredRef>,
{
    match ast {
        Ast::UnresolvedStructured(reference) => resolve(
            &reference,
            formula_sheet,
            formula_row,
            formula_col,
        )
        .map_or(Ast::UnresolvedStructured(reference), Ast::Structured),
        Ast::Func(func, args) => Ast::Func(
            func,
            args.into_iter()
                .map(|arg| {
                    resolve_structured_refs(
                        arg,
                        formula_sheet,
                        formula_row,
                        formula_col,
                        resolve,
                    )
                })
                .collect(),
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name,
            args.into_iter()
                .map(|arg| {
                    resolve_structured_refs(
                        arg,
                        formula_sheet,
                        formula_row,
                        formula_col,
                        resolve,
                    )
                })
                .collect(),
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            op,
            Box::new(resolve_structured_refs(
                *left,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
            Box::new(resolve_structured_refs(
                *right,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            op,
            Box::new(resolve_structured_refs(
                *left,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
            Box::new(resolve_structured_refs(
                *right,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        Ast::Pos(inner) => Ast::Pos(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        Ast::Percent(inner) => Ast::Percent(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        other => other,
    }
}


/// Translate relative A1 references from one formula origin to another.
///
/// Conditional-format expressions store one parsed AST at the rule range's
/// top-left. Window evaluation clones that bounded AST and applies the target
/// cell delta here; absolute row/column markers remain fixed.
pub fn translate_relative_refs(ast: &mut Ast, row_delta: i64, col_delta: i64) {
    if !translate_relative_refs_inner(ast, row_delta, col_delta) {
        *ast = Ast::InvalidRef;
    }
}

fn translated_coordinate(value: u32, delta: i64, absolute: bool) -> Option<u32> {
    if absolute {
        return Some(value);
    }
    let translated = i64::from(value).checked_add(delta)?;
    u32::try_from(translated).ok()
}

fn translate_relative_refs_inner(ast: &mut Ast, row_delta: i64, col_delta: i64) -> bool {
    match ast {
        Ast::Cell(row, col, flags)
        | Ast::SheetCell(_, row, col, flags)
        | Ast::AbsCell(_, row, col, flags) => {
            let (Some(next_row), Some(next_col)) = (
                translated_coordinate(*row, row_delta, flags.row_abs),
                translated_coordinate(*col, col_delta, flags.col_abs),
            ) else {
                return false;
            };
            *row = next_row;
            *col = next_col;
            true
        }
        Ast::Range(r0, c0, r1, c1, flags)
        | Ast::SheetRange(_, r0, c0, r1, c1, flags)
        | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                translated_coordinate(*r0, row_delta, flags.start.row_abs),
                translated_coordinate(*c0, col_delta, flags.start.col_abs),
                translated_coordinate(*r1, row_delta, flags.end.row_abs),
                translated_coordinate(*c1, col_delta, flags.end.col_abs),
            ) else {
                return false;
            };
            *r0 = next_r0;
            *c0 = next_c0;
            *r1 = next_r1;
            *c1 = next_c1;
            true
        }
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                if !translate_relative_refs_inner(arg, row_delta, col_delta) {
                    *arg = Ast::InvalidRef;
                }
            }
            true
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            if !translate_relative_refs_inner(left, row_delta, col_delta) {
                **left = Ast::InvalidRef;
            }
            if !translate_relative_refs_inner(right, row_delta, col_delta) {
                **right = Ast::InvalidRef;
            }
            true
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            if !translate_relative_refs_inner(inner, row_delta, col_delta) {
                **inner = Ast::InvalidRef;
            }
            true
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef => true,
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
        Ast::Structured(reference) if reference.sheet == edited_sheet => {
            match axis {
                Axis::Row => {
                    if let Some((start, end)) =
                        shift_range(reference.row_start, reference.row_end, at, delta)
                    {
                        reference.row_start = start;
                        reference.row_end = end;
                    } else {
                        *ast = Ast::InvalidRef;
                    }
                }
                Axis::Col => {
                    if let Some(col) = shift_index(reference.col, at, delta) {
                        reference.col = col;
                    } else {
                        *ast = Ast::InvalidRef;
                    }
                }
            }
        }
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                rewrite_axis(arg, axis, at, delta, formula_sheet, edited_sheet);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            rewrite_axis(left, axis, at, delta, formula_sheet, edited_sheet);
            rewrite_axis(right, axis, at, delta, formula_sheet, edited_sheet);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
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
pub(crate) fn shift_range(start: u32, end: u32, at: u32, delta: i64) -> Option<(u32, u32)> {
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
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= rename_sheet_refs(arg, handle, name);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= rename_sheet_refs(left, handle, name);
            changed |= rename_sheet_refs(right, handle, name);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= rename_sheet_refs(inner, handle, name);
        }
        _ => {}
    }
    changed
}

pub(crate) fn update_structured_refs<F>(
    ast: &mut Ast,
    table_id: &str,
    resolve: &F,
) -> bool
where
    F: Fn(&StructuredRef) -> Option<StructuredRef>,
{
    if let Ast::Structured(reference) = ast {
        if reference.table_id == table_id {
            *ast = resolve(reference).map_or(Ast::InvalidRef, Ast::Structured);
            return true;
        }
    }
    let mut changed = false;
    match ast {
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= update_structured_refs(arg, table_id, resolve);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= update_structured_refs(left, table_id, resolve);
            changed |= update_structured_refs(right, table_id, resolve);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= update_structured_refs(inner, table_id, resolve);
        }
        _ => {}
    }
    changed
}

/// Replace every resolved cell/range reference to a removed stable handle with `#REF!`.
pub(crate) fn invalidate_sheet_refs(ast: &mut Ast, handle: u32) -> bool {
    let invalid = matches!(
        ast,
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle
    ) || matches!(ast, Ast::Structured(reference) if reference.sheet == handle);
    if invalid {
        *ast = Ast::InvalidRef;
        return true;
    }

    let mut changed = false;
    match ast {
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= invalidate_sheet_refs(arg, handle);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= invalidate_sheet_refs(left, handle);
            changed |= invalidate_sheet_refs(right, handle);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= invalidate_sheet_refs(inner, handle);
        }
        _ => {}
    }
    changed
}

fn write_structured_ref(
    table_name: Option<&str>,
    column_name: &str,
    section: TableSection,
    out: &mut String,
) {
    if let Some(name) = table_name {
        out.push_str(name);
    }
    match section {
        TableSection::Body => {
            out.push('[');
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::CurrentRow => {
            out.push_str("[@");
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::Headers | TableSection::Totals => {
            out.push_str("[[");
            out.push_str(if section == TableSection::Headers {
                "#Headers"
            } else {
                "#Totals"
            });
            out.push_str("],[");
            out.push_str(column_name);
            out.push_str("]]");
        }
    }
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
        Ast::Name(name) => out.push_str(name),
        Ast::NamedRange(named) => out.push_str(&named.name),
        Ast::UnresolvedStructured(reference) => write_structured_ref(
            reference.table_name.as_deref(),
            &reference.column_name,
            reference.section,
            out,
        ),
        Ast::Structured(reference) => write_structured_ref(
            reference.qualified.then_some(reference.table_name.as_str()),
            &reference.column_name,
            reference.section,
            out,
        ),
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
        Ast::Missing => {}
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
        Ast::UnknownFunc(name, args) => {
            out.push_str(name);
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
                Op::Pow => '^',
                Op::Concat => '&',
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
        Ast::Pos(inner) => {
            out.push_str("+(");
            write_ast(inner, out);
            out.push(')');
        }
        Ast::Percent(inner) => {
            out.push('(');
            write_ast(inner, out);
            out.push_str(")%");
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
    fn absolute_reference_flags_round_trip_and_survive_structural_edits() {
        fn collect_cell_refs(ast: &Ast, refs: &mut Vec<(u32, u32, RefFlags)>) {
            match ast {
                Ast::Cell(row, col, flags) => refs.push((*row, *col, *flags)),
                Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
                    for arg in args {
                        collect_cell_refs(arg, refs);
                    }
                }
                Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                    collect_cell_refs(left, refs);
                    collect_cell_refs(right, refs);
                }
                Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                    collect_cell_refs(inner, refs);
                }
                _ => {}
            }
        }

        let mut parsed = parse("=$A$1 + A$1 + $A1").expect("formula should parse");
        let expected_flags = [
            RefFlags {
                row_abs: true,
                col_abs: true,
            },
            RefFlags {
                row_abs: true,
                col_abs: false,
            },
            RefFlags {
                row_abs: false,
                col_abs: true,
            },
        ];
        let mut refs = Vec::new();
        collect_cell_refs(&parsed, &mut refs);
        assert_eq!(refs, expected_flags.map(|flags| (0, 0, flags)).to_vec());

        let serialized = serialize(&parsed);
        assert_eq!(parse(&serialized), Ok(parsed.clone()));

        shift_rows(&mut parsed, 0, 2, 0, 0);
        refs.clear();
        collect_cell_refs(&parsed, &mut refs);
        assert_eq!(refs, expected_flags.map(|flags| (2, 0, flags)).to_vec());
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
    fn operator_precedence_is_excel_compatible_and_errors_stay_explicit() {
        assert_eq!(serialize(&parse("=-1^2").unwrap()), "=(-(1)^2)");
        assert_eq!(serialize(&parse("=2^3^2").unwrap()), "=((2^3)^2)");
        assert_eq!(serialize(&parse("=1&2+3").unwrap()), "=(1&(2+3))");
        assert_eq!(serialize(&parse("=2^2%").unwrap()), "=(2^(2)%)");
        assert!(parse("=%2").is_err());
        assert!(parse("=2^").is_err());
        assert!(parse("=2&&3").is_err());
    }

    #[test]
    fn seeded_operator_ast_round_trip_property() {
        fn generated(seed: &mut u64, depth: usize) -> Ast {
            *seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            if depth == 0 {
                return Ast::Num(((*seed >> 32) % 10_000) as f64 / 100.0);
            }
            match *seed % 9 {
                0 => Ast::Neg(Box::new(generated(seed, depth - 1))),
                1 => Ast::Pos(Box::new(generated(seed, depth - 1))),
                2 => Ast::Percent(Box::new(generated(seed, depth - 1))),
                operator => {
                    let op = match operator {
                        3 => Op::Add,
                        4 => Op::Sub,
                        5 => Op::Mul,
                        6 => Op::Div,
                        7 => Op::Pow,
                        _ => Op::Concat,
                    };
                    Ast::Bin(
                        op,
                        Box::new(generated(seed, depth - 1)),
                        Box::new(generated(seed, depth - 1)),
                    )
                }
            }
        }

        let mut seed = 0x5eed_070_u64;
        for _ in 0..512 {
            let ast = generated(&mut seed, 5);
            let source = serialize(&ast);
            assert_eq!(parse(&source), Ok(ast), "failed source: {source}");
        }
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
    #[test]
    fn function_registry_is_exact_complete_and_case_insensitive() {
        assert_eq!(FUNCTION_NAMES.len(), 155);
        assert_eq!(FUNCTION_NAMES.len() + FUNCTION_ALIASES.len(), 156);
        for registry in [FUNCTION_NAMES, FUNCTION_ALIASES] {
            for pair in registry.windows(2) {
                assert_eq!(
                    registered_name_cmp(pair[0].0, pair[1].0),
                    Ordering::Less,
                    "registry order: {} before {}",
                    pair[0].0,
                    pair[1].0
                );
            }
        }

        for &(spelling, func) in FUNCTION_NAMES.iter().chain(FUNCTION_ALIASES) {
            assert_eq!(lookup_func(spelling), Some(func), "{spelling}");
            assert_eq!(lookup_func(&spelling.to_ascii_lowercase()), Some(func), "{spelling}");
            let mixed: String = spelling
                .chars()
                .enumerate()
                .map(|(index, ch)| {
                    if index % 2 == 0 {
                        ch.to_ascii_lowercase()
                    } else {
                        ch
                    }
                })
                .collect();
            assert_eq!(lookup_func(&mixed), Some(func), "{spelling}");

            let parsed = parse(&format!("={mixed}(1)")).expect("registered call should parse");
            assert_eq!(parsed, Ast::Func(func, vec![Ast::Num(1.0)]), "{spelling}");
            assert_eq!(parse(&serialize(&parsed)), Ok(parsed), "{spelling}");
        }
        for &(spelling, func) in FUNCTION_NAMES {
            assert_eq!(func_name(func), spelling);
        }
        assert_eq!(func_name(Func::Avg), "AVG");
        assert_eq!(lookup_func("AVERAGE"), Some(Func::Avg));
        assert_eq!(lookup_func("NOT_A_FUNCTION"), None);
    }

    #[test]
    fn names_sheet_refs_and_unknown_calls_preserve_source_case() {
        assert_eq!(
            parse("=Revenue_Q1"),
            Ok(Ast::Name("Revenue_Q1".to_string()))
        );
        assert_eq!(
            parse("=Sales.Data"),
            Ok(Ast::Name("Sales.Data".to_string()))
        );

        let sheet_ref = parse("='North East'!a1").expect("quoted sheet ref should parse");
        assert_eq!(serialize(&sheet_ref), "='North East'!A1");
        assert_eq!(parse(&serialize(&sheet_ref)), Ok(sheet_ref));

        let unicode_sheet =
            parse("='München Süd'!b2").expect("UTF-8 quoted sheet ref should parse");
        assert_eq!(serialize(&unicode_sheet), "='München Süd'!B2");
        assert_eq!(parse(&serialize(&unicode_sheet)), Ok(unicode_sheet));
        assert_eq!(
            parse("=\"café\""),
            Ok(Ast::Str("café".to_string()))
        );
        assert_eq!(
            serialize(&parse("=1\u{2003}+2").expect("Unicode whitespace should parse")),
            "=(1+2)"
        );

        let unknown =
            parse("=MiXeD.Call(Revenue_Q1)").expect("unknown call should remain parseable");
        assert_eq!(
            unknown,
            Ast::UnknownFunc(
                "MiXeD.Call".to_string(),
                vec![Ast::Name("Revenue_Q1".to_string())]
            )
        );
        assert_eq!(serialize(&unknown), "=MiXeD.Call(Revenue_Q1)");
    }

    #[test]
    fn dotted_function_names_and_leading_decimal_round_trip() {
        let dotted = parse("=MODE.SNGL(.5)").expect("dotted function should parse");
        assert_eq!(
            dotted,
            Ast::Func(Func::ModeSngl, vec![Ast::Num(0.5)])
        );
        assert_eq!(parse(&serialize(&dotted)), Ok(dotted));
        assert_eq!(parse("=.5"), Ok(Ast::Num(0.5)));
        let unknown = parse("=X.TEST(1)").expect("unknown dotted function should preserve");
        assert_eq!(parse(&serialize(&unknown)), Ok(unknown));
    }
}
