import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  BUN_VERSION,
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  PUBLISHABLE_PACKAGE_ORDER,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

export const RELEASE_ARTIFACT_SCHEMA_VERSION = 2;
export const RELEASE_ARTIFACT_MANIFEST = "release-artifacts.json";
export const RELEASE_BUILD_COMMAND = "bun run build:packages";

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly types?: unknown;
  readonly main?: unknown;
  readonly module?: unknown;
  readonly browser?: unknown;
  readonly svelte?: unknown;
  readonly [key: string]: unknown;
}

interface NpmPackResult {
  readonly name: string;
  readonly version: string;
  readonly filename: string;
  readonly size: number;
  readonly unpackedSize: number;
  readonly shasum: string;
  readonly integrity: string;
  readonly files: ReadonlyArray<{ readonly path: string }>;
}

export interface ReleaseToolchain {
  readonly bun: string;
  readonly node: string;
  readonly npm: string;
  readonly rust: string;
  readonly wasmTarget: string;
  readonly wasmPack: string;
  readonly cargoAudit: string;
  readonly cargoLlvmCov: string;
}

export interface ReleasePackageArtifact {
  readonly name: string;
  readonly version: string;
  readonly path: string;
  readonly bytes: number;
  readonly unpackedBytes: number;
  readonly fileCount: number;
  readonly files: readonly string[];
  readonly shasum: string;
  readonly integrity: string;
  readonly sha512: string;
  readonly internalDependencies: Readonly<Record<string, string>>;
}

export interface ReleaseArtifactManifest {
  readonly schemaVersion: number;
  readonly sourceCommit: string;
  readonly dirty: boolean;
  readonly toolchain: ReleaseToolchain;
  readonly buildCommand: typeof RELEASE_BUILD_COMMAND;
  readonly packages: readonly ReleasePackageArtifact[];
}

const repositoryRoot = resolve(import.meta.dir, "..");

function processEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function run(command: readonly [string, ...string[]], cwd = repositoryRoot): Promise<string> {
  const child = Bun.spawn([...command], {
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
  return stdout.trim();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function assertReleaseTreeClean(status: string): void {
  if (status.trim() !== "") {
    throw new Error(`Release tree is dirty:\n${status.trim()}`);
  }
}

export function releaseModeDirty(mode: ReleaseArtifactMode, status: string): boolean {
  if (mode === "release") assertReleaseTreeClean(status);
  return status.trim().length > 0;
}

export function assertOutputDirectoryEmpty(entries: readonly string[]): void {
  if (entries.length > 0) {
    throw new Error(
      `Release artifact output directory is not empty: ${[...entries].sort().join(", ")}`,
    );
  }
}

export function rewriteWorkspaceRanges(
  dependencies: Readonly<Record<string, string>> | undefined,
  versions: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith("workspace:")) return [name, range];
      const version = versions.get(name);
      if (version === undefined) throw new Error(`No release version found for ${name}`);
      return [name, version];
    }),
  );
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;

function collectInternalDependencies(
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): Record<string, string> {
  const internal = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (!versions.has(name)) continue;
      const expected = versions.get(name);
      if (version !== expected) {
        throw new Error(`${manifest.name} internal dependency ${name} must be ${expected}`);
      }
      internal.set(name, version);
    }
  }
  return Object.fromEntries([...internal].sort(([left], [right]) => left.localeCompare(right)));
}

function assertStableReleaseVersion(version: string, label: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`${label} must be an exact stable semantic version`);
  }
}

function expectedTarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export function expectedArtifactFiles(version: string): readonly string[] {
  return [
    RELEASE_ARTIFACT_MANIFEST,
    ...PUBLISHABLE_PACKAGE_ORDER.map((name) => expectedTarballName(name, version)),
  ].sort();
}

export function serializeReleaseManifest(manifest: ReleaseArtifactManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
export function releaseManifestDigest(bytes: Uint8Array): string {
  return `sha512-${digest(bytes, "sha512", "base64")}`;
}

export async function readReleaseManifestDigest(artifactDirectory: string): Promise<string> {
  return releaseManifestDigest(
    new Uint8Array(await readFile(join(resolve(artifactDirectory), RELEASE_ARTIFACT_MANIFEST))),
  );
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
}

function assertInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} schema drift: expected ${wanted.join(", ")}`);
  }
}

export function validateReleaseManifest(manifest: ReleaseArtifactManifest): void {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("Release manifest must be an object");
  }
  assertExactKeys(
    manifest,
    ["schemaVersion", "sourceCommit", "dirty", "toolchain", "buildCommand", "packages"],
    "Release manifest",
  );
  if (manifest.schemaVersion !== RELEASE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported release artifact schema ${String(manifest.schemaVersion)}`);
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) {
    throw new Error("Release source commit must be a full Git SHA");
  }
  if (typeof manifest.dirty !== "boolean") throw new Error("Release dirty flag must be boolean");
  if (manifest.buildCommand !== RELEASE_BUILD_COMMAND) {
    throw new Error(`Release build command must be ${RELEASE_BUILD_COMMAND}`);
  }
  const expectedToolchain: ReleaseToolchain = {
    bun: BUN_VERSION,
    node: NODE_VERSION,
    npm: NPM_VERSION,
    rust: RUST_VERSION,
    wasmTarget: WASM_TARGET,
    wasmPack: WASM_PACK_VERSION,
    cargoAudit: CARGO_AUDIT_VERSION,
    cargoLlvmCov: CARGO_LLVM_COV_VERSION,
  };
  if (typeof manifest.toolchain !== "object" || manifest.toolchain === null) {
    throw new Error("Release toolchain must be an object");
  }
  assertExactKeys(manifest.toolchain, Object.keys(expectedToolchain), "Release toolchain");
  for (const [name, expected] of Object.entries(expectedToolchain)) {
    if (manifest.toolchain[name as keyof ReleaseToolchain] !== expected) {
      throw new Error(`Release toolchain ${name} must be ${expected}`);
    }
  }
  if (!Array.isArray(manifest.packages)) throw new Error("Release packages must be an array");
  if (manifest.packages.length !== PUBLISHABLE_PACKAGE_ORDER.length) {
    throw new Error(
      `Release manifest must contain exactly ${PUBLISHABLE_PACKAGE_ORDER.length} packages`,
    );
  }
  const releaseVersion = manifest.packages[0]?.version;
  assertString(releaseVersion, "Release version");
  assertStableReleaseVersion(releaseVersion, "Release version");
  const seen = new Set<string>();
  for (const [index, artifact] of manifest.packages.entries()) {
    if (typeof artifact !== "object" || artifact === null) {
      throw new Error(`Release package ${index} must be an object`);
    }
    assertExactKeys(
      artifact,
      [
        "name",
        "version",
        "path",
        "bytes",
        "unpackedBytes",
        "fileCount",
        "files",
        "shasum",
        "integrity",
        "sha512",
        "internalDependencies",
      ],
      `Release package ${index}`,
    );
    const expectedName = PUBLISHABLE_PACKAGE_ORDER[index];
    if (artifact.name !== expectedName) {
      throw new Error(`Release package ${index} must be ${expectedName ?? "missing"}`);
    }
    if (seen.has(artifact.name)) throw new Error(`Duplicate release package ${artifact.name}`);
    seen.add(artifact.name);
    if (artifact.version !== releaseVersion) {
      throw new Error(`${artifact.name} must use coordinated version ${releaseVersion}`);
    }
    const expectedPath = expectedTarballName(artifact.name, artifact.version);
    if (artifact.path !== expectedPath || basename(artifact.path) !== artifact.path) {
      throw new Error(`${artifact.name} must use canonical tarball path ${expectedPath}`);
    }
    assertInteger(artifact.bytes, `${artifact.name} bytes`);
    assertInteger(artifact.unpackedBytes, `${artifact.name} unpackedBytes`);
    assertInteger(artifact.fileCount, `${artifact.name} fileCount`);
    if (!Array.isArray(artifact.files) || artifact.files.length !== artifact.fileCount) {
      throw new Error(`${artifact.name} packed file list does not match fileCount`);
    }
    if (new Set(artifact.files).size !== artifact.files.length) {
      throw new Error(`${artifact.name} packed file list contains duplicates`);
    }
    if ([...artifact.files].sort().some((path, fileIndex) => path !== artifact.files[fileIndex])) {
      throw new Error(`${artifact.name} packed file list must be sorted`);
    }
    assertString(artifact.shasum, `${artifact.name} shasum`);
    if (!/^[0-9a-f]{40}$/.test(artifact.shasum)) {
      throw new Error(`${artifact.name} shasum must be SHA-1 hex`);
    }
    assertString(artifact.integrity, `${artifact.name} integrity`);
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(artifact.integrity)) {
      throw new Error(`${artifact.name} integrity must be SHA-512 SRI`);
    }
    if (!/^[0-9a-f]{128}$/.test(artifact.sha512)) {
      throw new Error(`${artifact.name} sha512 must be SHA-512 hex`);
    }
    if (
      typeof artifact.internalDependencies !== "object" ||
      artifact.internalDependencies === null
    ) {
      throw new Error(`${artifact.name} internalDependencies must be an object`);
    }
    for (const [name, version] of Object.entries(artifact.internalDependencies)) {
      if (!PUBLISHABLE_PACKAGE_ORDER.includes(name as never) || version !== releaseVersion) {
        throw new Error(`${artifact.name} internal dependency ${name} must be ${releaseVersion}`);
      }
    }
  }
}

const REQUIRED_PACKAGE_FILES: Readonly<Record<string, readonly string[]>> = {
  "@sheetwrite/wasm": [
    "README.md",
    "LICENSE",
    "loader.d.ts",
    "loader.mjs",
    "loader-browser.mjs",
    "loader-node.mjs",
    "pkg/sheetwrite_wasm.d.ts",
    "pkg/sheetwrite_wasm.js",
    "pkg/sheetwrite_wasm_bg.wasm",
    "pkg/sheetwrite_wasm_bg.wasm.d.ts",
  ],
  "@sheetwrite/core": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/index.js.map",
    "dist/worker.d.ts",
    "dist/worker.js",
    "styles.css",
    "shell.css",
  ],
  "@sheetwrite/xlsx": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/index.js.map",
  ],
  "@sheetwrite/react": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js", "styles.css"],
  "@sheetwrite/vue": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js", "styles.css"],
  "@sheetwrite/svelte": ["README.md", "LICENSE", "src/Grid.svelte", "src/index.ts", "styles.css"],
};

function packageTargets(manifest: PackageManifest): string[] {
  const targets = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("./")) targets.add(value.slice(2));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(manifest.exports);
  for (const field of ["types", "main", "module", "browser", "svelte"] as const) {
    const value = manifest[field];
    if (typeof value === "string") targets.add(value.replace(/^\.\//, ""));
    else if (field === "browser") visit(value);
  }
  return [...targets];
}

function validatePackedManifest(
  artifact: ReleasePackageArtifact,
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): void {
  if (manifest.name !== artifact.name || manifest.version !== artifact.version) {
    throw new Error(`${artifact.name} packed manifest identity changed`);
  }
  if (manifest.scripts?.prepublishOnly !== undefined) {
    throw new Error(`${artifact.name} packed manifest retains prepublishOnly`);
  }
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (version.includes("workspace:")) {
        throw new Error(`${artifact.name} contains an unpublished workspace range`);
      }
      const expected = versions.get(name);
      if (expected !== undefined && version !== expected) {
        throw new Error(`${artifact.name} internal dependency ${name} must be ${expected}`);
      }
    }
  }
  const internalDependencies = collectInternalDependencies(manifest, versions);
  if (JSON.stringify(internalDependencies) !== JSON.stringify(artifact.internalDependencies)) {
    throw new Error(`${artifact.name} internal dependency map changed`);
  }
  const files = new Set(artifact.files);
  for (const required of REQUIRED_PACKAGE_FILES[artifact.name] ?? []) {
    if (!files.has(required))
      throw new Error(`${artifact.name} is missing required file ${required}`);
  }
  for (const target of packageTargets(manifest)) {
    if (!files.has(target) && !artifact.files.some((file) => file.startsWith(`${target}/`))) {
      throw new Error(`${artifact.name} package target does not exist with exact case: ${target}`);
    }
  }
  for (const declared of manifest.files ?? []) {
    const path = declared.replace(/^\.\//, "").replace(/\/$/, "");
    if (!files.has(path) && !artifact.files.some((file) => file.startsWith(`${path}/`))) {
      throw new Error(
        `${artifact.name} declared file target does not exist with exact case: ${declared}`,
      );
    }
  }
  const forbidden = artifact.files.find(
    (path) =>
      (/^(?:src)\//.test(path) && artifact.name !== "@sheetwrite/svelte") ||
      /^(?:test|tests|coverage|node_modules|\.cache|tmp|temp)\//.test(path) ||
      /(?:^|\/)(?:\.DS_Store|Thumbs\.db|[^/]+\.tmp)$/.test(path) ||
      (path.endsWith(".ts") && !path.endsWith(".d.ts") && artifact.name !== "@sheetwrite/svelte"),
  );
  if (forbidden !== undefined)
    throw new Error(`${artifact.name} contains forbidden file ${forbidden}`);
}

function digest(bytes: Uint8Array, algorithm: "sha1" | "sha512", encoding: "hex" | "base64") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

async function assertToolchain(): Promise<ReleaseToolchain> {
  const toolchain: ReleaseToolchain = {
    bun: Bun.version,
    node: process.versions.node,
    npm: await run(["npm", "--version"]),
    rust: (await run(["rustc", "--version"])).match(/^rustc\s+([^\s]+)/)?.[1] ?? "missing",
    wasmTarget: WASM_TARGET,
    wasmPack:
      (await run(["wasm-pack", "--version"])).match(/^wasm-pack\s+([^\s]+)/)?.[1] ?? "missing",
    cargoAudit:
      (await run(["cargo", "audit", "--version"])).match(
        /^cargo-audit(?:-audit)?\s+([^\s]+)/,
      )?.[1] ?? "missing",
    cargoLlvmCov:
      (await run(["cargo", "llvm-cov", "--version"])).match(/^cargo-llvm-cov\s+([^\s]+)/)?.[1] ??
      "missing",
  };
  validateReleaseManifest({
    schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    sourceCommit: "0".repeat(40),
    dirty: false,
    toolchain,
    buildCommand: RELEASE_BUILD_COMMAND,
    packages: PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
      name,
      version: "0.0.0",
      path: expectedTarballName(name, "0.0.0"),
      bytes: 0,
      unpackedBytes: 0,
      fileCount: 0,
      files: [],
      shasum: "0".repeat(40),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
      sha512: "0".repeat(128),
      internalDependencies: {},
    })),
  });
  return toolchain;
}

function parsePackResult(output: string, expectedName: string): NpmPackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Malformed npm pack JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack must return exactly one artifact");
  }
  const result = parsed[0] as Partial<NpmPackResult>;
  if (
    result.name !== expectedName ||
    typeof result.version !== "string" ||
    typeof result.filename !== "string" ||
    !Number.isInteger(result.size) ||
    !Number.isInteger(result.unpackedSize) ||
    typeof result.shasum !== "string" ||
    typeof result.integrity !== "string" ||
    !Array.isArray(result.files)
  ) {
    throw new Error(`Malformed npm pack result for ${expectedName}`);
  }
  return result as NpmPackResult;
}

async function loadSourcePackages(): Promise<
  ReadonlyArray<{ readonly directory: string; readonly manifest: PackageManifest }>
> {
  const packageDirectories = await readdir(join(repositoryRoot, "packages"), {
    withFileTypes: true,
  });
  const byName = new Map<string, { directory: string; manifest: PackageManifest }>();
  for (const entry of packageDirectories) {
    if (!entry.isDirectory()) continue;
    const directory = join(repositoryRoot, "packages", entry.name);
    const manifestPath = join(directory, "package.json");
    if (!(await pathExists(manifestPath))) continue;
    const manifest = await readJson<PackageManifest>(manifestPath);
    if (PUBLISHABLE_PACKAGE_ORDER.includes(manifest.name as never)) {
      byName.set(manifest.name, { directory, manifest });
    }
  }
  const sources = PUBLISHABLE_PACKAGE_ORDER.map((name) => {
    const source = byName.get(name);
    if (source === undefined) throw new Error(`Missing publishable workspace package ${name}`);
    return source;
  });
  const releaseVersion = sources[0]!.manifest.version;
  assertStableReleaseVersion(releaseVersion, "Publishable package version");
  for (const source of sources) {
    if (source.manifest.version !== releaseVersion) {
      throw new Error(`${source.manifest.name} must use coordinated version ${releaseVersion}`);
    }
  }
  return sources;
}

interface StagedPackage {
  readonly root: string;
  readonly internalDependencies: Readonly<Record<string, string>>;
}

async function stagePackage(
  source: { readonly directory: string; readonly manifest: PackageManifest },
  stageRoot: string,
  versions: ReadonlyMap<string, string>,
): Promise<StagedPackage> {
  const target = join(stageRoot, basename(source.directory));
  await mkdir(target, { recursive: true });
  const paths = new Set([...(source.manifest.files ?? []), "LICENSE", "README.md"]);
  for (const path of paths) {
    await cp(join(source.directory, path), join(target, path), { recursive: true });
  }
  const scripts = { ...source.manifest.scripts };
  delete scripts.prepublishOnly;
  const stagedManifest: PackageManifest = {
    ...source.manifest,
    dependencies: rewriteWorkspaceRanges(source.manifest.dependencies, versions),
    devDependencies: rewriteWorkspaceRanges(source.manifest.devDependencies, versions),
    peerDependencies: rewriteWorkspaceRanges(source.manifest.peerDependencies, versions),
    scripts: Object.keys(scripts).length === 0 ? undefined : scripts,
  };
  const internalDependencies = collectInternalDependencies(stagedManifest, versions);
  await writeFile(join(target, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);
  return { root: target, internalDependencies };
}

export async function verifyReleaseArtifacts(
  artifactDirectory: string,
): Promise<ReleaseArtifactManifest> {
  const root = resolve(artifactDirectory);
  const manifestPath = join(root, RELEASE_ARTIFACT_MANIFEST);
  if (!(await pathExists(manifestPath))) {
    throw new Error(`Release artifact directory is missing ${RELEASE_ARTIFACT_MANIFEST}`);
  }
  const manifest = await readJson<ReleaseArtifactManifest>(manifestPath);
  validateReleaseManifest(manifest);
  const entries = (await readdir(root)).sort();
  const expectedEntries = [...expectedArtifactFiles(manifest.packages[0]!.version)];
  if (
    entries.length !== expectedEntries.length ||
    entries.some((entry, index) => entry !== expectedEntries[index])
  ) {
    throw new Error(
      `Release artifact directory must contain exactly: ${expectedEntries.join(", ")}`,
    );
  }
  const sourcePackages = await loadSourcePackages();
  const sourceVersions = new Map(
    sourcePackages.map(({ manifest: source }) => [source.name, source.version] as const),
  );
  const versions = new Map(
    manifest.packages.map((artifact) => [artifact.name, artifact.version] as const),
  );
  for (const [name, version] of sourceVersions) {
    if (versions.get(name) !== version) throw new Error(`${name} source version changed`);
  }
  for (const artifact of manifest.packages) {
    const tarballPath = join(root, artifact.path);
    if (!(await pathExists(tarballPath))) {
      throw new Error(`Missing release tarball ${artifact.path}`);
    }
    const bytes = new Uint8Array(await readFile(tarballPath));
    if (bytes.byteLength !== artifact.bytes) throw new Error(`${artifact.name} byte size changed`);
    if (digest(bytes, "sha1", "hex") !== artifact.shasum) {
      throw new Error(`${artifact.name} shasum changed`);
    }
    if (`sha512-${digest(bytes, "sha512", "base64")}` !== artifact.integrity) {
      throw new Error(`${artifact.name} integrity changed`);
    }
    if (digest(bytes, "sha512", "hex") !== artifact.sha512) {
      throw new Error(`${artifact.name} sha512 changed`);
    }
    const archiveEntries = (await run(["tar", "-tzf", tarballPath])).split("\n").filter(Boolean);
    const tarFiles: string[] = [];
    for (const entry of archiveEntries) {
      if (entry === "package" || entry === "package/") continue;
      if (!entry.startsWith("package/") || entry.includes("\\") || entry.includes("\0")) {
        throw new Error(`${artifact.name} contains malicious archive path ${entry}`);
      }
      const path = entry.slice("package/".length).replace(/\/$/, "");
      if (
        path.length === 0 ||
        path.startsWith("/") ||
        path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        throw new Error(`${artifact.name} contains malicious archive path ${entry}`);
      }
      tarFiles.push(path);
    }
    tarFiles.sort();
    if (new Set(tarFiles).size !== tarFiles.length) {
      throw new Error(`${artifact.name} archive contains duplicate paths`);
    }
    if (JSON.stringify(tarFiles) !== JSON.stringify(artifact.files)) {
      throw new Error(`${artifact.name} packed file list changed`);
    }
    const verboseEntries = await run(["tar", "-tvzf", tarballPath]);
    if (verboseEntries.split("\n").some((line) => /^[lh]/.test(line))) {
      throw new Error(`${artifact.name} archive contains a link entry`);
    }
    const packedManifestText = await run(["tar", "-xOzf", tarballPath, "package/package.json"]);
    const packedManifest = JSON.parse(packedManifestText) as PackageManifest;
    validatePackedManifest(artifact, packedManifest, versions);
  }
  return manifest;
}

async function ensureEmptyOutput(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  assertOutputDirectoryEmpty(await readdir(root));
}

export type ReleaseArtifactMode = "verification" | "release";

export async function buildReleaseArtifacts(
  artifactDirectory: string,
  mode: ReleaseArtifactMode = "verification",
): Promise<ReleaseArtifactManifest> {
  const outputRoot = resolve(artifactDirectory);
  const status = await run(["git", "status", "--porcelain", "--untracked-files=no"]);
  const dirty = releaseModeDirty(mode, status);
  await ensureEmptyOutput(outputRoot);
  const [sourceCommit, toolchain, sources] = await Promise.all([
    run(["git", "rev-parse", "HEAD"]),
    assertToolchain(),
    loadSourcePackages(),
  ]);
  await run(["bun", "run", "build:packages"]);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-release-artifacts-"));
  try {
    const stageRoot = join(temporaryRoot, "stage");
    const tarballRoot = join(temporaryRoot, "tarballs");
    await Promise.all([mkdir(stageRoot), mkdir(tarballRoot)]);
    const versions = new Map(
      sources.map(({ manifest }) => [manifest.name, manifest.version] as const),
    );
    const packages: ReleasePackageArtifact[] = [];
    for (const source of sources) {
      const staged = await stagePackage(source, stageRoot, versions);
      const result = parsePackResult(
        await run(
          ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
          staged.root,
        ),
        source.manifest.name,
      );
      if (result.version !== source.manifest.version) {
        throw new Error(
          `${result.name} npm pack version changed to ${result.version}, expected ${source.manifest.version}`,
        );
      }
      const expectedFilename = expectedTarballName(result.name, result.version);
      if (result.filename !== expectedFilename) {
        throw new Error(`${result.name} npm pack filename must be ${expectedFilename}`);
      }
      const tarballPath = join(tarballRoot, result.filename);
      const tarballBytes = new Uint8Array(await readFile(tarballPath));
      const files = result.files.map((file) => file.path).sort();
      const artifact: ReleasePackageArtifact = {
        name: result.name,
        version: result.version,
        path: result.filename,
        bytes: result.size,
        unpackedBytes: result.unpackedSize,
        fileCount: files.length,
        files,
        shasum: result.shasum,
        integrity: result.integrity,
        sha512: digest(tarballBytes, "sha512", "hex"),
        internalDependencies: staged.internalDependencies,
      };
      if (
        tarballBytes.byteLength !== artifact.bytes ||
        digest(tarballBytes, "sha1", "hex") !== artifact.shasum ||
        `sha512-${digest(tarballBytes, "sha512", "base64")}` !== artifact.integrity ||
        digest(tarballBytes, "sha512", "hex") !== artifact.sha512
      ) {
        throw new Error(`${artifact.name} npm pack digest metadata does not match its tarball`);
      }
      packages.push(artifact);
    }
    const manifest: ReleaseArtifactManifest = {
      schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      sourceCommit,
      dirty,
      toolchain,
      buildCommand: RELEASE_BUILD_COMMAND,
      packages,
    };
    validateReleaseManifest(manifest);
    for (const artifact of manifest.packages) {
      await cp(join(tarballRoot, artifact.path), join(outputRoot, artifact.path));
    }
    await writeFile(
      join(outputRoot, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(manifest),
    );
    await verifyReleaseArtifacts(outputRoot);
    return manifest;
  } catch (error) {
    await rm(outputRoot, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function requiredOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`Missing required ${name} path`);
  return value;
}

async function cli(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "build") {
    const output = requiredOption(args, "--output");
    const manifest = await buildReleaseArtifacts(output, "verification");
    console.log(
      `Built ${manifest.packages.length} canonical release tarballs in ${resolve(output)}`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(output)}`);
    return;
  }
  if (command === "prepare") {
    const mode = requiredOption(args, "--mode");
    if (mode !== "verification" && mode !== "release") {
      throw new Error("--mode must be verification or release");
    }
    const output = requiredOption(args, "--output");
    const manifest = await buildReleaseArtifacts(output, mode);
    console.log(
      `Prepared ${manifest.packages.length} canonical release tarballs in ${resolve(output)} (${mode})`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(output)}`);
    return;
  }
  if (command === "verify") {
    const artifacts = requiredOption(args, "--artifacts");
    const manifest = await verifyReleaseArtifacts(artifacts);
    console.log(
      `Verified ${manifest.packages.length} canonical release tarballs from ${manifest.sourceCommit}`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifacts)}`);
    return;
  }
  if (command === "verify-input") {
    const artifacts = requiredOption(args, "--input");
    const manifest = await verifyReleaseArtifacts(artifacts);
    console.log(
      `Verified ${manifest.packages.length} canonical release tarballs from ${manifest.sourceCommit}`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifacts)}`);
    return;
  }
  throw new Error(
    "Usage: bun scripts/release-artifacts.ts build --output <directory> | prepare --mode <verification|release> --output <directory> | verify --artifacts <directory> | verify-input --input <directory>",
  );
}

if (import.meta.main) await cli();
