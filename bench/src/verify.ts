import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type DataBenchmarkResult, validateDataBenchmark } from "./data-bench.js";
import {
  type PrefetchBenchmarkReport,
  validateDatasourcePrefetchReport,
} from "./datasource-prefetch-bench.js";
import { type FormulaBenchmarkResult, validateFormulaBenchmark } from "./formula-bench.js";
import { validateInteractionArtifact } from "./interaction-gate.js";
import { type PagedBenchmarkResult, validatePagedBenchmark } from "./paged-bench.js";
import { type RangeGateArtifact, validateRangeArtifact } from "./range-gate.js";
import { validateRenderGateArtifact } from "./render-gate.js";
import { renderBenchmarkMarkdown } from "./render-protocol.js";
import { type ResourceBenchmarkArtifact, validateResourceBenchmark } from "./resource-protocol.js";
import { validateXlsxBenchmarkArtifact } from "./xlsx-bench.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const ARTIFACT_ROOT = resolve(BENCH_ROOT, "../test-results/performance-gates");
const GATE_FAMILIES = [
  "data",
  "paged",
  "formula",
  "range",
  "resource",
  "datasource-prefetch",
  "view-index",
  "interaction",
  "render",
  "xlsx",
] as const;
type GateFamily = (typeof GATE_FAMILIES)[number];

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function command(args: readonly string[]): Promise<CommandResult> {
  const child = Bun.spawn([...args], {
    cwd: BENCH_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function commandArtifact(stdout: string, family: GateFamily): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const line = trimmed
      .split("\n")
      .filter((candidate) => candidate.trim().startsWith("{"))
      .at(-1);
    if (!line) throw new Error(`${family} smoke returned no JSON artifact`);
    return JSON.parse(line) as unknown;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateViewIndexArtifact(value: unknown): void {
  const artifact = record(value, "view-index artifact");
  if (artifact.rows !== 1_000_000 || artifact.repeats !== 5) {
    throw new Error("view-index matrix identity changed");
  }
  const runs = record(artifact.runs, "view-index runs");
  for (const engine of ["map", "packed"] as const) {
    if (!Array.isArray(runs[engine]) || runs[engine].length !== artifact.repeats) {
      throw new Error(`view-index ${engine} requires five raw runs`);
    }
  }
  const gates = record(artifact.gates, "view-index gates");
  if (Object.keys(gates).length === 0 || Object.values(gates).some((passed) => passed !== true)) {
    throw new Error("view-index runtime gates failed");
  }
  for (const field of ["heapReduction", "lookupP95Regression"] as const) {
    if (typeof artifact[field] !== "number" || !Number.isFinite(artifact[field])) {
      throw new Error(`view-index ${field} must be finite`);
    }
  }
}

function validateFamily(family: GateFamily, value: unknown): void {
  switch (family) {
    case "data":
      validateDataBenchmark(value as DataBenchmarkResult, "smoke");
      break;
    case "paged":
      validatePagedBenchmark(value as PagedBenchmarkResult, "smoke");
      break;
    case "formula":
      validateFormulaBenchmark(value as FormulaBenchmarkResult, "smoke");
      break;
    case "range":
      validateRangeArtifact(value as RangeGateArtifact, "smoke");
      break;
    case "resource":
      validateResourceBenchmark(value as ResourceBenchmarkArtifact, "smoke");
      break;
    case "datasource-prefetch":
      validateDatasourcePrefetchReport(value as PrefetchBenchmarkReport);
      break;
    case "view-index":
      validateViewIndexArtifact(value);
      break;
    case "interaction":
      validateInteractionArtifact(value);
      break;
    case "xlsx":
      validateXlsxBenchmarkArtifact(value);
      break;
    case "render":
      validateRenderGateArtifact(value, "smoke", {
        nowMs: Date.now(),
        maxAgeMs: 60 * 60 * 1_000,
      });
      break;
  }
}

function writeFailure(family: GateFamily, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(ARTIFACT_ROOT, `${family}-error.json`),
    `${JSON.stringify({ family, status: "failed", message }, null, 2)}\n`,
  );
}

async function verifyCommandFamily(
  family: Exclude<GateFamily, "render" | "interaction">,
  script: string,
): Promise<void> {
  const result = await command(["bun", "run", script, "--smoke"]);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.stdout`), result.stdout);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.stderr`), result.stderr);
  const value = commandArtifact(result.stdout, family);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.json`), `${JSON.stringify(value, null, 2)}\n`);
  validateFamily(family, value);
  if (result.exitCode !== 0) throw new Error(`${family} smoke exited ${result.exitCode}`);
}

async function verifyRender(): Promise<void> {
  const jsonPath = resolve(ARTIFACT_ROOT, "render.json");
  const markdownPath = resolve(ARTIFACT_ROOT, "render.md");
  const result = await command([
    "bun",
    "run",
    "src/render-driver.ts",
    "--smoke",
    "--engine",
    "sheetwrite",
    "--output",
    jsonPath,
    "--markdown-output",
    markdownPath,
  ]);
  writeFileSync(resolve(ARTIFACT_ROOT, "render.stdout"), result.stdout);
  writeFileSync(resolve(ARTIFACT_ROOT, "render.stderr"), result.stderr);
  if (!(await Bun.file(jsonPath).exists())) {
    throw new Error(`render smoke exited ${result.exitCode} without a structured artifact`);
  }
  const raw = readFileSync(jsonPath, "utf8");
  const artifact = validateRenderGateArtifact(JSON.parse(raw) as unknown, "smoke", {
    nowMs: Date.now(),
    maxAgeMs: 60 * 60 * 1_000,
  });
  const markdown = readFileSync(markdownPath, "utf8");
  if (markdown !== renderBenchmarkMarkdown(artifact)) {
    throw new Error("render smoke Markdown is not the byte-stable view of its raw artifact");
  }
  if (result.exitCode !== 0) throw new Error(`render smoke exited ${result.exitCode}`);
}

function verifyCheckedInteraction(): void {
  const sourcePath = resolve(BENCH_ROOT, "results/interaction-results.json");
  const raw = readFileSync(sourcePath, "utf8");
  validateFamily("interaction", JSON.parse(raw) as unknown);
  writeFileSync(resolve(ARTIFACT_ROOT, "interaction.json"), raw);
}

async function verifyFixture(specification: string): Promise<void> {
  const separator = specification.indexOf(":");
  const family = specification.slice(0, separator) as GateFamily;
  const path = specification.slice(separator + 1);
  if (!GATE_FAMILIES.includes(family) || path.length === 0) {
    throw new Error("--fixture must be family:/path/to/result.json");
  }
  const raw = readFileSync(resolve(path), "utf8");
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.json`), raw);
  validateFamily(family, JSON.parse(raw) as unknown);
}

export async function runVerification(args: readonly string[]): Promise<number> {
  rmSync(ARTIFACT_ROOT, { recursive: true, force: true });
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  if (args.includes("--report-only")) {
    writeFailure("data", new Error("CI-facing verification rejects --report-only"));
    return 1;
  }

  const fixtureIndex = args.indexOf("--fixture");
  if (fixtureIndex >= 0) {
    const specification = args[fixtureIndex + 1] ?? "";
    const family = specification.slice(0, specification.indexOf(":")) as GateFamily;
    try {
      await verifyFixture(specification);
      return 0;
    } catch (error) {
      writeFailure(GATE_FAMILIES.includes(family) ? family : "data", error);
      return 1;
    }
  }

  for (const [family, script] of [
    ["data", "src/data-bench.ts"],
    ["paged", "src/paged-bench.ts"],
    ["formula", "src/formula-bench.ts"],
    ["range", "src/range-bench.ts"],
    ["resource", "src/resource-bench.ts"],
    ["datasource-prefetch", "src/datasource-prefetch-bench.ts"],
    ["view-index", "src/view-index-bench.ts"],
    ["xlsx", "src/xlsx-bench.ts"],
  ] as const) {
    try {
      await verifyCommandFamily(family, script);
    } catch (error) {
      writeFailure(family, error);
      return 1;
    }
  }
  try {
    verifyCheckedInteraction();
  } catch (error) {
    writeFailure("interaction", error);
    return 1;
  }
  try {
    await verifyRender();
  } catch (error) {
    writeFailure("render", error);
    return 1;
  }
  process.stderr.write(`benchmark smoke and safety checks passed; artifacts: ${ARTIFACT_ROOT}\n`);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  process.exitCode = await runVerification(args);
}
