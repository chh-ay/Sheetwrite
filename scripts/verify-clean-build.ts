import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PUBLISHABLE_PACKAGE_ORDER, validateWorkspaceGraph } from "./workspace-tooling.js";

interface PackageManifest {
  readonly name?: string;
  readonly exports?: unknown;
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
}

const GENERATED_OUTPUTS = [
  "packages/wasm/pkg",
  "packages/wasm/target",
  "packages/core/dist",
  "packages/xlsx/dist",
  "packages/react/dist",
  "packages/vue/dist",
  "docs/dist",
  "docs/.astro",
] as const;

const RUNTIME_ENTRY_PATHS = [
  "./packages/wasm/loader-node.mjs",
  "./packages/core/dist/index.js",
  "./packages/xlsx/dist/index.js",
  "./packages/react/dist/index.js",
  "./packages/vue/dist/index.js",
] as const;

function packageDirectories(root: string): readonly string[] {
  return readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, "packages", entry.name));
}

function collectExportTargets(value: unknown, targets: string[]): void {
  if (typeof value === "string") {
    if (value.startsWith("./")) targets.push(value);
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectExportTargets(nested, targets);
  }
}

export function assertGeneratedOutputsAbsent(root: string): void {
  const present = GENERATED_OUTPUTS.filter((path) => existsSync(resolve(root, path)));
  if (present.length > 0) {
    throw new Error(
      `Clean-build verification requires absent generated output: ${present.join(", ")}`,
    );
  }
}

export function validateExportTargets(root: string): readonly string[] {
  const checked: string[] = [];
  const missing: string[] = [];
  for (const packageRoot of packageDirectories(root)) {
    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8"),
    ) as PackageManifest;
    if (!manifest.name || !PUBLISHABLE_PACKAGE_ORDER.includes(manifest.name as never)) continue;
    const targets: string[] = [];
    collectExportTargets(manifest.exports, targets);
    for (const field of [manifest.main, manifest.module, manifest.types]) {
      if (field?.startsWith("./")) targets.push(field);
    }
    for (const target of new Set(targets)) {
      const relativeTarget = target.slice(2);
      checked.push(`${manifest.name}:${target}`);
      if (!existsSync(resolve(packageRoot, relativeTarget)))
        missing.push(`${manifest.name}:${target}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Declared package export targets are missing: ${missing.join(", ")}`);
  }
  return checked.sort();
}

async function run(
  root: string,
  command: readonly [string, ...string[]],
  capture = false,
): Promise<string> {
  console.log(`::clean-build::${command.join(" ")}`);
  const child = Bun.spawn([...command], {
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdin: "ignore",
    stdout: capture ? "pipe" : "inherit",
    stderr: capture ? "pipe" : "inherit",
  });
  if (capture) {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) throw new Error(`${command.join(" ")} failed: ${stderr.trim()}`);
    return stdout;
  }
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  return "";
}

async function exportWorkspace(sourceRoot: string, destinationRoot: string): Promise<void> {
  const output = await run(
    sourceRoot,
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    true,
  );
  const paths = output.split("\0").filter(Boolean);
  if (paths.length === 0) throw new Error("Git returned no source files for the clean export");
  for (const relativePath of paths) {
    const source = resolve(sourceRoot, relativePath);
    const destination = resolve(destinationRoot, relativePath);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() && !sourceStat.isSymbolicLink()) {
      throw new Error(`Clean export encountered unsupported source entry: ${relativePath}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { dereference: false });
  }
}

async function verifyRuntimeImports(root: string): Promise<void> {
  const smokePath = resolve(root, ".sheetwrite-runtime-import-smoke.ts");
  await writeFile(
    smokePath,
    `const entries = ${JSON.stringify(RUNTIME_ENTRY_PATHS)};\n` +
      "for (const entry of entries) {\n" +
      "  // Runtime-selected entry URLs intentionally exercise built module loading boundaries.\n" +
      "  await import(new URL(entry, import.meta.url).href);\n" +
      "}\n",
  );
  try {
    await run(root, ["bun", smokePath]);
  } finally {
    await rm(smokePath, { force: true });
  }
}

export async function validateBuiltWorkspace(root: string): Promise<void> {
  validateWorkspaceGraph(root);
  const checked = validateExportTargets(root);
  await verifyRuntimeImports(root);
  console.log(
    `Validated ${checked.length} declared export target(s) and ${RUNTIME_ENTRY_PATHS.length} runtime entry import(s)`,
  );
}

export async function verifyCleanBuild(sourceRoot = resolve(import.meta.dir, "..")): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-clean-build-"));
  console.log(`Clean-build export: ${temporaryRoot}`);
  try {
    await exportWorkspace(sourceRoot, temporaryRoot);
    assertGeneratedOutputsAbsent(temporaryRoot);
    const lockBefore = await readFile(resolve(temporaryRoot, "bun.lock"));
    await run(temporaryRoot, ["bun", "install", "--frozen-lockfile"]);
    const lockAfter = await readFile(resolve(temporaryRoot, "bun.lock"));
    if (!lockBefore.equals(lockAfter)) throw new Error("Frozen install changed bun.lock");
    await run(temporaryRoot, ["bun", "run", "build:packages"]);
    await run(temporaryRoot, ["bun", "run", "typecheck:packages"]);
    await validateBuiltWorkspace(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main(args: readonly string[]): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  if (args.includes("--assert-absent")) {
    assertGeneratedOutputsAbsent(root);
    console.log("Generated package, WASM, and example outputs are absent");
    return;
  }
  if (args.includes("--validate-current")) {
    await validateBuiltWorkspace(root);
    return;
  }
  await verifyCleanBuild(root);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
