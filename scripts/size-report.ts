import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readReleaseManifestDigest, verifyReleaseArtifacts } from "./release-artifacts.js";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";

export const SIZE_PROTOCOL_VERSION = 1;
export const SIZE_TOOL_NAME = "sheetwrite-delivery-size";
export const SIZE_TOOL_VERSION = "1.0.0";

export type MetricUnit = "bytes" | "count";
export type PackedCategory =
  | "css"
  | "declarations"
  | "maps"
  | "metadata"
  | "runtime-js"
  | "runtime-source"
  | "wasm";
export type AssetKind = "css" | "javascript" | "wasm";

export interface PackFile {
  path: string;
  size: number;
}

export interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: PackFile[];
}

export interface Metric {
  actual: number;
  unit: MetricUnit;
  category: string;
  owner: string;
}

export interface BudgetLine {
  unit: MetricUnit;
  baseline: number;
  maximum: number;
  category: string;
  owner: string;
  rationale: string;
}

export interface BudgetManifest {
  schemaVersion: number;
  tool: { name: string; version: string };
  protocolVersion: number;
  toolchain: Record<string, string>;
  budgets: Record<string, BudgetLine>;
}

export interface BundlerAsset {
  path: string;
  kind: AssetKind;
  owner: string;
  roles: string[];
}

export interface BundlerEvidence {
  schemaVersion: number;
  bundler: "next" | "vite" | "webpack";
  version: string;
  assets: BundlerAsset[];
}

export interface PackageReport {
  name: string;
  tarballBytes: number;
  unpackedBytes: number;
  fileCount: number;
  categories: Record<PackedCategory, number>;
}

export interface ClosureReport {
  name: string;
  packageCount: number;
  logicalBytes: number;
  packages: string[];
}

export interface AssetReport extends BundlerAsset {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  sha256: string;
}

export interface SizeReport {
  schemaVersion: number;
  protocolVersion: number;
  tool: { name: string; version: string };
  /** Protocol-binding capture stamp; the docs evidence page requires it. */
  meta: { commit: string; dirty: boolean; timestamp: string };
  toolchain: Record<string, string>;
  metrics: Record<string, Metric>;
  packages: PackageReport[];
  closures: ClosureReport[];
  bundlers: Array<{
    name: BundlerEvidence["bundler"];
    version: string;
    assets: AssetReport[];
  }>;
  reproduction: string;
}

export interface BudgetFailure {
  key: string;
  message: string;
  actual?: number;
  limit?: number;
  delta?: number;
  owner?: string;
}

interface PackageManifest {
  name: string;
  version: string;
  files?: string[];
  dependencies?: Record<string, string>;
}

interface PackedPackage {
  name: string;
  tarballPath: string;
  report: PackageReport;
}

const repositoryRoot = resolve(import.meta.dir, "..");
const evidenceRoot = join(repositoryRoot, "test-results/delivery-size");
const reportPath = join(evidenceRoot, "size-report.json");
const budgetPath = join(repositoryRoot, "scripts/size-budgets.json");
const excelPackages: Record<string, true> = {
  exceljs: true,
  "read-excel-file": true,
  "write-excel-file": true,
};
const packageDirectories = [
  "packages/wasm",
  "packages/core",
  "packages/xlsx",
  "packages/react",
  "packages/vue",
  "packages/svelte",
] as const;
const requiredBundlerRoles: Record<BundlerEvidence["bundler"], readonly string[]> = {
  vite: [
    "core-initial",
    "react-initial",
    "vue-initial",
    "svelte-initial",
    "worker-async",
    "xlsx-async",
  ],
  webpack: ["core-initial", "worker-async"],
  next: ["core-initial"],
};

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
  );
}

export function parsePackJson(input: string): PackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(
      `Malformed npm pack JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack JSON must contain exactly one result");
  }
  const candidate = parsed[0] as Record<string, unknown>;
  if (
    typeof candidate.filename !== "string" ||
    candidate.filename.length === 0 ||
    !isNonNegativeInteger(candidate.size) ||
    !isNonNegativeInteger(candidate.unpackedSize) ||
    !Array.isArray(candidate.files)
  ) {
    throw new Error("npm pack JSON has invalid filename, size, unpackedSize, or files");
  }
  const seen = new Set<string>();
  const files = candidate.files.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`npm pack JSON file ${index} is malformed`);
    }
    const file = entry as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      !isNonNegativeInteger(file.size)
    ) {
      throw new Error(`npm pack JSON file ${index} has invalid path or size`);
    }
    if (seen.has(file.path)) throw new Error(`npm pack JSON contains duplicate file ${file.path}`);
    seen.add(file.path);
    return { path: file.path, size: file.size };
  });
  return {
    filename: candidate.filename,
    size: candidate.size,
    unpackedSize: candidate.unpackedSize,
    files,
  };
}

export function classifyPackedPath(path: string): PackedCategory {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wasm")) return "wasm";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".map")) return "maps";
  if (/\.d\.(?:c|m)?ts$/.test(lower)) return "declarations";
  if (/\.(?:c|m)?js$/.test(lower)) return "runtime-js";
  if (/\.(?:svelte|ts|tsx|jsx)$/.test(lower)) return "runtime-source";
  if (
    /(?:^|\/)(?:package\.json|license(?:\.[^/]*)?|readme(?:\.[^/]*)?|notice(?:\.[^/]*)?)$/i.test(
      path,
    )
  ) {
    return "metadata";
  }
  throw new Error(`Unclassified packed artifact: ${path}`);
}

export function summarizePack(name: string, result: PackResult): PackageReport {
  const categories: Record<PackedCategory, number> = {
    css: 0,
    declarations: 0,
    maps: 0,
    metadata: 0,
    "runtime-js": 0,
    "runtime-source": 0,
    wasm: 0,
  };
  let fileBytes = 0;
  for (const file of result.files) {
    categories[classifyPackedPath(file.path)] += file.size;
    fileBytes += file.size;
  }
  if (fileBytes !== result.unpackedSize) {
    throw new Error(
      `${name} npm pack file bytes ${fileBytes} do not equal unpackedSize ${result.unpackedSize}`,
    );
  }
  return {
    name,
    tarballBytes: result.size,
    unpackedBytes: result.unpackedSize,
    fileCount: result.files.length,
    categories,
  };
}

export function compressedSizes(data: Uint8Array): {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
} {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

export async function walkLogicalBytes(root: string): Promise<{ bytes: number; files: number }> {
  const visitedDirectories = new Set<string>();
  const visitedFiles = new Set<string>();
  let bytes = 0;
  let files = 0;

  async function visit(path: string): Promise<void> {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      await visit(target);
      return;
    }
    if (entry.isDirectory()) {
      const canonical = await realpath(path);
      if (visitedDirectories.has(canonical)) return;
      visitedDirectories.add(canonical);
      const entries = await readdir(path);
      entries.sort();
      for (const name of entries) await visit(join(path, name));
      return;
    }
    if (!entry.isFile()) return;
    const canonical = await realpath(path);
    if (visitedFiles.has(canonical)) return;
    visitedFiles.add(canonical);
    bytes += entry.size;
    files += 1;
  }

  await visit(root);
  return { bytes, files };
}

export function validateBundlerEvidence(value: unknown): BundlerEvidence {
  if (value === null || typeof value !== "object") throw new Error("Bundler evidence is malformed");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SIZE_PROTOCOL_VERSION) {
    throw new Error(`Bundler evidence protocol mismatch: ${String(candidate.schemaVersion)}`);
  }
  if (!(["next", "vite", "webpack"] as unknown[]).includes(candidate.bundler)) {
    throw new Error(`Unknown bundler evidence owner: ${String(candidate.bundler)}`);
  }
  if (typeof candidate.version !== "string" || !Array.isArray(candidate.assets)) {
    throw new Error("Bundler evidence has invalid version or assets");
  }
  const bundler = candidate.bundler as BundlerEvidence["bundler"];
  const seen = new Set<string>();
  const assets = candidate.assets.map((value, index) => {
    if (value === null || typeof value !== "object") {
      throw new Error(`${bundler} asset ${index} is malformed`);
    }
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.path !== "string" ||
      asset.path.length === 0 ||
      !(asset.kind === "javascript" || asset.kind === "css" || asset.kind === "wasm") ||
      typeof asset.owner !== "string" ||
      asset.owner.length === 0 ||
      asset.owner === "unclassified" ||
      !Array.isArray(asset.roles) ||
      asset.roles.length === 0 ||
      !asset.roles.every((role) => typeof role === "string" && role.length > 0)
    ) {
      throw new Error(`${bundler} asset ${index} is missing path, kind, owner, or roles`);
    }
    if (seen.has(asset.path)) throw new Error(`${bundler} contains duplicate asset ${asset.path}`);
    seen.add(asset.path);
    return {
      path: asset.path,
      kind: asset.kind,
      owner: asset.owner,
      roles: [...new Set(asset.roles as string[])].sort(),
    } as BundlerAsset;
  });
  for (const role of requiredBundlerRoles[bundler]) {
    if (!assets.some((asset) => asset.roles.includes(role))) {
      throw new Error(`${bundler} is missing required ${role} asset ownership`);
    }
  }
  if (!assets.some((asset) => asset.kind === "wasm")) {
    throw new Error(`${bundler} is missing a required WASM asset`);
  }
  const initialRoles = new Set(["core-initial", "react-initial", "vue-initial", "svelte-initial"]);
  for (const asset of assets) {
    if (
      (asset.roles.includes("worker-async") || asset.roles.includes("xlsx-async")) &&
      asset.roles.some((role) => initialRoles.has(role))
    ) {
      throw new Error(`${bundler} async asset ${asset.path} leaked into an initial entry`);
    }
  }
  return { schemaVersion: SIZE_PROTOCOL_VERSION, bundler, version: candidate.version, assets };
}

export function compareBudgets(
  report: Pick<SizeReport, "protocolVersion" | "tool" | "toolchain" | "metrics">,
  manifest: BudgetManifest,
): BudgetFailure[] {
  const failures: BudgetFailure[] = [];
  if (manifest.schemaVersion !== SIZE_PROTOCOL_VERSION) {
    failures.push({
      key: "$schemaVersion",
      message: `budget schema ${manifest.schemaVersion} does not match ${SIZE_PROTOCOL_VERSION}`,
    });
  }
  if (manifest.protocolVersion !== report.protocolVersion) {
    failures.push({
      key: "$protocolVersion",
      message: `budget protocol ${manifest.protocolVersion} does not match report ${report.protocolVersion}`,
    });
  }
  if (manifest.tool.name !== report.tool.name || manifest.tool.version !== report.tool.version) {
    failures.push({
      key: "$tool",
      message: `budget tool ${manifest.tool.name}@${manifest.tool.version} does not match report ${report.tool.name}@${report.tool.version}`,
    });
  }
  const toolchainKeys = new Set([
    ...Object.keys(report.toolchain),
    ...Object.keys(manifest.toolchain),
  ]);
  for (const key of [...toolchainKeys].sort()) {
    if (manifest.toolchain[key] !== report.toolchain[key]) {
      failures.push({
        key: `$toolchain.${key}`,
        message: `budget toolchain ${manifest.toolchain[key] ?? "missing"} does not match report ${
          report.toolchain[key] ?? "missing"
        }`,
      });
    }
  }
  const keys = new Set([...Object.keys(report.metrics), ...Object.keys(manifest.budgets)]);
  for (const key of [...keys].sort()) {
    const metric = report.metrics[key];
    const budget = manifest.budgets[key];
    if (metric === undefined) {
      failures.push({ key, message: "required budget metric is missing from the report" });
      continue;
    }
    if (budget === undefined) {
      failures.push({ key, message: "measured metric has no reviewed absolute budget" });
      continue;
    }
    if (!isNonNegativeInteger(metric.actual)) {
      failures.push({ key, message: `measurement is non-finite or malformed: ${metric.actual}` });
      continue;
    }
    if (
      !isNonNegativeInteger(budget.baseline) ||
      !isNonNegativeInteger(budget.maximum) ||
      budget.maximum < budget.baseline
    ) {
      failures.push({ key, message: "budget baseline or maximum is malformed" });
      continue;
    }
    if (metric.unit !== budget.unit) {
      failures.push({ key, message: `unit mismatch: report=${metric.unit} budget=${budget.unit}` });
      continue;
    }
    if (metric.actual > budget.maximum) {
      failures.push({
        key,
        message: "absolute ceiling exceeded",
        actual: metric.actual,
        limit: budget.maximum,
        delta: metric.actual - budget.maximum,
        owner: budget.owner,
      });
    }
  }
  return failures;
}

function processEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  environment.CI = "1";
  environment.NEXT_TELEMETRY_DISABLED = "1";
  return environment;
}

async function runCommand(command: string[], cwd = repositoryRoot): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
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
    throw new Error(
      `${command.join(" ")} failed with exit code ${exitCode}\n${stdout.trim()}\n${stderr.trim()}`,
    );
  }
  return stdout;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function rewriteWorkspaceRanges(
  dependencies: Record<string, string> | undefined,
  versions: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith("workspace:")) return [name, range];
      const version = versions.get(name);
      if (version === undefined) throw new Error(`No workspace version found for ${name}`);
      return [name, version];
    }),
  );
}

async function packPackages(temporaryRoot: string): Promise<PackedPackage[]> {
  const stageRoot = join(temporaryRoot, "stage");
  const tarballRoot = join(temporaryRoot, "tarballs");
  await Promise.all([
    mkdir(stageRoot, { recursive: true }),
    mkdir(tarballRoot, { recursive: true }),
  ]);
  const sourceManifests = await Promise.all(
    packageDirectories.map((directory) =>
      readJson<PackageManifest>(join(repositoryRoot, directory, "package.json")),
    ),
  );
  const versions = new Map(sourceManifests.map((manifest) => [manifest.name, manifest.version]));
  const packed: PackedPackage[] = [];

  for (let index = 0; index < packageDirectories.length; index += 1) {
    const directory = packageDirectories[index];
    const sourceManifest = sourceManifests[index];
    if (directory === undefined || sourceManifest === undefined)
      throw new Error("Package list mismatch");
    const sourceRoot = join(repositoryRoot, directory);
    const packageRoot = join(stageRoot, basename(directory));
    await mkdir(packageRoot, { recursive: true });
    for (const path of sourceManifest.files ?? []) {
      await cp(join(sourceRoot, path), join(packageRoot, path), { recursive: true });
    }
    await cp(join(repositoryRoot, "LICENSE"), join(packageRoot, "LICENSE"));
    await cp(join(sourceRoot, "README.md"), join(packageRoot, "README.md"));
    const manifest: PackageManifest = {
      ...sourceManifest,
      dependencies: rewriteWorkspaceRanges(sourceManifest.dependencies, versions),
    };
    await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const output = await runCommand(
      ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
      packageRoot,
    );
    const result = parsePackJson(output);
    packed.push({
      name: manifest.name,
      tarballPath: join(tarballRoot, result.filename),
      report: summarizePack(manifest.name, result),
    });
  }
  return packed;
}

async function loadPackedArtifacts(
  artifactDirectory: string,
  temporaryRoot: string,
): Promise<PackedPackage[]> {
  const artifactRoot = resolve(artifactDirectory);
  const release = await verifyReleaseArtifacts(artifactRoot);
  const extractRoot = join(temporaryRoot, "artifact-packages");
  await mkdir(extractRoot, { recursive: true });
  const packed: PackedPackage[] = [];
  for (const artifact of release.packages) {
    const packageRoot = join(extractRoot, artifact.name.replaceAll("/", "-"));
    await mkdir(packageRoot, { recursive: true });
    const tarballPath = join(artifactRoot, artifact.path);
    await runCommand(["tar", "-xzf", tarballPath, "-C", packageRoot]);
    const files = await Promise.all(
      artifact.files.map(async (path) => ({
        path,
        size: (await stat(join(packageRoot, "package", path))).size,
      })),
    );
    packed.push({
      name: artifact.name,
      tarballPath,
      report: summarizePack(artifact.name, {
        filename: artifact.path,
        size: artifact.bytes,
        unpackedSize: artifact.unpackedBytes,
        files,
      }),
    });
  }
  return packed;
}

async function sumPackageFiles(packageRoot: string): Promise<number> {
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) bytes += (await stat(path)).size;
    }
  }
  await visit(packageRoot);
  return bytes;
}

async function measureClosure(
  name: string,
  dependencyNames: readonly string[],
  packed: ReadonlyMap<string, string>,
  temporaryRoot: string,
  sequence: number,
): Promise<ClosureReport> {
  const consumerRoot = join(temporaryRoot, `closure-${name}-${sequence}`);
  await cp(join(repositoryRoot, "test/release-locks", name), consumerRoot, { recursive: true });
  const artifactRoot = join(consumerRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  const closureTarballs = new Map<string, string>();
  for (const packageName of dependencyNames) {
    const tarball = packed.get(packageName);
    if (tarball === undefined) throw new Error(`No packed tarball for ${packageName}`);
    closureTarballs.set(packageName, tarball);
    await cp(tarball, join(artifactRoot, basename(tarball)));
  }
  await bindCanonicalTarballIntegrities(join(consumerRoot, "package-lock.json"), closureTarballs);
  await runCommand(
    ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"],
    consumerRoot,
  );
  const lock = await readJson<{ packages?: Record<string, unknown> }>(
    join(consumerRoot, "package-lock.json"),
  );
  if (lock.packages === undefined)
    throw new Error(`${name} committed lockfile has no package graph`);
  const packagePaths = Object.keys(lock.packages)
    .filter((path) => /(?:^|\/)node_modules\//.test(path))
    .sort();
  const seen = new Set<string>();
  const packageNames: string[] = [];
  let logicalBytes = 0;
  for (const lockPath of packagePaths) {
    const packageRoot = join(consumerRoot, lockPath);
    const canonical = await realpath(packageRoot);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const manifest = await readJson<{ name?: unknown; version?: unknown }>(
      join(packageRoot, "package.json"),
    );
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`${name} installed package at ${lockPath} has malformed identity`);
    }
    packageNames.push(`${manifest.name}@${manifest.version}`);
    logicalBytes += await sumPackageFiles(packageRoot);
  }
  packageNames.sort();
  if (name !== "core-xlsx") {
    const leaked = packageNames.filter((identity) => {
      const packageName = identity.split("@").slice(0, -1).join("@");
      return excelPackages[packageName] === true;
    });
    if (leaked.length > 0)
      throw new Error(`${name} runtime closure contains Excel packages: ${leaked.join(", ")}`);
  }
  return { name, packageCount: packageNames.length, logicalBytes, packages: packageNames };
}

function addMetric(
  metrics: Record<string, Metric>,
  key: string,
  actual: number,
  unit: MetricUnit,
  category: string,
  owner: string,
): void {
  if (metrics[key] !== undefined) throw new Error(`Duplicate size metric ${key}`);
  if (!isNonNegativeInteger(actual)) throw new Error(`Metric ${key} is non-finite or malformed`);
  metrics[key] = { actual, unit, category, owner };
}

async function loadBundlerEvidence(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<BundlerEvidence[]> {
  if (!reuseBundlers) {
    const command = ["node", "test/bundler-fixtures/run.mjs"];
    if (artifactDirectory !== undefined) command.push("--artifacts", resolve(artifactDirectory));
    await runCommand(command);
  }
  const evidence: BundlerEvidence[] = [];
  for (const bundler of ["vite", "webpack", "next"] as const) {
    const path = join(evidenceRoot, "bundlers", `${bundler}.json`);
    evidence.push(validateBundlerEvidence(await readJson<unknown>(path)));
  }
  return evidence;
}

async function reportAsset(asset: BundlerAsset): Promise<AssetReport> {
  const absolutePath = resolve(repositoryRoot, asset.path);
  if (!absolutePath.startsWith(`${repositoryRoot}${sep}`)) {
    throw new Error(`Bundler asset escapes repository root: ${asset.path}`);
  }
  const content = await readFile(absolutePath);
  const compressed = compressedSizes(content);
  return {
    ...asset,
    ...compressed,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function metricSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase());
}

async function buildSizeReport(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<SizeReport> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-size-report-"));
  try {
    const packedPackages =
      artifactDirectory === undefined
        ? await packPackages(temporaryRoot)
        : await loadPackedArtifacts(artifactDirectory, temporaryRoot);
    const tarballs = new Map(packedPackages.map((entry) => [entry.name, entry.tarballPath]));
    const closureSpecs: Array<[string, string[]]> = [
      ["core", ["@sheetwrite/wasm", "@sheetwrite/core"]],
      ["react", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/react"]],
      ["vue", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/vue"]],
      ["svelte", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/svelte"]],
      ["core-xlsx", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/xlsx"]],
    ];
    const closures = await Promise.all(
      closureSpecs.map(([name, names], index) =>
        measureClosure(name, names, tarballs, temporaryRoot, index),
      ),
    );
    const repeatedCore = await measureClosure(
      "core",
      closureSpecs[0]?.[1] ?? [],
      tarballs,
      temporaryRoot,
      closureSpecs.length,
    );
    const core = closures[0];
    if (
      core === undefined ||
      core.packageCount !== repeatedCore.packageCount ||
      core.logicalBytes !== repeatedCore.logicalBytes ||
      JSON.stringify(core.packages) !== JSON.stringify(repeatedCore.packages)
    ) {
      throw new Error("Repeated core clean-install closure measurement was not deterministic");
    }

    const bundlerEvidence = await loadBundlerEvidence(reuseBundlers, artifactDirectory);
    const bundlers: SizeReport["bundlers"] = [];
    for (const evidence of bundlerEvidence) {
      const assets = await Promise.all(evidence.assets.map(reportAsset));
      assets.sort((left, right) => left.path.localeCompare(right.path));
      bundlers.push({ name: evidence.bundler, version: evidence.version, assets });
    }
    bundlers.sort((left, right) => left.name.localeCompare(right.name));

    const metrics: Record<string, Metric> = {};
    for (const entry of packedPackages) {
      const prefix = `package.${entry.name}`;
      addMetric(
        metrics,
        `${prefix}.tarballBytes`,
        entry.report.tarballBytes,
        "bytes",
        "package",
        entry.name,
      );
      addMetric(
        metrics,
        `${prefix}.unpackedBytes`,
        entry.report.unpackedBytes,
        "bytes",
        "package",
        entry.name,
      );
      addMetric(
        metrics,
        `${prefix}.fileCount`,
        entry.report.fileCount,
        "count",
        "package",
        entry.name,
      );
      for (const [category, bytes] of Object.entries(entry.report.categories).sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        addMetric(
          metrics,
          `${prefix}.${metricSegment(category)}Bytes`,
          bytes,
          "bytes",
          `package-${category}`,
          entry.name,
        );
      }
    }
    for (const closure of closures) {
      const prefix = `closure.${closure.name}`;
      addMetric(
        metrics,
        `${prefix}.packageCount`,
        closure.packageCount,
        "count",
        "install-closure",
        closure.name,
      );
      addMetric(
        metrics,
        `${prefix}.logicalBytes`,
        closure.logicalBytes,
        "bytes",
        "install-closure",
        closure.name,
      );
      const excelCount = closure.packages.filter((identity) => {
        const packageName = identity.split("@").slice(0, -1).join("@");
        return excelPackages[packageName] === true;
      }).length;
      if (closure.name !== "core-xlsx") {
        addMetric(
          metrics,
          `${prefix}.excelPackageCount`,
          excelCount,
          "count",
          "optional-dependency-isolation",
          closure.name,
        );
      }
    }
    for (const bundler of bundlers) {
      const roles = [...new Set(bundler.assets.flatMap((asset) => asset.roles))].sort();
      for (const role of roles) {
        for (const kind of ["javascript", "css", "wasm"] as const) {
          const selected = bundler.assets.filter(
            (asset) => asset.kind === kind && asset.roles.includes(role),
          );
          if (selected.length === 0) continue;
          const prefix = `bundler.${bundler.name}.${metricSegment(role)}.${kind}`;
          addMetric(
            metrics,
            `${prefix}.rawBytes`,
            selected.reduce((sum, asset) => sum + asset.rawBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.gzipBytes`,
            selected.reduce((sum, asset) => sum + asset.gzipBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.brotliBytes`,
            selected.reduce((sum, asset) => sum + asset.brotliBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
        }
      }
    }
    for (const [name, path] of [
      ["styles", join(repositoryRoot, "packages/core/styles.css")],
      ["shell", join(repositoryRoot, "packages/core/shell.css")],
    ] as const) {
      const sizes = compressedSizes(await readFile(path));
      for (const [metric, value] of Object.entries(sizes)) {
        addMetric(
          metrics,
          `css.${name}.${metric}`,
          value,
          "bytes",
          "browser-css",
          `@sheetwrite/core/${name}.css`,
        );
      }
    }

    const npmVersion = (await runCommand(["npm", "--version"])).trim();

    return {
      schemaVersion: SIZE_PROTOCOL_VERSION,
      protocolVersion: SIZE_PROTOCOL_VERSION,
      tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
      meta: {
        commit: (await runCommand(["git", "rev-parse", "HEAD"])).trim(),
        dirty:
          (await runCommand(["git", "status", "--porcelain", "--untracked-files=no"])).trim()
            .length > 0,
        timestamp: new Date().toISOString(),
      },
      toolchain: {
        bun: Bun.version,
        next: bundlers.find((entry) => entry.name === "next")?.version ?? "missing",
        node: process.versions.node,
        npm: npmVersion,
        vite: bundlers.find((entry) => entry.name === "vite")?.version ?? "missing",
        webpack: bundlers.find((entry) => entry.name === "webpack")?.version ?? "missing",
      },
      metrics: Object.fromEntries(
        Object.entries(metrics).sort(([left], [right]) => left.localeCompare(right)),
      ),
      packages: packedPackages
        .map((entry) => entry.report)
        .sort((left, right) => left.name.localeCompare(right.name)),
      closures: closures.sort((left, right) => left.name.localeCompare(right.name)),
      bundlers,
      reproduction: "bun run size:check",
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function defaultMaximum(metric: Metric): number {
  if (metric.actual === 0) return 0;
  if (metric.unit === "count") return metric.actual + 2;
  return metric.actual + Math.max(1024, Math.ceil(metric.actual * 0.05));
}

export function candidateManifest(report: SizeReport): BudgetManifest {
  const budgets: Record<string, BudgetLine> = {};
  for (const [key, metric] of Object.entries(report.metrics)) {
    budgets[key] = {
      unit: metric.unit,
      baseline: metric.actual,
      maximum: defaultMaximum(metric),
      category: metric.category,
      owner: metric.owner,
      rationale:
        metric.actual === 0
          ? "Zero-growth isolation invariant; any presence requires design review."
          : metric.unit === "count"
            ? "Approved clean baseline with at most two additional files or packages."
            : "Approved clean baseline plus the larger of five percent or 1 KiB.",
    };
  }
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
    protocolVersion: SIZE_PROTOCOL_VERSION,
    toolchain: report.toolchain,
    budgets,
  };
}

function formatTable(report: SizeReport): string {
  const rows = ["metric\tactual\tunit"];
  for (const [key, metric] of Object.entries(report.metrics)) {
    rows.push(`${key}\t${metric.actual}\t${metric.unit}`);
  }
  return rows.join("\n");
}

async function writeReport(report: SizeReport): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await rm(join(evidenceRoot, "failure.json"), { force: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function writeFailure(error: unknown): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(
    join(evidenceRoot, "failure.json"),
    `${JSON.stringify(
      {
        schemaVersion: SIZE_PROTOCOL_VERSION,
        tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
        error: message,
        reproduction: "bun run size:check",
      },
      null,
      2,
    )}\n`,
  );
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function cli(): Promise<void> {
  const mode = process.argv[2] ?? "report";
  const reuseBundlers = process.argv.includes("--reuse-bundlers");
  const artifactDirectory = optionValue("--artifacts");
  try {
    if (artifactDirectory?.startsWith("--")) {
      throw new Error("--artifacts requires a directory");
    }
    const requiredArtifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
    if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifactDirectory === undefined) {
      throw new Error("Artifact-only size verification requires --artifacts");
    }
    if (
      requiredArtifacts !== undefined &&
      (artifactDirectory === undefined || resolve(artifactDirectory) !== resolve(requiredArtifacts))
    ) {
      throw new Error("Size verification artifact input differs from the canonical artifact set");
    }
    const report = await buildSizeReport(reuseBundlers, artifactDirectory);
    await writeReport(report);
    console.log(formatTable(report));
    console.log(`JSON report: ${relative(repositoryRoot, reportPath)}`);
    if (artifactDirectory !== undefined) {
      console.log(
        `Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifactDirectory)}`,
      );
    }
    if (mode === "report") return;
    if (mode === "candidate") {
      const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
      const output = resolve(
        outputArgument?.slice("--output=".length) ??
          join(tmpdir(), "sheetwrite-size-budgets-candidate.json"),
      );
      const temporaryDirectory = resolve(tmpdir());
      if (!output.startsWith(`${temporaryDirectory}${sep}`)) {
        throw new Error(
          "Candidate budgets may only be written beneath the operating-system temporary directory",
        );
      }
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(candidateManifest(report), null, 2)}\n`);
      console.log(`Candidate budget manifest: ${output}`);
      return;
    }
    if (mode !== "check") throw new Error(`Unknown size-report mode: ${mode}`);
    const budgetArgument = process.argv.find((argument) => argument.startsWith("--budget="));
    const selectedBudgetPath = resolve(budgetArgument?.slice("--budget=".length) ?? budgetPath);
    const manifest = await readJson<BudgetManifest>(selectedBudgetPath);
    const failures = compareBudgets(report, manifest);
    if (failures.length > 0) {
      for (const failure of failures) {
        const details =
          failure.actual === undefined
            ? ""
            : ` actual=${failure.actual} limit=${failure.limit} delta=+${failure.delta} owner=${failure.owner}`;
        console.error(`SIZE FAILURE ${failure.key}:${details} ${failure.message}`);
      }
      console.error("Reproduce with: bun run size:check");
      throw new Error(`${failures.length} delivery size budget failure(s)`);
    }
    console.log("All delivery size budgets passed");
  } catch (error) {
    await writeFailure(error);
    throw error;
  }
}

if (import.meta.main) await cli();
