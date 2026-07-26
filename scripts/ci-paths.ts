const DOCUMENTATION_INDEPENDENT_PATHS = [
  /^\.changeset\//,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/(?:CODEOWNERS|dependabot\.yml)$/,
  /^(?:CONTRIBUTING|LICENSE|SECURITY|SUPPORT)\.md$/,
  /^packages\/[^/]+\/(?:test|tests)\//,
  /^bench\/test\//,
  /^scripts\/[^/]+\.test\.ts$/,
  /^test\/(?!browser\/)/,
] as const;

/**
 * Returns true unless every changed path is proven independent from the generated
 * documentation, public APIs, examples, package outputs, and browser contracts.
 * Unknown paths deliberately take the expensive lane.
 */
export function requiresDocumentationBuild(paths: readonly string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some(
    (path) => !DOCUMENTATION_INDEPENDENT_PATHS.some((pattern) => pattern.test(path)),
  );
}

/**
 * Paths proven unable to change measured runtime performance. Everything else —
 * every `src` tree, manifest, lockfile, and workflow — selects the expensive lane.
 */
const PERFORMANCE_INDEPENDENT_PATHS = [
  /^\.changeset\//,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/(?:CODEOWNERS|dependabot\.yml)$/,
  /^(?:CONTRIBUTING|LICENSE|README|SECURITY|SUPPORT)\.md$/,
  /^docs\//,
  /^examples\//,
  /^packages\/[^/]+\/(?:test|tests)\//,
  /^packages\/[^/]+\/README\.md$/,
  // `bench/test/` only. `bench/results/render-baseline.json` is the reference the
  // zero-regression gate compares against (`ci.yml` check step), so a change there
  // must run the benchmark rather than skip it.
  /^bench\/test\//,
  /^scripts\/[^/]+\.test\.ts$/,
  /^test\//,
] as const;

/**
 * Returns true unless every changed path is proven independent from measured
 * performance. The matched zero-regression benchmark occupies a single
 * self-hosted runner for up to 90 minutes, so it is skipped when the change
 * cannot move it — but unknown paths, mixed sets, and empty sets deliberately
 * take the expensive lane: a false negative ships a regression, a false positive
 * costs one benchmark run.
 */
export function requiresPerformanceRun(paths: readonly string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some((path) => !PERFORMANCE_INDEPENDENT_PATHS.some((pattern) => pattern.test(path)));
}

function changedPaths(baseSha: string): readonly string[] {
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    throw new Error("BASE_SHA must be a full lowercase commit SHA");
  }
  if (/^0+$/.test(baseSha)) return [];

  const result = Bun.spawnSync(
    ["git", "diff", "--name-only", "--diff-filter=ACDMRTUXB", baseSha, "HEAD"],
    { stderr: "pipe", stdout: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`git diff failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout
    .toString()
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

if (import.meta.main) {
  const baseSha = process.env.BASE_SHA;
  if (!baseSha) throw new Error("BASE_SHA is required");
  const paths = changedPaths(baseSha);
  console.log(`docs_required=${requiresDocumentationBuild(paths)}`);
  console.log(`perf_required=${requiresPerformanceRun(paths)}`);
}
