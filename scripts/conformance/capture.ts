import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, isNonemptyString, isObject, sha256Bytes } from "./normalize.js";
import { scanSecrets, validateResult } from "./schema.js";
import type { CaptureArtifact, ConformanceCorpus, ConformanceObservation } from "./types.js";

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const CAPTURE_DIRECTORY = "scripts/conformance/captures";

async function readBoundedFile(path: string, limit: number): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new TypeError(`Capture artifact is not a regular file: ${path}`);
    if (info.size > limit) throw new RangeError(`Capture artifact exceeds ${limit} bytes: ${path}`);
    return new Uint8Array(await handle.readFile());
  } finally {
    await handle.close();
  }
}

function validateCaptureArtifact(value: unknown, path: string): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return [`${path}: expected object`];
  if (value.protocol !== 1) issues.push(`${path}.protocol: expected 1`);
  if (!isNonemptyString(value.producer)) issues.push(`${path}.producer: required`);
  if (!isNonemptyString(value.producerVersion)) issues.push(`${path}.producerVersion: required`);
  if (!isNonemptyString(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt))) {
    issues.push(`${path}.capturedAt: invalid timestamp`);
  }
  if (!Array.isArray(value.observations)) {
    issues.push(`${path}.observations: expected array`);
  } else {
    const ids = new Set<string>();
    value.observations.forEach((observation, index) => {
      const observationPath = `${path}.observations[${index}]`;
      if (!isObject(observation)) {
        issues.push(`${observationPath}: expected object`);
        return;
      }
      if (!isNonemptyString(observation.caseId)) issues.push(`${observationPath}.caseId: required`);
      else if (ids.has(observation.caseId)) issues.push(`${observationPath}.caseId: duplicate`);
      else ids.add(observation.caseId);
      validateResult(observation.result, `${observationPath}.result`, issues);
    });
  }
  scanSecrets(value, path, issues);
  return issues;
}

function bindsObservation(
  artifact: CaptureArtifact,
  caseId: string,
  observation: ConformanceObservation,
): boolean {
  if (
    artifact.producer !== observation.producer ||
    artifact.producerVersion !== observation.producerVersion ||
    artifact.capturedAt !== observation.capturedAt
  ) {
    return false;
  }
  const captured = artifact.observations.find((candidate) => candidate.caseId === caseId);
  return (
    captured !== undefined && canonicalJson(captured.result) === canonicalJson(observation.result)
  );
}

export async function verifyCaptureArtifacts(
  corpus: ConformanceCorpus,
  directory = CAPTURE_DIRECTORY,
): Promise<{ verified: Set<string>; issues: string[] }> {
  const verified = new Set<string>();
  const issues: string[] = [];
  const reviewedByHash = new Map<
    string,
    Array<{ caseId: string; observation: ConformanceObservation }>
  >();
  for (const entry of corpus.cases) {
    for (const observation of entry.observations) {
      if (observation.status !== "reviewed" || !observation.artifactSha256) continue;
      const bound = reviewedByHash.get(observation.artifactSha256) ?? [];
      bound.push({ caseId: entry.id, observation });
      reviewedByHash.set(observation.artifactSha256, bound);
    }
  }
  for (const [hash, claims] of reviewedByHash) {
    const path = resolve(directory, `${hash}.json`);
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedFile(path, MAX_CAPTURE_BYTES);
    } catch (error) {
      issues.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const actualHash = sha256Bytes(bytes);
    if (actualHash !== hash) {
      issues.push(`${path}: filename hash ${hash} does not match artifact bytes ${actualHash}`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      issues.push(
        `${path}: invalid UTF-8 JSON (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }
    const artifactIssues = validateCaptureArtifact(value, path);
    if (artifactIssues.length > 0) {
      issues.push(...artifactIssues);
      continue;
    }
    const artifact = value as CaptureArtifact;
    let fullyBound = true;
    for (const claim of claims) {
      if (!bindsObservation(artifact, claim.caseId, claim.observation)) {
        fullyBound = false;
        issues.push(
          `${path}: does not bind reviewed observation ${claim.caseId}/${claim.observation.producer}`,
        );
      }
    }
    if (fullyBound) verified.add(hash);
  }
  return { verified, issues };
}

function artifactPath(producer: string): string {
  return resolve(
    "test-results/conformance",
    `${producer}-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
}

export async function persistCapture(artifact: CaptureArtifact): Promise<string> {
  const path = artifactPath(artifact.producer);
  await mkdir(dirname(path), { recursive: true });
  const bytes = new TextEncoder().encode(`${canonicalJson(artifact)}\n`);
  if (bytes.byteLength > MAX_CAPTURE_BYTES) {
    throw new RangeError(`Conformance capture exceeds ${MAX_CAPTURE_BYTES} bytes`);
  }
  await writeFile(path, bytes, { flag: "wx" });
  return `${path} sha256=${sha256Bytes(bytes)}`;
}

export async function readBoundedResponse(
  response: Response,
  limit = MAX_CAPTURE_BYTES,
): Promise<Uint8Array> {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > limit) {
      await response.body?.cancel();
      throw new RangeError(`Oracle response Content-Length exceeds ${limit} bytes`);
    }
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new RangeError(`Oracle response exceeds ${limit} bytes`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
