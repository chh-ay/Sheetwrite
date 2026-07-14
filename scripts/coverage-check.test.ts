import { describe, expect, it } from "bun:test";
import {
  COVERAGE_SCHEMA_VERSION,
  type CoverageLanguage,
  type CoverageRecord,
  type CoverageThresholdEntry,
  evaluateCoveragePolicy,
  filterRuntimeRecords,
  isCoverageContamination,
  mergeLcovRecords,
  normalizeRustCoverage,
  parseCoverageManifest,
  parseLcov,
  REQUIRED_RISK_PATHS,
  serialiseNormalizedLcov,
} from "./coverage-check.js";

const ROOT = "/repo";

function exclusion(path: string): CoverageThresholdEntry {
  return {
    path,
    language: path.endsWith(".rs") ? "rust" : "typescript",
    tier: "A",
    metrics: {},
    owner: "runtime-owner",
    rationale: "Fixture classification",
    exclusion: { reason: "Fixture-only exclusion", command: "bun test contract.test.ts" },
  };
}

function manifestFor(
  language: CoverageLanguage,
  replacements: readonly CoverageThresholdEntry[] = [],
) {
  const replacementByPath = new Map(replacements.map((entry) => [entry.path, entry]));
  const entries = REQUIRED_RISK_PATHS.filter(
    (path) => (path.endsWith(".rs") ? "rust" : "typescript") === language,
  ).map((path) => replacementByPath.get(path) ?? exclusion(path));
  for (const replacement of replacements) {
    if (!entries.some((entry) => entry.path === replacement.path)) entries.push(replacement);
  }
  return { schemaVersion: COVERAGE_SCHEMA_VERSION, entries };
}

function scored(
  path = "packages/core/src/document-protocol.ts",
  metrics = { lines: 90, functions: 85 },
): CoverageThresholdEntry {
  return {
    path,
    language: "typescript",
    tier: "A",
    metrics,
    owner: "core-owner",
    rationale: "Snapshot input is a trust boundary",
  };
}

function record(
  path = "packages/core/src/document-protocol.ts",
  lines = { covered: 90, total: 100 },
): CoverageRecord {
  return {
    path,
    lines,
    functions: { covered: 17, total: 20 },
    uncoveredLines: Array.from({ length: lines.total - lines.covered }, (_, index) => index + 1),
  };
}

function runtimePaths(entries: readonly CoverageThresholdEntry[]): string[] {
  return entries.flatMap((entry) => entry.members ?? [entry.path]);
}

describe("LCOV parser", () => {
  it("normalizes repository paths and rejects a one-line malformed/non-finite counter", () => {
    const report = [
      "TN:",
      "SF:packages/core/src/grid.ts",
      "FNF:2",
      "FNH:1",
      "DA:10,2",
      "DA:11,0",
      "LF:2",
      "LH:1",
      "end_of_record",
    ].join("\n");
    expect(parseLcov(report, ROOT)[0]).toMatchObject({
      path: "packages/core/src/grid.ts",
      lines: { covered: 1, total: 2 },
      functions: { covered: 1, total: 2 },
      uncoveredLines: [11],
    });
    expect(() => parseLcov(report.replace("DA:11,0", "DA:11,NaN"), ROOT)).toThrow(
      "finite non-negative integer",
    );
  });

  it("serializes normalized records as complete parseable LCOV", () => {
    const source = [
      "SF:packages/core/src/grid.ts",
      "FNF:2",
      "FNH:1",
      "DA:10,2",
      "DA:11,0",
      "LF:2",
      "LH:1",
      "end_of_record",
    ].join("\n");
    const records = parseLcov(source, ROOT);
    expect(parseLcov(serialiseNormalizedLcov(records), ROOT)).toMatchObject([
      {
        path: "packages/core/src/grid.ts",
        lines: { covered: 1, total: 2 },
        functions: { covered: 1, total: 2 },
        uncoveredLines: [11],
      },
    ]);
  });

  it("merges sharded line hits while conservatively ratcheting function coverage", () => {
    const first = parseLcov(
      "SF:packages/core/src/grid.ts\nFNF:3\nFNH:1\nDA:10,2\nDA:11,0\nLF:2\nLH:1\nend_of_record",
      ROOT,
    );
    const second = parseLcov(
      "SF:packages/core/src/grid.ts\nFNF:4\nFNH:2\nDA:10,0\nDA:11,3\nDA:12,1\nLF:3\nLH:2\nend_of_record",
      ROOT,
    );
    expect(mergeLcovRecords([first, second])).toMatchObject([
      {
        path: "packages/core/src/grid.ts",
        lines: { covered: 3, total: 3 },
        functions: { covered: 2, total: 4 },
        uncoveredLines: [],
      },
    ]);
  });

  it("rejects duplicate source records and duplicate line counters", () => {
    const source = [
      "SF:packages/core/src/grid.ts",
      "FNF:0",
      "FNH:0",
      "DA:1,1",
      "LF:1",
      "LH:1",
      "end_of_record",
    ].join("\n");
    expect(() => parseLcov(`${source}\n${source}`, ROOT)).toThrow("Duplicate LCOV source record");
    expect(() => parseLcov(source.replace("DA:1,1", "DA:1,1\nDA:1,0"), ROOT)).toThrow(
      "Duplicate LCOV DA",
    );
  });

  it("fails closed on a missing terminator and counters inconsistent with DA", () => {
    expect(() => parseLcov("SF:packages/core/src/grid.ts\nDA:1,1", ROOT)).toThrow(
      "ended before end_of_record",
    );
    expect(() =>
      parseLcov(
        "SF:packages/core/src/grid.ts\nFNF:0\nFNH:0\nDA:1,1\nLF:2\nLH:1\nend_of_record",
        ROOT,
      ),
    ).toThrow("LF does not match");
  });
});

describe("source-only classification", () => {
  it("keeps adjacent runtime source while filtering dist/test/generated records", () => {
    const records = [
      record("packages/core/src/grid.ts"),
      record("packages/core/dist/grid.js"),
      record("packages/core/test/grid.test.ts"),
      record("packages/wasm/pkg/sheetwrite_wasm.js"),
    ];
    expect(
      filterRuntimeRecords(records, new Set(["packages/core/src/grid.ts"])).map(
        (item) => item.path,
      ),
    ).toEqual(["packages/core/src/grid.ts"]);
    expect(isCoverageContamination("packages/core/src/grid.ts")).toBe(false);
    expect(isCoverageContamination("packages/core/dist/grid.js")).toBe(true);
  });
  it("recomputes stale Rust line summaries from DA counters", () => {
    expect(
      parseLcov(
        "SF:packages/wasm/src/calc.rs\nFNF:0\nFNH:0\nDA:1,1\nLF:2\nLH:2\nend_of_record",
        ROOT,
        "recompute",
      )[0]?.lines,
    ).toEqual({ covered: 1, total: 1 });
  });

  it("rejects a newly added unclassified runtime source and a stale threshold path", () => {
    const manifest = manifestFor("typescript");
    expect(() =>
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [],
        runtimePaths: [...runtimePaths(manifest.entries), "packages/core/src/new-runtime.ts"],
      }),
    ).toThrow("Unclassified runtime source file");

    const stale = scored("packages/core/src/moved-away.ts");
    const staleManifest = manifestFor("typescript", [stale]);
    expect(() =>
      evaluateCoveragePolicy({
        manifest: staleManifest,
        language: "typescript",
        records: [record(stale.path)],
        runtimePaths: runtimePaths(staleManifest.entries).filter((path) => path !== stale.path),
      }),
    ).toThrow("has no runtime source file");
  });

  it("rejects missing Tier A/B risk modules and generated contamination in the scored set", () => {
    const manifest = manifestFor("typescript");
    const withoutRebase = {
      ...manifest,
      entries: manifest.entries.filter((entry) => entry.path !== "packages/core/src/rebase.ts"),
    };
    expect(() =>
      evaluateCoveragePolicy({
        manifest: withoutRebase,
        language: "typescript",
        records: [],
        runtimePaths: runtimePaths(withoutRebase.entries),
      }),
    ).toThrow("Missing required risk module classification");

    const generated = scored("packages/core/dist/grid.js");
    const contaminated = manifestFor("typescript", [generated]);
    expect(() =>
      evaluateCoveragePolicy({
        manifest: contaminated,
        language: "typescript",
        records: [record(generated.path)],
        runtimePaths: runtimePaths(contaminated.entries),
      }),
    ).toThrow("Generated/test output entered scored coverage");
  });
});

describe("risk floors", () => {
  it("passes the approved baseline and higher actual coverage without rewriting policy", () => {
    const entry = scored();
    const manifest = manifestFor("typescript", [entry]);
    const paths = runtimePaths(manifest.entries);
    expect(
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [record()],
        runtimePaths: paths,
      }).records,
    ).toHaveLength(1);
    expect(
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [record(entry.path, { covered: 96, total: 100 })],
        runtimePaths: paths,
      }).records,
    ).toHaveLength(1);
  });

  it("fails on a one-line drop, a missing source record, and a floor below the hard tier minimum", () => {
    const entry = scored();
    const manifest = manifestFor("typescript", [entry]);
    const paths = runtimePaths(manifest.entries);
    expect(() =>
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [record(entry.path, { covered: 89, total: 100 })],
        runtimePaths: paths,
      }),
    ).toThrow("below 90%");
    expect(() =>
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [],
        runtimePaths: paths,
      }),
    ).toThrow("missing scored source");

    const low = scored(entry.path, { lines: 89, functions: 85 });
    const lowManifest = manifestFor("typescript", [low]);
    expect(() =>
      evaluateCoveragePolicy({
        manifest: lowManifest,
        language: "typescript",
        records: [record()],
        runtimePaths: runtimePaths(lowManifest.entries),
      }),
    ).toThrow("below Tier A minimum");
  });
});

describe("aggregate risk floors", () => {
  it("classifies split modules once and enforces the prior combined floor", () => {
    const members = [
      "packages/core/src/store/facade.ts",
      "packages/core/src/store/engine.ts",
    ] as const;
    const group: CoverageThresholdEntry = {
      ...scored("packages/core/src/store/**", { lines: 90, functions: 85 }),
      members,
    };
    const manifest = manifestFor("typescript", [group]);
    const paths = runtimePaths(manifest.entries);
    const records = [
      record(members[0], { covered: 98, total: 100 }),
      record(members[1], { covered: 82, total: 100 }),
    ];
    expect(
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records,
        runtimePaths: paths,
      }).records,
    ).toHaveLength(2);
    expect(() =>
      evaluateCoveragePolicy({
        manifest,
        language: "typescript",
        records: [records[0]!, record(members[1], { covered: 81, total: 100 })],
        runtimePaths: paths,
      }),
    ).toThrow("below 90%");
  });
});

describe("manifest schema", () => {
  it("rejects unjustified exclusions, empty ownership, and unsupported schema versions", () => {
    const base = exclusion("packages/core/src/types.ts");
    expect(() =>
      parseCoverageManifest({
        schemaVersion: COVERAGE_SCHEMA_VERSION,
        entries: [{ ...base, exclusion: { reason: "type-only", command: "" } }],
      }),
    ).toThrow("command must be non-empty");
    expect(() =>
      parseCoverageManifest({
        schemaVersion: COVERAGE_SCHEMA_VERSION,
        entries: [{ ...base, owner: "" }],
      }),
    ).toThrow("owner must be non-empty");
    expect(() => parseCoverageManifest({ schemaVersion: 1, entries: [] })).toThrow(
      "Unsupported coverage threshold schema version",
    );
  });
});

describe("Rust LLVM normalization", () => {
  it("removes inline #[cfg(test)] function regions from line/function/region metrics", () => {
    const lcov = parseLcov(
      [
        "SF:/repo/packages/wasm/src/calc.rs",
        "FNF:2",
        "FNH:2",
        "DA:1,3",
        "DA:2,0",
        "DA:3,2",
        "DA:4,1",
        "DA:5,1",
        "LF:5",
        "LH:4",
        "end_of_record",
      ].join("\n"),
      ROOT,
    );
    const llvm = {
      data: [
        {
          files: [{ filename: "/repo/packages/wasm/src/calc.rs" }],
          functions: [
            {
              name: "_RNv_prod",
              count: 3,
              filenames: ["/repo/packages/wasm/src/calc.rs"],
              regions: [
                [1, 1, 1, 8, 3, 0, 0, 0],
                [2, 1, 3, 8, 0, 0, 0, 0],
              ],
            },
            {
              name: "_RNvNt_crate5tests_contract",
              count: 1,
              filenames: ["/repo/packages/wasm/src/calc.rs"],
              regions: [[4, 1, 5, 8, 1, 0, 0, 0]],
            },
          ],
        },
      ],
    };
    expect(normalizeRustCoverage(llvm, lcov, ROOT)).toEqual([
      {
        path: "packages/wasm/src/calc.rs",
        lines: { covered: 2, total: 3 },
        functions: { covered: 1, total: 1 },
        regions: { covered: 1, total: 2 },
        uncoveredLines: [2],
        lineCounts: new Map([
          [1, 3],
          [2, 0],
          [3, 2],
        ]),
      },
    ]);
  });

  it("rejects malformed/non-finite LLVM counters and JSON/LCOV source disagreement", () => {
    const lcov = parseLcov(
      "SF:/repo/packages/wasm/src/calc.rs\nFNF:0\nFNH:0\nDA:1,1\nLF:1\nLH:1\nend_of_record",
      ROOT,
    );
    const base = {
      data: [
        {
          files: [{ filename: "/repo/packages/wasm/src/calc.rs" }],
          functions: [
            {
              name: "prod",
              count: Number.NaN,
              filenames: ["/repo/packages/wasm/src/calc.rs"],
              regions: [[1, 1, 1, 2, 1, 0, 0, 0]],
            },
          ],
        },
      ],
    };
    expect(() => normalizeRustCoverage(base, lcov, ROOT)).toThrow("finite non-negative integer");
    expect(() =>
      normalizeRustCoverage(
        { data: [{ files: [{ filename: "/repo/packages/wasm/src/eval.rs" }], functions: [] }] },
        lcov,
        ROOT,
      ),
    ).toThrow("missing from LCOV");
  });
});
