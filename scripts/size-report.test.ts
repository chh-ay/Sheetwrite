import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIRST_PAINT_BROTLI_GATE_BYTES,
  FIRST_PAINT_DEFERRED_MODULE,
  firstPaintGate,
  validateFirstPaintEvidence,
} from "./first-paint-evidence.js";
import {
  addPackageSizeMetrics,
  assertAttributionAssetsFresh,
  BUNDLER_SOURCE_MAP_MODE,
  buildAttributionFindings,
  classifyPackedPath,
  compressedSizes,
  formatMetricDelta,
  formatMetricDisplay,
  formatSizeHistory,
  type Metric,
  parsePackJson,
  SIZE_PROTOCOL_VERSION,
  summarizePack,
  validateBundlerEvidence,
  validateComparableAttribution,
  validateSizeHistory,
  walkLogicalBytes,
} from "./size-report.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function packJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      filename: "sheetwrite.tgz",
      size: 4,
      unpackedSize: 3,
      files: [
        { path: "dist/index.js", size: 2 },
        { path: "package.json", size: 1 },
      ],
      ...overrides,
    },
  ]);
}

function evidence(
  assets: unknown[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const initialPath =
    (assets as Array<{ path?: unknown; kind?: unknown; roles?: unknown }>).find(
      (asset) =>
        asset.kind === "javascript" &&
        Array.isArray(asset.roles) &&
        asset.roles.includes("core-initial"),
    )?.path ?? "dist/main.js";
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler: "webpack",
    version: "5.102.1",
    assets,
    provenance: {
      buildMode: "production",
      minified: true,
      minifier: { name: "terser-webpack-plugin", version: "5.3.14" },
      externals: [],
      target: "browser",
      sourceMaps: BUNDLER_SOURCE_MAP_MODE,
      attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
    },
    attribution: [
      {
        name: "core-first-paint",
        entry: "src/main.js",
        eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
        assets: [{ path: initialPath, sha256: "a".repeat(64) }],
        generatedBytes: 10,
        modules: [
          {
            id: "@sheetwrite/core/dist/index.js",
            owner: "@sheetwrite/core",
            attribution: "source-map",
            rawBytes: 10,
            gzipBytes: 8,
            brotliBytes: 6,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function comparableEvidence(bundler: "next" | "vite", overrides: Record<string, unknown> = {}) {
  const roles =
    bundler === "next"
      ? ["core-initial"]
      : [
          "core-initial",
          "react-initial",
          "vue-initial",
          "svelte-initial",
          "worker-async",
          "xlsx-async",
        ];
  const assets = roles.map((role) => ({
    path: `dist/${role}.js`,
    kind: "javascript",
    owner: role,
    roles: [role],
  }));
  assets.push({
    path: "dist/runtime.wasm",
    kind: "wasm",
    owner: "core-initial",
    roles: ["core-initial"],
  });
  return validateBundlerEvidence(
    evidence(assets, {
      bundler,
      version: bundler === "next" ? "15.5.9" : "7.2.2",
      provenance: {
        buildMode: "production",
        minified: true,
        minifier: {
          name: bundler === "next" ? "next-swc" : "esbuild",
          version: bundler === "next" ? "15.5.9" : "0.25.12",
        },
        externals: [],
        target: "browser",
        sourceMaps: BUNDLER_SOURCE_MAP_MODE,
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      ...overrides,
    }),
  );
}

describe("npm pack parsing and classification", () => {
  it("parses a complete npm pack result and classifies packed bytes", () => {
    const result = parsePackJson(packJson());
    expect(result.files).toHaveLength(2);
    expect(summarizePack("@sheetwrite/test", result)).toMatchObject({
      tarballBytes: 4,
      unpackedBytes: 3,
      fileCount: 2,
      categories: { "runtime-js": 2, metadata: 1 },
    });
    expect(classifyPackedPath("dist/index.d.ts.map")).toBe("maps");
    expect(classifyPackedPath("src/Grid.svelte")).toBe("runtime-source");
  });

  it("rejects source maps in the published core package", () => {
    const result = parsePackJson(
      packJson({
        files: [
          { path: "dist/index.js.map", size: 2 },
          { path: "package.json", size: 1 },
        ],
      }),
    );
    expect(() => summarizePack("@sheetwrite/core", result)).toThrow(
      "@sheetwrite/core published files must exclude source maps",
    );
  });

  it("fails closed on malformed, duplicate, and unclassified pack data", () => {
    expect(() => parsePackJson("not-json")).toThrow("Malformed npm pack JSON");
    expect(() => parsePackJson("[]")).toThrow("exactly one result");
    expect(() =>
      parsePackJson(
        packJson({
          unpackedSize: 4,
          files: [
            { path: "dist/index.js", size: 2 },
            { path: "dist/index.js", size: 2 },
          ],
        }),
      ),
    ).toThrow("duplicate file");
    expect(() => classifyPackedPath("dist/unexpected.bin")).toThrow("Unclassified");
    expect(() => summarizePack("test", parsePackJson(packJson({ unpackedSize: 99 })))).toThrow(
      "do not equal",
    );
  });
});

describe("package size metric surfaces", () => {
  it("labels transfer and install bytes separately from browser payload bytes", () => {
    const metrics: Record<string, Metric> = {};
    addPackageSizeMetrics(metrics, summarizePack("@sheetwrite/test", parsePackJson(packJson())));

    expect(metrics["package.@sheetwrite/test.tarballBytes"]?.category).toBe("package-tarball");
    expect(metrics["package.@sheetwrite/test.unpackedBytes"]?.category).toBe("package-unpacked");
    expect(metrics["package.@sheetwrite/test.runtimeJsBytes"]?.category).toBe(
      "package-unpacked-runtime-js",
    );
    expect(Object.values(metrics).some((metric) => metric.category.startsWith("browser-"))).toBe(
      false,
    );
  });
});

describe("deterministic transfer and install bytes", () => {
  it("uses stable gzip and Brotli settings", () => {
    const input = new TextEncoder().encode("sheetwrite".repeat(100));
    const first = compressedSizes(input);
    const second = compressedSizes(input);
    expect(first).toEqual(second);
    expect(first.rawBytes).toBe(1000);
    expect(first.gzipBytes).toBeGreaterThan(0);
    expect(first.brotliBytes).toBeGreaterThan(0);
  });

  it("counts a symlinked file once and terminates a symlink cycle", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-size-walk-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested/data.txt"), "12345");
    await symlink(join(root, "nested/data.txt"), join(root, "alias.txt"));
    await symlink(root, join(root, "nested/cycle"));
    expect(await walkLogicalBytes(root)).toEqual({ bytes: 5, files: 1 });
  });
});

describe("manifest ownership", () => {
  const complete = [
    {
      path: "dist/main-renamed.js",
      kind: "javascript",
      owner: "core-initial",
      roles: ["core-initial"],
    },
    {
      path: "dist/worker-any-hash.js",
      kind: "javascript",
      owner: "worker-async",
      roles: ["worker-async"],
    },
    {
      path: "dist/runtime-any-hash.wasm",
      kind: "wasm",
      owner: "core-initial",
      roles: ["core-initial"],
    },
  ];

  it("classifies evidence independently of generated chunk filenames", () => {
    const renamed = complete.map((asset, index) => ({
      ...asset,
      path: `dist/generated-${index}.${asset.path.slice(asset.path.lastIndexOf(".") + 1)}`,
    }));
    const classification = (assets: unknown[]) =>
      validateBundlerEvidence(evidence(assets)).assets.map(({ kind, owner, roles }) => ({
        kind,
        owner,
        roles,
      }));
    expect(classification(renamed)).toEqual(classification(complete));
  });

  it("rejects missing, duplicate, unclassified, and leaked assets", () => {
    expect(() => validateBundlerEvidence(evidence(complete.slice(0, 1)))).toThrow(
      "missing required worker-async",
    );
    expect(() => validateBundlerEvidence(evidence([...complete, complete[0]]))).toThrow(
      "duplicate asset",
    );
    expect(() =>
      validateBundlerEvidence(
        evidence([{ ...complete[0], owner: "unclassified" }, ...complete.slice(1)]),
      ),
    ).toThrow("missing path, kind, owner, or roles");
    expect(() =>
      validateBundlerEvidence(
        evidence([
          complete[0],
          { ...complete[1], roles: ["core-initial", "worker-async"] },
          complete[2],
        ]),
      ),
    ).toThrow("leaked into an initial entry");
  });

  it("rejects absent or incomplete module attribution", () => {
    expect(() => validateBundlerEvidence(evidence(complete, { attribution: [] }))).toThrow(
      "missing module attribution",
    );
    const incomplete = evidence(complete);
    const attribution = incomplete.attribution as Array<{
      modules: Array<{ owner?: string }>;
    }>;
    delete attribution[0]?.modules[0]?.owner;
    expect(() => validateBundlerEvidence(incomplete)).toThrow("lacks ownership or sizes");
  });

  it("requires explicit ownership for opaque framework assets", () => {
    const opaque = evidence(complete);
    const modules = opaque.attribution as Array<{
      modules: Array<{ id: string; owner: string; attribution: string }>;
    }>;
    const module = modules[0]?.modules[0];
    if (module === undefined) throw new Error("Attribution fixture lost its module");
    module.id = "webpack:opaque/polyfills.js";
    module.owner = "webpack:opaque-framework";
    module.attribution = "opaque-asset";
    expect(validateBundlerEvidence(opaque).attribution[0]?.modules[0]?.attribution).toBe(
      "opaque-asset",
    );
    module.owner = "fixture";
    expect(() => validateBundlerEvidence(opaque)).toThrow("invalid opaque ownership");
  });
  it("rejects attribution without an asset digest", () => {
    const missingHash = evidence(complete);
    const attributedAssets = missingHash.attribution as Array<{
      assets: Array<{ sha256?: string }>;
    }>;
    delete attributedAssets[0]?.assets[0]?.sha256;
    expect(() => validateBundlerEvidence(missingHash)).toThrow("attribution entry 0 is incomplete");
  });

  it("rejects stale same-length attribution by asset digest", () => {
    const parsed = validateBundlerEvidence(evidence(complete));
    const path = parsed.attribution[0]?.assets[0]?.path;
    if (path === undefined) throw new Error("Attribution fixture lost its initial asset");
    expect(() =>
      assertAttributionAssetsFresh(parsed, [{ path, rawBytes: 10, sha256: "a".repeat(64) }]),
    ).not.toThrow();
    expect(() =>
      assertAttributionAssetsFresh(parsed, [{ path, rawBytes: 10, sha256: "b".repeat(64) }]),
    ).toThrow("attribution asset SHA-256 changed");
  });

  it("accepts controlled Next.js and Vite provenance and separates measured causes", () => {
    const next = comparableEvidence("next");
    const vite = comparableEvidence("vite");
    expect(() => validateComparableAttribution([next, vite])).not.toThrow();

    const findings = buildAttributionFindings([next, vite]);
    expect(findings.comparison.minifiers).toEqual({
      next: { name: "next-swc", version: "15.5.9" },
      vite: { name: "esbuild", version: "0.25.12" },
    });
    expect(findings.firstPaint.map((entry) => entry.rootBarrelRawBytes)).toEqual([10, 10]);
    expect(findings.subpaths.every((entry) => entry.decision === "retain-root-export")).toBe(true);
  });

  it("rejects incomparable modes, externals, and eager imports", () => {
    const next = comparableEvidence("next");
    const vite = comparableEvidence("vite");
    const development = comparableEvidence("vite", {
      provenance: { ...vite.provenance, buildMode: "development" },
    });
    expect(() => validateComparableAttribution([next, development])).toThrow(
      "not a minified production browser build",
    );
    const externalized = comparableEvidence("vite", {
      provenance: { ...vite.provenance, externals: ["react"] },
    });
    expect(() => validateComparableAttribution([next, externalized])).toThrow(
      "incomparable externals",
    );
    const differentImports = comparableEvidence("vite", {
      attribution: vite.attribution.map((entry) => ({
        ...entry,
        eagerImports: ["@sheetwrite/core#createGrid"],
      })),
    });
    expect(() => validateComparableAttribution([next, differentImports])).toThrow(
      "eager imports differ",
    );
  });
});

describe("release size history", () => {
  const metric: Metric = { actual: 10, unit: "bytes", category: "test", owner: "owner" };

  it("formats adaptive units and signed release deltas", () => {
    expect(formatMetricDisplay({ ...metric, actual: 900 })).toEqual(["900", "B"]);
    expect(formatMetricDisplay({ ...metric, actual: 1536 })).toEqual(["1.5", "KiB"]);
    expect(formatMetricDisplay({ ...metric, actual: 5 * 1024 * 1024 })).toEqual(["5.00", "MiB"]);
    expect(formatMetricDisplay({ ...metric, actual: 2 * 1024 ** 3 })).toEqual(["2.00", "GiB"]);
    expect(formatMetricDelta({ ...metric, actual: 1536 }, { actual: 1024, unit: "bytes" })).toEqual(
      ["+512 B", "+50.0%"],
    );
  });

  it("renders only versioned release comparisons and rejects duplicate versions", () => {
    const history = {
      schemaVersion: 1 as const,
      releases: [
        {
          version: "0.1.0",
          source: "npm",
          metrics: { size: { actual: 100, unit: "bytes" as const } },
        },
        {
          version: "0.2.0",
          source: "npm",
          metrics: { size: { actual: 90, unit: "bytes" as const } },
        },
      ],
    };
    expect(formatSizeHistory(validateSizeHistory(history))).toContain("-10 B\t-10.0%");
    expect(() =>
      validateSizeHistory({ ...history, releases: [history.releases[0], history.releases[0]] }),
    ).toThrow("Duplicate size release");
  });
});

function firstPaintEvidence(): Record<string, unknown> {
  const fixture = (bundler: "next" | "vite") => ({
    bundler,
    version: bundler === "next" ? "15.5.9" : "7.2.2",
    provenance: {
      buildMode: "production",
      minified: true,
      minifier: {
        name: bundler === "next" ? "next-swc" : "esbuild",
        version: bundler === "next" ? "15.5.9" : "0.25.12",
      },
      externals: [],
      target: "browser",
      sourceMaps: BUNDLER_SOURCE_MAP_MODE,
      attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
    },
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    baseline: {
      initialJavaScript: { rawBytes: 200_000, gzipBytes: 70_000, brotliBytes: 60_000 },
      timing: { samplesMs: new Array(10).fill(20), medianMs: 20, p95Ms: 20 },
      checksum: "a".repeat(64),
    },
    candidate: {
      initialJavaScript: { rawBytes: 160_000, gzipBytes: 56_000, brotliBytes: 50_000 },
      timing: { samplesMs: new Array(10).fill(19), medianMs: 19, p95Ms: 19 },
      checksum: "a".repeat(64),
      deferredChunk: "assets/clipboard-controller.js",
      interaction: {
        module: FIRST_PAINT_DEFERRED_MODULE,
        loaded: true,
        successOutcome: "empty",
        errorOutcome: "unsupported",
        rejected: false,
      },
    },
    delta: {
      rawBytes: 40_000,
      gzipBytes: 14_000,
      brotliBytes: 10_000,
      brotliPercent: (10_000 / 60_000) * 100,
    },
  });
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    kind: "first-paint-counterfactual",
    candidate: {
      fixtureOnly: true,
      shipping: false,
      deferredModules: [FIRST_PAINT_DEFERRED_MODULE],
    },
    thresholds: {
      brotliBytes: FIRST_PAINT_BROTLI_GATE_BYTES,
      percent: 10,
      timing: "median-and-p95-no-slower",
    },
    fixtures: [fixture("next"), fixture("vite")],
  };
}

describe("first-paint counterfactual evidence", () => {
  it("admits complete comparable evidence only when both size and timing gates pass", () => {
    const evidence = firstPaintEvidence();
    expect(validateFirstPaintEvidence(evidence).fixtures).toHaveLength(2);
    expect(firstPaintGate(evidence)).toEqual({ admitted: true, reasons: [] });
  });

  it("rejects missing size, timing, checksum, and interaction fields", () => {
    for (const field of ["initialJavaScript", "timing", "checksum"] as const) {
      const evidence = structuredClone(firstPaintEvidence());
      const baseline = (evidence.fixtures as Array<Record<string, unknown>>)[0]!.baseline as Record<
        string,
        unknown
      >;
      delete baseline[field];
      expect(() => validateFirstPaintEvidence(evidence)).toThrow();
    }
    const evidence = structuredClone(firstPaintEvidence());
    delete (
      (evidence.fixtures as Array<Record<string, unknown>>)[0]!.candidate as Record<string, unknown>
    ).interaction;
    expect(() => validateFirstPaintEvidence(evidence)).toThrow("interaction evidence is missing");
  });

  it("rejects incomparable semantics, provenance, samples, and recorded deltas", () => {
    const mutations = [
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.candidate as Record<string, unknown>).checksum = "b".repeat(64);
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.provenance as Record<string, unknown>).buildMode = "development";
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        const candidate = fixture.candidate as Record<string, unknown>;
        (candidate.timing as Record<string, unknown>).samplesMs = [19];
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.delta as Record<string, unknown>).brotliBytes = 9_999;
      },
    ];
    for (const mutate of mutations) {
      const evidence = structuredClone(firstPaintEvidence());
      mutate(evidence);
      expect(() => validateFirstPaintEvidence(evidence)).toThrow();
    }
  });

  it("fails closed on either insufficient reduction or slower first paint", () => {
    const evidence = firstPaintEvidence();
    const vite = (evidence.fixtures as Array<Record<string, unknown>>)[1]!;
    const baseline = vite.baseline as Record<string, unknown>;
    const candidate = vite.candidate as Record<string, unknown>;
    candidate.initialJavaScript = {
      rawBytes: 210_000,
      gzipBytes: 75_000,
      brotliBytes: 62_000,
    };
    vite.delta = {
      rawBytes: -10_000,
      gzipBytes: -5_000,
      brotliBytes: -2_000,
      brotliPercent: (-2_000 / 60_000) * 100,
    };
    candidate.timing = {
      samplesMs: new Array(10).fill(21),
      medianMs: 21,
      p95Ms: 21,
    };
    baseline.timing = {
      samplesMs: new Array(10).fill(20),
      medianMs: 20,
      p95Ms: 20,
    };
    const decision = firstPaintGate(evidence);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain("vite Brotli reduction is below 7680 bytes");
    expect(decision.reasons).toContain("vite Brotli reduction is below 10%");
    expect(decision.reasons).toContain("vite candidate median first paint is slower");
    expect(decision.reasons).toContain("vite candidate p95 first paint is slower");
  });
});
