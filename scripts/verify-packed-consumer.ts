import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

interface PackageManifest {
  name: string;
  version: string;
  files?: string[];
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
}

interface PackageSpec {
  directory: string;
  requiredFiles: string[];
}

const repositoryRoot = resolve(import.meta.dir, "..");
const fixtureRoot = join(repositoryRoot, "test/consumer");
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
      "dist/worker.d.ts",
      "dist/worker.js",
      "dist/shell.d.ts",
      "dist/shell.js",
      "shell.css",
      "dist/xlsx-backend.d.ts",
      "dist/xlsx-backend.js",
      "styles.css",
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
  }

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

  console.log("Packed tarball consumer verification passed");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
