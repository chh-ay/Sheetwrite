import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertUniqueOrderedNodes,
  PACKAGE_BUILD_NODES,
  PACKAGE_TYPECHECK_NODES,
  PUBLISHABLE_PACKAGE_ORDER,
  TYPECHECK_NODES,
  VERIFY_CI_NODES,
  validateWorkspaceGraph,
} from "./workspace-tooling.js";

const fixtureRoots: string[] = [];

async function graphFixture(extraPackage?: { readonly name: string; readonly build?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-workspace-graph-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "packages"), { recursive: true });
  await mkdir(join(root, "bench"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  const dependencies: Readonly<Record<string, readonly string[]>> = {
    "@sheetwrite/wasm": [],
    "@sheetwrite/core": ["@sheetwrite/wasm"],
    "@sheetwrite/xlsx": ["@sheetwrite/core"],
    "@sheetwrite/react": ["@sheetwrite/core"],
    "@sheetwrite/vue": ["@sheetwrite/core"],
    "@sheetwrite/svelte": ["@sheetwrite/core"],
  };
  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const directory = name.slice("@sheetwrite/".length);
    await mkdir(join(root, "packages", directory), { recursive: true });
    await writeFile(
      join(root, "packages", directory, "package.json"),
      `${JSON.stringify({
        name,
        publishConfig: { access: "public" },
        scripts: { build: "build", typecheck: "typecheck" },
        dependencies: Object.fromEntries(
          (dependencies[name] ?? []).map((item) => [item, "workspace:*"]),
        ),
      })}\n`,
    );
  }
  if (extraPackage) {
    const directory = extraPackage.name.slice("@sheetwrite/".length);
    await mkdir(join(root, "packages", directory), { recursive: true });
    await writeFile(
      join(root, "packages", directory, "package.json"),
      `${JSON.stringify({
        name: extraPackage.name,
        publishConfig: { access: "public" },
        scripts: {
          ...(extraPackage.build === false ? {} : { build: "build" }),
          typecheck: "typecheck",
        },
      })}\n`,
    );
  }
  await writeFile(
    join(root, "bench/package.json"),
    `${JSON.stringify({ name: "@sheetwrite/bench", scripts: { typecheck: "typecheck" } })}\n`,
  );
  await writeFile(
    join(root, "docs/package.json"),
    `${JSON.stringify({ name: "@sheetwrite/docs-site", scripts: { typecheck: "typecheck" } })}\n`,
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("canonical workspace graph", () => {
  it("covers the real publishable workspace", () => {
    expect(() => validateWorkspaceGraph(resolve(import.meta.dir, ".."))).not.toThrow();
  });

  it("rejects an unlisted publishable workspace package", async () => {
    const root = await graphFixture({ name: "@sheetwrite/new-package" });
    expect(() => validateWorkspaceGraph(root)).toThrow("missing: @sheetwrite/new-package");
  });

  it("rejects a dependency order inversion", async () => {
    const root = await graphFixture();
    const reversed = [...PUBLISHABLE_PACKAGE_ORDER].reverse();
    expect(() => validateWorkspaceGraph(root, reversed)).toThrow("must run after its dependency");
  });

  it("builds every publishable package exactly once in canonical order", () => {
    expect(PACKAGE_BUILD_NODES.map((node) => node.id)).toEqual(
      PUBLISHABLE_PACKAGE_ORDER.map((name) => `build:${name}`),
    );
    expect(() => assertUniqueOrderedNodes(VERIFY_CI_NODES)).not.toThrow();
    for (const buildNode of PACKAGE_BUILD_NODES) {
      expect(VERIFY_CI_NODES.filter((node) => node.id === buildNode.id)).toHaveLength(1);
    }
  });

  it("checks delivery size after reusable package and bundler evidence", () => {
    const benchmark = VERIFY_CI_NODES.findIndex((node) => node.id === "verify:benchmarks");
    const size = VERIFY_CI_NODES.findIndex((node) => node.id === "verify:delivery-size");
    expect(size).toBe(benchmark + 1);
    expect(VERIFY_CI_NODES[size]?.command).toEqual([
      "bun",
      "scripts/size-report.ts",
      "check",
      "--reuse-bundlers",
    ]);
    expect(VERIFY_CI_NODES.slice(size).some((node) => node.id.startsWith("build:"))).toBe(false);
  });

  it("rejects duplicate command starts", () => {
    expect(() =>
      assertUniqueOrderedNodes([...PACKAGE_BUILD_NODES, PACKAGE_BUILD_NODES[0]!]),
    ).toThrow("duplicate node");
  });

  it("typechecks packages, benchmark, examples, and verification consumers", () => {
    expect(PACKAGE_TYPECHECK_NODES.map((node) => node.id)).toEqual(
      PUBLISHABLE_PACKAGE_ORDER.map((name) => `typecheck:${name}`),
    );
    expect(TYPECHECK_NODES.map((node) => node.id)).toEqual([
      ...PUBLISHABLE_PACKAGE_ORDER.map((name) => `typecheck:${name}`),
      "typecheck:@sheetwrite/bench",
      "typecheck:@sheetwrite/docs-site",
      "typecheck:verification",
      "typecheck:consumer-nodenext",
    ]);
  });
});

describe("changeset workspace contract", () => {
  it("resolves every configured ignore to an existing workspace", async () => {
    const root = resolve(import.meta.dir, "..");
    const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      readonly workspaces: readonly string[];
    };
    const changesetConfig = JSON.parse(
      await readFile(join(root, ".changeset/config.json"), "utf8"),
    ) as {
      readonly ignore: readonly string[];
    };
    const workspaceNames = new Set<string>();
    for (const workspace of rootManifest.workspaces) {
      const glob = new Bun.Glob(`${workspace}/package.json`);
      for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
        const manifest = JSON.parse(await readFile(join(root, path), "utf8")) as {
          readonly name?: string;
        };
        if (manifest.name) workspaceNames.add(manifest.name);
      }
    }

    for (const ignore of changesetConfig.ignore) {
      const escaped = ignore.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
      expect([...workspaceNames].some((name) => pattern.test(name))).toBeTrue();
    }
  });

  it("runs the canonical Changesets status command", () => {
    const root = resolve(import.meta.dir, "..");
    const result = Bun.spawnSync(
      ["bun", "run", "changeset:status", "--", "--since=origin/develop"],
      {
        cwd: root,
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });
});
