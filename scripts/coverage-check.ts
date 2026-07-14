import { relative, resolve, sep } from "node:path";

export type CoverageLanguage = "typescript" | "rust";
export type CoverageTier = "A" | "B" | "C";
export type CoverageMetricName = "lines" | "functions" | "regions";

export interface CoverageCounts {
  readonly covered: number;
  readonly total: number;
}

export interface CoverageRecord {
  readonly path: string;
  readonly lines: CoverageCounts;
  readonly functions: CoverageCounts;
  readonly regions?: CoverageCounts;
  readonly uncoveredLines: readonly number[];
  readonly lineCounts?: ReadonlyMap<number, number>;
}

export interface CoverageFloor {
  readonly lines?: number;
  readonly functions?: number;
  readonly regions?: number;
}

export interface CoverageExclusion {
  readonly reason: string;
  readonly command: string;
}

export interface CoverageThresholdEntry {
  readonly path: string;
  readonly members?: readonly string[];
  readonly language: CoverageLanguage;
  readonly tier: CoverageTier;
  readonly metrics: CoverageFloor;
  readonly owner: string;
  readonly rationale: string;
  readonly exclusion?: CoverageExclusion;
}

export interface CoverageThresholdManifest {
  readonly schemaVersion: number;
  readonly entries: readonly CoverageThresholdEntry[];
}

export interface LcovRecord extends CoverageRecord {
  readonly lineCounts: ReadonlyMap<number, number>;
}

export const COVERAGE_SCHEMA_VERSION = 2;
export const TIER_MINIMUMS: Readonly<
  Record<CoverageTier, Readonly<Record<CoverageMetricName, number>>>
> = {
  A: { lines: 90, functions: 85, regions: 85 },
  B: { lines: 80, functions: 75, regions: 75 },
  C: { lines: 75, functions: 70, regions: 70 },
};

/** Files whose risk classification must not silently disappear during a move/split. */
export const REQUIRED_RISK_PATHS = [
  "packages/core/src/adapter.ts",
  "packages/core/src/canvas-paint.ts",
  "packages/core/src/clipboard-controller.ts",
  "packages/core/src/datasource-controller.ts",
  "packages/core/src/document-controller.ts",
  "packages/core/src/document-protocol.ts",
  "packages/core/src/geometry-layout-controller.ts",
  "packages/core/src/grid-controller.ts",
  "packages/core/src/grid.ts",
  "packages/core/src/history.ts",
  "packages/core/src/indexeddb.ts",
  "packages/core/src/input-controller.ts",
  "packages/core/src/persistence.ts",
  "packages/core/src/rebase.ts",
  "packages/core/src/render-coordinator.ts",
  "packages/core/src/store.ts",
  "packages/core/src/store/data-engine.ts",
  "packages/core/src/sync.ts",
  "packages/core/src/worker-renderer.ts",
  "packages/core/src/worker.ts",
  "packages/react/src/index.tsx",
  "packages/svelte/src/Grid.svelte",
  "packages/svelte/src/Sheetwrite.svelte",
  "packages/vue/src/index.ts",
  "packages/xlsx/src/register.ts",
  "packages/xlsx/src/registration.ts",
  "packages/xlsx/src/table-export.ts",
  "packages/xlsx/src/table-import.ts",
  "packages/xlsx/src/workbook.ts",
  "packages/wasm/src/calc.rs",
  "packages/wasm/src/eval/mod.rs",
  "packages/wasm/src/eval/criteria.rs",
  "packages/wasm/src/eval/date.rs",
  "packages/wasm/src/eval/dependency.rs",
  "packages/wasm/src/eval/functions.rs",
  "packages/wasm/src/eval/lookup.rs",
  "packages/wasm/src/eval/matrix.rs",
  "packages/wasm/src/eval/value.rs",
  "packages/wasm/src/query.rs",
  "packages/wasm/src/sheet.rs",
  "packages/wasm/src/store.rs",
  "packages/wasm/src/types.rs",
  "packages/wasm/src/window.rs",
] as const;

const CONTAMINATED_SEGMENTS = new Set(["dist", "test", "tests", "node_modules", "examples"]);
const INTEGER = /^\d+$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function finiteNonNegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${label} must be a finite non-negative integer`);
  }
  return value;
}

function lcovInteger(raw: string, label: string): number {
  if (!INTEGER.test(raw)) throw new Error(`${label} must be a finite non-negative integer`);
  const value = Number(raw);
  return finiteNonNegativeInteger(value, label);
}

export function normalizeSourcePath(path: string, root: string): string {
  if (typeof path !== "string" || path.trim() === "")
    throw new Error("Coverage source path is empty");
  const normalizedInput = path.replaceAll("\\", "/");
  const absolute = normalizedInput.startsWith("/")
    ? resolve(normalizedInput)
    : resolve(root, normalizedInput);
  const repositoryRoot = resolve(root);
  const repositoryPath = relative(repositoryRoot, absolute);
  if (
    repositoryPath === "" ||
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    repositoryPath.startsWith("/")
  ) {
    throw new Error(`Coverage source escapes repository root: ${path}`);
  }
  return repositoryPath.split(sep).join("/");
}

function finaliseLcovRecord(
  rawPath: string | undefined,
  root: string,
  lineCounts: Map<number, number>,
  fields: Map<string, number>,
): LcovRecord {
  if (!rawPath) throw new Error("LCOV record is missing SF");
  const path = normalizeSourcePath(rawPath, root);
  const lines = {
    covered: [...lineCounts.values()].filter((count) => count > 0).length,
    total: lineCounts.size,
  };
  const functions = {
    covered: fields.get("FNH") ?? 0,
    total: fields.get("FNF") ?? 0,
  };
  if (functions.covered > functions.total) {
    throw new Error(`LCOV FNH exceeds FNF for ${path}`);
  }
  if (fields.has("LF") && fields.get("LF") !== lines.total) {
    throw new Error(`LCOV LF does not match DA records for ${path}`);
  }
  if (fields.has("LH") && fields.get("LH") !== lines.covered) {
    throw new Error(`LCOV LH does not match DA records for ${path}`);
  }
  return {
    path,
    lines,
    functions,
    uncoveredLines: [...lineCounts]
      .filter(([, count]) => count === 0)
      .map(([line]) => line)
      .sort((left, right) => left - right),
    lineCounts,
  };
}

/** Parse the line/function subset emitted by both Bun and cargo-llvm-cov. */
export function parseLcov(
  text: string,
  root: string,
  lineSummary: "validate" | "recompute" = "validate",
): readonly LcovRecord[] {
  if (typeof text !== "string" || text.trim() === "") throw new Error("LCOV report is empty");
  const records: LcovRecord[] = [];
  const paths = new Set<string>();
  let rawPath: string | undefined;
  let lineCounts = new Map<number, number>();
  let fields = new Map<string, number>();
  let active = false;

  for (const [zeroBasedLine, rawLine] of text.split(/\r?\n/).entries()) {
    const reportLine = zeroBasedLine + 1;
    if (rawLine === "") continue;
    if (rawLine.startsWith("TN:")) {
      if (active) throw new Error(`Unexpected TN inside LCOV record at line ${reportLine}`);
      continue;
    }
    if (rawLine.startsWith("SF:")) {
      if (active) throw new Error(`Duplicate/nested SF at LCOV line ${reportLine}`);
      active = true;
      rawPath = rawLine.slice(3);
      lineCounts = new Map();
      fields = new Map();
      continue;
    }
    if (!active) throw new Error(`LCOV data outside a source record at line ${reportLine}`);
    if (rawLine.startsWith("DA:")) {
      const fieldsRaw = rawLine.slice(3).split(",");
      if (fieldsRaw.length < 2) throw new Error(`Malformed LCOV DA at line ${reportLine}`);
      const line = lcovInteger(fieldsRaw[0]!, `LCOV DA line at report line ${reportLine}`);
      if (line === 0) throw new Error(`LCOV DA source line must be positive at line ${reportLine}`);
      const count = lcovInteger(fieldsRaw[1]!, `LCOV DA count at report line ${reportLine}`);
      if (lineCounts.has(line)) throw new Error(`Duplicate LCOV DA source line ${line}`);
      lineCounts.set(line, count);
      continue;
    }
    const summary = rawLine.match(/^(FNF|FNH|LF|LH):(.*)$/);
    if (summary) {
      const key = summary[1]!;
      if (fields.has(key)) throw new Error(`Duplicate LCOV ${key} field`);
      fields.set(key, lcovInteger(summary[2]!, `LCOV ${key}`));
      continue;
    }
    if (rawLine.startsWith("FN:") || rawLine.startsWith("FNDA:") || rawLine.startsWith("BR")) {
      // Function names and branches are not used for Bun scoring. Their counters are
      // represented by FNF/FNH; Rust region data comes from LLVM JSON.
      continue;
    }
    if (rawLine === "end_of_record") {
      if (lineSummary === "recompute") {
        fields.delete("LF");
        fields.delete("LH");
      }
      const record = finaliseLcovRecord(rawPath, root, lineCounts, fields);
      if (paths.has(record.path)) throw new Error(`Duplicate LCOV source record: ${record.path}`);
      paths.add(record.path);
      records.push(record);
      active = false;
      rawPath = undefined;
      continue;
    }
    throw new Error(`Unknown LCOV field at line ${reportLine}: ${rawLine}`);
  }
  if (active) throw new Error("LCOV report ended before end_of_record");
  if (records.length === 0) throw new Error("LCOV report contains no source records");
  return records;
}

/**
 * Merge independently collected Bun reports without double-counting function
 * definitions. Bun's LCOV omits function identities, so the maximum covered
 * function count is a conservative lower bound across shards.
 */
export function mergeLcovRecords(
  reports: readonly (readonly LcovRecord[])[],
): readonly LcovRecord[] {
  if (reports.length === 0) throw new Error("No LCOV reports to merge");
  const byPath = new Map<string, LcovRecord[]>();
  for (const report of reports) {
    for (const record of report) {
      const records = byPath.get(record.path) ?? [];
      records.push(record);
      byPath.set(record.path, records);
    }
  }
  return [...byPath]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, records]) => {
      const lineCounts = new Map<number, number>();
      for (const record of records) {
        for (const [line, count] of record.lineCounts) {
          lineCounts.set(line, (lineCounts.get(line) ?? 0) + count);
        }
      }
      const orderedLineCounts = new Map([...lineCounts].sort(([left], [right]) => left - right));
      return {
        path,
        lines: {
          covered: [...orderedLineCounts.values()].filter((count) => count > 0).length,
          total: orderedLineCounts.size,
        },
        functions: {
          covered: Math.max(...records.map((record) => record.functions.covered)),
          total: Math.max(...records.map((record) => record.functions.total)),
        },
        uncoveredLines: [...orderedLineCounts]
          .filter(([, count]) => count === 0)
          .map(([line]) => line),
        lineCounts: orderedLineCounts,
      };
    });
}

function isRustInlineTestSymbol(name: string): boolean {
  // Rust 1.96's v0 mangling encodes the path segment `tests` as `5tests`.
  // cargo-llvm-cov drops a separate tests.rs, but not inline #[cfg(test)] modules.
  return name.includes("5tests");
}

function rustRegion(
  value: unknown,
  label: string,
): readonly [number, number, number, number, number, number, number, number] {
  if (!Array.isArray(value) || value.length < 8) throw new Error(`${label} is malformed`);
  return value
    .slice(0, 8)
    .map((item, index) =>
      finiteNonNegativeInteger(item, `${label}[${index}]`),
    ) as unknown as readonly [number, number, number, number, number, number, number, number];
}

/**
 * Normalize LLVM JSON while removing regions/functions belonging to inline
 * `#[cfg(test)] mod tests`. Line counters come from the matching LCOV report;
 * function/region definitions are grouped by source location to collapse Rust
 * monomorph instantiations exactly as llvm-cov's file summary does.
 */
export function normalizeRustCoverage(
  raw: unknown,
  lcovRecords: readonly LcovRecord[],
  root: string,
): readonly CoverageRecord[] {
  assertRecord(raw, "LLVM JSON");
  if (!Array.isArray(raw.data) || raw.data.length !== 1) {
    throw new Error("LLVM JSON must contain exactly one data report");
  }
  const data = raw.data[0];
  assertRecord(data, "LLVM JSON data report");
  if (!Array.isArray(data.files) || !Array.isArray(data.functions)) {
    throw new Error("LLVM JSON is missing files/functions arrays");
  }

  const lcovByPath = new Map(lcovRecords.map((record) => [record.path, record]));
  const functions = data.functions.map((value, index) => {
    assertRecord(value, `LLVM function ${index}`);
    if (
      typeof value.name !== "string" ||
      !Array.isArray(value.filenames) ||
      !Array.isArray(value.regions)
    ) {
      throw new Error(`LLVM function ${index} has an invalid schema`);
    }
    const count = finiteNonNegativeInteger(value.count, `LLVM function ${index} count`);
    const filenames = value.filenames.map((filename, filenameIndex) => {
      if (typeof filename !== "string")
        throw new Error(`LLVM function ${index} filename ${filenameIndex} is invalid`);
      return normalizeSourcePath(filename, root);
    });
    return {
      name: value.name,
      count,
      filenames,
      regions: value.regions.map((region, regionIndex) =>
        rustRegion(region, `LLVM function ${index} region ${regionIndex}`),
      ),
    };
  });

  const result: CoverageRecord[] = [];
  const seen = new Set<string>();
  for (const [fileIndex, value] of data.files.entries()) {
    assertRecord(value, `LLVM file ${fileIndex}`);
    if (typeof value.filename !== "string")
      throw new Error(`LLVM file ${fileIndex} filename is invalid`);
    const path = normalizeSourcePath(value.filename, root);
    if (seen.has(path)) throw new Error(`Duplicate LLVM source record: ${path}`);
    seen.add(path);
    const lcov = lcovByPath.get(path);
    if (!lcov) throw new Error(`LLVM JSON source is missing from LCOV: ${path}`);

    const fileFunctions = functions.filter((fn) => fn.filenames.includes(path));
    const testFunctions = fileFunctions.filter((fn) => isRustInlineTestSymbol(fn.name));
    const productionFunctions = fileFunctions.filter((fn) => !isRustInlineTestSymbol(fn.name));
    const testRanges = testFunctions.flatMap((fn) =>
      fn.regions.map((region) => ({ start: region[0], end: region[2] })),
    );
    const lineCounts = new Map(
      [...lcov.lineCounts].filter(
        ([line]) => !testRanges.some((range) => line >= range.start && line <= range.end),
      ),
    );

    const definitions = new Map<string, number[]>();
    const regions = new Map<string, number[]>();
    for (const fn of productionFunctions) {
      const first = fn.regions[0];
      if (first) {
        const key = `${first[0]}:${first[1]}`;
        const counts = definitions.get(key) ?? [];
        counts.push(fn.count);
        definitions.set(key, counts);
      }
      for (const region of fn.regions) {
        if (region[7] !== 0) continue;
        const key = `${region[0]}:${region[1]}:${region[2]}:${region[3]}`;
        const counts = regions.get(key) ?? [];
        counts.push(region[4]);
        regions.set(key, counts);
      }
    }

    result.push({
      path,
      lines: {
        covered: [...lineCounts.values()].filter((count) => count > 0).length,
        total: lineCounts.size,
      },
      functions: {
        covered: [...definitions.values()].filter((counts) => counts.some((count) => count > 0))
          .length,
        total: definitions.size,
      },
      regions: {
        covered: [...regions.values()].filter((counts) => counts.some((count) => count > 0)).length,
        total: regions.size,
      },
      uncoveredLines: [...lineCounts]
        .filter(([, count]) => count === 0)
        .map(([line]) => line)
        .sort((left, right) => left - right),
      lineCounts,
    });
  }
  return result;
}

export function isCoverageContamination(path: string): boolean {
  const segments = path.split("/");
  return (
    segments.some((segment) => CONTAMINATED_SEGMENTS.has(segment)) ||
    path.endsWith(".d.ts") ||
    path.includes("/pkg/") ||
    path.includes("wasm-bindgen")
  );
}

export function filterRuntimeRecords(
  records: readonly CoverageRecord[],
  runtimePaths: ReadonlySet<string>,
): readonly CoverageRecord[] {
  return records.filter((record) => runtimePaths.has(record.path));
}

function validateText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be non-empty`);
}

function validateRepositoryPath(value: unknown, label: string): asserts value is string {
  validateText(value, label);
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) {
    throw new Error(`${label} must be repository-relative`);
  }
}

function entrySourcePaths(entry: CoverageThresholdEntry): readonly string[] {
  return entry.members ?? [entry.path];
}

export function parseCoverageManifest(raw: unknown): CoverageThresholdManifest {
  assertRecord(raw, "Coverage threshold manifest");
  if (raw.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported coverage threshold schema version: ${String(raw.schemaVersion)}`);
  }
  if (!Array.isArray(raw.entries))
    throw new Error("Coverage threshold manifest entries must be an array");
  const entryIds = new Set<string>();
  const classifiedPaths = new Set<string>();
  const entries = raw.entries.map((value, index): CoverageThresholdEntry => {
    assertRecord(value, `Coverage threshold entry ${index}`);
    validateRepositoryPath(value.path, `Coverage threshold entry ${index} path`);
    if (entryIds.has(value.path))
      throw new Error(`Duplicate coverage threshold entry: ${value.path}`);
    entryIds.add(value.path);
    let members: string[] | undefined;
    if (value.members !== undefined) {
      if (!Array.isArray(value.members) || value.members.length === 0) {
        throw new Error(`Coverage threshold entry ${value.path} members must be a non-empty array`);
      }
      members = value.members.map((member, memberIndex) => {
        validateRepositoryPath(
          member,
          `Coverage threshold entry ${value.path} member ${memberIndex}`,
        );
        return member;
      });
    }
    for (const sourcePath of members ?? [value.path]) {
      if (classifiedPaths.has(sourcePath)) {
        throw new Error(`Duplicate coverage source classification: ${sourcePath}`);
      }
      classifiedPaths.add(sourcePath);
    }
    if (value.language !== "typescript" && value.language !== "rust") {
      throw new Error(`Coverage threshold entry ${value.path} has an invalid language`);
    }
    if (value.tier !== "A" && value.tier !== "B" && value.tier !== "C") {
      throw new Error(`Coverage threshold entry ${value.path} has an invalid tier`);
    }
    validateText(value.owner, `Coverage threshold entry ${value.path} owner`);
    validateText(value.rationale, `Coverage threshold entry ${value.path} rationale`);
    assertRecord(value.metrics, `Coverage threshold entry ${value.path} metrics`);
    const metrics: Record<string, number> = {};
    for (const metric of ["lines", "functions", "regions"] as const) {
      const floor = value.metrics[metric];
      if (floor === undefined) continue;
      if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 0 || floor > 100) {
        throw new Error(`Coverage threshold entry ${value.path} has an invalid ${metric} floor`);
      }
      metrics[metric] = floor;
    }
    let exclusion: CoverageExclusion | undefined;
    if (value.exclusion !== undefined) {
      assertRecord(value.exclusion, `Coverage threshold entry ${value.path} exclusion`);
      validateText(
        value.exclusion.reason,
        `Coverage threshold entry ${value.path} exclusion reason`,
      );
      validateText(
        value.exclusion.command,
        `Coverage threshold entry ${value.path} exclusion command`,
      );
      if (Object.keys(metrics).length !== 0) {
        throw new Error(`Excluded coverage entry ${value.path} must not define metric floors`);
      }
      exclusion = { reason: value.exclusion.reason, command: value.exclusion.command };
    } else if (metrics.lines === undefined || metrics.functions === undefined) {
      throw new Error(`Scored coverage entry ${value.path} requires line and function floors`);
    }
    return {
      path: value.path,
      ...(members ? { members } : {}),
      language: value.language,
      tier: value.tier,
      metrics,
      owner: value.owner,
      rationale: value.rationale,
      ...(exclusion ? { exclusion } : {}),
    };
  });
  return { schemaVersion: COVERAGE_SCHEMA_VERSION, entries };
}

function assertCounts(counts: CoverageCounts, label: string): void {
  finiteNonNegativeInteger(counts.covered, `${label} covered`);
  finiteNonNegativeInteger(counts.total, `${label} total`);
  if (counts.covered > counts.total) throw new Error(`${label} covered exceeds total`);
}

function metricCounts(
  record: CoverageRecord,
  metric: CoverageMetricName,
): CoverageCounts | undefined {
  return record[metric];
}

function meetsFloor(counts: CoverageCounts, floor: number): boolean {
  if (counts.total === 0) return floor === 100;
  return counts.covered * 100 >= floor * counts.total;
}

function aggregateCoverageRecords(
  entry: CoverageThresholdEntry,
  recordByPath: ReadonlyMap<string, CoverageRecord>,
): CoverageRecord {
  const records = entrySourcePaths(entry).map((path) => {
    const record = recordByPath.get(path);
    if (!record) throw new Error(`Coverage report is missing scored source: ${path}`);
    return record;
  });
  const sum = (metric: CoverageMetricName): CoverageCounts | undefined => {
    const counts = records.map((record) => metricCounts(record, metric));
    if (counts.some((value) => value === undefined)) return undefined;
    return counts.reduce<CoverageCounts>(
      (total, value) => ({
        covered: total.covered + (value?.covered ?? 0),
        total: total.total + (value?.total ?? 0),
      }),
      { covered: 0, total: 0 },
    );
  };
  return {
    path: entry.path,
    lines: sum("lines") ?? { covered: 0, total: 0 },
    functions: sum("functions") ?? { covered: 0, total: 0 },
    ...(sum("regions") ? { regions: sum("regions") } : {}),
    uncoveredLines: [],
  };
}

export interface CoveragePolicyResult {
  readonly records: readonly CoverageRecord[];
  readonly entries: readonly CoverageThresholdEntry[];
}

export function evaluateCoveragePolicy(options: {
  readonly manifest: CoverageThresholdManifest;
  readonly language: CoverageLanguage;
  readonly records: readonly CoverageRecord[];
  readonly runtimePaths: readonly string[];
}): CoveragePolicyResult {
  const { manifest, language, records } = options;
  const runtimePaths = new Set(options.runtimePaths);
  const entries = manifest.entries.filter((entry) => entry.language === language);
  const manifestPaths = new Set(entries.flatMap((entry) => entrySourcePaths(entry)));

  for (const required of REQUIRED_RISK_PATHS) {
    const expectedLanguage: CoverageLanguage = required.endsWith(".rs") ? "rust" : "typescript";
    if (expectedLanguage === language && !manifestPaths.has(required)) {
      throw new Error(`Missing required risk module classification: ${required}`);
    }
  }
  for (const path of runtimePaths) {
    if (!manifestPaths.has(path)) throw new Error(`Unclassified runtime source file: ${path}`);
  }
  for (const entry of entries) {
    for (const sourcePath of entrySourcePaths(entry)) {
      if (!runtimePaths.has(sourcePath)) {
        throw new Error(`Coverage threshold has no runtime source file: ${sourcePath}`);
      }
      if (!entry.exclusion && isCoverageContamination(sourcePath)) {
        throw new Error(`Generated/test output entered scored coverage: ${sourcePath}`);
      }
    }
  }

  const recordByPath = new Map<string, CoverageRecord>();
  for (const record of records) {
    if (recordByPath.has(record.path))
      throw new Error(`Duplicate normalized coverage source: ${record.path}`);
    if (isCoverageContamination(record.path)) {
      throw new Error(`Generated/test output entered scored coverage: ${record.path}`);
    }
    assertCounts(record.lines, `${record.path} lines`);
    assertCounts(record.functions, `${record.path} functions`);
    if (record.regions) assertCounts(record.regions, `${record.path} regions`);
    recordByPath.set(record.path, record);
  }

  for (const entry of entries) {
    if (entry.exclusion) continue;
    const record = aggregateCoverageRecords(entry, recordByPath);
    for (const metric of ["lines", "functions", "regions"] as const) {
      const floor = entry.metrics[metric];
      if (floor === undefined) continue;
      const counts = metricCounts(record, metric);
      if (!counts) throw new Error(`Coverage report is missing ${metric} data for ${entry.path}`);
      const minimum = TIER_MINIMUMS[entry.tier][metric];
      if (floor < minimum) {
        throw new Error(
          `${entry.path} ${metric} floor ${floor}% is below Tier ${entry.tier} minimum ${minimum}%`,
        );
      }
      if (!meetsFloor(counts, floor)) {
        const actual = counts.total === 0 ? 100 : (counts.covered * 100) / counts.total;
        throw new Error(
          `${entry.path} ${metric} coverage ${actual.toFixed(2)}% (${counts.covered}/${counts.total}) is below ${floor}%`,
        );
      }
    }
  }

  return { records, entries };
}

export function serialiseNormalizedLcov(records: readonly CoverageRecord[]): string {
  return records
    .map((record) => {
      const lines = [
        "TN:",
        `SF:${record.path}`,
        `FNF:${record.functions.total}`,
        `FNH:${record.functions.covered}`,
      ];
      const lineCounts = record.lineCounts;
      if (!lineCounts) {
        throw new Error(`Normalized coverage is missing line counters for ${record.path}`);
      }
      for (const [line, count] of [...lineCounts].sort(([left], [right]) => left - right)) {
        lines.push(`DA:${line},${count}`);
      }
      lines.push(`LF:${record.lines.total}`, `LH:${record.lines.covered}`, "end_of_record");
      return lines.join("\n");
    })
    .join("\n");
}
