import { verifyCaptureArtifacts } from "./capture.js";
import {
  MANIFEST_PATH,
  INVENTORY_PATH,
  readConformanceManifest,
  readFormulaInventory,
} from "./generate.js";
import { isObject } from "./normalize.js";
import { readCorpusJson, SHA256_PATTERN, validateCorpus } from "./schema.js";
import type { ConformanceCorpus } from "./types.js";

function declaredArtifactHashes(value: unknown): Set<string> {
  const hashes = new Set<string>();
  if (!isObject(value) || !Array.isArray(value.cases)) return hashes;
  for (const entry of value.cases) {
    if (!isObject(entry) || !Array.isArray(entry.observations)) continue;
    for (const observation of entry.observations) {
      if (
        isObject(observation) &&
        observation.status === "reviewed" &&
        SHA256_PATTERN.test(String(observation.artifactSha256 ?? ""))
      ) {
        hashes.add(String(observation.artifactSha256));
      }
    }
  }
  return hashes;
}

export async function loadCorpus(
  path = "test/conformance/corpus.json",
  paths: {
    manifest?: string;
    inventory?: string;
    captures?: string;
  } = {},
): Promise<ConformanceCorpus> {
  const [value, manifest, inventory] = await Promise.all([
    readCorpusJson(path),
    readConformanceManifest(paths.manifest ?? MANIFEST_PATH),
    readFormulaInventory(paths.inventory ?? INVENTORY_PATH),
  ]);
  const structuralIssues = validateCorpus(
    value,
    manifest,
    inventory,
    declaredArtifactHashes(value),
  );
  if (structuralIssues.length > 0) throw new Error(structuralIssues.join("\n"));
  const corpus = value as ConformanceCorpus;
  const artifacts = await verifyCaptureArtifacts(corpus, paths.captures);
  const issues = [
    ...artifacts.issues,
    ...validateCorpus(corpus, manifest, inventory, artifacts.verified),
  ];
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return corpus;
}
