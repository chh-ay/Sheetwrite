import { captureExcel } from "./conformance/adapters/excel.js";
import { captureGoogle } from "./conformance/adapters/google.js";
import { loadCorpus } from "./conformance/corpus.js";
import { sha256 } from "./conformance/normalize.js";
import { runOffline } from "./conformance/offline.js";

export type {
  CaptureArtifact,
  CaptureObservation,
  ConformanceCase,
  ConformanceCorpus,
  ConformanceObservation,
  ConformanceProducer,
  ConformanceResult,
  KnownDivergence,
  OfflineConformanceResult,
  ResultType,
} from "./conformance/types.js";
export { runSheetwriteCase } from "./conformance/adapters/sheetwrite.js";
export { validateExcelCapture } from "./conformance/adapters/excel.js";
export { verifyCaptureArtifacts } from "./conformance/capture.js";
export { compareResults, compareReviewedObservation } from "./conformance/compare.js";
export { loadCorpus } from "./conformance/corpus.js";
export { canonicalJson, sha256, sha256Bytes } from "./conformance/normalize.js";
export { runOffline } from "./conformance/offline.js";
export { validateCorpus, validateResult } from "./conformance/schema.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
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
