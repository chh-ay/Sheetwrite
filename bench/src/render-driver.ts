import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "@playwright/test";
import { DEFAULT_SEED, datasetChecksum, makeColumnar } from "./dataset.js";
import benchmarkPage from "./render-bench.html";
import {
  type BrowserCombinationResult,
  type BrowserLaunchAttempt,
  ENGINE_IDS,
  type EngineId,
  type FailedScenario,
  type FailureStage,
  parseRenderArtifactJson,
  parseScenarioResult,
  RENDER_MAX_LAUNCH_ATTEMPTS,
  RENDER_MINIMUM_SAMPLE_MS,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  RENDER_VIEWPORT,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  renderBenchmarkMarkdown,
  type ScenarioResult,
  scenarioGroup,
  summarizeCompleteness,
} from "./render-protocol.js";
import { counterbalancedOrder } from "./stats.js";

const BENCH_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const DEFAULT_JSON_PATH = resolve(BENCH_ROOT, "results/render-results.json");
const DEFAULT_MARKDOWN_PATH = resolve(BENCH_ROOT, "results/render-results.md");
const DEFAULT_ORDER_SEED = 0x51c0ffee;

interface DriverConfiguration {
  readonly smoke: boolean;
  readonly engines: readonly EngineId[];
  readonly rows: readonly number[];
  readonly rounds: number;
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly timeoutMs: number;
  readonly browserExecutable?: string;
  readonly outputPath?: string;
  readonly markdownPath?: string;
}

interface CombinationConfiguration {
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly timeoutMs: number;
  readonly datasetHash: string;
  readonly browserExecutable?: string;
}

interface CombinationOutput {
  readonly results: readonly ScenarioResult[];
  readonly browserVersion?: string;
  readonly launchAttempts: readonly BrowserLaunchAttempt[];
}

interface RuntimeDiagnostics {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
}

function argumentValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveIntegerArgument(args: readonly string[], name: string, fallback: number): number {
  const raw = argumentValue(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeIntegerArgument(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = argumentValue(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseConfiguration(args: readonly string[]): DriverConfiguration {
  const smoke = args.includes("--smoke");
  const engineArg = argumentValue(args, "--engine");
  const engines: readonly EngineId[] =
    engineArg === undefined
      ? ENGINE_IDS
      : [
          ENGINE_IDS.includes(engineArg as EngineId)
            ? (engineArg as EngineId)
            : (() => {
                throw new TypeError(`--engine must be one of: ${ENGINE_IDS.join(", ")}`);
              })(),
        ];
  const rowsArg = argumentValue(args, "--rows");
  const rows = rowsArg
    ? rowsArg.split(",").map((entry) => {
        const parsed = Number(entry);
        if (!Number.isInteger(parsed) || parsed < 30) {
          throw new TypeError("--rows values must be integers >= 30");
        }
        return parsed;
      })
    : [smoke ? 200 : 100_000];
  if (new Set(rows).size !== rows.length) throw new TypeError("--rows values must be unique");

  const outputArg = argumentValue(args, "--output");
  const markdownArg = argumentValue(args, "--markdown-output");
  const outputPath = outputArg ?? (smoke ? undefined : DEFAULT_JSON_PATH);
  const markdownPath =
    markdownArg ??
    (outputPath === undefined
      ? undefined
      : outputArg === undefined
        ? DEFAULT_MARKDOWN_PATH
        : outputPath.replace(/\.json$/u, ".md"));
  return {
    smoke,
    engines,
    rows,
    rounds: positiveIntegerArgument(args, "--rounds", smoke ? 1 : 2),
    measuredSamples: positiveIntegerArgument(args, "--samples", smoke ? 1 : 3),
    warmupSamples: nonNegativeIntegerArgument(args, "--warmups", 1),
    minimumSampleDurationMs: Math.max(
      RENDER_MINIMUM_SAMPLE_MS,
      positiveIntegerArgument(args, "--minimum-sample-ms", RENDER_MINIMUM_SAMPLE_MS),
    ),
    timeoutMs: positiveIntegerArgument(args, "--timeout-ms", smoke ? 120_000 : 300_000),
    browserExecutable: argumentValue(args, "--browser-executable"),
    outputPath,
    markdownPath,
  };
}

function normalizedError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function failureForScenario(
  configuration: CombinationConfiguration,
  scenarioId: (typeof RENDER_SCENARIOS)[number]["id"],
  stage: FailureStage,
  error: unknown,
  diagnostics: RuntimeDiagnostics,
  timeout: boolean,
  crash: boolean,
  partialSamples: FailedScenario["partialSamples"] = [],
): FailedScenario {
  const failure = normalizedError(error);
  return {
    runId: configuration.runId,
    round: configuration.round,
    engine: configuration.engine,
    rows: configuration.rows,
    scenarioId,
    group: scenarioGroup(scenarioId),
    status: "failed",
    stage,
    errorClass: failure.name || "Error",
    message: failure.message || String(error),
    timeout,
    crash,
    consoleErrors: diagnostics.consoleErrors,
    pageErrors: diagnostics.pageErrors,
    partialSamples,
    validation: [],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

export function createCombinationFailures(
  configuration: CombinationConfiguration,
  stage: FailureStage,
  error: unknown,
  diagnostics: RuntimeDiagnostics = { consoleErrors: [], pageErrors: [] },
  timeout = false,
  crash = false,
): FailedScenario[] {
  return RENDER_SCENARIOS.map((scenario) =>
    failureForScenario(configuration, scenario.id, stage, error, diagnostics, timeout, crash),
  );
}

function pageStage(value: unknown, fallback: FailureStage): FailureStage {
  return typeof value === "string" &&
    ["build", "launch", "mount", "warmup", "measure", "validate", "teardown"].includes(value)
    ? (value as FailureStage)
    : fallback;
}

function identityMatches(result: ScenarioResult, configuration: CombinationConfiguration): boolean {
  return (
    result.runId === configuration.runId &&
    result.round === configuration.round &&
    result.engine === configuration.engine &&
    result.rows === configuration.rows
  );
}

function diagnosticsFailure(
  result: ScenarioResult,
  configuration: CombinationConfiguration,
  diagnostics: RuntimeDiagnostics,
): FailedScenario {
  if (result.status === "failed") {
    return {
      ...result,
      consoleErrors: [...result.consoleErrors, ...diagnostics.consoleErrors],
      pageErrors: [...result.pageErrors, ...diagnostics.pageErrors],
    };
  }
  return failureForScenario(
    configuration,
    result.scenarioId,
    "validate",
    new Error("browser emitted console or page errors during a successful scenario"),
    diagnostics,
    false,
    false,
    result.rawSamples,
  );
}

function normalizeBrowserOutput(
  value: unknown,
  configuration: CombinationConfiguration,
  diagnostics: RuntimeDiagnostics,
): ScenarioResult[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("missing browser result"),
      diagnostics,
    );
  }
  const input = value as Record<string, unknown>;
  if (
    input.protocolVersion !== RENDER_PROTOCOL_VERSION ||
    input.runId !== configuration.runId ||
    input.round !== configuration.round ||
    input.engine !== configuration.engine ||
    input.rows !== configuration.rows
  ) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("stale or mismatched browser result identity"),
      diagnostics,
    );
  }
  if (input.datasetHash !== configuration.datasetHash) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error(
        `dataset checksum mismatch: expected ${configuration.datasetHash}, observed ${String(input.datasetHash)}`,
      ),
      diagnostics,
    );
  }
  if (!Array.isArray(input.results)) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("browser result is missing its scenario array"),
      diagnostics,
    );
  }

  const normalized: ScenarioResult[] = [];
  for (const scenario of RENDER_SCENARIOS) {
    const matches = input.results.filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        "scenarioId" in entry &&
        entry.scenarioId === scenario.id,
    );
    if (matches.length !== 1) {
      normalized.push(
        failureForScenario(
          configuration,
          scenario.id,
          "validate",
          new Error(
            matches.length === 0
              ? "browser omitted the expected scenario"
              : "browser emitted duplicate scenario results",
          ),
          diagnostics,
          false,
          false,
        ),
      );
      continue;
    }
    try {
      const result = parseScenarioResult(
        matches[0],
        configuration.measuredSamples,
        configuration.minimumSampleDurationMs,
      );
      if (!identityMatches(result, configuration)) {
        throw new TypeError("scenario identity does not match its browser process");
      }
      normalized.push(
        diagnostics.consoleErrors.length > 0 || diagnostics.pageErrors.length > 0
          ? diagnosticsFailure(result, configuration, diagnostics)
          : result,
      );
    } catch (error) {
      normalized.push(
        failureForScenario(
          configuration,
          scenario.id,
          "validate",
          error,
          diagnostics,
          false,
          false,
        ),
      );
    }
  }
  return normalized;
}

async function readPartialPageState(page: Page): Promise<{
  readonly result?: BrowserCombinationResult;
  readonly error?: string;
  readonly stage?: string;
}> {
  try {
    return await page.evaluate(() => ({
      result: window.__benchResults,
      error: window.__benchError,
      stage: window.__benchStage,
    }));
  } catch {
    return {};
  }
}

async function runCombination(
  baseUrl: string,
  configuration: CombinationConfiguration,
): Promise<CombinationOutput> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const diagnostics = { consoleErrors, pageErrors };
  const launchAttempts: BrowserLaunchAttempt[] = [];
  let browser: Browser | undefined;
  let page: Page | undefined;
  let browserVersion: string | undefined;
  let crashed = false;
  let stage: FailureStage = "launch";

  try {
    for (let attempt = 1; attempt <= RENDER_MAX_LAUNCH_ATTEMPTS; attempt++) {
      try {
        browser = await chromium.launch({
          headless: true,
          executablePath: configuration.browserExecutable,
          args: ["--enable-precise-memory-info"],
        });
        browserVersion = browser.version();
        launchAttempts.push({
          round: configuration.round,
          engine: configuration.engine,
          rows: configuration.rows,
          attempt,
          success: true,
          errorClass: null,
          message: null,
        });
        break;
      } catch (error) {
        const failure = normalizedError(error);
        launchAttempts.push({
          round: configuration.round,
          engine: configuration.engine,
          rows: configuration.rows,
          attempt,
          success: false,
          errorClass: failure.name || "Error",
          message: failure.message,
        });
        if (attempt === RENDER_MAX_LAUNCH_ATTEMPTS) throw error;
        await Bun.sleep(500);
      }
    }
    if (!browser) throw new Error("browser launch attempts completed without a browser");
    page = await browser.newPage({
      viewport: { width: RENDER_VIEWPORT.width + 480, height: RENDER_VIEWPORT.height + 180 },
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on("crash", () => {
      crashed = true;
    });
    await page.addInitScript(() => {
      delete window.__benchResults;
      delete window.__benchError;
      delete window.__benchStage;
      window.__benchDone = false;
    });

    const url = new URL(baseUrl);
    url.searchParams.set("auto", "1");
    url.searchParams.set("runId", configuration.runId);
    url.searchParams.set("round", String(configuration.round));
    url.searchParams.set("engine", configuration.engine);
    url.searchParams.set("rows", String(configuration.rows));
    url.searchParams.set("samples", String(configuration.measuredSamples));
    url.searchParams.set("warmups", String(configuration.warmupSamples));
    url.searchParams.set("minimumSampleMs", String(configuration.minimumSampleDurationMs));
    await page.goto(url.href, { waitUntil: "load", timeout: configuration.timeoutMs });
    stage = "mount";
    await page.waitForFunction(() => window.__benchDone === true, undefined, {
      timeout: configuration.timeoutMs,
    });
    const state = await readPartialPageState(page);
    if (state.error && !state.result) throw new Error(state.error);
    return {
      results: normalizeBrowserOutput(state.result, configuration, diagnostics),
      browserVersion,
      launchAttempts,
    };
  } catch (error) {
    const state = page ? await readPartialPageState(page) : {};
    const normalized = normalizedError(error);
    const timedOut = normalized.name === "TimeoutError" || /timed out/iu.test(normalized.message);
    const observedStage = pageStage(state.stage, stage);
    if (state.result) {
      const partial = normalizeBrowserOutput(state.result, configuration, diagnostics);
      const byScenario = new Map(partial.map((result) => [result.scenarioId, result]));
      const completed = RENDER_SCENARIOS.map((scenario) => {
        const result = byScenario.get(scenario.id);
        if (result && result.status === "success") return result;
        return failureForScenario(
          configuration,
          scenario.id,
          observedStage,
          state.error ? new Error(state.error) : normalized,
          diagnostics,
          timedOut,
          crashed,
          result?.status === "failed" ? result.partialSamples : [],
        );
      });
      return { results: completed, browserVersion, launchAttempts };
    }
    return {
      results: createCombinationFailures(
        configuration,
        observedStage,
        state.error ? new Error(state.error) : normalized,
        diagnostics,
        timedOut,
        crashed,
      ),
      browserVersion,
      launchAttempts,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      await Bun.sleep(250);
      Bun.gc(true);
    }
  }
}

function gitOutput(args: readonly string[]): string {
  const processResult = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (processResult.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${processResult.stderr.toString().trim()}`);
  }
  return processResult.stdout.toString().trim();
}

async function packageVersion(relativePath: string): Promise<string> {
  const value: unknown = await Bun.file(resolve(REPOSITORY_ROOT, relativePath)).json();
  if (value === null || typeof value !== "object" || !("version" in value)) {
    throw new TypeError(`${relativePath} has no version`);
  }
  const version = value.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new TypeError(`${relativePath} has an invalid version`);
  }
  return version;
}

function stableJson(value: RenderBenchmarkArtifact): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function validateExistingArtifact(path: string): Promise<void> {
  const json = await Bun.file(path).text();
  const artifact = parseRenderArtifactJson(json);
  const markdownPath = path.replace(/\.json$/u, ".md");
  const expectedMarkdown = renderBenchmarkMarkdown(artifact);
  const observedMarkdown = await Bun.file(markdownPath).text();
  if (observedMarkdown !== expectedMarkdown) {
    throw new Error(`${markdownPath} is not the byte-stable view of ${path}`);
  }
  console.log(
    `validated ${artifact.completeness.expectedKeys.length} render cells (${artifact.completeness.failedKeys.length} structured failures)`,
  );
}

async function runDriver(args: readonly string[]): Promise<void> {
  const validatePath = argumentValue(args, "--validate");
  if (validatePath) {
    await validateExistingArtifact(resolve(process.cwd(), validatePath));
    return;
  }

  const configuration = parseConfiguration(args);
  const runId = crypto.randomUUID();
  const engineOrder = counterbalancedOrder(
    configuration.engines,
    configuration.rounds,
    DEFAULT_ORDER_SEED,
  );
  const datasetHashes: Record<string, string> = {};
  for (const rows of configuration.rows) {
    datasetHashes[String(rows)] = datasetChecksum(makeColumnar(rows, DEFAULT_SEED));
  }
  Bun.gc(true);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    development: false,
    routes: {
      "/": benchmarkPage,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/sheetwrite_wasm_bg.wasm": new Response(
        Bun.file(resolve(REPOSITORY_ROOT, "packages/wasm/pkg/sheetwrite_wasm_bg.wasm")),
        { headers: { "content-type": "application/wasm" } },
      ),
    },
  });

  const results: ScenarioResult[] = [];
  const launchAttempts: BrowserLaunchAttempt[] = [];
  let browserVersion = "unavailable";
  try {
    for (let roundIndex = 0; roundIndex < engineOrder.length; roundIndex++) {
      const round = roundIndex + 1;
      for (const engine of engineOrder[roundIndex]!) {
        for (const rows of configuration.rows) {
          process.stderr.write(
            `render benchmark: round ${round}/${configuration.rounds}, ${engine}, ${rows.toLocaleString("en-US")} rows\n`,
          );
          const output = await runCombination(`http://${server.hostname}:${server.port}/`, {
            runId,
            round,
            engine,
            rows,
            measuredSamples: configuration.measuredSamples,
            warmupSamples: configuration.warmupSamples,
            minimumSampleDurationMs: configuration.minimumSampleDurationMs,
            timeoutMs: configuration.timeoutMs,
            datasetHash: datasetHashes[String(rows)]!,
            browserExecutable: configuration.browserExecutable,
          });
          results.push(...output.results);
          launchAttempts.push(...output.launchAttempts);
          if (output.browserVersion) browserVersion = output.browserVersion;
        }
      }
    }
  } finally {
    server.stop(true);
  }

  const config: RenderRunConfig = {
    engines: configuration.engines,
    rows: configuration.rows,
    scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
  };
  const timestamp = new Date().toISOString();
  const artifact: RenderBenchmarkArtifact = {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId,
    metadata: {
      commit: gitOutput(["rev-parse", "HEAD"]),
      dirty: gitOutput(["status", "--porcelain", "--untracked-files=no"]).length > 0,
      timestamp,
      bunVersion: Bun.version,
      nodeVersion: process.versions.node,
      browserVersion,
      os: `${process.platform} ${release()}`,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      engineVersions: {
        sheetwrite: await packageVersion("packages/core/package.json"),
        handsontable: await packageVersion("bench/node_modules/handsontable/package.json"),
      },
      datasetSeed: DEFAULT_SEED,
      datasetHashes,
      viewport: RENDER_VIEWPORT,
      measuredSamples: configuration.measuredSamples,
      warmupSamples: configuration.warmupSamples,
      minimumSampleDurationMs: configuration.minimumSampleDurationMs,
      rounds: configuration.rounds,
      orderSeed: DEFAULT_ORDER_SEED,
      engineOrder,
      launchAttempts,
    },
    config,
    results,
    completeness: summarizeCompleteness(config, configuration.rounds, results),
    reproductionCommands: [
      "bun run --filter '@sheetwrite/bench' bench:render",
      "bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite",
      "bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable",
    ],
  };
  const json = stableJson(artifact);
  const parsed = parseRenderArtifactJson(json, { expectedRunId: runId });
  const markdown = renderBenchmarkMarkdown(parsed);

  if (configuration.outputPath) {
    await Bun.write(configuration.outputPath, json);
    if (!configuration.markdownPath) throw new Error("JSON output requires a Markdown output path");
    await Bun.write(configuration.markdownPath, markdown);
    process.stderr.write(
      `wrote ${configuration.outputPath} and ${configuration.markdownPath} (${parsed.completeness.failedKeys.length} failed cells)\n`,
    );
  } else {
    process.stdout.write(json);
  }

  if (!parsed.completeness.successful) process.exitCode = 1;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  await runDriver(args);
}
