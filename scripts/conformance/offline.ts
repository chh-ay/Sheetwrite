import { verifyCaptureArtifacts } from "./capture.js";
import { compareResults, compareReviewedObservation } from "./compare.js";
import { runSheetwriteCase } from "./adapters/sheetwrite.js";
import { readConformanceManifest, readFormulaInventory } from "./generate.js";
import { validateCorpus } from "./schema.js";
import type { ConformanceCorpus, OfflineConformanceResult } from "./types.js";

export async function runOffline(
  corpus: ConformanceCorpus,
  paths: {
    manifest?: string;
    inventory?: string;
    captures?: string;
  } = {},
): Promise<OfflineConformanceResult> {
  const [artifacts, manifest, inventory] = await Promise.all([
    verifyCaptureArtifacts(corpus, paths.captures),
    readConformanceManifest(paths.manifest),
    readFormulaInventory(paths.inventory),
  ]);
  const corpusIssues = [
    ...artifacts.issues,
    ...validateCorpus(corpus, manifest, inventory, artifacts.verified),
  ];
  if (corpusIssues.length > 0) throw new Error(corpusIssues.join("\n"));
  const localCanaries = corpus.cases.filter((entry) => entry.localCanary === true).length;

  const failures: string[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];
  let checked = 0;
  let reviewed = 0;
  let deferred = 0;
  for (const entry of corpus.cases) {
    checked += 1;
    const actual = await runSheetwriteCase(entry);
    const localDifferences = compareResults(entry.expected, actual);
    if (localDifferences.length > 0) {
      failures.push(`${entry.id} sheetwrite: ${localDifferences.join("; ")}`);
    }
    if (entry.unsupported) {
      unsupported.push(entry.id);
      warnings.push(`${entry.id}: explicitly unsupported; compatibility is not claimed`);
      continue;
    }
    const reviewedObservations = entry.observations.filter(
      (observation) => observation.status === "reviewed",
    );
    if (reviewedObservations.length === 0) {
      deferred += 1;
      warnings.push(`${entry.id}: no reviewed producer capture; compatibility is not claimed`);
    }
    for (const observation of reviewedObservations) {
      reviewed += 1;
      const differences = compareReviewedObservation(
        entry.expected,
        observation,
        entry.knownDivergence,
      );
      if (differences.length > 0) {
        failures.push(`${entry.id} ${observation.producer}: ${differences.join("; ")}`);
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return {
    status: deferred === 0 && unsupported.length === 0 ? "verified" : "blocked",
    checked,
    localCanaries,
    reviewed,
    deferred,
    warnings,
    unsupported,
  };
}
