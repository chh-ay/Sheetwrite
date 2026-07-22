import { captureExcel } from "./conformance/adapters/excel.js";
import { captureGoogle } from "./conformance/adapters/google.js";
import { loadCorpus } from "./conformance/corpus.js";
import { writeConformanceEvidence } from "./conformance/generate.js";
import { sha256 } from "./conformance/normalize.js";
import { runOffline } from "./conformance/offline.js";
import { captureLibreOfficeWorkbookRoundtrips } from "./conformance/roundtrip.js";

export { validateExcelCapture } from "./conformance/adapters/excel.js";
export type {
  GoogleCaptureDependencies,
  GoogleWorkbookManifest,
} from "./conformance/adapters/google.js";
export {
  captureGoogleWithDependencies,
  MAX_GOOGLE_ARRAY_ENVELOPE_CELLS,
  MAX_GOOGLE_CASES_PER_WORKBOOK,
  validateGoogleCaptureArtifact,
} from "./conformance/adapters/google.js";
export { runSheetwriteCase } from "./conformance/adapters/sheetwrite.js";
export { verifyCaptureArtifacts } from "./conformance/capture.js";
export { compareResults, compareReviewedObservation } from "./conformance/compare.js";
export { loadCorpus } from "./conformance/corpus.js";
export {
  generateConformanceEvidence,
  readConformanceManifest,
  readFormulaInventory,
  supportedInventorySubjects,
  supportedNamesChecksum,
  writeConformanceEvidence,
} from "./conformance/generate.js";
export { canonicalJson, sha256, sha256Bytes } from "./conformance/normalize.js";
export { runOffline } from "./conformance/offline.js";
export type {
  WorkbookRoundtripArtifact,
  WorkbookRoundtripChain,
  WorkbookRoundtripResaver,
} from "./conformance/roundtrip.js";
export {
  captureLibreOfficeWorkbookRoundtrips,
  createLibreOfficeResaver,
  runWorkbookRoundtrips,
  structuralDifferences,
  workbookFeatureState,
} from "./conformance/roundtrip.js";
export { validateCorpus, validateResult } from "./conformance/schema.js";
export type {
  CaptureArtifact,
  CaptureObservation,
  CaseTolerance,
  ConformanceCase,
  ConformanceCorpus,
  ConformanceManifest,
  ConformanceObservation,
  ConformanceProducer,
  ConformanceResult,
  EvidenceDescriptor,
  FormulaInventory,
  FormulaSubject,
  KnownDivergence,
  OfflineConformanceResult,
  ResultType,
  SemanticCategory,
} from "./conformance/types.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
  if (command === "generate") {
    const manifest = await writeConformanceEvidence();
    console.log(
      `Compatibility test set generated: formulas=${manifest.counts.formula} workbook changes=${manifest.counts.mutation} workbook examples=${manifest.counts.workbook} file hash=${manifest.corpusSha256}`,
    );
    return;
  }
  if (command === "roundtrip-libreoffice") {
    const artifact = await captureLibreOfficeWorkbookRoundtrips(process.argv[3]);
    console.log(
      `LibreOffice save-and-open checks: status=${artifact.status} checks=${artifact.chains.length} LibreOffice=${artifact.producerVersion}`,
    );
    if (artifact.status !== "pass") {
      throw new Error(
        `Workbook compatibility is PARTIAL: ${artifact.chains
          .filter((chain) => chain.status !== "pass")
          .map((chain) => `${chain.id} (${chain.differences.length} differences)`)
          .join(", ")}`,
      );
    }
    return;
  }
  const corpus = await loadCorpus(process.argv[3]);
  if (command === "validate") {
    console.log(
      `Compatibility test set valid: version=${corpus.protocol} tests=${corpus.cases.length} file hash=${sha256(corpus)}`,
    );
    return;
  }
  if (command === "offline") {
    const result = await runOffline(corpus);
    if (result.status === "blocked") {
      throw new Error(
        `Compatibility release check BLOCKED: tests=${result.checked} reviewed app results=${result.reviewed} missing app results=${result.deferred} unsupported tests=${result.unsupported.length}; Sheetwrite's local checks passed, but Excel and Google Sheets compatibility is not claimed`,
      );
    }
    console.log(
      `Compatibility checks passed: tests=${result.checked} reviewed app results=${result.reviewed} unsupported tests=${result.unsupported.length}`,
    );
    return;
  }
  if (command === "capture-excel") {
    console.log(await captureExcel(corpus));
    return;
  }
  if (command === "capture-google") {
    console.log(await captureGoogle(corpus));
    return;
  }
  throw new Error(`Unknown compatibility command: ${command}`);
}

if (import.meta.main) await main();
