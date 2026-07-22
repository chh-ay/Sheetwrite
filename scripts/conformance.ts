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
      `Conformance corpus generated: formula=${manifest.counts.formula} mutation=${manifest.counts.mutation} workbook=${manifest.counts.workbook} sha256=${manifest.corpusSha256}`,
    );
    return;
  }
  if (command === "roundtrip-libreoffice") {
    const artifact = await captureLibreOfficeWorkbookRoundtrips(process.argv[3]);
    console.log(
      `LibreOffice workbook roundtrips: status=${artifact.status} chains=${artifact.chains.length} producer=${artifact.producerVersion}`,
    );
    if (artifact.status !== "pass") {
      throw new Error(
        `Workbook conformance PARTIAL: ${artifact.chains
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
      `Conformance corpus valid: protocol=${corpus.protocol} cases=${corpus.cases.length} sha256=${sha256(corpus)}`,
    );
    return;
  }
  if (command === "offline") {
    const result = await runOffline(corpus);
    if (result.status === "blocked") {
      throw new Error(
        `Conformance compatibility BLOCKED: checked=${result.checked} reviewed=${result.reviewed} missing-reviewed=${result.deferred} unsupported-nonclaims=${result.unsupported.length}; local checks passed but producer compatibility is not claimed`,
      );
    }
    console.log(
      `Offline conformance verified: checked=${result.checked} reviewed=${result.reviewed} unsupported=${result.unsupported.length}`,
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
  throw new Error(`Unknown conformance command: ${command}`);
}

if (import.meta.main) await main();
