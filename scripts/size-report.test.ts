import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BudgetManifest,
  candidateManifest,
  classifyPackedPath,
  compareBudgets,
  compressedSizes,
  type Metric,
  parsePackJson,
  SIZE_PROTOCOL_VERSION,
  SIZE_TOOL_NAME,
  SIZE_TOOL_VERSION,
  type SizeReport,
  summarizePack,
  validateBundlerEvidence,
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

function report(
  metrics: Record<string, Metric>,
): Pick<SizeReport, "protocolVersion" | "tool" | "toolchain" | "metrics"> {
  return {
    protocolVersion: SIZE_PROTOCOL_VERSION,
    tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
    toolchain: {},
    metrics,
  };
}

function manifest(budgets: BudgetManifest["budgets"]): BudgetManifest {
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    protocolVersion: SIZE_PROTOCOL_VERSION,
    tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
    toolchain: {},
    budgets,
  };
}

function budget(maximum: number, unit: "bytes" | "count" = "bytes") {
  return {
    unit,
    baseline: maximum,
    maximum,
    category: "test",
    owner: "test-owner",
    rationale: "Boundary fixture.",
  } as const;
}

function evidence(assets: unknown[]) {
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler: "webpack",
    version: "5.102.1",
    assets,
  };
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

  it("uses manifest roles rather than chunk names", () => {
    expect(validateBundlerEvidence(evidence(complete)).assets.map((asset) => asset.path)).toEqual(
      complete.map((asset) => asset.path),
    );
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
});

describe("absolute budget comparison", () => {
  const metric: Metric = { actual: 10, unit: "bytes", category: "test", owner: "owner" };

  it("passes an exact boundary and fails one byte over with diagnostics", () => {
    expect(compareBudgets(report({ size: metric }), manifest({ size: budget(10) }))).toEqual([]);
    expect(
      compareBudgets(report({ size: { ...metric, actual: 11 } }), manifest({ size: budget(10) })),
    ).toEqual([
      {
        key: "size",
        message: "absolute ceiling exceeded",
        actual: 11,
        limit: 10,
        delta: 1,
        owner: "test-owner",
      },
    ]);
  });

  it("fails every incomplete or malformed budget branch", () => {
    expect(compareBudgets(report({}), manifest({ size: budget(10) }))[0]?.message).toContain(
      "missing from the report",
    );
    expect(compareBudgets(report({ size: metric }), manifest({}))[0]?.message).toContain(
      "no reviewed",
    );
    expect(
      compareBudgets(
        report({ size: { ...metric, actual: Number.NaN } }),
        manifest({ size: budget(10) }),
      )[0]?.message,
    ).toContain("non-finite");
    expect(
      compareBudgets(
        report({ size: { ...metric, unit: "count" } }),
        manifest({ size: budget(10) }),
      )[0]?.message,
    ).toContain("unit mismatch");
    expect(
      compareBudgets(report({ size: metric }), {
        ...manifest({ size: budget(10) }),
        protocolVersion: 2,
      })[0]?.key,
    ).toBe("$protocolVersion");
    expect(
      compareBudgets(report({ size: metric }), {
        ...manifest({ size: budget(10) }),
        tool: { name: "other", version: "0" },
      })[0]?.key,
    ).toBe("$tool");
    expect(
      compareBudgets(
        { ...report({ size: metric }), toolchain: { bun: "different" } },
        manifest({ size: budget(10) }),
      )[0]?.key,
    ).toBe("$toolchain.bun");
  });

  it("creates absolute candidates without reducing zero-growth isolation", () => {
    const fullReport = {
      ...report({
        bytes: { ...metric, actual: 20_000 },
        files: { ...metric, actual: 10, unit: "count" as const },
        leakage: { ...metric, actual: 0, unit: "count" as const },
      }),
      schemaVersion: SIZE_PROTOCOL_VERSION,
      toolchain: {},
      packages: [],
      closures: [],
      bundlers: [],
      reproduction: "bun run size:check",
    };
    const candidate = candidateManifest(fullReport);
    expect(candidate.budgets.bytes?.maximum).toBe(21_024);
    expect(candidate.budgets.files?.maximum).toBe(12);
    expect(candidate.budgets.leakage?.maximum).toBe(0);
  });
});
