import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  type CoverageLanguage,
  type CoverageRecord,
  type CoverageThresholdEntry,
  evaluateCoveragePolicy,
  filterRuntimeRecords,
  type LcovRecord,
  mergeLcovRecords,
  normalizeRustCoverage,
  parseCoverageManifest,
  parseLcov,
  serialiseNormalizedLcov,
} from "./coverage-check.js";

const CARGO_LLVM_COV_VERSION = "0.8.7";
const RUST_VERSION = "1.96.0";
const TYPESCRIPT_ROOTS = [
  "packages/core/src",
  "packages/react/src",
  "packages/vue/src",
  "packages/svelte/src",
  "packages/xlsx/src",
] as const;
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".svelte"]);
const TYPESCRIPT_TEST_ROOTS = [
  "packages/core/test",
  "packages/react/test",
  "packages/vue/test",
  "packages/svelte/test",
  "packages/xlsx/test",
] as const;

async function filesRecursively(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) output.push(...(await filesRecursively(path)));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

export async function discoverRuntimePaths(
  root: string,
  language: CoverageLanguage,
): Promise<readonly string[]> {
  if (language === "rust") {
    return (await filesRecursively(resolve(root, "packages/wasm/src")))
      .filter((path) => extname(path) === ".rs" && !path.endsWith("/tests.rs"))
      .map((path) => path.slice(resolve(root).length + 1).replaceAll("\\", "/"))
      .sort();
  }

  const paths: string[] = [];
  for (const sourceRoot of TYPESCRIPT_ROOTS) {
    paths.push(
      ...(await filesRecursively(resolve(root, sourceRoot)))
        .filter((path) => TYPESCRIPT_EXTENSIONS.has(extname(path)) && !path.endsWith(".d.ts"))
        .map((path) => path.slice(resolve(root).length + 1).replaceAll("\\", "/")),
    );
  }
  for (const entry of await readdir(resolve(root, "packages/wasm"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith("loader") && entry.name.endsWith(".mjs")) {
      paths.push(`packages/wasm/${entry.name}`);
    }
  }
  return paths.sort();
}

async function run(command: readonly string[], root: string): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd: root,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

async function outputOf(command: readonly string[], root: string): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`);
  }
  return stdout.trim();
}

function ratio(counts: { covered: number; total: number }): string {
  const percent = counts.total === 0 ? 100 : (counts.covered * 100) / counts.total;
  return `${percent.toFixed(2)}% (${counts.covered}/${counts.total})`;
}

function printTable(
  records: readonly CoverageRecord[],
  entries: readonly CoverageThresholdEntry[],
): void {
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  console.log(
    "Tier  Source                                                   Lines              Functions          Regions",
  );
  for (const record of [...records].sort((left, right) => left.path.localeCompare(right.path))) {
    const tier = entryByPath.get(record.path)?.tier ?? "?";
    console.log(
      `${tier.padEnd(5)} ${record.path.padEnd(56)} ${ratio(record.lines).padEnd(18)} ${ratio(record.functions).padEnd(18)} ${record.regions ? ratio(record.regions) : "-"}`,
    );
  }
}

function lineRanges(lines: readonly number[]): string {
  const ranges: Array<[number, number]> = [];
  for (const line of [...new Set(lines)].sort((left, right) => left - right)) {
    const last = ranges.at(-1);
    if (!last || line > last[1] + 1) ranges.push([line, line]);
    else last[1] = line;
  }
  return ranges
    .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`))
    .join(", ");
}

function uncoveredDiagnostics(
  records: readonly CoverageRecord[],
  entries: readonly CoverageThresholdEntry[],
): string {
  const recordByPath = new Map(records.map((record) => [record.path, record]));
  const sections: string[] = [];
  for (const entry of entries) {
    if (entry.exclusion || (entry.tier !== "A" && entry.tier !== "B")) continue;
    const record = recordByPath.get(entry.path);
    sections.push(
      `${entry.tier} ${entry.path}\n  uncovered lines: ${record ? lineRanges(record.uncoveredLines) || "none" : "MISSING RECORD"}`,
    );
  }
  return `${sections.join("\n")}\n`;
}

function normalizedJson(language: CoverageLanguage, records: readonly CoverageRecord[]): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      language,
      records: records.map((record) => ({
        path: record.path,
        lines: record.lines,
        functions: record.functions,
        ...(record.regions ? { regions: record.regions } : {}),
        uncoveredLines: record.uncoveredLines,
      })),
    },
    null,
    2,
  )}\n`;
}

async function loadPolicy(root: string) {
  const text = await readFile(resolve(root, "scripts/coverage-thresholds.json"), "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Coverage threshold manifest is malformed JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  return parseCoverageManifest(raw);
}

async function writeArtifacts(options: {
  root: string;
  language: CoverageLanguage;
  artifactRoot: string;
  records: readonly CoverageRecord[];
  entries: readonly CoverageThresholdEntry[];
}): Promise<void> {
  const { root, language, artifactRoot, records, entries } = options;
  await writeFile(
    resolve(root, artifactRoot, "normalized.json"),
    normalizedJson(language, records),
  );
  await writeFile(resolve(root, artifactRoot, "lcov.info"), serialiseNormalizedLcov(records));
  await writeFile(
    resolve(root, artifactRoot, "uncovered-tier-ab.txt"),
    uncoveredDiagnostics(records, entries),
  );
}

export async function runTypeScriptCoverage(root = resolve(import.meta.dir, "..")): Promise<void> {
  const artifactRoot = "test-results/coverage/typescript";
  const rawRoot = `${artifactRoot}/raw`;
  await rm(resolve(root, artifactRoot), { recursive: true, force: true });
  await mkdir(resolve(root, rawRoot), { recursive: true });

  const coverageRuns = [
    { directory: `${rawRoot}/unified`, tests: [...TYPESCRIPT_TEST_ROOTS] },
    {
      directory: `${rawRoot}/loader-default`,
      tests: [
        "packages/core/test/wasm-loader.test.mjs",
        "--test-name-pattern",
        "packaged default binary",
      ],
    },
  ];
  const reports: Array<readonly LcovRecord[]> = [];
  for (const coverageRun of coverageRuns) {
    await mkdir(resolve(root, coverageRun.directory), { recursive: true });
    await run(
      [
        "bun",
        "test",
        ...coverageRun.tests,
        "--coverage",
        "--coverage-reporter=lcov",
        `--coverage-dir=${coverageRun.directory}`,
      ],
      root,
    );
    reports.push(
      parseLcov(await readFile(resolve(root, coverageRun.directory, "lcov.info"), "utf8"), root),
    );
  }
  const rawRecords = mergeLcovRecords(reports);
  await writeFile(resolve(root, rawRoot, "lcov.info"), serialiseNormalizedLcov(rawRecords));
  const manifest = await loadPolicy(root);
  const runtimePaths = await discoverRuntimePaths(root, "typescript");
  const entries = manifest.entries.filter((entry) => entry.language === "typescript");
  const scoredPaths = new Set(
    entries.filter((entry) => !entry.exclusion).map((entry) => entry.path),
  );
  const records = filterRuntimeRecords(rawRecords, scoredPaths);
  await writeArtifacts({ root, language: "typescript", artifactRoot, records, entries });
  const result = evaluateCoveragePolicy({
    manifest,
    language: "typescript",
    records,
    runtimePaths,
  });
  printTable(result.records, result.entries);
  console.log(`TypeScript source coverage passed for ${records.length} scored runtime files`);
}

export async function runRustCoverage(root = resolve(import.meta.dir, "..")): Promise<void> {
  const artifactRoot = "test-results/coverage/rust";
  const rawRoot = `${artifactRoot}/raw`;
  await rm(resolve(root, artifactRoot), { recursive: true, force: true });
  await mkdir(resolve(root, rawRoot), { recursive: true });

  const cargoVersion = await outputOf(["cargo", "llvm-cov", "--version"], root);
  if (cargoVersion !== `cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`) {
    throw new Error(
      `Expected cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}, received ${cargoVersion || "no version"}`,
    );
  }
  const rustVersion = await outputOf(["rustc", "--version"], root);
  if (!rustVersion.startsWith(`rustc ${RUST_VERSION} `)) {
    throw new Error(`Expected rustc ${RUST_VERSION}, received ${rustVersion || "no version"}`);
  }

  const common = ["--manifest-path", "packages/wasm/Cargo.toml"] as const;
  await run(["cargo", "llvm-cov", ...common, "--no-report"], root);
  await run(
    ["cargo", "llvm-cov", "report", ...common, "--lcov", "--output-path", `${rawRoot}/lcov.info`],
    root,
  );
  await run(
    ["cargo", "llvm-cov", "report", ...common, "--json", "--output-path", `${rawRoot}/raw.json`],
    root,
  );

  const manifest = await loadPolicy(root);
  const runtimePaths = await discoverRuntimePaths(root, "rust");
  const entries = manifest.entries.filter((entry) => entry.language === "rust");
  const scoredPaths = new Set(
    entries.filter((entry) => !entry.exclusion).map((entry) => entry.path),
  );
  const lcovText = await readFile(resolve(root, rawRoot, "lcov.info"), "utf8");
  const lcovRecords = parseLcov(lcovText, root, "recompute");
  const llvmJson = JSON.parse(
    await readFile(resolve(root, rawRoot, "raw.json"), "utf8"),
  ) as unknown;
  const normalized = normalizeRustCoverage(llvmJson, lcovRecords, root);
  const records = filterRuntimeRecords(normalized, scoredPaths);
  await writeArtifacts({ root, language: "rust", artifactRoot, records, entries });
  const result = evaluateCoveragePolicy({ manifest, language: "rust", records, runtimePaths });
  printTable(result.records, result.entries);
  console.log(`Rust source coverage passed for ${records.length} scored runtime files`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const root = resolve(import.meta.dir, "..");
  try {
    if (command === "ts") await runTypeScriptCoverage(root);
    else if (command === "rust") await runRustCoverage(root);
    else throw new Error("Usage: bun scripts/coverage.ts <ts|rust>");
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const language = command === "rust" ? "rust" : "typescript";
    const artifactRoot = resolve(root, "test-results/coverage", language);
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(resolve(artifactRoot, "failure.txt"), `${message}\n`);
    throw error;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
