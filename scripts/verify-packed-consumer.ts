import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { verifyReleaseArtifacts } from "./release-artifacts.js";

interface PackageManifest {
  name: string;
  version: string;
  license?: unknown;
  files?: string[];
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: Array<{ path: string }>;
}

interface PackageSpec {
  directory: string;
  requiredFiles: string[];
  forbiddenFiles?: string[];
}

const repositoryRoot = resolve(import.meta.dir, "..");
const fixtureRoot = join(repositoryRoot, "test/consumer");
const excelPackages = ["exceljs", "read-excel-file", "write-excel-file"] as const;
const mitCompatibleLicenses: Record<string, true> = {
  "0BSD": true,
  "Apache-2.0": true,
  "BSD-2-Clause": true,
  "BSD-3-Clause": true,
  "BlueOak-1.0.0": true,
  "CC0-1.0": true,
  ISC: true,
  MIT: true,
  "MIT/X11": true,
  Unlicense: true,
  Zlib: true,
};
// The 0.1.1 tarball predates its package.json license field. Debian records the
// upstream MIT grant and source commit: https://sources.debian.org/copyright/license/node-buffers/0.1.1-2/
const auditedLicenseOverrides: Record<string, string> = {
  "buffers@0.1.1": "MIT",
};
const packageSpecs: PackageSpec[] = [
  {
    directory: "packages/core",
    requiredFiles: [
      "LICENSE",
      "README.md",
      "dist/adapter.d.ts",
      "dist/adapter.js",
      "dist/index.d.ts",
      "dist/index.js",
      "dist/types/cell.d.ts",
      "dist/types/cell.d.ts.map",
      "dist/types/coordinates.d.ts",
      "dist/types/coordinates.d.ts.map",
      "dist/types/data.d.ts",
      "dist/types/data.d.ts.map",
      "dist/types/document.d.ts",
      "dist/types/document.d.ts.map",
      "dist/types/grid.d.ts",
      "dist/types/grid.d.ts.map",
      "dist/types/render.d.ts",
      "dist/types/render.d.ts.map",
      "dist/types/store.d.ts",
      "dist/types/store.d.ts.map",
      "dist/types/transaction.d.ts",
      "dist/types/transaction.d.ts.map",
      "dist/worker.d.ts",
      "dist/worker.js",
      "dist/shell.d.ts",
      "dist/shell.js",
      "shell.css",
      "styles.css",
    ],
    forbiddenFiles: [
      "dist/types/cell.js",
      "dist/types/cell.js.map",
      "dist/types/coordinates.js",
      "dist/types/coordinates.js.map",
      "dist/types/data.js",
      "dist/types/data.js.map",
      "dist/types/document.js",
      "dist/types/document.js.map",
      "dist/types/grid.js",
      "dist/types/grid.js.map",
      "dist/types/render.js",
      "dist/types/render.js.map",
      "dist/types/store.js",
      "dist/types/store.js.map",
      "dist/types/transaction.js",
      "dist/types/transaction.js.map",
    ],
  },
  {
    directory: "packages/wasm",
    requiredFiles: [
      "LICENSE",
      "README.md",
      "loader.d.ts",
      "loader.mjs",
      "pkg/sheetwrite_wasm.d.ts",
      "pkg/sheetwrite_wasm.js",
      "pkg/sheetwrite_wasm_bg.wasm",
      "pkg/sheetwrite_wasm_bg.wasm.d.ts",
    ],
  },
  {
    directory: "packages/xlsx",
    requiredFiles: [
      "LICENSE",
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "dist/index.js.map",
      "dist/register.d.ts",
      "dist/register.d.ts.map",
      "dist/register.js",
      "dist/register.js.map",
      "dist/registration.d.ts",
      "dist/registration.js",
      "dist/table-export.d.ts",
      "dist/table-export.js",
      "dist/table-import.d.ts",
      "dist/table-import.js",
      "dist/workbook.d.ts",
      "dist/workbook.js",
    ],
  },
  {
    directory: "packages/react",
    requiredFiles: ["LICENSE", "README.md", "dist/index.d.ts", "dist/index.js"],
  },
  {
    directory: "packages/vue",
    requiredFiles: ["LICENSE", "README.md", "dist/index.d.ts", "dist/index.js"],
  },
  {
    directory: "packages/svelte",
    requiredFiles: ["LICENSE", "README.md", "src/Grid.svelte", "src/index.ts"],
  },
];

async function run(command: string[], cwd: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    env: processEnv(),
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed in ${cwd}\n${stdout.trim()}\n${stderr.trim()}`);
  }

  return stdout;
}

function processEnv(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  environment.CI = "1";
  return environment;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function collectExportTargets(value: unknown, targets: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.startsWith("./")) targets.push(value.slice(2));
    return targets;
  }
  if (value === null || typeof value !== "object") return targets;

  for (const nested of Object.values(value)) collectExportTargets(nested, targets);
  return targets;
}

function rewriteWorkspaceRanges(
  dependencies: Record<string, string> | undefined,
  versions: Map<string, string>,
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

async function stagePackage(
  spec: PackageSpec,
  stageRoot: string,
  versions: Map<string, string>,
): Promise<PackageManifest> {
  const sourceRoot = join(repositoryRoot, spec.directory);
  const manifest = await readJson<PackageManifest>(join(sourceRoot, "package.json"));
  const packageRoot = join(stageRoot, basename(spec.directory));
  await mkdir(packageRoot, { recursive: true });

  for (const path of [...(manifest.files ?? []), "LICENSE", "README.md"]) {
    await cp(join(sourceRoot, path), join(packageRoot, path), { recursive: true });
  }

  const stagedManifest: PackageManifest = {
    ...manifest,
    dependencies: rewriteWorkspaceRanges(manifest.dependencies, versions),
  };
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify(stagedManifest, null, 2)}\n`,
  );
  return stagedManifest;
}

async function assertWorkerBundle(packageRoot: string, manifest: PackageManifest): Promise<void> {
  if (manifest.name !== "@sheetwrite/core") return;

  const result = await Bun.build({
    entrypoints: [join(packageRoot, "dist/worker.js")],
    format: "esm",
    target: "browser",
  });
  if (!result.success || result.outputs.length === 0) {
    const diagnostics = result.logs.map((log) => log.message).join("\n");
    throw new Error(
      `${manifest.name} packed Worker entry has an unresolvable module graph\n${diagnostics}`,
    );
  }
}

async function assertTarball(
  spec: PackageSpec,
  manifest: PackageManifest,
  result: PackResult,
  tarballPath: string,
  extractRoot: string,
): Promise<void> {
  const packedFiles = new Set(result.files.map((file) => file.path));
  for (const requiredFile of spec.requiredFiles) {
    if (!packedFiles.has(requiredFile)) {
      throw new Error(`${manifest.name} tarball is missing ${requiredFile}`);
    }
  }
  for (const forbiddenFile of spec.forbiddenFiles ?? []) {
    if (packedFiles.has(forbiddenFile)) {
      throw new Error(
        `${manifest.name} tarball contains unreachable runtime type module ${forbiddenFile}`,
      );
    }
  }

  if (manifest.name === "@sheetwrite/xlsx") {
    for (const path of packedFiles) {
      if (path.startsWith("src/") || path.startsWith("test/") || path.startsWith("node_modules/")) {
        throw new Error(`${manifest.name} tarball contains forbidden path ${path}`);
      }
    }
  }
  if (
    manifest.name === "@sheetwrite/core" &&
    [...packedFiles].some((path) => path.includes("xlsx-backend"))
  ) {
    throw new Error("@sheetwrite/core tarball still contains the removed XLSX backend");
  }
  for (const dependency of excelPackages) {
    const ownsDependency = manifest.dependencies?.[dependency] !== undefined;
    if (manifest.name === "@sheetwrite/xlsx" && !ownsDependency) {
      throw new Error(`${manifest.name} must declare ${dependency}`);
    }
    if (manifest.name !== "@sheetwrite/xlsx" && ownsDependency) {
      throw new Error(`${manifest.name} must not declare ${dependency}`);
    }
  }

  await mkdir(extractRoot, { recursive: true });
  await run(["tar", "-xzf", tarballPath, "-C", extractRoot], repositoryRoot);
  const packageRoot = join(extractRoot, "package");
  const packedManifest = await readJson<PackageManifest>(join(packageRoot, "package.json"));
  const metadata = JSON.stringify(packedManifest);
  if (metadata.includes("workspace:")) {
    throw new Error(`${manifest.name} contains an unpublished workspace dependency range`);
  }

  for (const target of collectExportTargets(packedManifest.exports)) {
    await access(join(packageRoot, target));
  }

  await assertWorkerBundle(packageRoot, packedManifest);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function verifyNoExcelClosure(
  name: string,
  packageName: string,
  tarballs: ReadonlyMap<string, string>,
  temporaryRoot: string,
): Promise<void> {
  const root = join(temporaryRoot, `without-xlsx-${name}`);
  await mkdir(root, { recursive: true });
  const dependencies: Record<string, string> = {};
  for (const localPackage of new Set([packageName, "@sheetwrite/core", "@sheetwrite/wasm"])) {
    const tarball = tarballs.get(localPackage);
    if (tarball === undefined) throw new Error(`Missing tarball for ${localPackage}`);
    dependencies[localPackage] = `file:${tarball}`;
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: `sheetwrite-${name}-without-xlsx`, private: true, type: "module", dependencies }, null, 2)}\n`,
  );
  await run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], root);

  const lock = await readFile(join(root, "package-lock.json"), "utf8");
  for (const dependency of excelPackages) {
    if (lock.includes(`node_modules/${dependency}`)) {
      throw new Error(`${packageName} package-lock unexpectedly contains ${dependency}`);
    }
    if (await pathExists(join(root, "node_modules", ...dependency.split("/")))) {
      throw new Error(`${packageName} node_modules unexpectedly contains ${dependency}`);
    }
  }

  const adapterProbe =
    packageName === "@sheetwrite/svelte"
      ? "const Entry = Core;"
      : `// Dynamic import intentionally checks the selected packed adapter entry.
         const Entry = await import(${JSON.stringify(packageName)});`;
  const runtime = `
    import * as Core from "@sheetwrite/core";
    ${adapterProbe}
    if (typeof Core.createGrid !== "function" || Object.keys(Entry).length === 0) {
      throw new Error("packed core or adapter entry failed to load");
    }
  `;
  await run(["node", "--input-type=module", "--eval", runtime], root);
}

async function resolveRuntimeDependency(
  name: string,
  packageRoot: string,
  consumerRoot: string,
): Promise<string> {
  let current = packageRoot;
  while (current.startsWith(consumerRoot)) {
    const candidate = join(current, "node_modules", ...name.split("/"));
    if (await pathExists(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to resolve runtime dependency ${name} from ${packageRoot}`);
}

async function auditRuntimeLicenses(consumerRoot: string): Promise<number> {
  const queue = [join(consumerRoot, "node_modules", "@sheetwrite", "xlsx")];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const packageRoot = queue.pop()!;
    if (visited.has(packageRoot)) continue;
    visited.add(packageRoot);
    const manifest = await readJson<PackageManifest>(join(packageRoot, "package.json"));
    const declaredLicense =
      typeof manifest.license === "string"
        ? manifest.license
        : manifest.license &&
            typeof manifest.license === "object" &&
            "type" in manifest.license &&
            typeof manifest.license.type === "string"
          ? manifest.license.type
          : "";
    const rawLicense =
      declaredLicense || auditedLicenseOverrides[`${manifest.name}@${manifest.version}`] || "";
    const alternatives = rawLicense.replace(/[()]/g, "").split(/\s+OR\s+/);
    const compatible = alternatives.some((alternative) =>
      alternative
        .split(/\s+AND\s+/)
        .every((license) => mitCompatibleLicenses[license.trim()] === true),
    );
    if (!compatible) {
      throw new Error(
        `${manifest.name} has unresolved or incompatible license ${rawLicense || "<missing>"}`,
      );
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push(await resolveRuntimeDependency(dependency, packageRoot, consumerRoot));
    }
  }
  return visited.size;
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const artifactDirectory = optionValue("--artifacts");
const requiredArtifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifactDirectory === undefined) {
  throw new Error("Artifact-only packed verification requires --artifacts");
}
if (
  requiredArtifacts !== undefined &&
  (artifactDirectory === undefined || resolve(artifactDirectory) !== resolve(requiredArtifacts))
) {
  throw new Error("Packed verification artifact input differs from the canonical artifact set");
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-packed-consumer-"));
try {
  const stageRoot = join(temporaryRoot, "stage");
  const tarballRoot = join(temporaryRoot, "tarballs");
  const extractRoot = join(temporaryRoot, "extracted");
  const consumerRoot = join(temporaryRoot, "consumer");
  await Promise.all([
    mkdir(stageRoot, { recursive: true }),
    mkdir(tarballRoot, { recursive: true }),
    mkdir(extractRoot, { recursive: true }),
  ]);

  const sourceManifests = await Promise.all(
    packageSpecs.map((spec) =>
      readJson<PackageManifest>(join(repositoryRoot, spec.directory, "package.json")),
    ),
  );
  const versions = new Map(
    sourceManifests.map((manifest) => [manifest.name, manifest.version] as const),
  );
  const tarballs = new Map<string, string>();
  const packageSizes = new Map<string, { packed: number; unpacked: number }>();

  if (artifactDirectory === undefined) {
    for (const spec of packageSpecs) {
      const manifest = await stagePackage(spec, stageRoot, versions);
      const packageRoot = join(stageRoot, basename(spec.directory));
      const output = await run(
        ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
        packageRoot,
      );
      const results = JSON.parse(output) as PackResult[];
      const result = results[0];
      if (result === undefined) throw new Error(`npm pack returned no result for ${manifest.name}`);

      const tarballPath = join(tarballRoot, result.filename);
      await assertTarball(
        spec,
        manifest,
        result,
        tarballPath,
        join(extractRoot, basename(spec.directory)),
      );
      tarballs.set(manifest.name, tarballPath);
      packageSizes.set(manifest.name, { packed: result.size, unpacked: result.unpackedSize });
    }
  } else {
    const release = await verifyReleaseArtifacts(resolve(artifactDirectory));
    const artifacts = new Map(release.packages.map((artifact) => [artifact.name, artifact]));
    for (const [index, spec] of packageSpecs.entries()) {
      const manifest = sourceManifests[index];
      if (manifest === undefined) throw new Error(`Missing source manifest for ${spec.directory}`);
      const artifact = artifacts.get(manifest.name);
      if (artifact === undefined)
        throw new Error(`Missing canonical artifact for ${manifest.name}`);
      const tarballPath = join(resolve(artifactDirectory), artifact.path);
      const result: PackResult = {
        filename: artifact.path,
        size: artifact.bytes,
        unpackedSize: artifact.unpackedBytes,
        files: artifact.files.map((path) => ({ path })),
      };
      await assertTarball(
        spec,
        manifest,
        result,
        tarballPath,
        join(extractRoot, basename(spec.directory)),
      );
      tarballs.set(manifest.name, tarballPath);
      packageSizes.set(manifest.name, {
        packed: artifact.bytes,
        unpacked: artifact.unpackedBytes,
      });
    }
  }

  await Promise.all([
    verifyNoExcelClosure("core", "@sheetwrite/core", tarballs, temporaryRoot),
    verifyNoExcelClosure("react", "@sheetwrite/react", tarballs, temporaryRoot),
    verifyNoExcelClosure("vue", "@sheetwrite/vue", tarballs, temporaryRoot),
    verifyNoExcelClosure("svelte", "@sheetwrite/svelte", tarballs, temporaryRoot),
  ]);

  await cp(fixtureRoot, consumerRoot, { recursive: true });
  const consumerManifest = await readJson<PackageManifest>(join(consumerRoot, "package.json"));
  consumerManifest.dependencies = {
    ...consumerManifest.dependencies,
    ...Object.fromEntries([...tarballs].map(([name, path]) => [name, `file:${path}`])),
  };
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(consumerManifest, null, 2)}\n`,
  );

  await run(
    ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
    consumerRoot,
  );
  await run(
    ["npm", "ls", "@sheetwrite/core", "@sheetwrite/wasm", "react", "svelte", "vue"],
    consumerRoot,
  );
  const auditedLicenseCount = await auditRuntimeLicenses(consumerRoot);
  await run(["npm", "run", "typecheck"], consumerRoot);
  await run(["npm", "run", "bundle"], consumerRoot);
  await run(["npm", "run", "bundle:svelte"], consumerRoot);
  await run(["npm", "run", "runtime"], consumerRoot);

  // The Vite build must have COMPILED the Svelte adapter from the tarball's
  // raw source (svelte export condition) and linked the shared controller —
  // not tree-shaken it away. Function names are minified, so probe for a
  // handler PROPERTY name (esbuild never mangles property accesses).
  const viteAssets = join(consumerRoot, "dist-vite/assets");
  const assetFiles = await readdir(viteAssets);
  let adapterCompiled = false;
  for (const name of assetFiles) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(viteAssets, name), "utf8");
    if (content.includes("onActiveSheetChange")) adapterCompiled = true;
  }
  if (!adapterCompiled) {
    throw new Error("Vite consumer bundle does not contain the compiled Svelte adapter");
  }

  for (const [name, size] of packageSizes) {
    console.log(`${name}: packed=${size.packed}B unpacked=${size.unpacked}B`);
  }
  console.log(`Audited ${auditedLicenseCount} MIT-compatible XLSX runtime package licenses`);
  console.log("Packed tarball consumer verification passed");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
