import { readFile, writeFile } from "node:fs/promises";
import { authoredAssertions } from "./formula-evidence.js";
import { canonicalJson, sha256 } from "./normalize.js";
import type {
  ConformanceCase,
  ConformanceCorpus,
  ConformanceManifest,
  FormulaInventory,
  FormulaInventoryFunction,
  FormulaInventoryOperator,
  FormulaSubject,
  SemanticCategory,
} from "./types.js";

export const CORPUS_PATH = "test/conformance/corpus.json";
export const MANIFEST_PATH = "test/conformance/corpus.manifest.json";
export const INVENTORY_PATH = "test/conformance/formula-contract.inventory.json";
export const MAX_CORPUS_BYTES = 2 * 1024 * 1024;
export const REQUIRED_COUNTS = { formula: 2000, mutation: 250, workbook: 100 } as const;
export const REQUIRED_CATEGORIES: readonly SemanticCategory[] = [
  "normal",
  "empty",
  "mixed",
  "error",
  "boundary",
  "range-array",
  "mutation",
];

export const MUTATION_FEATURES = [
  "edit-precedent",
  "fill-formula",
  "copy-formula",
  "insert-row",
  "delete-row",
  "insert-column",
  "delete-column",
  "rename-sheet",
  "rename-name",
  "spill-obstruction-resize",
  "undo-redo",
  "recalculate",
] as const;

export const WORKBOOK_FEATURES = [
  "sheets",
  "names",
  "visibility",
  "tables",
  "hyperlinks",
  "conditional-formats",
  "styles",
  "merges",
  "panes",
  "validation",
  "notes",
  "formulas",
  "errors",
  "warnings",
] as const;

export const FEATURE_MINIMUM = 10;

const FORMULA_CATEGORIES = REQUIRED_CATEGORIES.filter(
  (category): category is Exclude<SemanticCategory, "mutation"> => category !== "mutation",
);
const SPEC_LICENSE = "Spec metadata; MIT";
const ORIGINAL_LICENSE = "Original; MIT";
const OPENFORMULA_URL =
  "https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html";
const ECMA_376_URL =
  "https://ecma-international.org/publications-and-standards/standards/ecma-376/";

type CaseSource = ConformanceCase["source"];
type CaseWithoutChecksum = ConformanceCase;
type FormulaInputs = NonNullable<ConformanceCase["inputs"]>;

const BASE_INPUTS: FormulaInputs = [
  { cell: "A1", value: -100 },
  { cell: "A2", value: 60 },
  { cell: "A3", value: 60 },
  { cell: "B1", value: 1 },
  { cell: "B2", value: 2 },
  { cell: "B3", value: 3 },
];

const ARGUMENTS_BY_SIGNATURE: Record<string, string> = {
  address: "1,2",
  "array-unary": "A1:B2",
  "binary-number": "4,2",
  choose: '2,"a","b"',
  "choose-axis": "A1:B3,1",
  "criteria-many": 'A1:A3,">1"',
  "criteria-one": 'A1:A3,">1"',
  "date-offset": "DATE(2020,1,15),1",
  "date-pair": "DATE(2020,1,2),DATE(2020,1,1)",
  "date-three": "2020,1,2",
  filter: "A1:A3,B1:B3>2",
  "find-search": '"a","cat"',
  if: "TRUE,1,0",
  "if-error": "1,0",
  ifs: "TRUE,1",
  index: "A1:B3,1,1",
  irr: "A1:A3",
  "left-right": '"abc",1',
  let: "x,1,x",
  log: "8,2",
  "logical-variadic": "TRUE,FALSE",
  match: "60,A1:A3,0",
  mid: '"abc",2,1',
  networkdays: "DATE(2020,1,1),DATE(2020,1,3)",
  npv: "0.1,A1:A3",
  "number-value": '"1.5",".",","',
  "optional-reference": "A1",
  "optional-variadic-values": "1,2,3",
  "pair-arrays": "A1:A3,B1:B3",
  percentile: "A1:A3,0.5",
  "period-payment": "0.1,1,10,1000",
  "pv-fv-pmt": "0.1,10,-100",
  rank: "60,A1:A3,0",
  rate: "1,0,-100,110",
  "repeat-text": '"a",2',
  replace: '"abc",2,1,"x"',
  round: "1.25,1",
  sequence: "2,2",
  sort: "A1:A3",
  substitute: '"aba","a","x"',
  subtotal: "9,A1:A3",
  sumif: 'A1:A3,">1",B1:B3',
  sumifs: 'B1:B3,A1:A3,">1"',
  switch: '2,1,"a",2,"b","c"',
  "table-lookup": "-100,A1:B3,2,FALSE",
  "take-drop": "A1:B3,1",
  "text-format": '1,"0"',
  "text-join": '",",TRUE,"a","b"',
  trunc: "1.25,1",
  "unary-number": "1",
  "unary-value": "1",
  unique: "A1:A3",
  "value-k": "A1:A3,1",
  "variadic-values": "1,2,2,4",
  "weekday-weeknum": "DATE(2020,1,1)",
  workday: "DATE(2020,1,1),1",
  xlookup: "60,A1:A3,B1:B3",
  xmatch: "60,A1:A3,0",
  "yearfrac-days360": "DATE(2020,1,1),DATE(2020,7,1)",
  zero: "",
};

const ARGUMENTS_BY_FUNCTION: Record<string, string> = {
  COUNTBLANK: "A1:A3",
  DATEVALUE: '"2020-01-01"',
  TIMEVALUE: '"12:00"',
  "QUARTILE.INC": "B1:B3,2",
};

const OPERATOR_ASSERTIONS: Readonly<Record<string, readonly [string, string]>> = {
  add: ["1+2=3", "2+3=5"],
  subtract: ["5-2=3", "9-4=5"],
  multiply: ["3*4=12", "5*6=30"],
  divide: ["8/2=4", "15/3=5"],
  power: ["2^3=8", "3^2=9"],
  concatenate: ['"a"&"b"="ab"', '"x"&2="x2"'],
  equal: ["2=2", '"a"="a"'],
  "not-equal": ["2<>3", '"a"<>"b"'],
  "less-than": ["2<3", '"a"<"b"'],
  "less-than-or-equal": ["2<=2", "2<=3"],
  "greater-than": ["3>2", '"b">"a"'],
  "greater-than-or-equal": ["3>=3", "3>=2"],
  percent: ["50%=0.5", "25%=0.25"],
  "unary-plus": ["+2=2", "+7=7"],
  "unary-minus": ["-2=-2", "-7=-7"],
};

const CATEGORY_ASSERTIONS_BY_FUNCTION: Readonly<
  Record<string, Partial<Record<Exclude<SemanticCategory, "mutation" | "normal">, string>>>
> = {
  ABS: {
    empty: "ABS(C1)=0",
    mixed: "ABS(C1)=2",
    "range-array": "TYPE(ABS(C1:C2))=1",
    error: "ISERROR(ABS(1/0))",
    boundary: "ABS(C1)=0",
  },
  LET: {
    empty: "LET(x,C1,N(x))=0",
    mixed: 'LET(x,C1,T(x))="2"',
    error: "ISERROR(LET(x,1/0,x))",
    boundary: "LET(x,C1,x)=0",
    "range-array": "LET(x,SUM(C1:C2),x)=3",
  },
  IFERROR: { error: "IFERROR(1/0,0)=0" },
  ISERROR: { error: "ISERROR(1/0)=TRUE" },
  ISERR: { error: "ISERR(1/0)=TRUE" },
  ISNA: { error: "ISNA(1/0)=FALSE" },
  TYPE: { error: "TYPE(1/0)=16" },
  ISBLANK: { empty: "ISBLANK(C1)", error: "NOT(ISBLANK(1/0))" },
  ISNUMBER: { empty: "NOT(ISNUMBER(C1))", error: "NOT(ISNUMBER(1/0))" },
  ISTEXT: { error: "NOT(ISTEXT(1/0))" },
  ISLOGICAL: { error: "NOT(ISLOGICAL(1/0))" },
  COUNTA: { mixed: "COUNTA(C1,2,3)=3" },
  COUNTBLANK: { empty: "COUNTBLANK(C1)=1", mixed: "COUNTBLANK(C1)=0" },
  SUMPRODUCT: { empty: "SUMPRODUCT(C1,2,2,4)=0", mixed: "SUMPRODUCT(C1,2,2,4)=32" },
  SUBTOTAL: { mixed: "SUBTOTAL(C1,A1:A3)=3" },
  LARGE: { mixed: "LARGE(C1,1)=2" },
  SMALL: { mixed: "SMALL(C1,1)=2" },
  "PERCENTILE.INC": { mixed: "PERCENTILE.INC(C1,0.5)=2" },
  "QUARTILE.INC": { mixed: "QUARTILE.INC(C1,2)=2" },
  COUNTIF: { boundary: 'COUNTIF(C1,">1")=0' },
  COUNTIFS: { boundary: 'COUNTIFS(C1,">1")=0' },
  INDEX: { boundary: "INDEX(C1,1,1)=0" },
  ROW: { boundary: "ROW(C1)=1" },
  ROWS: { boundary: "ROWS(C1)=1" },
  COLUMN: { boundary: "COLUMN(C1)=3" },
  COLUMNS: { boundary: "COLUMNS(C1)=1" },
  T: { "range-array": "TYPE(T(C1:C2))=16" },
};

const DIRECT_ERROR_EXPECTATIONS: Readonly<
  Partial<Record<Exclude<SemanticCategory, "mutation" | "normal">, ReadonlySet<string>>>
> = {
  empty: new Set(
    "IFS DATEVALUE SUMIF SUMIFS AVERAGEIF AVERAGEIFS MATCH VLOOKUP HLOOKUP XLOOKUP FILTER SORT UNIQUE LN LOG LOG10 SUBTOTAL REPLACE VALUE CHAR CODE UNICHAR UNICODE NUMBERVALUE TIMEVALUE WEEKNUM LARGE SMALL RANK.EQ PERCENTILE.INC QUARTILE.INC CORREL COVARIANCE.S COVARIANCE.P MAXIFS MINIFS XMATCH CHOOSE ADDRESS TRANSPOSE SEQUENCE TAKE DROP CHOOSECOLS CHOOSEROWS IRR RATE".split(
      " ",
    ),
  ),
  mixed: new Set(
    "IF AND OR NOT IFS XOR DATEVALUE SUMIF SUMIFS AVERAGEIF AVERAGEIFS MATCH VLOOKUP HLOOKUP XLOOKUP FILTER SORT UNIQUE FIND SEARCH TIMEVALUE RANK.EQ CORREL COVARIANCE.S COVARIANCE.P MAXIFS MINIFS XMATCH TRANSPOSE TAKE DROP CHOOSECOLS CHOOSEROWS IRR".split(
      " ",
    ),
  ),
  boundary: new Set(
    "IFS DATEVALUE SUMIF SUMIFS AVERAGEIF AVERAGEIFS MATCH VLOOKUP HLOOKUP XLOOKUP FILTER SORT UNIQUE LN LOG LOG10 SUBTOTAL FIND SEARCH CHAR UNICHAR TIMEVALUE WEEKNUM RANK.EQ GEOMEAN CORREL COVARIANCE.S COVARIANCE.P MAXIFS MINIFS XMATCH CHOOSE ADDRESS TRANSPOSE SEQUENCE TAKE DROP CHOOSECOLS CHOOSEROWS IRR RATE".split(
      " ",
    ),
  ),
  "range-array": new Set(
    "IF IFNA IFS SWITCH N DATEVALUE SUMIF SUMIFS AVERAGEIF AVERAGEIFS MATCH VLOOKUP HLOOKUP XLOOKUP FILTER SUMPRODUCT FIND SEARCH TIMEVALUE RANK.EQ CORREL COVARIANCE.S COVARIANCE.P MAXIFS MINIFS XMATCH CHOOSE ADDRESS SEQUENCE IRR".split(
      " ",
    ),
  ),
};

interface CategoryContract {
  blank: string;
  text: string;
  range: string;
}

interface InventorySubject {
  subject: FormulaSubject;
  family: string;
  source: CaseSource;
  assertions: readonly [string, string];
  argumentsSource: string;
  operator?: FormulaInventoryOperator;
  inputs: FormulaInputs;
  categoryContract?: CategoryContract;
}

function sourceWithChecksum(source: Omit<CaseSource, "sha256">): CaseSource {
  return { ...source, sha256: sha256(source) };
}

function finalizedCase(entry: CaseWithoutChecksum): ConformanceCase {
  return entry;
}

function assertInventory(inventory: FormulaInventory): void {
  if (inventory.contract !== "sheetwrite.formula-capabilities" || inventory.version !== 1) {
    throw new Error("Formula inventory contract/version is invalid");
  }
  if (!Array.isArray(inventory.functions) || !Array.isArray(inventory.operators)) {
    throw new Error("Formula inventory must declare typed function and operator denominators");
  }
  const names = new Set<string>();
  for (const entry of [...inventory.functions, ...inventory.operators]) {
    const kind = "token" in entry ? "operator" : "function";
    if (entry.contractStatus !== "supported" && entry.contractStatus !== "required-supported") {
      throw new Error(`${kind} ${entry.canonical}: unsupported inventory entry in supported list`);
    }
    const identity = `${kind}:${entry.canonical}`;
    if (names.has(identity)) throw new Error(`Duplicate inventory identity ${identity}`);
    names.add(identity);
    if (!inventory.families[entry.family]) {
      throw new Error(`${identity}: missing inventory family ${entry.family}`);
    }
  }
}

export function supportedInventorySubjects(inventory: FormulaInventory): InventorySubject[] {
  assertInventory(inventory);
  const functions = inventory.functions.map((entry: FormulaInventoryFunction): InventorySubject => {
    const family = inventory.families[entry.family];
    if (!family) throw new Error(`function:${entry.canonical}: missing family ${entry.family}`);
    const source = inventory.sources[family.source];
    if (!source) throw new Error(`function:${entry.canonical}: missing source ${family.source}`);
    const argumentsSource =
      ARGUMENTS_BY_FUNCTION[entry.canonical] ?? ARGUMENTS_BY_SIGNATURE[entry.signature];
    if (argumentsSource === undefined) {
      throw new Error(
        `function:${entry.canonical}: signature ${entry.signature} has no independent probe`,
      );
    }
    const semantics = inventory.semanticsProfiles[entry.semantics] as
      | {
          shape?: { range?: string };
          coercion?: { blank?: string; text?: string };
        }
      | undefined;
    if (
      typeof semantics?.shape?.range !== "string" ||
      typeof semantics.coercion?.blank !== "string" ||
      typeof semantics.coercion.text !== "string"
    ) {
      throw new Error(`function:${entry.canonical}: incomplete category semantics profile`);
    }
    return {
      subject: { kind: "function", name: entry.canonical },
      family: entry.family,
      source: sourceWithChecksum({
        title: source.title,
        section: family.section,
        url: source.link,
        license: SPEC_LICENSE,
        authorship: "spec-derived",
      }),
      assertions: authoredAssertions(entry.canonical),
      argumentsSource,
      inputs: /[AB][1-3](?::[AB][1-3])?/.test(
        `${argumentsSource},${authoredAssertions(entry.canonical).join(",")}`,
      )
        ? BASE_INPUTS
        : [],
      categoryContract: {
        blank: semantics.coercion.blank,
        text: semantics.coercion.text,
        range: semantics.shape.range,
      },
    };
  });
  const operators = inventory.operators.map((entry): InventorySubject => {
    const source = inventory.sources[entry.source];
    if (!source) throw new Error(`operator:${entry.canonical}: missing source ${entry.source}`);
    const assertions = OPERATOR_ASSERTIONS[entry.canonical];
    if (!assertions) throw new Error(`Missing authored operator assertions for ${entry.canonical}`);
    return {
      subject: { kind: "operator", name: entry.canonical },
      family: entry.family,
      source: sourceWithChecksum({
        title: source.title,
        section: entry.section,
        url: source.link,
        license: SPEC_LICENSE,
        authorship: "spec-derived",
      }),
      assertions,
      argumentsSource: "",
      operator: entry,
      inputs: [],
    };
  });
  return [...functions, ...operators];
}

function replaceFirstArgument(argumentsSource: string, replacement: string): string {
  if (argumentsSource.length === 0) return argumentsSource;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < argumentsSource.length; index++) {
    const character = argumentsSource[index]!;
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === "(") depth += 1;
    else if (!quoted && character === ")") depth -= 1;
    else if (!quoted && depth === 0 && character === ",") {
      return `${replacement}${argumentsSource.slice(index)}`;
    }
  }
  return replacement;
}

function removeFirstArgument(argumentsSource: string): string {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < argumentsSource.length; index++) {
    const character = argumentsSource[index]!;
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === "(") depth += 1;
    else if (!quoted && character === ")") depth -= 1;
    else if (!quoted && depth === 0 && character === ",") {
      return argumentsSource.slice(index + 1);
    }
  }
  return "";
}

function operatorCategoryExpression(
  operator: FormulaInventoryOperator,
  replacement: string,
): string {
  if (operator.fixity === "prefix") return `${operator.token}${replacement}`;
  if (operator.fixity === "postfix") return `${replacement}${operator.token}`;
  return `${replacement}${operator.token}1`;
}

function categoryFormula(
  category: Exclude<SemanticCategory, "mutation">,
  subject: InventorySubject,
  variant: 0 | 1,
): { formula: string; inputs: FormulaInputs; oracle: string; unsupported?: true } {
  const assertion = subject.assertions[variant];
  if (category === "normal") {
    return {
      formula: `=${assertion}`,
      inputs: subject.inputs,
      oracle: "Authored documented result.",
    };
  }
  if (subject.subject.kind === "function" && subject.argumentsSource.length === 0) {
    return {
      formula: `=${assertion}`,
      inputs: subject.inputs,
      oracle: "Category is not applicable to a zero-argument function.",
      unsupported: true,
    };
  }
  const categoryInputs: FormulaInputs =
    category === "mixed"
      ? [{ cell: "C1", value: "2" }]
      : category === "boundary"
        ? [{ cell: "C1", value: 0 }]
        : category === "range-array"
          ? [
              { cell: "C1", value: 1 },
              { cell: "C2", value: 2 },
            ]
          : [];
  const directOverride =
    subject.subject.kind === "function"
      ? CATEGORY_ASSERTIONS_BY_FUNCTION[subject.subject.name]?.[category]
      : undefined;
  let property = directOverride;
  if (!property && subject.subject.kind === "operator") {
    const operator = subject.operator!;
    if (category === "error") {
      property = `ISERROR(${operatorCategoryExpression(operator, "1/0")})`;
    } else {
      const replacement = category === "range-array" ? "SUM(C1:C2)" : "C1";
      const baseline =
        category === "range-array"
          ? "3"
          : category === "mixed"
            ? operator.token === "&" || ["=", "<>", "<", "<=", ">", ">="].includes(operator.token)
              ? '"2"'
              : "2"
            : category === "empty" && operator.token === "&"
              ? '""'
              : "0";
      property = `IFERROR((${operatorCategoryExpression(operator, replacement)})=(${operatorCategoryExpression(operator, baseline)}),FALSE)`;
    }
  }
  if (!property) {
    const contract = subject.categoryContract!;
    const directArgument =
      category === "error" ? "1/0" : category === "range-array" ? "C1:C2" : "C1";
    const directArguments = replaceFirstArgument(subject.argumentsSource, directArgument);
    const direct = `${subject.subject.name}(${directArguments})`;
    if (DIRECT_ERROR_EXPECTATIONS[category]?.has(subject.subject.name)) {
      property = `ISERROR(${direct})`;
    } else if (category === "error") {
      property = `ISERROR(${direct})`;
    } else if (category === "range-array") {
      property = contract.range === "rejected" ? `ISERROR(${direct})` : `NOT(ISERROR(${direct}))`;
    } else if (category === "mixed" && contract.text === "function-defined") {
      property = `NOT(ISERROR(${direct}))`;
    } else if (category === "empty" && contract.blank === "function-defined") {
      property = `NOT(ISERROR(${direct}))`;
    } else {
      let baselineArguments: string;
      if (
        (category === "empty" && contract.blank === "ignored") ||
        (category === "mixed" && contract.text === "ignored-in-ranges")
      ) {
        baselineArguments = removeFirstArgument(subject.argumentsSource);
      } else {
        const baselineArgument =
          category === "mixed"
            ? contract.text === "number-if-parseable"
              ? "2"
              : '"2"'
            : category === "empty"
              ? contract.blank === "empty-text"
                ? '""'
                : contract.blank === "false"
                  ? "FALSE"
                  : "0"
              : "0";
        baselineArguments = replaceFirstArgument(subject.argumentsSource, baselineArgument);
      }
      property = `IFERROR((${direct})=(${subject.subject.name}(${baselineArguments})),FALSE)`;
    }
  }
  return {
    formula: `=AND(${assertion},${property})`,
    inputs: [...subject.inputs, ...categoryInputs],
    oracle: "Authored result and direct coercion/shape property.",
  };
}

function generatedFormulaCases(inventory: FormulaInventory, count: number): ConformanceCase[] {
  const subjects = supportedInventorySubjects(inventory);
  const primary = subjects.flatMap((subject) =>
    FORMULA_CATEGORIES.map((category) => ({ subject, category, variant: 0 as const })),
  );
  if (subjects.length === 0 || count < primary.length || count > primary.length * 2) {
    throw new Error(
      `Formula denominator ${count} must cover ${subjects.length} supported subjects across authored categories`,
    );
  }
  const secondary = subjects.flatMap((subject) =>
    FORMULA_CATEGORIES.map((category) => ({ subject, category, variant: 1 as const })),
  );
  return [...primary, ...secondary].slice(0, count).map((descriptor) => {
    const { subject, category, variant } = descriptor;
    const property = categoryFormula(category, subject, variant);
    const stableName = subject.subject.name.toLowerCase();
    return finalizedCase({
      id: `formula.${subject.subject.kind}.${stableName}.${category}.${variant + 1}`,
      area: "formula",
      dialect: "shared",
      category,
      family: subject.family,
      kind: "formula",
      subject: subject.subject,
      source: subject.source,
      evidence: { kind: "property", basis: "documented-semantics", oracle: property.oracle },
      tolerance: { kind: "exact" },
      inputs: property.inputs,
      formula: property.formula,
      target: "D4",
      expected: property.unsupported ? { type: "unsupported" } : { type: "boolean", value: true },
      observations: [],
      ...(property.unsupported ? { unsupported: true } : {}),
    });
  });
}

function documentSource(section: string): CaseSource {
  return sourceWithChecksum({
    title: "ECMA-376 Office Open XML File Formats",
    section,
    url: ECMA_376_URL,
    license: ORIGINAL_LICENSE,
    authorship: "original",
  });
}

function featureSequences(features: readonly string[], count: number, minLength = 1): string[][] {
  const sequences: string[][] = [];
  const seen = new Set<string>();
  for (const reverse of [false, true]) {
    for (let length = minLength; length <= features.length; length++) {
      for (let offset = 0; offset < features.length; offset++) {
        const sequence = Array.from(
          { length },
          (_, index) => features[(offset + index) % features.length]!,
        );
        if (reverse) sequence.reverse();
        const key = sequence.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        sequences.push(sequence);
        if (sequences.length === count) return sequences;
      }
    }
  }
  throw new Error(`Only ${sequences.length} unique operation shapes for ${count} cases`);
}

function generatedMutationCases(count: number): ConformanceCase[] {
  return featureSequences(MUTATION_FEATURES, count, 2).map((shape, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    return finalizedCase({
      id: `mutation.sequence.${sequence}`,
      area: "mutation",
      feature: "mutation-matrix",
      dialect: "shared",
      category: "mutation",
      family: "document-mutation",
      kind: "mutation",
      source: documentSource("Part 1, 18.3 worksheet state transitions"),
      evidence: {
        kind: "property",
        basis: "property-invariant",
        oracle: "Each declared mutation must produce its independently modeled invariant.",
      },
      tolerance: { kind: "exact" },
      operations: shape.map((op) => ({ op })),
      expected: {
        type: "workbook",
        value: { passed: shape.length },
      },
      observations: [],
    });
  });
}

function generatedWorkbookCases(count: number): ConformanceCase[] {
  return featureSequences(WORKBOOK_FEATURES, count).map((shape, index) => {
    const scenario = String(index + 1).padStart(3, "0");
    return finalizedCase({
      id: `workbook.scenario.${scenario}`,
      area: "workbook",
      feature: "workbook-matrix",
      dialect: "shared",
      category: index % 2 === 0 ? "normal" : "boundary",
      family: "workbook-state",
      kind: "workbook",
      source: documentSource("Part 1, 18.2 workbook and worksheet metadata"),
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle: "Each declared workbook feature must survive its explicit document operation.",
      },
      tolerance: { kind: "exact" },
      operations: shape.map((op) => ({ op })),
      expected: {
        type: "workbook",
        value: { passed: shape.length },
      },
      observations: [],
    });
  });
}

function openFormulaSource(section: string): CaseSource {
  return sourceWithChecksum({
    title: "OpenDocument v1.3 Part 4 OpenFormula",
    section,
    url: OPENFORMULA_URL,
    license: SPEC_LICENSE,
    authorship: "spec-derived",
  });
}

function canaryCases(inventory: FormulaInventory): ConformanceCase[] {
  const subjects = new Map(
    supportedInventorySubjects(inventory).map((entry) => [
      `${entry.subject.kind}:${entry.subject.name}`,
      entry,
    ]),
  );
  const formulaCanary = (entry: Omit<CaseWithoutChecksum, "localCanary">): ConformanceCase =>
    finalizedCase({ ...entry, localCanary: true });
  const subject = (kind: FormulaSubject["kind"], name: string): InventorySubject => {
    const value = subjects.get(`${kind}:${name}`);
    if (!value)
      throw new Error(`Canary subject ${kind}:${name} is absent from the typed inventory`);
    return value;
  };
  const add = subject("operator", "add");
  const ifFunction = subject("function", "IF");
  const countif = subject("function", "COUNTIF");
  const vlookup = subject("function", "VLOOKUP");
  const filter = subject("function", "FILTER");
  const dateSource = sourceWithChecksum({
    title: "Date systems in Excel",
    section: "The 1900 date system",
    url: "https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487",
    license: SPEC_LICENSE,
    authorship: "spec-derived",
  });
  return [
    formulaCanary({
      id: "canary.arithmetic.1-plus-1",
      area: "formula",
      dialect: "shared",
      category: "normal",
      family: add.family,
      kind: "formula",
      subject: add.subject,
      source: add.source,
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle: "Integer addition has the exact identity 1 + 1 = 2.",
      },
      tolerance: { kind: "exact" },
      inputs: [],
      formula: "=1+1",
      target: "A1",
      expected: { type: "number", value: 2 },
      observations: [],
    }),
    formulaCanary({
      id: "canary.date.serial-60",
      area: "formula",
      dialect: "excel",
      category: "boundary",
      family: add.family,
      kind: "formula",
      subject: add.subject,
      source: dateSource,
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle:
          "The raw serial is preserved while the local formatter uses its documented date fallback.",
      },
      tolerance: { kind: "exact" },
      inputs: [],
      formula: "=60+0",
      numberFormat: "yyyy-mm-dd",
      target: "B1",
      expected: { type: "number", value: 60, displayedText: "1900-02-28" },
      knownDivergence: {
        reason:
          "Excel's synthetic serial 60 displays as 1900-02-29; Sheetwrite preserves the raw serial and uses the documented JavaScript-date fallback 1900-02-28.",
        producers: ["excel-desktop", "excel-web"],
        alternate: { type: "number", value: 60, displayedText: "1900-02-29" },
      },
      observations: [],
    }),
    formulaCanary({
      id: "canary.if.lazy-error-branch",
      area: "formula",
      dialect: "shared",
      category: "error",
      family: ifFunction.family,
      kind: "formula",
      subject: ifFunction.subject,
      source: openFormulaSource("6.15.4 IF"),
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle: "IF does not evaluate the unselected division-by-zero branch.",
      },
      tolerance: { kind: "exact" },
      inputs: [],
      formula: "=IF(FALSE,1/0,7)",
      target: "A1",
      expected: { type: "number", value: 7 },
      observations: [],
    }),
    formulaCanary({
      id: "canary.criteria.wildcard",
      area: "formula",
      dialect: "shared",
      category: "range-array",
      family: countif.family,
      kind: "formula",
      subject: countif.subject,
      source: openFormulaSource("6.10.9 COUNTIF"),
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle: "Only alpha in the independently supplied range matches the a* wildcard.",
      },
      tolerance: { kind: "exact" },
      inputs: [
        { cell: "A1", value: "alpha" },
        { cell: "A2", value: "beta" },
      ],
      formula: '=COUNTIF(A1:A2,"a*")',
      target: "B1",
      expected: { type: "number", value: 1 },
      observations: [],
    }),
    formulaCanary({
      id: "canary.lookup.not-found",
      area: "formula",
      dialect: "shared",
      category: "error",
      family: vlookup.family,
      kind: "formula",
      subject: vlookup.subject,
      source: openFormulaSource("6.14.12 VLOOKUP"),
      evidence: {
        kind: "property",
        basis: "documented-semantics",
        oracle: "An exact lookup for z in the independently supplied a/b table has no match.",
      },
      tolerance: { kind: "exact" },
      inputs: [
        { cell: "A1", value: "a" },
        { cell: "B1", value: 1 },
        { cell: "A2", value: "b" },
        { cell: "B2", value: 2 },
      ],
      formula: '=VLOOKUP("z",A1:B2,2,FALSE)',
      target: "C1",
      expected: { type: "error", error: "#N/A" },
      observations: [],
    }),
    formulaCanary({
      id: "canary.spill.obstruction",
      area: "formula",
      dialect: "shared",
      category: "range-array",
      family: filter.family,
      kind: "formula",
      subject: filter.subject,
      source: filter.source,
      evidence: {
        kind: "property",
        basis: "property-invariant",
        oracle: "A pre-existing C2 literal blocks the selected two-row spill rooted at C1.",
      },
      tolerance: { kind: "exact" },
      inputs: [
        { cell: "A1", value: 1 },
        { cell: "A2", value: 2 },
        { cell: "B1", value: true },
        { cell: "B2", value: true },
        { cell: "C2", value: "blocker" },
      ],
      formula: "=FILTER(A1:A2,B1:B2)",
      target: "C1",
      expected: { type: "error", error: "#SPILL!" },
      observations: [],
    }),
    formulaCanary({
      id: "canary.workbook.roundtrip",
      area: "workbook",
      feature: "workbook-canary",
      dialect: "shared",
      category: "mutation",
      family: "workbook-state",
      kind: "workbook",
      source: documentSource("Part 1, 18.2 workbook and worksheet identity"),
      evidence: {
        kind: "property",
        basis: "property-invariant",
        oracle: "One create and one set operation yield one visible Canary sheet containing A1=2.",
      },
      tolerance: { kind: "exact" },
      operations: [
        { op: "create-sheet", name: "Canary" },
        { op: "set", cell: "A1", value: 2 },
      ],
      expected: {
        type: "workbook",
        value: {
          activeSheet: "Canary",
          sheetCount: 1,
          sheets: [{ name: "Canary", visibility: "visible", cells: { A1: 2 } }],
        },
      },
      observations: [],
    }),
  ];
}

export function supportedNamesChecksum(inventory: FormulaInventory): string {
  const names = supportedInventorySubjects(inventory)
    .map(({ subject }) => `${subject.kind}:${subject.name}`)
    .sort();
  return sha256(names);
}

export function generateConformanceEvidence(inventory: FormulaInventory): {
  corpus: ConformanceCorpus;
  manifest: ConformanceManifest;
} {
  const canaries = canaryCases(inventory);
  const formulaCanaries = canaries.filter((entry) => entry.area === "formula").length;
  const workbookCanaries = canaries.filter((entry) => entry.area === "workbook").length;
  const generatedFormulas = generatedFormulaCases(
    inventory,
    REQUIRED_COUNTS.formula - formulaCanaries,
  );
  const mutations = generatedMutationCases(REQUIRED_COUNTS.mutation);
  const workbooks = generatedWorkbookCases(REQUIRED_COUNTS.workbook - workbookCanaries);
  const corpus: ConformanceCorpus = {
    protocol: 1,
    license: "MIT; original vectors derived independently from cited public specifications",
    cases: [...canaries, ...generatedFormulas, ...mutations, ...workbooks],
  };
  const operationShapes = corpus.cases
    .filter((entry) => entry.area === "mutation" || entry.area === "workbook")
    .map((entry) => ({
      id: entry.id,
      operations: (entry.operations ?? []).map((operation) => String(operation.op)),
    }));
  const featureCounts: Record<string, number> = {};
  for (const shape of operationShapes) {
    for (const feature of shape.operations) {
      featureCounts[feature] = (featureCounts[feature] ?? 0) + 1;
    }
  }
  const sortedFeatureCounts = Object.fromEntries(
    Object.entries(featureCounts).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const manifest: ConformanceManifest = {
    protocol: 1,
    generator: "sheetwrite.conformance.original-evidence",
    generatorVersion: 1,
    corpusPath: CORPUS_PATH,
    corpusSha256: sha256(corpus),
    inventoryPath: INVENTORY_PATH,
    inventorySha256: sha256(inventory),
    supportedNamesSha256: supportedNamesChecksum(inventory),
    categoriesSha256: sha256([...REQUIRED_CATEGORIES].sort()),
    operationShapesSha256: sha256(operationShapes),
    featureCounts: sortedFeatureCounts,
    caseSha256: corpus.cases.map((entry) => sha256(entry)),
    counts: {
      formula: corpus.cases.filter((entry) => entry.area === "formula").length,
      mutation: corpus.cases.filter((entry) => entry.area === "mutation").length,
      workbook: corpus.cases.filter((entry) => entry.area === "workbook").length,
      localCanary: corpus.cases.filter((entry) => entry.localCanary === true).length,
      supportedFunctions: inventory.functions.length,
      supportedOperators: inventory.operators.length,
    },
    minimums: REQUIRED_COUNTS,
  };
  return { corpus, manifest };
}

export async function readFormulaInventory(path = INVENTORY_PATH): Promise<FormulaInventory> {
  return JSON.parse(await readFile(path, "utf8")) as FormulaInventory;
}

export async function readConformanceManifest(path = MANIFEST_PATH): Promise<ConformanceManifest> {
  return JSON.parse(await readFile(path, "utf8")) as ConformanceManifest;
}

export async function writeConformanceEvidence(
  inventoryPath = INVENTORY_PATH,
  corpusPath = CORPUS_PATH,
  manifestPath = MANIFEST_PATH,
): Promise<ConformanceManifest> {
  const inventory = await readFormulaInventory(inventoryPath);
  const { corpus, manifest } = generateConformanceEvidence(inventory);
  const corpusBytes = `${canonicalJson(corpus)}\n`;
  if (Buffer.byteLength(corpusBytes) > MAX_CORPUS_BYTES) {
    throw new RangeError(`Generated corpus exceeds ${MAX_CORPUS_BYTES} bytes`);
  }
  await Promise.all([
    writeFile(corpusPath, corpusBytes),
    writeFile(manifestPath, `${canonicalJson(manifest)}\n`),
  ]);
  return manifest;
}
