import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type DataBenchmarkResult, validateDataBenchmark } from "./data-bench.js";
import { type FormulaBenchmarkResult, validateFormulaBenchmark } from "./formula-bench.js";
import { type PagedBenchmarkResult, validatePagedBenchmark } from "./paged-bench.js";
import { validateRenderGateArtifact } from "./render-gate.js";
import { renderBenchmarkMarkdown } from "./render-protocol.js";
import { validateXlsxBenchmarkArtifact } from "./xlsx-bench.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const ARTIFACT_ROOT = resolve(BENCH_ROOT, "../test-results/performance-gates");
type GateFamily = "data" | "paged" | "formula" | "render" | "xlsx";

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

function jsonLine(stdout: string, family: GateFamily): string {
  const line = stdout
    .trim()
    .split("\n")
    .filter((candidate) => candidate.trim().startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`${family} smoke returned no JSON artifact`);
  return line;
}

function validateFamily(family: GateFamily, value: unknown): void {
  if (family === "data") {
    validateDataBenchmark(value as DataBenchmarkResult, "smoke");
  } else if (family === "paged") {
    validatePagedBenchmark(value as PagedBenchmarkResult, "smoke");
  } else if (family === "formula") {
    validateFormulaBenchmark(value as FormulaBenchmarkResult, "smoke");
  } else if (family === "xlsx") {
    validateXlsxBenchmarkArtifact(value);
  } else {
    validateRenderGateArtifact(value, "smoke", {
      nowMs: Date.now(),
      maxAgeMs: 60 * 60 * 1_000,
    });
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
  family: Exclude<GateFamily, "render">,
  script: string,
): Promise<void> {
  const result = await command(["bun", "run", script, "--smoke"]);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.stdout`), result.stdout);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.stderr`), result.stderr);
  const raw = jsonLine(result.stdout, family);
  writeFileSync(resolve(ARTIFACT_ROOT, `${family}.json`), `${raw}\n`);
  const value: unknown = JSON.parse(raw);
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

async function verifyFixture(specification: string): Promise<void> {
  const separator = specification.indexOf(":");
  const family = specification.slice(0, separator) as GateFamily;
  const path = specification.slice(separator + 1);
  if (
    !(["data", "paged", "formula", "render", "xlsx"] as const).includes(family) ||
    path.length === 0
  ) {
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
      writeFailure(
        (["data", "paged", "formula", "render", "xlsx"] as const).includes(family)
          ? family
          : "data",
        error,
      );
      return 1;
    }
  }

  for (const [family, script] of [
    ["data", "src/data-bench.ts"],
    ["paged", "src/paged-bench.ts"],
    ["formula", "src/formula-bench.ts"],
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
    await verifyRender();
  } catch (error) {
    writeFailure("render", error);
    return 1;
  }
  process.stderr.write(`deterministic benchmark gates passed; artifacts: ${ARTIFACT_ROOT}\n`);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  process.exitCode = await runVerification(args);
}
