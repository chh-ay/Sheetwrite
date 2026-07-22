import type { CellScalar } from "../../packages/core/src/types/cell.js";

export type ResultType =
  | "blank"
  | "boolean"
  | "number"
  | "string"
  | "error"
  | "array"
  | "workbook"
  | "unsupported";

export type ConformanceProducer =
  | "excel-desktop"
  | "excel-web"
  | "google-sheets"
  | "libreoffice"
  | "sheetwrite";

export interface ConformanceResult {
  type: ResultType;
  value?: unknown;
  error?: string;
  rows?: number;
  columns?: number;
  displayedText?: string;
  formula?: string;
  tolerance?: { kind: "absolute" | "relative" | "ulp"; value: number };
}

export type SemanticCategory =
  | "normal"
  | "empty"
  | "mixed"
  | "error"
  | "boundary"
  | "range-array"
  | "mutation";

export interface CaseTolerance {
  kind: "exact" | "absolute" | "relative" | "ulp";
  value?: number;
}

export interface EvidenceDescriptor {
  kind: "property" | "metamorphic" | "pinned-observation";
  basis: "documented-semantics" | "property-invariant" | "producer-observation";
  oracle: string;
}

export interface FormulaSubject {
  kind: "function" | "operator";
  name: string;
}

export interface FormulaInventoryFunction {
  canonical: string;
  family: string;
  signature: string;
  semantics: string;
  contractStatus: "supported" | "required-supported";
  [key: string]: unknown;
}

export interface FormulaInventoryOperator {
  canonical: string;
  token: string;
  fixity: "prefix" | "infix" | "postfix";
  family: "operator";
  contractStatus: "supported" | "required-supported";
  source: string;
  section: string;
  [key: string]: unknown;
}

export interface FormulaInventory {
  contract: "sheetwrite.formula-capabilities";
  version: 1;
  sources: Record<string, { title: string; link: string }>;
  families: Record<string, { title: string; source: string; section: string }>;
  semanticsProfiles: Record<string, unknown>;
  functions: FormulaInventoryFunction[];
  operators: FormulaInventoryOperator[];
  [key: string]: unknown;
}

export interface ConformanceManifest {
  protocol: 1;
  generator: "sheetwrite.conformance.original-evidence";
  generatorVersion: 1;
  corpusPath: string;
  corpusSha256: string;
  inventoryPath: string;
  inventorySha256: string;
  supportedNamesSha256: string;
  categoriesSha256: string;
  operationShapesSha256: string;
  featureCounts: Record<string, number>;
  caseSha256: string[];
  counts: {
    formula: number;
    mutation: number;
    workbook: number;
    localCanary: number;
    supportedFunctions: number;
    supportedOperators: number;
  };
  minimums: {
    formula: 2000;
    mutation: 250;
    workbook: 100;
  };
}

export interface ConformanceObservation {
  producer: ConformanceProducer;
  producerVersion: string;
  capturedAt: string;
  status: "reviewed" | "provisional" | "unavailable";
  result?: ConformanceResult;
  artifactSha256?: string;
  notes?: string;
}

export interface KnownDivergence {
  reason: string;
  producers: ConformanceProducer[];
  alternate: ConformanceResult;
}

export interface ConformanceCase {
  id: string;
  area: "formula" | "mutation" | "workbook" | "xlsx";
  feature?: string;
  dialect: "shared" | "excel" | "google-sheets" | "openformula";
  category: SemanticCategory;
  family: string;
  kind: "formula" | "mutation" | "workbook";
  subject?: FormulaSubject;
  source: {
    title: string;
    section: string;
    url: string;
    sha256: string;
    license: string;
    authorship: "original" | "spec-derived" | "producer-observation";
    notice?: string;
  };
  evidence: EvidenceDescriptor;
  tolerance: CaseTolerance;
  inputs?: Array<{ cell: string; value: CellScalar }>;
  numberFormat?: string;
  formula?: string;
  target?: string;
  operations?: Array<Record<string, unknown>>;
  expected: ConformanceResult;
  observations: ConformanceObservation[];
  knownDivergence?: KnownDivergence;
  unsupported?: boolean;
  localCanary?: boolean;
}

export interface ConformanceCorpus {
  protocol: 1;
  license: string;
  cases: ConformanceCase[];
}

export interface CaptureObservation {
  caseId: string;
  result: ConformanceResult;
}

export interface CaptureArtifact {
  protocol: 1;
  producer: ConformanceProducer;
  producerVersion: string;
  capturedAt: string;
  observations: CaptureObservation[];
  [key: string]: unknown;
}

export interface OfflineConformanceResult {
  status: "verified" | "blocked";
  checked: number;
  reviewed: number;
  localCanaries: number;
  deferred: number;
  warnings: string[];
  unsupported: string[];
}
