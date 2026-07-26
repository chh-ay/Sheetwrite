import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const PACKAGE_SIZE_HISTORY_PREFIX = "automation/package-size-history-";
const REQUIRED_PACKAGE_SIZE_HISTORY_FILES = new Set([
  "docs/src/content/docs/guides/performance-resources.md",
  "scripts/size-history.json",
]);
const ALLOWED_PACKAGE_SIZE_HISTORY_FILES = new Set([
  ...REQUIRED_PACKAGE_SIZE_HISTORY_FILES,
  "docs/src/generated/docs-contract.json",
]);

export interface ChangesetComparison {
  readonly baseRef: string;
  readonly diffRange: string;
  readonly sinceArgument: string;
}

export function changesetComparisonFromBaseRef(
  githubBaseRef: string | undefined,
): ChangesetComparison {
  const baseRef = `origin/${githubBaseRef?.trim() || "develop"}`;
  return {
    baseRef,
    diffRange: `${baseRef}...HEAD`,
    sinceArgument: `--since=${baseRef}`,
  };
}

export function releaseVersionFromHeadRef(headRef: string | undefined): string | undefined {
  return headRef !== undefined && STABLE_VERSION.test(headRef) ? headRef : undefined;
}
export function packageSizeHistoryVersionFromHeadRef(
  headRef: string | undefined,
): string | undefined {
  if (headRef === undefined || !headRef.startsWith(PACKAGE_SIZE_HISTORY_PREFIX)) return undefined;
  const version = headRef.slice(PACKAGE_SIZE_HISTORY_PREFIX.length);
  return STABLE_VERSION.test(version) ? version : undefined;
}
export function isGeneratedPackageSizeHistoryChange(paths: readonly string[]): boolean {
  const uniquePaths = new Set(paths);
  return (
    uniquePaths.size === paths.length &&
    [...REQUIRED_PACKAGE_SIZE_HISTORY_FILES].every((path) => uniquePaths.has(path)) &&
    paths.every((path) => ALLOWED_PACKAGE_SIZE_HISTORY_FILES.has(path))
  );
}

async function changedFilesSince(comparison: ChangesetComparison): Promise<string[]> {
  const child = Bun.spawn(["git", "diff", "--name-only", comparison.diffRange], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Unable to inspect package size history diff: ${stderr}`);
  return stdout
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export function validateReleasePackageVersions(version: string, root = REPOSITORY_ROOT): void {
  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const directory = name.slice("@sheetwrite/".length);
    const manifest = JSON.parse(
      readFileSync(resolve(root, "packages", directory, "package.json"), "utf8"),
    ) as { readonly name?: unknown; readonly version?: unknown };
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(
        `Release branch ${version} requires ${name}@${version}, observed ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const releaseVersion = releaseVersionFromHeadRef(process.env.GITHUB_HEAD_REF);
  if (releaseVersion !== undefined) {
    validateReleasePackageVersions(releaseVersion);
    console.log(`Release package versions match branch ${releaseVersion}`);
    return;
  }
  const comparison = changesetComparisonFromBaseRef(process.env.GITHUB_BASE_REF);
  const packageSizeHistoryVersion = packageSizeHistoryVersionFromHeadRef(
    process.env.GITHUB_HEAD_REF,
  );
  if (packageSizeHistoryVersion !== undefined) {
    validateReleasePackageVersions(packageSizeHistoryVersion);
    if (isGeneratedPackageSizeHistoryChange(await changedFilesSince(comparison))) {
      console.log(`Package size history versions match branch ${packageSizeHistoryVersion}`);
      return;
    }
    console.log(
      "Package size history branch contains non-generated changes; requiring a changeset",
    );
  }
  const child = Bun.spawn(["bun", "run", "changeset:status", "--", comparison.sinceArgument], {
    cwd: REPOSITORY_ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

if (import.meta.main) await main();
