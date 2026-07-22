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
  dialect: "shared" | "excel" | "google-sheets" | "openformula";
  kind: "formula" | "workbook";
  source: {
    title: string;
    section: string;
    url?: string;
    sha256?: string;
    license: string;
    authorship: "original" | "spec-derived" | "producer-observation";
    notice?: string;
  };
  inputs?: Array<{ cell: string; value: CellScalar }>;
  numberFormat?: string;
  formula?: string;
  target?: string;
  operations?: Array<Record<string, unknown>>;
  expected: ConformanceResult;
  observations: ConformanceObservation[];
  knownDivergence?: KnownDivergence;
  unsupported?: boolean;
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
  deferred: number;
  warnings: string[];
  unsupported: string[];
}
