import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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
