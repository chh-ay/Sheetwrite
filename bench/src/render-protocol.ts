import type { AggregateSample } from "./stats.js";
import { summarizeFinite } from "./stats.js";

export const RENDER_PROTOCOL_VERSION = 1;
export const RENDER_MINIMUM_SAMPLE_MS = 100;
export const RENDER_MAX_LAUNCH_ATTEMPTS = 2;
export const RENDER_VIEWPORT = { width: 640, height: 480 } as const;
export const RENDER_ORDER_SEED = 0x51c0ffee;

export const ENGINE_IDS = ["sheetwrite", "handsontable"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export type ScenarioGroup =
  | "view-scrolling"
  | "editing"
  | "altering"
  | "arrow-keys-navigation"
  | "formatting";

export const RENDER_SCENARIOS = [
  { id: "scroll-down.top-left", group: "view-scrolling" },
  { id: "scroll-down.middle", group: "view-scrolling" },
  { id: "scroll-smooth.same-window", group: "view-scrolling" },
  { id: "scroll-right.top-left", group: "view-scrolling" },
  { id: "edit-open.top-left", group: "editing" },
  { id: "edit-open.middle", group: "editing" },
  { id: "edit-open.bottom-right", group: "editing" },
  { id: "edit-commit.middle", group: "editing" },
  { id: "altering.insert-5-rows-top", group: "altering" },
  { id: "altering.remove-5-rows-top", group: "altering" },
  { id: "arrow-down.top-left", group: "arrow-keys-navigation" },
  { id: "arrow-right.middle", group: "arrow-keys-navigation" },
  { id: "formatted-paint.top-left", group: "formatting" },
] as const satisfies readonly { readonly id: string; readonly group: ScenarioGroup }[];

export type ScenarioId = (typeof RENDER_SCENARIOS)[number]["id"];
export type FailureStage =
  | "build"
  | "launch"
  | "mount"
  | "warmup"
  | "measure"
  | "validate"
  | "teardown";

export interface ScenarioIdentity {
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly scenarioId: ScenarioId;
  readonly group: ScenarioGroup;
}

export interface ValidationObservation {
  readonly checkpoint: string;
  readonly expected: string;
  readonly observed: string;
  readonly passed: boolean;
}

export interface MemoryDelta {
  readonly beforeBytes: number | null;
  readonly afterBytes: number | null;
  readonly deltaBytes: number | null;
}

export interface RenderResourceMetrics {
  readonly compiledFormats: number;
  readonly numberFormatters: number;
  readonly dateTimeFormatters: number;
  readonly formatCacheEntries: number;
  readonly numberFormatterCacheEntries: number;
  readonly dateTimeFormatterCacheEntries: number;
}

export interface MeasuredSample extends AggregateSample {
  readonly index: number;
}

export interface SuccessfulScenario extends ScenarioIdentity {
  readonly status: "success";
  readonly operationCount: number;
  readonly rawSamples: readonly MeasuredSample[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly madMs: number;
  readonly validation: readonly ValidationObservation[];
  readonly memory: MemoryDelta;
  readonly resources?: RenderResourceMetrics;
}

export interface FailedScenario extends ScenarioIdentity {
  readonly status: "failed";
  readonly stage: FailureStage;
  readonly errorClass: string;
  readonly message: string;
  readonly timeout: boolean;
  readonly crash: boolean;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly partialSamples: readonly MeasuredSample[];
  readonly validation: readonly ValidationObservation[];
  readonly memory: MemoryDelta;
}

export type ScenarioResult = SuccessfulScenario | FailedScenario;

export interface BrowserLaunchAttempt {
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly attempt: number;
  readonly success: boolean;
  readonly errorClass: string | null;
  readonly message: string | null;
}

export interface RenderRunMetadata {
  readonly commit: string;
  readonly dirty: boolean;
  readonly timestamp: string;
  readonly bunVersion: string;
  readonly nodeVersion: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly arch: string;
  readonly cpu: string;
  readonly engineVersions: Readonly<Record<EngineId, string>>;
  readonly datasetSeed: number;
  readonly datasetHashes: Readonly<Record<string, string>>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly rounds: number;
  readonly orderSeed: number;
  readonly engineOrder: readonly (readonly EngineId[])[];
  readonly launchAttempts: readonly BrowserLaunchAttempt[];
}

export interface RenderRunConfig {
  readonly engines: readonly EngineId[];
  readonly rows: readonly number[];
  readonly scenarios: readonly ScenarioId[];
}

export interface CompletenessSummary {
  readonly expectedKeys: readonly string[];
  readonly observedKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly duplicateKeys: readonly string[];
  readonly unexpectedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly complete: boolean;
  readonly successful: boolean;
}

export interface RenderBenchmarkArtifact {
  readonly protocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly runId: string;
  readonly metadata: RenderRunMetadata;
  readonly config: RenderRunConfig;
  readonly results: readonly ScenarioResult[];
  readonly completeness: CompletenessSummary;
  readonly reproductionCommands: readonly string[];
}

export interface BrowserCombinationResult {
  readonly protocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly datasetHash: string;
  readonly results: readonly ScenarioResult[];
}

const SCENARIO_GROUPS = new Map<ScenarioId, ScenarioGroup>(
  RENDER_SCENARIOS.map((scenario) => [scenario.id, scenario.group]),
);

export function scenarioGroup(scenarioId: ScenarioId): ScenarioGroup {
  const group = SCENARIO_GROUPS.get(scenarioId);
  if (!group) throw new RangeError(`unknown render scenario: ${scenarioId}`);
  return group;
}

export function renderMatrixKey(identity: ScenarioIdentity): string {
  return `round=${identity.round};engine=${identity.engine};rows=${identity.rows};scenario=${identity.scenarioId}`;
}

export function expectedMatrixKeys(config: RenderRunConfig, rounds: number): string[] {
  const keys: string[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const engine of config.engines) {
      for (const rows of config.rows) {
        for (const scenarioId of config.scenarios) {
          keys.push(
            renderMatrixKey({
              runId: "expected",
              round,
              engine,
              rows,
              scenarioId,
              group: scenarioGroup(scenarioId),
            }),
          );
        }
      }
    }
  }
  return keys.sort();
}

export function summarizeCompleteness(
  config: RenderRunConfig,
  rounds: number,
  results: readonly ScenarioResult[],
): CompletenessSummary {
  const expectedKeys = expectedMatrixKeys(config, rounds);
  const expectedSet = new Set(expectedKeys);
  const observedKeys = results.map(renderMatrixKey).sort();
  const counts = new Map<string, number>();
  for (const key of observedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const missingKeys = expectedKeys.filter((key) => !counts.has(key));
  const duplicateKeys = [...counts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
  const unexpectedKeys = [...counts.keys()].filter((key) => !expectedSet.has(key)).sort();
  const failedKeys = results
    .filter((result): result is FailedScenario => result.status === "failed")
    .map(renderMatrixKey)
    .sort();
  const complete =
    missingKeys.length === 0 && duplicateKeys.length === 0 && unexpectedKeys.length === 0;
  return {
    expectedKeys,
    observedKeys,
    missingKeys,
    duplicateKeys,
    unexpectedKeys,
    failedKeys,
    complete,
    successful: complete && failedKeys.length === 0,
  };
}

export interface ParseRenderOptions {
  readonly expectedRunId?: string;
  readonly nowMs?: number;
  readonly maxAgeMs?: number;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function finite(value: unknown, path: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = finite(value, path, minimum);
  if (!Number.isInteger(parsed)) throw new TypeError(`${path} must be an integer`);
  return parsed;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function nullableFinite(value: unknown, path: string): number | null {
  return value === null ? null : finite(value, path);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => text(entry, `${path}[${index}]`, true));
}

function parseObservation(value: unknown, path: string): ValidationObservation {
  const input = record(value, path);
  return {
    checkpoint: text(input.checkpoint, `${path}.checkpoint`),
    expected: text(input.expected, `${path}.expected`, true),
    observed: text(input.observed, `${path}.observed`, true),
    passed: bool(input.passed, `${path}.passed`),
  };
}

function parseMemory(value: unknown, path: string): MemoryDelta {
  const input = record(value, path);
  const beforeBytes = nullableFinite(input.beforeBytes, `${path}.beforeBytes`);
  const afterBytes = nullableFinite(input.afterBytes, `${path}.afterBytes`);
  const deltaBytes = nullableFinite(input.deltaBytes, `${path}.deltaBytes`);
  const nullValues = [beforeBytes, afterBytes, deltaBytes].filter((entry) => entry === null).length;
  if (nullValues !== 0 && nullValues !== 3) {
    throw new TypeError(`${path} must contain either three numeric values or three null values`);
  }
  if (beforeBytes !== null && afterBytes !== null && deltaBytes !== afterBytes - beforeBytes) {
    throw new TypeError(`${path}.deltaBytes does not match before/after values`);
  }
  return { beforeBytes, afterBytes, deltaBytes };
}

function parseResources(value: unknown, path: string): RenderResourceMetrics {
  const input = record(value, path);
  return {
    compiledFormats: integer(input.compiledFormats, `${path}.compiledFormats`, 0),
    numberFormatters: integer(input.numberFormatters, `${path}.numberFormatters`, 0),
    dateTimeFormatters: integer(input.dateTimeFormatters, `${path}.dateTimeFormatters`, 0),
    formatCacheEntries: integer(input.formatCacheEntries, `${path}.formatCacheEntries`, 0),
    numberFormatterCacheEntries: integer(
      input.numberFormatterCacheEntries,
      `${path}.numberFormatterCacheEntries`,
      0,
    ),
    dateTimeFormatterCacheEntries: integer(
      input.dateTimeFormatterCacheEntries,
      `${path}.dateTimeFormatterCacheEntries`,
      0,
    ),
  };
}

function parseSample(value: unknown, path: string): MeasuredSample {
  const input = record(value, path);
  const durationMs = finite(input.durationMs, `${path}.durationMs`, 0);
  const operationCount = integer(input.operationCount, `${path}.operationCount`, 1);
  const perOperationMs = finite(input.perOperationMs, `${path}.perOperationMs`, 0);
  const expectedPerOperation = durationMs / operationCount;
  if (Math.abs(perOperationMs - expectedPerOperation) > Number.EPSILON * Math.max(1, durationMs)) {
    throw new TypeError(`${path}.perOperationMs does not match durationMs / operationCount`);
  }
  return {
    index: integer(input.index, `${path}.index`, 0),
    durationMs,
    operationCount,
    perOperationMs,
  };
}

function parseIdentity(value: Record<string, unknown>, path: string): ScenarioIdentity {
  const scenarioId = enumValue(
    value.scenarioId,
    RENDER_SCENARIOS.map((scenario) => scenario.id),
    `${path}.scenarioId`,
  );
  const group = enumValue(
    value.group,
    ["view-scrolling", "editing", "altering", "arrow-keys-navigation", "formatting"],
    `${path}.group`,
  );
  if (group !== scenarioGroup(scenarioId)) {
    throw new TypeError(`${path}.group does not match scenario ${scenarioId}`);
  }
  return {
    runId: text(value.runId, `${path}.runId`),
    round: integer(value.round, `${path}.round`, 1),
    engine: enumValue(value.engine, ENGINE_IDS, `${path}.engine`),
    rows: integer(value.rows, `${path}.rows`, 1),
    scenarioId,
    group,
  };
}

export function parseScenarioResult(
  value: unknown,
  measuredSamples: number,
  minimumSampleDurationMs: number,
  path = "result",
): ScenarioResult {
  const input = record(value, path);
  const identity = parseIdentity(input, path);
  const status = enumValue(input.status, ["success", "failed"], `${path}.status`);
  const validation = array(input.validation, `${path}.validation`).map((entry, index) =>
    parseObservation(entry, `${path}.validation[${index}]`),
  );
  const memory = parseMemory(input.memory, `${path}.memory`);

  if (status === "failed") {
    return {
      ...identity,
      status,
      stage: enumValue(
        input.stage,
        ["build", "launch", "mount", "warmup", "measure", "validate", "teardown"],
        `${path}.stage`,
      ),
      errorClass: text(input.errorClass, `${path}.errorClass`),
      message: text(input.message, `${path}.message`),
      timeout: bool(input.timeout, `${path}.timeout`),
      crash: bool(input.crash, `${path}.crash`),
      consoleErrors: stringArray(input.consoleErrors, `${path}.consoleErrors`),
      pageErrors: stringArray(input.pageErrors, `${path}.pageErrors`),
      partialSamples: array(input.partialSamples, `${path}.partialSamples`).map((entry, index) =>
        parseSample(entry, `${path}.partialSamples[${index}]`),
      ),
      validation,
      memory,
    };
  }

  const rawSamples = array(input.rawSamples, `${path}.rawSamples`).map((entry, index) =>
    parseSample(entry, `${path}.rawSamples[${index}]`),
  );
  if (rawSamples.length !== measuredSamples) {
    throw new TypeError(`${path}.rawSamples must contain ${measuredSamples} samples`);
  }
  for (const [index, sample] of rawSamples.entries()) {
    if (sample.index !== index)
      throw new TypeError(`${path}.rawSamples indices must be contiguous`);
    if (sample.durationMs < minimumSampleDurationMs) {
      throw new TypeError(
        `${path}.rawSamples[${index}] is below the ${minimumSampleDurationMs} ms aggregate minimum`,
      );
    }
  }
  if (validation.length === 0 || validation.some((observation) => !observation.passed)) {
    throw new TypeError(`${path}.validation must contain only passing checkpoints for success`);
  }
  const summary = summarizeFinite(rawSamples.map((sample) => sample.perOperationMs));
  const operationCount = rawSamples.reduce((total, sample) => total + sample.operationCount, 0);
  const medianMs = finite(input.medianMs, `${path}.medianMs`, 0);
  const p95Ms = finite(input.p95Ms, `${path}.p95Ms`, 0);
  const madMs = finite(input.madMs, `${path}.madMs`, 0);
  if (
    input.operationCount !== operationCount ||
    medianMs !== summary.median ||
    p95Ms !== summary.p95 ||
    madMs !== summary.mad
  ) {
    throw new TypeError(`${path} summary does not match its raw samples`);
  }
  return {
    ...identity,
    status,
    operationCount,
    rawSamples,
    medianMs,
    p95Ms,
    madMs,
    validation,
    memory,
    ...(input.resources === undefined
      ? {}
      : { resources: parseResources(input.resources, `${path}.resources`) }),
  };
}

function parseLaunchAttempt(value: unknown, path: string): BrowserLaunchAttempt {
  const input = record(value, path);
  const success = bool(input.success, `${path}.success`);
  const errorClass =
    input.errorClass === null ? null : text(input.errorClass, `${path}.errorClass`);
  const message = input.message === null ? null : text(input.message, `${path}.message`);
  if (success !== (errorClass === null && message === null)) {
    throw new TypeError(`${path} success/error fields are inconsistent`);
  }
  return {
    round: integer(input.round, `${path}.round`, 1),
    engine: enumValue(input.engine, ENGINE_IDS, `${path}.engine`),
    rows: integer(input.rows, `${path}.rows`, 1),
    attempt: integer(input.attempt, `${path}.attempt`, 1),
    success,
    errorClass,
    message,
  };
}

function parseMetadata(value: unknown, path: string): RenderRunMetadata {
  const input = record(value, path);
  const engineVersions = record(input.engineVersions, `${path}.engineVersions`);
  const hashes = record(input.datasetHashes, `${path}.datasetHashes`);
  const viewport = record(input.viewport, `${path}.viewport`);
  const engineOrder = array(input.engineOrder, `${path}.engineOrder`).map((entry, round) =>
    array(entry, `${path}.engineOrder[${round}]`).map((engine, index) =>
      enumValue(engine, ENGINE_IDS, `${path}.engineOrder[${round}][${index}]`),
    ),
  );
  const metadata: RenderRunMetadata = {
    commit: text(input.commit, `${path}.commit`),
    dirty: bool(input.dirty, `${path}.dirty`),
    timestamp: text(input.timestamp, `${path}.timestamp`),
    bunVersion: text(input.bunVersion, `${path}.bunVersion`),
    nodeVersion: text(input.nodeVersion, `${path}.nodeVersion`),
    browserVersion: text(input.browserVersion, `${path}.browserVersion`),
    os: text(input.os, `${path}.os`),
    arch: text(input.arch, `${path}.arch`),
    cpu: text(input.cpu, `${path}.cpu`),
    engineVersions: {
      sheetwrite: text(engineVersions.sheetwrite, `${path}.engineVersions.sheetwrite`),
      handsontable: text(engineVersions.handsontable, `${path}.engineVersions.handsontable`),
    },
    datasetSeed: integer(input.datasetSeed, `${path}.datasetSeed`),
    datasetHashes: Object.fromEntries(
      Object.entries(hashes).map(([rows, hash]) => [
        rows,
        text(hash, `${path}.datasetHashes.${rows}`),
      ]),
    ),
    viewport: {
      width: integer(viewport.width, `${path}.viewport.width`, 1),
      height: integer(viewport.height, `${path}.viewport.height`, 1),
    },
    measuredSamples: integer(input.measuredSamples, `${path}.measuredSamples`, 1),
    warmupSamples: integer(input.warmupSamples, `${path}.warmupSamples`, 0),
    minimumSampleDurationMs: finite(
      input.minimumSampleDurationMs,
      `${path}.minimumSampleDurationMs`,
      RENDER_MINIMUM_SAMPLE_MS,
    ),
    rounds: integer(input.rounds, `${path}.rounds`, 1),
    orderSeed: integer(input.orderSeed, `${path}.orderSeed`),
    engineOrder,
    launchAttempts: array(input.launchAttempts, `${path}.launchAttempts`).map((entry, index) =>
      parseLaunchAttempt(entry, `${path}.launchAttempts[${index}]`),
    ),
  };
  if (!Number.isFinite(Date.parse(metadata.timestamp))) {
    throw new TypeError(`${path}.timestamp must be an ISO timestamp`);
  }
  if (metadata.engineOrder.length !== metadata.rounds) {
    throw new TypeError(`${path}.engineOrder must contain one order per round`);
  }
  return metadata;
}

function parseConfig(value: unknown, path: string): RenderRunConfig {
  const input = record(value, path);
  const engines = array(input.engines, `${path}.engines`).map((engine, index) =>
    enumValue(engine, ENGINE_IDS, `${path}.engines[${index}]`),
  );
  const rows = array(input.rows, `${path}.rows`).map((count, index) =>
    integer(count, `${path}.rows[${index}]`, 1),
  );
  const scenarios = array(input.scenarios, `${path}.scenarios`).map((scenario, index) =>
    enumValue(
      scenario,
      RENDER_SCENARIOS.map((entry) => entry.id),
      `${path}.scenarios[${index}]`,
    ),
  );
  if (engines.length === 0 || new Set(engines).size !== engines.length) {
    throw new TypeError(`${path}.engines must be non-empty and unique`);
  }
  if (rows.length === 0 || new Set(rows).size !== rows.length) {
    throw new TypeError(`${path}.rows must be non-empty and unique`);
  }
  if (scenarios.length === 0 || new Set(scenarios).size !== scenarios.length) {
    throw new TypeError(`${path}.scenarios must be non-empty and unique`);
  }
  return { engines, rows, scenarios };
}

function parseCompleteness(value: unknown, path: string): CompletenessSummary {
  const input = record(value, path);
  return {
    expectedKeys: stringArray(input.expectedKeys, `${path}.expectedKeys`),
    observedKeys: stringArray(input.observedKeys, `${path}.observedKeys`),
    missingKeys: stringArray(input.missingKeys, `${path}.missingKeys`),
    duplicateKeys: stringArray(input.duplicateKeys, `${path}.duplicateKeys`),
    unexpectedKeys: stringArray(input.unexpectedKeys, `${path}.unexpectedKeys`),
    failedKeys: stringArray(input.failedKeys, `${path}.failedKeys`),
    complete: bool(input.complete, `${path}.complete`),
    successful: bool(input.successful, `${path}.successful`),
  };
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseRenderArtifact(
  value: unknown,
  options: ParseRenderOptions = {},
): RenderBenchmarkArtifact {
  const input = record(value, "artifact");
  const protocolVersion = integer(input.protocolVersion, "artifact.protocolVersion", 1);
  if (protocolVersion !== RENDER_PROTOCOL_VERSION) {
    throw new TypeError(`unsupported render protocol version: ${protocolVersion}`);
  }
  const runId = text(input.runId, "artifact.runId");
  if (options.expectedRunId !== undefined && runId !== options.expectedRunId) {
    throw new TypeError(
      `stale render result: expected run ${options.expectedRunId}, observed ${runId}`,
    );
  }
  const metadata = parseMetadata(input.metadata, "artifact.metadata");
  if (options.maxAgeMs !== undefined) {
    const nowMs = options.nowMs ?? Date.now();
    if (nowMs - Date.parse(metadata.timestamp) > options.maxAgeMs) {
      throw new TypeError(`stale render result timestamp: ${metadata.timestamp}`);
    }
  }
  const config = parseConfig(input.config, "artifact.config");
  for (const engine of config.engines) {
    for (const order of metadata.engineOrder) {
      if (!order.includes(engine) || order.length !== config.engines.length) {
        throw new TypeError("artifact.metadata.engineOrder does not match configured engines");
      }
    }
  }
  for (const rows of config.rows) {
    if (metadata.datasetHashes[String(rows)] === undefined) {
      throw new TypeError(`artifact.metadata.datasetHashes is missing ${rows}`);
    }
  }
  const results = array(input.results, "artifact.results").map((entry, index) =>
    parseScenarioResult(
      entry,
      metadata.measuredSamples,
      metadata.minimumSampleDurationMs,
      `artifact.results[${index}]`,
    ),
  );
  if (results.some((result) => result.runId !== runId)) {
    throw new TypeError("artifact contains a stale scenario run ID");
  }
  for (let round = 1; round <= metadata.rounds; round++) {
    for (const engine of config.engines) {
      for (const rows of config.rows) {
        const attempts = metadata.launchAttempts.filter(
          (attempt) =>
            attempt.round === round && attempt.engine === engine && attempt.rows === rows,
        );
        if (attempts.length === 0 || attempts.length > RENDER_MAX_LAUNCH_ATTEMPTS) {
          throw new TypeError(
            `artifact.metadata.launchAttempts must record 1-${RENDER_MAX_LAUNCH_ATTEMPTS} attempts per browser process`,
          );
        }
        if (attempts.some((attempt, index) => attempt.attempt !== index + 1)) {
          throw new TypeError("artifact.metadata.launchAttempts must be contiguous");
        }
        if (attempts.slice(0, -1).some((attempt) => attempt.success)) {
          throw new TypeError(
            "artifact.metadata.launchAttempts continued after a successful launch",
          );
        }
        if (!attempts.at(-1)!.success) {
          const combination = results.filter(
            (result) => result.round === round && result.engine === engine && result.rows === rows,
          );
          if (
            combination.length !== config.scenarios.length ||
            combination.some((result) => result.status !== "failed" || result.stage !== "launch")
          ) {
            throw new TypeError(
              "artifact results must preserve an exhausted browser launch failure",
            );
          }
        }
      }
    }
  }
  const completeness = parseCompleteness(input.completeness, "artifact.completeness");
  const actualCompleteness = summarizeCompleteness(config, metadata.rounds, results);
  for (const field of [
    "expectedKeys",
    "observedKeys",
    "missingKeys",
    "duplicateKeys",
    "unexpectedKeys",
    "failedKeys",
  ] as const) {
    if (!equalStringArrays(completeness[field], actualCompleteness[field])) {
      throw new TypeError(`artifact.completeness.${field} does not match results`);
    }
  }
  if (
    completeness.complete !== actualCompleteness.complete ||
    completeness.successful !== actualCompleteness.successful
  ) {
    throw new TypeError("artifact.completeness flags do not match results");
  }
  if (!completeness.complete) {
    throw new TypeError("render artifact matrix is incomplete or duplicated");
  }
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId,
    metadata,
    config,
    results,
    completeness,
    reproductionCommands: stringArray(input.reproductionCommands, "artifact.reproductionCommands"),
  };
}

export function parseRenderArtifactJson(
  json: string,
  options: ParseRenderOptions = {},
): RenderBenchmarkArtifact {
  return parseRenderArtifact(JSON.parse(json) as unknown, options);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatMs(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(5);
}

export function renderBenchmarkMarkdown(value: RenderBenchmarkArtifact): string {
  const artifact = parseRenderArtifact(value);
  const lines: string[] = [
    "# Auditable render benchmark",
    "",
    `Protocol version: **${artifact.protocolVersion}**  `,
    `Run ID: \`${artifact.runId}\`  `,
    `Matrix: **${artifact.completeness.successful ? "complete and successful" : "complete with structured failures"}**`,
    "",
  ];
  if (!artifact.completeness.successful) {
    lines.push(
      "> Comparative headline ratios are intentionally omitted because one or more cells failed.",
      "",
    );
  }
  lines.push(
    "## Environment",
    "",
    "| Field | Value |",
    "|:--|:--|",
    `| Commit | \`${escapeMarkdown(artifact.metadata.commit)}\` (${artifact.metadata.dirty ? "dirty" : "clean"}) |`,
    `| Timestamp | ${artifact.metadata.timestamp} |`,
    `| Runtime | Bun ${escapeMarkdown(artifact.metadata.bunVersion)}; Node ${escapeMarkdown(artifact.metadata.nodeVersion)} |`,
    `| Browser | ${escapeMarkdown(artifact.metadata.browserVersion)} |`,
    `| OS / arch | ${escapeMarkdown(artifact.metadata.os)} / ${escapeMarkdown(artifact.metadata.arch)} |`,
    `| CPU | ${escapeMarkdown(artifact.metadata.cpu)} |`,
    `| Engines | Sheetwrite ${escapeMarkdown(artifact.metadata.engineVersions.sheetwrite)}; Handsontable ${escapeMarkdown(artifact.metadata.engineVersions.handsontable)} |`,
    `| Dataset | seed ${artifact.metadata.datasetSeed}; ${Object.entries(
      artifact.metadata.datasetHashes,
    )
      .map(([rows, hash]) => `${Number(rows).toLocaleString("en-US")} rows = \`${hash}\``)
      .join("; ")} |`,
    `| Viewport | ${artifact.metadata.viewport.width} × ${artifact.metadata.viewport.height} |`,
    `| Sampling | ${artifact.metadata.warmupSamples} excluded warmup aggregate(s), ${artifact.metadata.measuredSamples} measured aggregate(s), minimum ${artifact.metadata.minimumSampleDurationMs} ms each |`,
    `| Counterbalance | seed ${artifact.metadata.orderSeed}; ${artifact.metadata.engineOrder
      .map((order, index) => `round ${index + 1}: ${order.join(" → ")}`)
      .join("; ")} |`,
    `| Browser launches | ${artifact.metadata.launchAttempts.length} attempt(s); ${artifact.metadata.launchAttempts.filter((attempt) => !attempt.success).length} failed attempt(s), all recorded in raw JSON |`,
    "",
    "Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.",
    "",
    "## Results",
    "",
    "| round | rows | scenario / raw identity | Sheetwrite | Handsontable |",
    "|---:|---:|:--|:--|:--|",
  );

  const byKey = new Map(artifact.results.map((result) => [renderMatrixKey(result), result]));
  for (let round = 1; round <= artifact.metadata.rounds; round++) {
    for (const rows of artifact.config.rows) {
      for (const scenarioId of artifact.config.scenarios) {
        const cells = artifact.config.engines.map((engine) => {
          const identity: ScenarioIdentity = {
            runId: artifact.runId,
            round,
            engine,
            rows,
            scenarioId,
            group: scenarioGroup(scenarioId),
          };
          const result = byKey.get(renderMatrixKey(identity));
          if (!result) return "**INCOMPLETE — missing cell**";
          if (result.status === "failed") {
            return `**FAILED (${result.stage})** — ${escapeMarkdown(result.errorClass)}: ${escapeMarkdown(result.message)}`;
          }
          return `median ${formatMs(result.medianMs)} ms; p95 ${formatMs(result.p95Ms)}; MAD ${formatMs(result.madMs)}; ${result.rawSamples.length} samples / ${result.operationCount} ops`;
        });
        const identityLabel = `r${round}-${rows}-${scenarioId}`;
        lines.push(
          `| ${round} | ${rows.toLocaleString("en-US")} | [\`${escapeMarkdown(identityLabel)}\`](./render-results.json) | ${cells.join(" | ")} |`,
        );
      }
    }
  }

  lines.push("", "## Reproduce", "");
  for (const command of artifact.reproductionCommands) lines.push(`- \`${command}\``);
  lines.push(
    "",
    "The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.",
    "",
  );
  return lines.join("\n");
}
