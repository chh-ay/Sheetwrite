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

export const RELEASE_ARTIFACT_SCHEMA_VERSION = 1;
export const RELEASE_ARTIFACT_MANIFEST = "release-manifest.json";
export const INITIAL_RELEASE_VERSION = "0.1.0";

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
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
}

export interface ReleaseArtifactManifest {
  readonly schemaVersion: number;
  readonly sourceCommit: string;
  readonly toolchain: ReleaseToolchain;
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

function expectedTarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export function expectedArtifactFiles(): readonly string[] {
  return [
    RELEASE_ARTIFACT_MANIFEST,
    ...PUBLISHABLE_PACKAGE_ORDER.map((name) => expectedTarballName(name, INITIAL_RELEASE_VERSION)),
  ].sort();
}

export function serializeReleaseManifest(manifest: ReleaseArtifactManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
}

function assertInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function validateReleaseManifest(manifest: ReleaseArtifactManifest): void {
  if (manifest.schemaVersion !== RELEASE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported release artifact schema ${String(manifest.schemaVersion)}`);
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) {
    throw new Error("Release source commit must be a full Git SHA");
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
  for (const [name, expected] of Object.entries(expectedToolchain)) {
    if (manifest.toolchain?.[name as keyof ReleaseToolchain] !== expected) {
      throw new Error(`Release toolchain ${name} must be ${expected}`);
    }
  }
  if (!Array.isArray(manifest.packages)) throw new Error("Release packages must be an array");
  if (manifest.packages.length !== PUBLISHABLE_PACKAGE_ORDER.length) {
    throw new Error(
      `Release manifest must contain exactly ${PUBLISHABLE_PACKAGE_ORDER.length} packages`,
    );
  }
  const seen = new Set<string>();
  for (const [index, artifact] of manifest.packages.entries()) {
    const expectedName = PUBLISHABLE_PACKAGE_ORDER[index];
    if (artifact.name !== expectedName) {
      throw new Error(`Release package ${index} must be ${expectedName ?? "missing"}`);
    }
    if (seen.has(artifact.name)) throw new Error(`Duplicate release package ${artifact.name}`);
    seen.add(artifact.name);
    if (artifact.version !== INITIAL_RELEASE_VERSION) {
      throw new Error(`${artifact.name} must remain version ${INITIAL_RELEASE_VERSION}`);
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
  }
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
    toolchain,
    packages: PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
      name,
      version: INITIAL_RELEASE_VERSION,
      path: expectedTarballName(name, INITIAL_RELEASE_VERSION),
      bytes: 0,
      unpackedBytes: 0,
      fileCount: 0,
      files: [],
      shasum: "0".repeat(40),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
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
  return PUBLISHABLE_PACKAGE_ORDER.map((name) => {
    const source = byName.get(name);
    if (source === undefined) throw new Error(`Missing publishable workspace package ${name}`);
    if (source.manifest.version !== INITIAL_RELEASE_VERSION) {
      throw new Error(`${name} must remain version ${INITIAL_RELEASE_VERSION}`);
    }
    return source;
  });
}

async function stagePackage(
  source: { readonly directory: string; readonly manifest: PackageManifest },
  stageRoot: string,
  versions: ReadonlyMap<string, string>,
): Promise<string> {
  const target = join(stageRoot, basename(source.directory));
  await mkdir(target, { recursive: true });
  const paths = new Set([...(source.manifest.files ?? []), "LICENSE", "README.md"]);
  for (const path of paths) {
    await cp(join(source.directory, path), join(target, path), { recursive: true });
  }
  const stagedManifest: PackageManifest = {
    ...source.manifest,
    dependencies: rewriteWorkspaceRanges(source.manifest.dependencies, versions),
  };
  await writeFile(join(target, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);
  return target;
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
  const expectedEntries = [...expectedArtifactFiles()];
  if (
    entries.length !== expectedEntries.length ||
    entries.some((entry, index) => entry !== expectedEntries[index])
  ) {
    throw new Error(
      `Release artifact directory must contain exactly: ${expectedEntries.join(", ")}`,
    );
  }
  for (const artifact of manifest.packages) {
    const tarballPath = join(root, artifact.path);
    if (!(await pathExists(tarballPath)))
      throw new Error(`Missing release tarball ${artifact.path}`);
    const bytes = new Uint8Array(await readFile(tarballPath));
    if (bytes.byteLength !== artifact.bytes) throw new Error(`${artifact.name} byte size changed`);
    if (digest(bytes, "sha1", "hex") !== artifact.shasum) {
      throw new Error(`${artifact.name} shasum changed`);
    }
    if (`sha512-${digest(bytes, "sha512", "base64")}` !== artifact.integrity) {
      throw new Error(`${artifact.name} integrity changed`);
    }
    const tarFiles = (await run(["tar", "-tzf", tarballPath]))
      .split("\n")
      .filter((path) => path.startsWith("package/") && path !== "package/")
      .map((path) => path.slice("package/".length).replace(/\/$/, ""))
      .filter((path) => path.length > 0)
      .sort();
    if (JSON.stringify(tarFiles) !== JSON.stringify(artifact.files)) {
      throw new Error(`${artifact.name} packed file list changed`);
    }
    const packedManifestText = await run(["tar", "-xOzf", tarballPath, "package/package.json"]);
    const packedManifest = JSON.parse(packedManifestText) as PackageManifest;
    if (packedManifest.name !== artifact.name || packedManifest.version !== artifact.version) {
      throw new Error(`${artifact.name} packed manifest identity changed`);
    }
    if (packedManifestText.includes("workspace:")) {
      throw new Error(`${artifact.name} contains an unpublished workspace range`);
    }
  }
  return manifest;
}

async function ensureEmptyOutput(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  assertOutputDirectoryEmpty(await readdir(root));
}

export async function buildReleaseArtifacts(
  artifactDirectory: string,
): Promise<ReleaseArtifactManifest> {
  const outputRoot = resolve(artifactDirectory);
  assertReleaseTreeClean(await run(["git", "status", "--porcelain", "--untracked-files=all"]));
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
      const packageRoot = await stagePackage(source, stageRoot, versions);
      const result = parsePackResult(
        await run(
          ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
          packageRoot,
        ),
        source.manifest.name,
      );
      if (result.version !== INITIAL_RELEASE_VERSION) {
        throw new Error(`${result.name} npm pack version changed to ${result.version}`);
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
      };
      if (
        tarballBytes.byteLength !== artifact.bytes ||
        digest(tarballBytes, "sha1", "hex") !== artifact.shasum ||
        `sha512-${digest(tarballBytes, "sha512", "base64")}` !== artifact.integrity
      ) {
        throw new Error(`${artifact.name} npm pack digest metadata does not match its tarball`);
      }
      packages.push(artifact);
    }
    const manifest: ReleaseArtifactManifest = {
      schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      sourceCommit,
      toolchain,
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
    const manifest = await buildReleaseArtifacts(output);
    console.log(
      `Built ${manifest.packages.length} canonical release tarballs in ${resolve(output)}`,
    );
    return;
  }
  if (command === "prepare") {
    const mode = requiredOption(args, "--mode");
    if (mode !== "verification" && mode !== "release") {
      throw new Error("--mode must be verification or release");
    }
    const output = requiredOption(args, "--output");
    const manifest = await buildReleaseArtifacts(output);
    console.log(
      `Prepared ${manifest.packages.length} canonical release tarballs in ${resolve(output)} (${mode})`,
    );
    return;
  }
  if (command === "verify") {
    const artifacts = requiredOption(args, "--artifacts");
    const manifest = await verifyReleaseArtifacts(artifacts);
    console.log(
      `Verified ${manifest.packages.length} canonical release tarballs from ${manifest.sourceCommit}`,
    );
    return;
  }
  if (command === "verify-input") {
    const artifacts = requiredOption(args, "--input");
    const manifest = await verifyReleaseArtifacts(artifacts);
    console.log(
      `Verified ${manifest.packages.length} canonical release tarballs from ${manifest.sourceCommit}`,
    );
    return;
  }
  throw new Error(
    "Usage: bun scripts/release-artifacts.ts build --output <directory> | prepare --mode <verification|release> --output <directory> | verify --artifacts <directory> | verify-input --input <directory>",
  );
}

if (import.meta.main) await cli();
