import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type ReleaseArtifactManifest,
  type ReleasePackageArtifact,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";

export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
}

export interface PublishedPackage extends PackageIdentity {
  readonly integrity: string;
}

export interface PublicationResult {
  readonly verifiedPackages: readonly PublishedPackage[];
  readonly newlyPublishedPackages: readonly PublishedPackage[];
}

export interface RegistryPackage {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dist?: { readonly integrity?: unknown };
}

type PublishArtifact = (
  artifactRoot: string,
  artifact: ReleasePackageArtifact,
) => Promise<PublishedPackage>;

type RegistryQuery = (artifact: ReleasePackageArtifact) => Promise<RegistryPackage>;
type LatestQuery = (name: string) => Promise<string>;
type ExistingQuery = (identity: PackageIdentity) => Promise<RegistryPackage | undefined>;

function processEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function command(command: readonly [string, ...string[]]): Promise<string> {
  const child = Bun.spawn([...command], {
    env: processEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
  }
  return stdout.trim();
}

export function publishedPackageFrom(value: unknown): Omit<PublishedPackage, "integrity"> {
  const candidates = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object"
      ? [value, ...Object.values(value)]
      : [value];
  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.name === "string" && typeof record.version === "string") {
      return { name: record.name, version: record.version };
    }
  }
  throw new Error("npm publish did not return an explicit package name and version");
}

export async function publishArtifact(
  artifactRoot: string,
  artifact: ReleasePackageArtifact,
): Promise<PublishedPackage> {
  const stdout = await command([
    "npm",
    "publish",
    join(artifactRoot, artifact.path),
    "--access",
    "public",
    "--tag",
    "latest",
    "--provenance",
    "--ignore-scripts",
    "--json",
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`npm publish did not return JSON: ${stdout}`);
  }
  const published = publishedPackageFrom(parsed);
  if (published.name !== artifact.name || published.version !== artifact.version) {
    throw new Error(
      `npm published ${published.name}@${published.version}, expected ${artifact.name}@${artifact.version}`,
    );
  }
  return { ...published, integrity: artifact.integrity };
}

async function queryRegistry(identity: PackageIdentity): Promise<RegistryPackage> {
  return JSON.parse(
    await command([
      "npm",
      "view",
      `${identity.name}@${identity.version}`,
      "name",
      "version",
      "dist.integrity",
      "--json",
    ]),
  ) as RegistryPackage;
}

async function queryExistingRegistry(
  identity: PackageIdentity,
): Promise<RegistryPackage | undefined> {
  try {
    return await queryRegistry(identity);
  } catch (error) {
    if (String(error).includes("E404")) return undefined;
    throw error;
  }
}

async function queryLatest(name: string): Promise<string> {
  const value = JSON.parse(
    await command(["npm", "view", name, "dist-tags.latest", "--json"]),
  ) as unknown;
  if (typeof value !== "string") throw new Error(`${name} has no string latest dist-tag`);
  return value;
}

function assertRegistryIdentity(identity: PackageIdentity, registry: RegistryPackage): void {
  if (registry.name !== identity.name || registry.version !== identity.version) {
    throw new Error(
      `Registry returned ${String(registry.name)}@${String(registry.version)}, expected ${identity.name}@${identity.version}`,
    );
  }
}

export function assertRegistryArtifact(
  artifact: ReleasePackageArtifact,
  registry: RegistryPackage,
): void {
  assertRegistryIdentity(artifact, registry);
  if (registry.dist?.integrity !== artifact.integrity) {
    throw new Error(
      `${artifact.name}@${artifact.version} registry integrity does not match the canonical tarball`,
    );
  }
}

export async function publishArtifactsIdempotently(
  artifactRoot: string,
  artifacts: readonly ReleasePackageArtifact[],
  existing: ExistingQuery = queryExistingRegistry,
  publish: PublishArtifact = publishArtifact,
): Promise<PublicationResult> {
  const packagedNames = new Set<string>();
  for (const artifact of artifacts) packagedNames.add(artifact.name);
  const verifiedIndependentDependencies = new Set<string>();
  for (const artifact of artifacts) {
    for (const [name, version] of Object.entries(artifact.internalDependencies)) {
      if (packagedNames.has(name)) continue;
      const dependencyKey = `${name}@${version}`;
      if (verifiedIndependentDependencies.has(dependencyKey)) continue;
      const identity = { name, version };
      const registry = await existing(identity);
      if (registry === undefined) {
        throw new Error(
          `${artifact.name}@${artifact.version} requires unpublished internal dependency ${dependencyKey}`,
        );
      }
      assertRegistryIdentity(identity, registry);
      verifiedIndependentDependencies.add(dependencyKey);
    }
  }

  const verifiedPackages: PublishedPackage[] = [];
  const newlyPublishedPackages: PublishedPackage[] = [];
  for (const artifact of artifacts) {
    const registry = await existing(artifact);
    if (registry !== undefined) {
      assertRegistryArtifact(artifact, registry);
      verifiedPackages.push({
        name: artifact.name,
        version: artifact.version,
        integrity: artifact.integrity,
      });
      continue;
    }
    const published = await publish(artifactRoot, artifact);
    verifiedPackages.push(published);
    newlyPublishedPackages.push(published);
  }
  return { verifiedPackages, newlyPublishedPackages };
}

export function assertRegistryPackage(
  artifact: ReleasePackageArtifact,
  registry: RegistryPackage,
  latest: string,
): void {
  assertRegistryArtifact(artifact, registry);
  if (latest !== artifact.version) {
    throw new Error(`${artifact.name} latest is ${latest}, expected ${artifact.version}`);
  }
}

export async function verifyPublishedArtifacts(
  artifacts: readonly ReleasePackageArtifact[],
  query: RegistryQuery = queryRegistry,
  latest: LatestQuery = queryLatest,
  attempts = 12,
  pause: (milliseconds: number) => Promise<unknown> = Bun.sleep,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      for (const artifact of artifacts) {
        assertRegistryPackage(artifact, await query(artifact), await latest(artifact.name));
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await pause(5_000);
    }
  }
  throw new Error(`Published package registry verification failed after ${attempts} attempts`, {
    cause: lastError,
  });
}

export function assertCanonicalReleaseIdentity(
  manifest: Pick<ReleaseArtifactManifest, "sourceCommit" | "packages">,
  expectedCommit: string,
): void {
  if (manifest.sourceCommit !== expectedCommit) {
    throw new Error(
      `Canonical artifacts came from ${manifest.sourceCommit}, expected ${expectedCommit}`,
    );
  }
}

export async function publishCanonicalArtifacts(
  artifactRoot: string,
  expectedCommit: string,
): Promise<PublicationResult> {
  const manifest = await verifyReleaseArtifacts(artifactRoot);
  assertCanonicalReleaseIdentity(manifest, expectedCommit);
  const result = await publishArtifactsIdempotently(artifactRoot, manifest.packages);
  await verifyPublishedArtifacts(manifest.packages);
  return result;
}

if (import.meta.main) {
  const artifactRoot = resolve(process.argv[2] ?? "test-results/release-artifacts");
  const expectedCommit = process.env.EXPECTED_SHA;
  if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const result = await publishCanonicalArtifacts(artifactRoot, expectedCommit);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const verified = result.verifiedPackages.map(({ name, version }) => ({ name, version }));
    const published = result.newlyPublishedPackages.map(({ name, version }) => ({
      name,
      version,
    }));
    await appendFile(
      outputPath,
      `verified=${JSON.stringify(verified)}\n` + `published=${JSON.stringify(published)}\n`,
      "utf8",
    );
  }
  console.log(
    `Published ${result.newlyPublishedPackages.length} and verified ${result.verifiedPackages.length} canonical packages`,
  );
}
