import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type ReleasePackageArtifact, verifyReleaseArtifacts } from "./release-artifacts.js";

export interface StageSummaryEntry {
  readonly package: string;
  readonly version: string;
  readonly tarballSha512: string;
  readonly stageId: string;
  readonly reviewCommands: readonly string[];
}

export function stageIdFrom(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = stageIdFrom(item);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, candidate] of Object.entries(record)) {
      if (
        /^(?:stage_?id|id)$/i.test(key) &&
        typeof candidate === "string" &&
        candidate.length >= 8
      ) {
        return candidate;
      }
    }
    for (const candidate of Object.values(record)) {
      if (candidate && typeof candidate === "object") {
        const found = stageIdFrom(candidate);
        if (found) return found;
      }
    }
  }
  return undefined;
}

export async function stagePackage(
  root: string,
  artifact: ReleasePackageArtifact,
): Promise<StageSummaryEntry> {
  const tarball = join(root, artifact.path);
  const command = [
    "npm",
    "stage",
    "publish",
    tarball,
    "--access",
    "public",
    "--tag",
    "latest",
    "--ignore-scripts",
    "--json",
  ];
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`Staging ${artifact.name} failed (${exitCode}): ${stderr || stdout}`);
  }
  let output: unknown;
  try {
    output = JSON.parse(stdout);
  } catch {
    throw new Error(`Staging ${artifact.name} did not return JSON: ${stdout}`);
  }
  const stageId = stageIdFrom(output);
  if (!stageId) throw new Error(`Staging ${artifact.name} did not return a stage ID`);
  return {
    package: artifact.name,
    version: artifact.version,
    tarballSha512: artifact.integrity,
    stageId,
    reviewCommands: [
      `npm stage view ${stageId}`,
      `npm stage download ${stageId}`,
      `npm stage approve ${stageId}`,
    ],
  };
}

export async function stageArtifactsInOrder(
  artifactRoot: string,
  artifacts: readonly ReleasePackageArtifact[],
  publish: (root: string, artifact: ReleasePackageArtifact) => Promise<StageSummaryEntry>,
): Promise<readonly StageSummaryEntry[]> {
  const entries: StageSummaryEntry[] = [];
  for (const artifact of artifacts) entries.push(await publish(artifactRoot, artifact));
  return entries;
}

export async function stageCanonicalArtifacts(
  artifactRoot: string,
  outputRoot: string,
  publish: (
    root: string,
    artifact: ReleasePackageArtifact,
  ) => Promise<StageSummaryEntry> = stagePackage,
): Promise<readonly StageSummaryEntry[]> {
  const manifest = await verifyReleaseArtifacts(artifactRoot);
  const entries = await stageArtifactsInOrder(artifactRoot, manifest.packages, publish);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    join(outputRoot, "staging-summary.json"),
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    "utf8",
  );
  return entries;
}

if (import.meta.main) {
  const artifactRoot = resolve(process.argv[2] ?? "test-results/release-artifacts");
  const outputRoot = resolve(process.argv[3] ?? "test-results/release-stage");
  const entries = await stageCanonicalArtifacts(artifactRoot, outputRoot);
  console.log(`Staged ${entries.length} canonical packages; maintainer approval is required`);
}
