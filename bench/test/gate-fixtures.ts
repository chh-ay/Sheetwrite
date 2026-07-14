import { DEFAULT_SEED } from "../src/dataset.js";
import type { ControlledRunnerFingerprint, HarnessFingerprint } from "../src/gate-protocol.js";
import { RENDER_DATASET_HASHES } from "../src/render-gate.js";
import {
  type BrowserLaunchAttempt,
  type EngineId,
  RENDER_ORDER_SEED,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  type ScenarioResult,
  scenarioGroup,
  summarizeCompleteness,
} from "../src/render-protocol.js";
import { counterbalancedOrder, summarizeFinite } from "../src/stats.js";

export const TEST_RUNNER: ControlledRunnerFingerprint = {
  os: "linux test",
  arch: "x64",
  cpu: "controlled cpu",
  bun: "1.3.14",
  node: "24.3.0",
  browser: "Chromium 140",
  powerMode: "performance",
  concurrency: 1,
};

export const TEST_HARNESS: HarnessFingerprint = {
  digest: "sha256:test",
  protocol: "performance=1;render=1",
  matrix: "render-full-v1",
  dataset: "seed=test;schema=test",
  sampling: "measured=3;warmup=1;minimum-sample-ms=100;order-seed=test",
  schema: "typed-render-artifact-v1;controlled-baseline-v1",
  sources: { "bench/src/render-protocol.ts": "sha256:source" },
};

interface RenderFixtureOptions {
  readonly rounds?: number;
  readonly engines?: readonly EngineId[];
  readonly rows?: readonly number[];
  readonly measuredSamples?: number;
  readonly warmupSamples?: number;
  readonly timestamp?: string;
  readonly commit?: string;
  readonly dirty?: boolean;
  readonly samples?: (
    round: number,
    engine: EngineId,
    scenarioId: (typeof RENDER_SCENARIOS)[number]["id"],
  ) => readonly number[];
}

export function makeRenderArtifact(options: RenderFixtureOptions = {}): RenderBenchmarkArtifact {
  const rounds = options.rounds ?? 2;
  const engines = options.engines ?? (["sheetwrite", "handsontable"] as const);
  const rows = options.rows ?? [100_000];
  const measuredSamples = options.measuredSamples ?? 3;
  const warmupSamples = options.warmupSamples ?? 1;
  const runId = "00000000-0000-4000-8000-000000000052";
  const config: RenderRunConfig = {
    engines,
    rows,
    scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
  };
  const results: ScenarioResult[] = [];
  const launchAttempts: BrowserLaunchAttempt[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const engine of engines) {
      for (const rowCount of rows) {
        launchAttempts.push({
          round,
          engine,
          rows: rowCount,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        });
        for (const scenario of RENDER_SCENARIOS) {
          const values =
            options.samples?.(round, engine, scenario.id) ??
            Array.from({ length: measuredSamples }, () => 10);
          if (values.length !== measuredSamples) {
            throw new Error("fixture sample callback returned the wrong sample count");
          }
          const rawSamples = values.map((perOperationMs, index) => ({
            index,
            durationMs: perOperationMs * 100,
            operationCount: 100,
            perOperationMs,
          }));
          const summary = summarizeFinite(values);
          results.push({
            runId,
            round,
            engine,
            rows: rowCount,
            scenarioId: scenario.id,
            group: scenarioGroup(scenario.id),
            status: "success",
            operationCount: measuredSamples * 100,
            rawSamples,
            medianMs: summary.median,
            p95Ms: summary.p95,
            madMs: summary.mad,
            validation: [
              {
                checkpoint: "canonical state",
                expected: "correct",
                observed: "correct",
                passed: true,
              },
            ],
            memory: { beforeBytes: 1_000, afterBytes: 1_100, deltaBytes: 100 },
            ...(scenario.id === "formatted-paint.top-left"
              ? {
                  resources:
                    engine === "sheetwrite"
                      ? {
                          compiledFormats: 2,
                          numberFormatters: 1,
                          dateTimeFormatters: 1,
                          formatCacheEntries: 2,
                          numberFormatterCacheEntries: 1,
                          dateTimeFormatterCacheEntries: 1,
                        }
                      : {
                          compiledFormats: 0,
                          numberFormatters: 0,
                          dateTimeFormatters: 0,
                          formatCacheEntries: 0,
                          numberFormatterCacheEntries: 0,
                          dateTimeFormatterCacheEntries: 0,
                        },
                }
              : {}),
          });
        }
      }
    }
  }
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId,
    metadata: {
      commit: options.commit ?? "2c10118",
      dirty: options.dirty ?? false,
      timestamp: options.timestamp ?? new Date().toISOString(),
      bunVersion: TEST_RUNNER.bun,
      nodeVersion: TEST_RUNNER.node,
      browserVersion: TEST_RUNNER.browser,
      os: TEST_RUNNER.os,
      arch: TEST_RUNNER.arch,
      cpu: TEST_RUNNER.cpu,
      engineVersions: { sheetwrite: "0.0.0", handsontable: "18.0.0" },
      datasetSeed: DEFAULT_SEED,
      datasetHashes: Object.fromEntries(
        rows.map((rowCount) => [String(rowCount), RENDER_DATASET_HASHES[rowCount]!]),
      ),
      viewport: { width: 640, height: 480 },
      measuredSamples,
      warmupSamples,
      minimumSampleDurationMs: 100,
      rounds,
      orderSeed: RENDER_ORDER_SEED,
      engineOrder: counterbalancedOrder(engines, rounds, RENDER_ORDER_SEED),
      launchAttempts,
    },
    config,
    results,
    completeness: summarizeCompleteness(config, rounds, results),
    reproductionCommands: ["fixture"],
  };
}
