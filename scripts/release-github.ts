import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

export interface PackageReleaseIdentity {
  readonly name: string;
  readonly version: string;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (command: readonly [string, ...string[]]) => Promise<CommandResult>;
export type ProvenanceQuery = (identity: PackageReleaseIdentity) => Promise<string>;

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parsePackageReleaseIdentities(
  value: string,
  label = "VERIFIED_PACKAGES",
  allowEmpty = false,
): readonly PackageReleaseIdentity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON`, { cause: error });
  }
  if (!Array.isArray(parsed) || (!allowEmpty && parsed.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an array" : "a non-empty array"}`);
  }
  const seen = new Set<string>();
  let previousIndex = -1;
  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "name" || keys[1] !== "version") {
      throw new Error(`${label}[${index}] must contain only name and version`);
    }
    const { name, version } = entry as Record<string, unknown>;
    const packageIndex = PUBLISHABLE_PACKAGE_ORDER.indexOf(name as never);
    if (packageIndex === -1) throw new Error(`Unknown publishable package ${String(name)}`);
    if (packageIndex <= previousIndex) throw new Error(`${label} must preserve dependency order`);
    if (typeof version !== "string" || !STABLE_VERSION.test(version)) {
      throw new Error(`${String(name)} has no stable version`);
    }
    if (seen.has(name as string)) throw new Error(`Duplicate package ${String(name)}`);
    seen.add(name as string);
    previousIndex = packageIndex;
    return { name: name as string, version };
  });
}

export function packageReleaseTag(identity: PackageReleaseIdentity): string {
  return `${identity.name}@${identity.version}`;
}

export function provenanceCommitFromAttestations(value: unknown): string {
  if (value === null || typeof value !== "object" || !("attestations" in value)) {
    throw new Error("npm provenance response has no attestations");
  }
  const attestations = (value as { readonly attestations?: unknown }).attestations;
  if (!Array.isArray(attestations)) throw new Error("npm provenance attestations must be an array");
  for (const attestation of attestations) {
    if (
      attestation === null ||
      typeof attestation !== "object" ||
      !("predicateType" in attestation) ||
      attestation.predicateType !== "https://slsa.dev/provenance/v1" ||
      !("bundle" in attestation)
    ) {
      continue;
    }
    const bundle = attestation.bundle as {
      readonly dsseEnvelope?: { readonly payload?: unknown };
    };
    if (typeof bundle.dsseEnvelope?.payload !== "string") continue;
    const statement = JSON.parse(
      Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"),
    ) as {
      readonly predicate?: {
        readonly buildDefinition?: {
          readonly resolvedDependencies?: ReadonlyArray<{
            readonly digest?: { readonly gitCommit?: unknown };
          }>;
        };
      };
    };
    for (const dependency of statement.predicate?.buildDefinition?.resolvedDependencies ?? []) {
      const commit = dependency.digest?.gitCommit;
      if (typeof commit === "string" && /^[0-9a-f]{40}$/.test(commit)) return commit;
    }
  }
  throw new Error("npm provenance has no source commit");
}

async function queryPackageProvenance(identity: PackageReleaseIdentity): Promise<string> {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(identity.name)}/${identity.version}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const metadataResponse = await fetch(metadataUrl);
      if (!metadataResponse.ok) throw new Error(`npm metadata returned ${metadataResponse.status}`);
      const metadata = (await metadataResponse.json()) as {
        readonly dist?: { readonly attestations?: { readonly url?: unknown } };
      };
      const attestationsUrl = metadata.dist?.attestations?.url;
      if (typeof attestationsUrl !== "string")
        throw new Error("npm metadata has no attestations URL");
      const attestationsResponse = await fetch(attestationsUrl);
      if (!attestationsResponse.ok) {
        throw new Error(`npm attestations returned ${attestationsResponse.status}`);
      }
      return provenanceCommitFromAttestations(await attestationsResponse.json());
    } catch (error) {
      lastError = error;
      if (attempt < 12) await Bun.sleep(5_000);
    }
  }
  throw new Error(`${packageReleaseTag(identity)} provenance did not propagate`, {
    cause: lastError,
  });
}

async function defaultRunner(command: readonly [string, ...string[]]): Promise<CommandResult> {
  const child = Bun.spawn([...command], { env: process.env, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function requireSuccess(
  runner: CommandRunner,
  command: readonly [string, ...string[]],
): Promise<string> {
  const result = await runner(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

export async function ensurePackageReleases(
  packages: readonly PackageReleaseIdentity[],
  publishedPackages: readonly PackageReleaseIdentity[],
  expectedCommit: string,
  runner: CommandRunner = defaultRunner,
  provenance: ProvenanceQuery = queryPackageProvenance,
): Promise<void> {
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const verified = new Set(packages.map((identity) => packageReleaseTag(identity)));
  const published = new Set<string>();
  for (const identity of publishedPackages) {
    const tag = packageReleaseTag(identity);
    if (!verified.has(tag)) throw new Error(`${tag} was published but not verified`);
    published.add(tag);
  }

  for (const identity of packages) {
    const tag = packageReleaseTag(identity);
    const attestedCommit = await provenance(identity);
    if (!/^[0-9a-f]{40}$/.test(attestedCommit)) {
      throw new Error(`${tag} provenance has invalid source commit ${attestedCommit}`);
    }
    if (published.has(tag) && attestedCommit !== expectedCommit) {
      throw new Error(`${tag} provenance targets ${attestedCommit}, expected ${expectedCommit}`);
    }

    const tagResult = await runner(["git", "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
    if (tagResult.exitCode === 0) {
      if (tagResult.stdout.trim() !== attestedCommit) {
        throw new Error(`${tag} targets ${tagResult.stdout.trim()}, expected ${attestedCommit}`);
      }
    } else {
      await requireSuccess(runner, ["git", "tag", tag, attestedCommit]);
      await requireSuccess(runner, ["git", "push", "origin", `refs/tags/${tag}`]);
    }

    const releaseResult = await runner([
      "gh",
      "release",
      "view",
      tag,
      "--json",
      "tagName,isDraft,isPrerelease",
    ]);
    if (releaseResult.exitCode === 0) {
      const release = JSON.parse(releaseResult.stdout) as {
        readonly tagName?: unknown;
        readonly isDraft?: unknown;
        readonly isPrerelease?: unknown;
      };
      if (release.tagName !== tag || release.isDraft !== false || release.isPrerelease !== false) {
        throw new Error(`${tag} has an invalid GitHub release state`);
      }
      continue;
    }

    await requireSuccess(runner, [
      "gh",
      "release",
      "create",
      tag,
      "--verify-tag",
      "--target",
      attestedCommit,
      "--title",
      `${identity.name} ${identity.version}`,
      "--generate-notes",
    ]);
  }
}

async function main(): Promise<void> {
  const rawPackages = process.env.VERIFIED_PACKAGES;
  if (!rawPackages) throw new Error("VERIFIED_PACKAGES is required");
  const rawPublished = process.env.PUBLISHED_PACKAGES;
  if (rawPublished === undefined) throw new Error("PUBLISHED_PACKAGES is required");
  const expectedCommit = process.env.EXPECTED_SHA;
  if (!expectedCommit) throw new Error("EXPECTED_SHA is required");
  const packages = parsePackageReleaseIdentities(rawPackages);
  const publishedPackages = parsePackageReleaseIdentities(rawPublished, "PUBLISHED_PACKAGES", true);
  await ensurePackageReleases(packages, publishedPackages, expectedCommit);
  console.log(`Verified ${packages.length} package-specific GitHub releases`);
}

if (import.meta.main) await main();
