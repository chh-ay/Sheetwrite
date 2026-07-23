export type CompatibilityArea =
  | "formula"
  | "reference"
  | "worksheet"
  | "view"
  | "style"
  | "validation"
  | "clipboard"
  | "xlsx-import"
  | "xlsx-export";

export type CompatibilityDialect =
  | "shared"
  | "excel"
  | "google-sheets"
  | "openformula"
  | "sheetwrite-extension";

export type CompatibilityStatus =
  | "supported"
  | "partial"
  | "roundtrip-only"
  | "warning"
  | "unsupported";

export type CompatibilityResultMode =
  | "evaluated"
  | "preserved"
  | "flattened"
  | "warning"
  | "unsupported";

export interface CompatibilityFixture {
  readonly id: string;
  readonly kind: "original-test" | "independent-xlsx" | "spec-xlsx" | "manifest";
  readonly path: string;
  readonly producer: string;
  readonly producerVersion: string;
  readonly license: string;
  readonly provenance: string;
  readonly sha256?: string;
  readonly expected: readonly string[];
  readonly expectedWarnings: readonly string[];
}

export interface CompatibilityRecord {
  readonly id: string;
  readonly label: string;
  readonly area: CompatibilityArea;
  readonly dialect: CompatibilityDialect;
  readonly status: CompatibilityStatus;
  readonly resultMode: CompatibilityResultMode;
  readonly semantics: string;
  readonly divergence: string;
  readonly source: string;
  readonly evidence: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly importBehavior: string;
  readonly exportBehavior: string;
  readonly warningCode: string | null;
  readonly lastVerifiedProtocolVersion: 3;
}

export const COMPATIBILITY_FIXTURES: readonly CompatibilityFixture[] = [
  {
    id: "formula-engine-vectors",
    kind: "original-test",
    path: "packages/wasm/src/tests.rs",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance:
      "Original parser, evaluator, dependency, and spill vectors maintained in this repository.",
    expected: ["operators", "quoted references", "FILTER/SORT/UNIQUE spills", "explicit errors"],
    expectedWarnings: [],
  },
  {
    id: "formula-document-vectors",
    kind: "original-test",
    path: "packages/core/test/formula-matrix.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance: "Original document, clipboard, history, snapshot, and spill lifecycle vectors.",
    expected: ["spill ownership", "copy", "history", "snapshot", "dependency invalidation"],
    expectedWarnings: [],
  },
  {
    id: "worksheet-lifecycle-vectors",
    kind: "original-test",
    path: "packages/core/test/sheet-lifecycle.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance: "Original stable-ID worksheet lifecycle and active-session export vectors.",
    expected: ["rename", "reorder", "visibility", "active fallback", "undo", "rebase"],
    expectedWarnings: [],
  },
  {
    id: "worksheet-xlsx-vectors",
    kind: "original-test",
    path: "packages/xlsx/test/worksheet-lifecycle.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance: "Original in-memory OOXML packages authored from ECMA-376 worksheet structures.",
    expected: [
      "canonical names",
      "quoted references",
      "visibility",
      "activeTab",
      "visible-sheet invariant",
    ],
    expectedWarnings: [],
  },
  {
    id: "libreoffice-positive",
    kind: "independent-xlsx",
    path: "packages/xlsx/test/fixtures/sheetwrite-libreoffice-positive.xlsx",
    producer: "LibreOffice",
    producerVersion: "26.2.4.2 build 64a984c51f4702dbd3710b13428c673a2f1292e7",
    license: "Fixture generated from repository-owned CSV input",
    provenance:
      "Headless LibreOffice conversion; command and source checksum are recorded in fixtures/manifest.json.",
    sha256: "cb7cba1a9a804d7115f69da5730a3186b8ea343eb959eb1e8c3e7b95d9ec3a65",
    expected: ["strings", "numbers", "date-formatted numbers", "whitespace", "multiple rows"],
    expectedWarnings: [],
  },
  {
    id: "libreoffice-rich",
    kind: "independent-xlsx",
    path: "packages/xlsx/test/fixtures/libreoffice-rich.xlsx",
    producer: "LibreOffice",
    producerVersion: "26.2.4.2 build 64a984c51f4702dbd3710b13428c673a2f1292e7",
    license: "Fixture generated from repository-owned UNO script",
    provenance:
      "Produced independently through LibreOffice UNO; generator checksum is recorded in fixtures/manifest.json.",
    sha256: "75fb643cafcbe660caaff5062423403a592fc483d3dedf8e76ad9b3a006883c2",
    expected: [
      "formulas",
      "styles",
      "merges",
      "validation",
      "notes",
      "freeze panes",
      "named range",
    ],
    expectedWarnings: ["unsupported-feature: hidden worksheet visibility"],
  },
  {
    id: "ecma-shared-formula",
    kind: "spec-xlsx",
    path: "packages/xlsx/test/fixtures/shared-formula.xlsx",
    producer: "Hand-authored ECMA-376 package",
    producerVersion: "fflate 0.8.3",
    license: "MIT",
    provenance:
      "Implementation-neutral shared-formula master/slave XML; generator checksum is recorded in fixtures/manifest.json.",
    sha256: "330da901b938e598948c13e8f1e0530b4691a67c4c23c4841c866d9bd74468a5",
    expected: ["shared formula master", "two translated slaves"],
    expectedWarnings: [],
  },
  {
    id: "xlsx-conformance-vectors",
    kind: "original-test",
    path: "packages/xlsx/test/external-conformance.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT with pinned upstream vector attribution in external-case-mapping.json",
    provenance:
      "Retyped implementation-neutral OOXML vectors; no upstream workbook bytes are redistributed.",
    expected: ["formats", "merges", "validation warnings", "notes", "views", "defined names"],
    expectedWarnings: ["exact structured unsupported-feature warnings"],
  },
  {
    id: "workbook-table-vectors",
    kind: "original-test",
    path: "packages/xlsx/test/workbook-table.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT; original vectors derived from ECMA-376 5th edition",
    provenance:
      "Original minimal OOXML table packages with ECMA-376 clause URLs and archive checksums; no producer test suite is copied.",
    expected: [
      "stable table and column IDs",
      "structured references",
      "native table parts",
      "unsupported table metadata warnings",
    ],
    expectedWarnings: ["exact unsupported table feature warnings"],
  },
  {
    id: "hyperlink-conditional-vectors",
    kind: "original-test",
    path: "packages/xlsx/test/hyperlink-conditional.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT; original vectors derived from ECMA-376 5th edition",
    provenance:
      "Original minimal OPC/SpreadsheetML vectors with ECMA-376 clause URLs and archive checksums.",
    expected: [
      "HTTPS and mailto links",
      "stable internal links",
      "bounded conditional formats",
      "round-trip style and stop precedence",
    ],
    expectedWarnings: ["unsafe hyperlink and unsupported conditional-format warnings"],
  },
  {
    id: "external-producer-manifest",
    kind: "manifest",
    path: "packages/xlsx/test/fixtures/external-corpus.json",
    producer: "Apache POI test fixtures and public Google Sheets export",
    producerVersion: "POI commit 913c78891bd0cd20945b050c63abfb8c66c88009",
    license: "Apache-2.0 for POI fixture metadata; Google workbook is not redistributed",
    provenance:
      "Pinned producer/version/checksum records; byte execution is scheduled or supplied through SHEETWRITE_EXTERNAL_XLSX_DIR.",
    expected: [
      "five Excel-family records",
      "one Google Sheets record",
      "explicit unverified features",
    ],
    expectedWarnings: ["producer claims remain partial until checksum-locked bytes execute"],
  },
  {
    id: "clipboard-vectors",
    kind: "original-test",
    path: "packages/core/test/clipboard.test.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance: "Original clipboard and delimited-text security/round-trip vectors.",
    expected: ["plain text", "HTML", "formulas", "refs", "styles", "injection neutralization"],
    expectedWarnings: [],
  },
  {
    id: "interop-browser-contract",
    kind: "original-test",
    path: "test/browser/showcase-interoperability.spec.ts",
    producer: "Sheetwrite",
    producerVersion: "v0.3 protocol 3",
    license: "MIT",
    provenance: "Real-browser contract over the optional XLSX package and public Grid APIs.",
    expected: ["fixture import", "round trip", "warnings", "limits", "package isolation"],
    expectedWarnings: ["unsupported behavior remains visible"],
  },
] as const;

export const COMPATIBILITY_INVENTORY: readonly CompatibilityRecord[] = [
  {
    id: "formula.portable-operators",
    label: "Portable arithmetic, comparison, concatenation, and percent operators",
    area: "formula",
    dialect: "shared",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "Parses and evaluates +, -, *, /, ^, &, comparisons, unary signs, and postfix percent with deterministic coercion and errors.",
    divergence:
      "This is a declared portable subset, not every Excel, Sheets, or OpenFormula coercion edge.",
    source:
      "https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html",
    evidence: ["packages/wasm/src/tests.rs", "packages/core/test/formula-matrix.test.ts"],
    fixtureIds: ["formula-engine-vectors", "formula-document-vectors"],
    importBehavior:
      "Formula source is preserved and evaluated when every token is in the portable subset.",
    exportBehavior: "Canonical formula source is emitted to XLSX without cached-value fabrication.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "formula.dynamic-arrays",
    label: "Bounded dynamic arrays and spill ranges",
    area: "formula",
    dialect: "shared",
    status: "partial",
    resultMode: "evaluated",
    semantics:
      "FILTER, SORT, UNIQUE, TRANSPOSE, SEQUENCE, TAKE, DROP, CHOOSECOLS, CHOOSEROWS, direct range arrays, spill ownership, resizing, obstruction, history, and dependency invalidation are evaluated.",
    divergence:
      "No implicit-intersection operator, spill-reference # syntax, multi-key SORT, higher-order LAMBDA array functions, or general Excel/Sheets dynamic-array family is claimed.",
    source:
      "https://support.microsoft.com/en-us/office/dynamic-array-formulas-and-spilled-array-behavior-205c6b06-03ba-4151-89a1-87a7eb36e531",
    evidence: [
      "packages/wasm/src/tests.rs",
      "packages/core/test/formula-matrix.test.ts",
      "test/browser/examples.spec.ts",
    ],
    fixtureIds: ["formula-engine-vectors", "formula-document-vectors"],
    importBehavior:
      "Recognized formulas evaluate; unknown dynamic-array syntax remains preserved source with an explicit formula error.",
    exportBehavior:
      "Anchor formula source is exported; derived spill cells are not serialized as invented formulas.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "formula.let",
    label: "Bounded lexical and lazy LET bindings",
    area: "formula",
    dialect: "excel",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "LET evaluates lexical, case-insensitive bindings lazily; inner bindings shadow outer bindings, and unused reads, errors, and volatility do not become dependencies.",
    divergence:
      "At most 126 bindings and 16,384 expanded AST nodes are admitted; LET does not define or execute reusable functions.",
    source:
      "https://support.microsoft.com/en-us/office/let-function-34842dd8-b92b-4d3f-b325-b8b8f9908999",
    evidence: ["packages/wasm/src/tests.rs", "docs/src/content/docs/guides/formulas.md"],
    fixtureIds: ["formula-engine-vectors"],
    importBehavior:
      "Recognized LET source evaluates within the bounded lexical subset; invalid names, arity, or resource expansion return explicit formula errors.",
    exportBehavior:
      "The exact formula source is preserved and emitted without a fabricated cached result.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "formula.let-lambda",
    label: "LAMBDA and reusable named functions",
    area: "formula",
    dialect: "excel",
    status: "unsupported",
    resultMode: "unsupported",
    semantics:
      "Formula source is retained, but LAMBDA and higher-order execution are not evaluated.",
    divergence:
      "LET is supported separately; no approximation, reusable named-function runtime, or JavaScript execution fallback is provided.",
    source:
      "https://support.microsoft.com/en-us/office/lambda-function-bd212d27-1cd1-4321-a34a-ccbf254b8b67",
    evidence: ["packages/wasm/src/tests.rs", "docs/src/content/docs/guides/formulas.md"],
    fixtureIds: ["formula-engine-vectors"],
    importBehavior: "Source is preserved; evaluation returns an explicit unsupported-name error.",
    exportBehavior: "Preserved source may be emitted, without a fabricated cached result.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "reference.cross-sheet-stable-id",
    label: "Quoted cross-sheet references through stable worksheet identity",
    area: "reference",
    dialect: "shared",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "Cross-sheet references resolve by stable sheet handle and survive rename and reorder with canonical quoting.",
    divergence: "External workbook links and 3-D references are unsupported.",
    source: "https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/",
    evidence: ["packages/wasm/src/tests.rs", "packages/xlsx/test/worksheet-lifecycle.test.ts"],
    fixtureIds: ["formula-engine-vectors", "worksheet-xlsx-vectors"],
    importBehavior: "Native same-workbook references map to stable worksheet IDs.",
    exportBehavior:
      "References are rendered using the current canonical sheet name and quoting rules.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "worksheet.lifecycle",
    label: "Create, rename, reorder, hide, unhide, remove, and active fallback",
    area: "worksheet",
    dialect: "shared",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "Stable IDs, canonical names, ordinary visibility, active fallback, history, rebase, persistence, and session export share one lifecycle.",
    divergence: "veryHidden is host-managed and cannot be revealed through the stock tab strip.",
    source: "https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/",
    evidence: [
      "packages/core/test/sheet-lifecycle.test.ts",
      "packages/xlsx/test/worksheet-lifecycle.test.ts",
      "test/browser/vue-workbench.spec.ts",
    ],
    fixtureIds: ["worksheet-lifecycle-vectors", "worksheet-xlsx-vectors"],
    importBehavior:
      "Valid names and visibility are retained; invalid all-hidden workbooks fail or select a visible fallback as specified.",
    exportBehavior:
      "Current Grid active state and ordinary visibility are emitted without mutating shared navigation history.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "worksheet.very-hidden",
    label: "veryHidden worksheet preservation",
    area: "worksheet",
    dialect: "excel",
    status: "roundtrip-only",
    resultMode: "preserved",
    semantics:
      "veryHidden metadata remains formula-addressable and survives snapshot/XLSX round trips.",
    divergence: "Stock worksheet tabs intentionally do not expose or unhide it.",
    source: "https://learn.microsoft.com/en-us/office/vba/api/excel.xlsheetvisibility",
    evidence: [
      "packages/xlsx/test/worksheet-lifecycle.test.ts",
      "packages/core/test/sheet-lifecycle.test.ts",
    ],
    fixtureIds: ["worksheet-xlsx-vectors", "worksheet-lifecycle-vectors"],
    importBehavior: "The visibility token is retained as host-only state.",
    exportBehavior: "The token is emitted when retained by the canonical workbook.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "xlsx.basic-values",
    label: "Independent XLSX strings, numbers, dates, and whitespace",
    area: "xlsx-import",
    dialect: "openformula",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "A LibreOffice-produced workbook with a recorded file hash imports the declared scalar and format subset without warnings.",
    divergence: "Evidence covers this file and version, not all LibreOffice documents.",
    source: "packages/xlsx/test/fixtures/manifest.json",
    evidence: [
      "packages/xlsx/test/xlsx-import.test.ts",
      "test/browser/showcase-interoperability.spec.ts",
    ],
    fixtureIds: ["libreoffice-positive", "interop-browser-contract"],
    importBehavior: "Expected cells import with zero warnings.",
    exportBehavior: "Equivalent Sheetwrite scalar cells export through the optional XLSX package.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "xlsx.rich-workbook",
    label: "Styles, merges, validation, notes, panes, names, and hidden sheets",
    area: "xlsx-import",
    dialect: "openformula",
    status: "partial",
    resultMode: "warning",
    semantics:
      "A LibreOffice-produced workbook with a recorded file hash imports the declared rich subset and exact warning boundary.",
    divergence:
      "Hidden worksheet visibility produces the recorded unsupported-feature warning for the legacy fixture path.",
    source: "packages/xlsx/test/fixtures/manifest.json",
    evidence: [
      "packages/xlsx/test/xlsx-import.test.ts",
      "packages/xlsx/test/ooxml-fidelity.test.ts",
      "test/browser/showcase-interoperability.spec.ts",
    ],
    fixtureIds: ["libreoffice-rich", "interop-browser-contract"],
    importBehavior:
      "Supported native parts become workbook data; unsupported parts emit structured warnings.",
    exportBehavior:
      "Canonical supported parts export; unknown OOXML parts are not promised lossless preservation.",
    warningCode: "unsupported-feature",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "xlsx.shared-formulas",
    label: "ECMA-376 shared formula master and translated slaves",
    area: "xlsx-import",
    dialect: "excel",
    status: "supported",
    resultMode: "evaluated",
    semantics:
      "Shared formula records expand into canonical per-cell formula source with translated relative references.",
    divergence:
      "Export writes canonical ordinary formulas rather than promising the producer's shared-record packing.",
    source: "https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/",
    evidence: ["packages/xlsx/test/xlsx-import.test.ts"],
    fixtureIds: ["ecma-shared-formula"],
    importBehavior: "Master/slave records import as three exact formula sources.",
    exportBehavior:
      "Equivalent formulas export semantically, not byte-for-byte or record-for-record.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "validation.native-subset",
    label: "Native data-validation subset",
    area: "validation",
    dialect: "excel",
    status: "partial",
    resultMode: "warning",
    semantics:
      "Declared comparison and list validations round-trip through the canonical validation model.",
    divergence:
      "Unsupported operators or extension forms are dropped with exact structured warnings.",
    source: "https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/",
    evidence: [
      "packages/xlsx/test/external-conformance.test.ts",
      "packages/core/test/grid.test.ts",
    ],
    fixtureIds: ["xlsx-conformance-vectors"],
    importBehavior:
      "Supported rules import; unsupported rules do not masquerade as supported validation.",
    exportBehavior: "Supported canonical rules emit native validation records.",
    warningCode: "unsupported-validation",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "table.native-subset",
    label: "Native workbook tables and structured references",
    area: "xlsx-import",
    dialect: "excel",
    status: "partial",
    resultMode: "warning",
    semantics:
      "Stable table and column identities, body/header/totals/current-row structured references, structural rewrites, and the declared ECMA-376 table subset are implemented.",
    divergence:
      "Auto-filter state, sort state, calculated columns, totals functions, query tables, external data, and extensions remain explicit unsupported metadata.",
    source: "https://ecma-international.org/publications-and-standards/standards/ecma-376/",
    evidence: [
      "packages/core/test/workbook-table.test.ts",
      "packages/wasm/src/tests.rs",
      "packages/xlsx/test/workbook-table.test.ts",
    ],
    fixtureIds: ["workbook-table-vectors"],
    importBehavior:
      "The bounded native table subset imports with stable identities; unsupported table features emit exact warnings.",
    exportBehavior:
      "Canonical supported tables emit native worksheet relationships and table parts without fabricating unsupported features.",
    warningCode: "unsupported-feature",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "hyperlink.safe-subset",
    label: "Host-safe external and internal hyperlinks",
    area: "xlsx-import",
    dialect: "excel",
    status: "partial",
    resultMode: "warning",
    semantics:
      "Absolute HTTPS/mailto targets and stable same-workbook sheet/range targets round-trip with bounded display and style metadata.",
    divergence:
      "Activation remains host-owned; unsafe schemes, malformed ranges, package traversal, and over-limit metadata fail closed or emit exact warnings.",
    source: "https://ecma-international.org/publications-and-standards/standards/ecma-376/",
    evidence: [
      "packages/core/test/hyperlink.test.ts",
      "packages/xlsx/test/hyperlink-conditional.test.ts",
      "packages/xlsx/test/external-conformance.test.ts",
    ],
    fixtureIds: ["hyperlink-conditional-vectors"],
    importBehavior:
      "Safe external and internal targets import without fetching; unsafe or malformed targets never enter the snapshot.",
    exportBehavior:
      "Safe external targets emit OPC relationships and internal targets emit stable worksheet locations.",
    warningCode: "hyperlink",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "conditional-format.native-subset",
    label: "Bounded native conditional formatting",
    area: "style",
    dialect: "excel",
    status: "partial",
    resultMode: "warning",
    semantics:
      "Ordered formula, comparison, contains-text, and blank predicates evaluate dependency-scoped styles with stop-if-true precedence and a 32-rule sheet limit.",
    divergence:
      "Color scales, data bars, icon sets, extended conditional formatting, and other undeclared rule kinds are not approximated.",
    source: "https://ecma-international.org/publications-and-standards/standards/ecma-376/",
    evidence: [
      "packages/core/test/conditional-format.test.ts",
      "packages/wasm/src/tests.rs",
      "packages/xlsx/test/hyperlink-conditional.test.ts",
    ],
    fixtureIds: ["hyperlink-conditional-vectors"],
    importBehavior:
      "Supported rules import in priority order; unsupported and over-limit rules emit exact warnings.",
    exportBehavior:
      "Supported rules emit native differential styles and conditional-format records.",
    warningCode: "format-loss",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "xlsx.advanced-unsupported",
    label: "Charts, macros, pivots, slicers, Power Query, and external data",
    area: "xlsx-import",
    dialect: "excel",
    status: "unsupported",
    resultMode: "unsupported",
    semantics: "Known undeclared OOXML application parts are detected rather than evaluated.",
    divergence:
      "These application features are not imported into a parallel object model and are not claimed to round-trip losslessly.",
    source: "https://ecma-international.org/publications-and-standards/standards/ecma-376/",
    evidence: [
      "packages/xlsx/test/external-conformance.test.ts",
      "packages/xlsx/test/ooxml-fidelity.test.ts",
    ],
    fixtureIds: ["xlsx-conformance-vectors"],
    importBehavior:
      "Known parts emit exact unsupported-feature warnings; unsafe packages fail closed.",
    exportBehavior: "Sheetwrite does not fabricate these application parts.",
    warningCode: "unsupported-feature",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "clipboard.delimited",
    label: "CSV/TSV and browser clipboard interchange",
    area: "clipboard",
    dialect: "shared",
    status: "partial",
    resultMode: "flattened",
    semantics:
      "Delimited export/import and HTML/plain clipboard paths preserve the declared scalar, formula, reference, and style subset with injection neutralization.",
    divergence:
      "CSV/TSV cannot represent workbook structure, formulas with cached semantics, or rich OOXML features.",
    source: "https://www.rfc-editor.org/rfc/rfc4180",
    evidence: [
      "packages/core/test/clipboard.test.ts",
      "test/browser/showcase-interoperability.spec.ts",
    ],
    fixtureIds: ["clipboard-vectors", "interop-browser-contract"],
    importBehavior:
      "Bounded delimited text becomes typed columnar data; over-limit input fails explicitly.",
    exportBehavior:
      "Leading formula-like text is neutralized and only the selected/active rectangular data is emitted.",
    warningCode: null,
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "producer.microsoft-excel",
    label: "Recorded Microsoft Excel-produced test files",
    area: "xlsx-import",
    dialect: "excel",
    status: "partial",
    resultMode: "warning",
    semantics:
      "Five producer, version, source, and file-hash records are scheduled against the optional XLSX reader.",
    divergence:
      "The workbook bytes and reviewed results are not checked in; missing files cannot support a blanket Excel claim.",
    source: "packages/xlsx/test/fixtures/external-corpus.json",
    evidence: [
      "packages/xlsx/test/external-corpus.test.ts",
      "packages/xlsx/test/fixtures/external-corpus.json",
    ],
    fixtureIds: ["external-producer-manifest"],
    importBehavior:
      "When separately supplied bytes match their recorded hashes, the scheduled check compares exact expected results and warnings. No result exists in the default checkout.",
    exportBehavior: "No Excel resave claim is made without separately captured producer evidence.",
    warningCode: "unverified-producer-evidence",
    lastVerifiedProtocolVersion: 3,
  },
  {
    id: "producer.google-sheets",
    label: "Recorded public Google Sheets export",
    area: "xlsx-import",
    dialect: "google-sheets",
    status: "warning",
    resultMode: "warning",
    semantics:
      "One non-redistributed public export has a recorded URL, producer, file hash, expected subset, and warning boundary.",
    divergence:
      "The local checkout contains metadata only; most Google Sheets workbook behaviors remain explicitly unverified.",
    source: "packages/xlsx/test/fixtures/external-corpus.json",
    evidence: [
      "packages/xlsx/test/external-corpus.test.ts",
      "test/browser/showcase-interoperability.spec.ts",
    ],
    fixtureIds: ["external-producer-manifest", "interop-browser-contract"],
    importBehavior:
      "Separately supplied bytes may verify only the declared export when the file hash matches; missing bytes display unavailable status.",
    exportBehavior: "No Google Sheets import or resave behavior is claimed.",
    warningCode: "unverified-producer-evidence",
    lastVerifiedProtocolVersion: 3,
  },
] as const;
