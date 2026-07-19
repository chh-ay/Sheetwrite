import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReleasePackageArtifact } from "./release-artifacts.js";
import { parseCiRunId } from "./release-preflight.js";
import {
  assertCanonicalReleaseIdentity,
  assertRegistryPackage,
  type PackageIdentity,
  publishArtifactsIdempotently,
  publishedPackageFrom,
  verifyPublishedArtifacts,
} from "./release-publish.js";
import { parseWorkflowContract } from "./workflow-contract.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/release.yml");

async function workflow() {
  const source = await readFile(workflowPath, "utf8");
  return { parsed: parseWorkflowContract(source, "release workflow"), source };
}

function artifact(name: string, version = "0.2.0"): ReleasePackageArtifact {
  return {
    name,
    version,
    path: `${name.slice("@sheetwrite/".length)}-${version}.tgz`,
    bytes: 1,
    unpackedBytes: 1,
    fileCount: 1,
    files: ["package.json"],
    shasum: "0".repeat(40),
    integrity: `sha512-${name}-${version}`,
    sha512: "0".repeat(128),
    internalDependencies: {},
  };
}

describe("CI-completion package release workflow", () => {
  it("runs only after completed develop CI and serializes publication", async () => {
    const { parsed, source } = await workflow();
    const trigger = parsed.on as {
      workflow_run?: {
        workflows?: string[];
        types?: string[];
        branches?: string[];
      };
    };
    expect(trigger.workflow_run).toEqual({
      workflows: ["CI"],
      types: ["completed"],
      branches: ["develop"],
    });
    expect(parsed.concurrency).toEqual({ group: "npm-release", "cancel-in-progress": false });
    const identity = parsed.jobs.identity!;
    expect(identity.if).toContain("workflow_run.conclusion == 'success'");
    expect(identity.if).toContain("workflow_run.event == 'push'");
    expect(identity.if).toContain("workflow_run.head_branch == 'develop'");
    expect(identity.if).toContain("workflow_run.head_repository.full_name == github.repository");
    expect(source).not.toMatch(/push:\s*\n\s*tags:|RELEASE_TAG|RELEASE_VERSION/);
    expect(parseCiRunId("42")).toBe(42);
    expect(() => parseCiRunId("0")).toThrow("positive integer");
    expect(() => parseCiRunId("1.5")).toThrow("positive integer");
    expect(() => parseCiRunId(String(Number.MAX_SAFE_INTEGER + 1))).toThrow("safe integer");
  });

  it("binds canonical artifact bytes only to the exact source commit", () => {
    const sha = "a".repeat(40);
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.3.1"),
      artifact("@sheetwrite/core", "1.2.0"),
    ];
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: sha, packages: artifacts }, sha),
    ).not.toThrow();
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: "b".repeat(40), packages: artifacts }, sha),
    ).toThrow("Canonical artifacts came from");
  });

  it("binds publication to the successful CI commit and artifact run", async () => {
    const { parsed, source } = await workflow();
    expect(Object.keys(parsed.jobs ?? {})).toEqual(["identity", "publish"]);
    expect(source).toContain("github.event.workflow_run.head_sha");
    expect(source).toContain("github.event.workflow_run.id");
    expect(source).not.toContain("workflow_dispatch");
    expect(JSON.stringify(parsed.jobs?.publish)).toContain("needs.identity.outputs.commit");
    expect(JSON.stringify(parsed.jobs?.publish)).toContain("needs.identity.outputs.ci_run_id");
    expect(source).toContain("steps.publish.outputs.verified");
    expect(source).toContain("steps.publish.outputs.published");
  });

  it("isolates OIDC and repository write access to the publishing job", async () => {
    const { parsed } = await workflow();
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    const jobs = parsed.jobs ?? {};
    const privileged = Object.entries(jobs).filter(
      ([, job]) => job.permissions?.["id-token"] === "write",
    );
    expect(privileged).toHaveLength(1);
    const [publishName, publishJob] = privileged[0]!;
    expect(publishName).toBe("publish");
    expect(publishJob.environment).toBe("npm-release");
    expect(publishJob.permissions).toEqual({
      actions: "read",
      contents: "write",
      "id-token": "write",
    });

    const pending = [
      ...(Array.isArray(publishJob.needs)
        ? publishJob.needs
        : publishJob.needs
          ? [publishJob.needs]
          : []),
    ];
    const prerequisites = new Set<string>();
    while (pending.length > 0) {
      const name = pending.pop()!;
      if (prerequisites.has(name)) continue;
      prerequisites.add(name);
      const needs = jobs[name]?.needs;
      pending.push(...(Array.isArray(needs) ? needs : needs ? [needs] : []));
    }
    for (const name of prerequisites) {
      expect(jobs[name]?.permissions?.["id-token"]).toBeUndefined();
      expect(jobs[name]?.permissions?.contents).not.toBe("write");
    }
  });

  it("publishes only artifacts from successful CI without repeating its gates", async () => {
    const { parsed, source } = await workflow();
    const commands = Object.values(parsed.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .flatMap((step) => (step.run ? [step.run] : []))
      .join("\n");
    expect(source).toContain("scripts/release-preflight.ts");
    expect(commands).toContain("gh run download");
    expect(commands).toContain("canonical-release-artifacts");
    expect(commands).toContain("scripts/release-publish.ts");
    expect(commands).toContain("scripts/release-github.ts");
    expect(commands).not.toMatch(
      /verify:ci|verify:release-quality|test:coverage|test:browser|release:prepare|release-verify\.ts|install-wasm-pack|browser:install/,
    );
    expect(source).not.toMatch(
      /secrets\.(?:NODE_AUTH_TOKEN|NPM_TOKEN)|changeset publish|release-stage/,
    );
  });

  it("publishes and verifies a one-package release", async () => {
    const core = artifact("@sheetwrite/core", "1.4.0");
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      [core],
      async () => undefined,
      async (_root, item) => ({
        name: item.name,
        version: item.version,
        integrity: item.integrity,
      }),
    );
    expect(result).toEqual({
      verifiedPackages: [{ name: core.name, version: core.version, integrity: core.integrity }],
      newlyPublishedPackages: [
        { name: core.name, version: core.version, integrity: core.integrity },
      ],
    });
  });

  it("publishes core-only when its exact omitted wasm dependency is available", async () => {
    const core = {
      ...artifact("@sheetwrite/core", "1.4.0"),
      internalDependencies: { "@sheetwrite/wasm": "0.7.0" },
    };
    const queried: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      [core],
      async (identity) => {
        queried.push(`${identity.name}@${identity.version}`);
        return identity.name === "@sheetwrite/wasm"
          ? { name: identity.name, version: identity.version }
          : undefined;
      },
      async (_root, item) => ({
        name: item.name,
        version: item.version,
        integrity: item.integrity,
      }),
    );
    expect(queried).toEqual(["@sheetwrite/wasm@0.7.0", "@sheetwrite/core@1.4.0"]);
    expect(result.newlyPublishedPackages).toEqual([
      { name: core.name, version: core.version, integrity: core.integrity },
    ]);
  });

  it("rejects core-only before publishing when its omitted wasm version is unavailable", async () => {
    const core = {
      ...artifact("@sheetwrite/core", "1.4.0"),
      internalDependencies: { "@sheetwrite/wasm": "0.7.0" },
    };
    const queried: string[] = [];
    let publishCalls = 0;
    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [core],
        async (identity) => {
          queried.push(`${identity.name}@${identity.version}`);
          return undefined;
        },
        async (_root, item) => {
          publishCalls += 1;
          return { name: item.name, version: item.version, integrity: item.integrity };
        },
      ),
    ).rejects.toThrow(
      "@sheetwrite/core@1.4.0 requires unpublished internal dependency @sheetwrite/wasm@0.7.0",
    );
    expect(queried).toEqual(["@sheetwrite/wasm@0.7.0"]);
    expect(publishCalls).toBe(0);
  });

  it("publishes a mixed-version dependency-ordered subset sequentially", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
      artifact("@sheetwrite/react", "2.1.3"),
    ];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => {
        started.push(`query:${item.name}@${item.version}`);
        return undefined;
      },
      async (_root, item) => {
        started.push(`publish:${item.name}@${item.version}`);
        expect(completed).toHaveLength(started.length / 2 - 1);
        await Promise.resolve();
        completed.push(`${item.name}@${item.version}`);
        return { name: item.name, version: item.version, integrity: item.integrity };
      },
    );
    expect(started).toEqual(
      artifacts.flatMap((item) => [
        `query:${item.name}@${item.version}`,
        `publish:${item.name}@${item.version}`,
      ]),
    );
    expect(completed).toEqual(artifacts.map((item) => `${item.name}@${item.version}`));
    expect(result.verifiedPackages.map((entry) => entry.version)).toEqual([
      "0.7.0",
      "1.4.0",
      "2.1.3",
    ]);
    expect(result.newlyPublishedPackages).toEqual(result.verifiedPackages);
  });

  it("is idempotent on an exact package-version rerun", async () => {
    const artifacts = [
      artifact("@sheetwrite/core", "1.4.0"),
      artifact("@sheetwrite/react", "2.1.3"),
    ];
    const registry = new Map<
      string,
      { name: string; version: string; dist: { integrity: string } }
    >();
    let publishCalls = 0;
    const existing = async (item: PackageIdentity) => registry.get(`${item.name}@${item.version}`);
    const publish = async (_root: string, item: ReleasePackageArtifact) => {
      publishCalls += 1;
      registry.set(`${item.name}@${item.version}`, {
        name: item.name,
        version: item.version,
        dist: { integrity: item.integrity },
      });
      return { name: item.name, version: item.version, integrity: item.integrity };
    };

    const first = await publishArtifactsIdempotently("/artifacts", artifacts, existing, publish);
    const rerun = await publishArtifactsIdempotently("/artifacts", artifacts, existing, publish);
    expect(publishCalls).toBe(artifacts.length);
    expect(first.newlyPublishedPackages).toEqual(first.verifiedPackages);
    expect(rerun.verifiedPackages.map(({ name, version }) => ({ name, version }))).toEqual(
      artifacts.map(({ name, version }) => ({ name, version })),
    );
    expect(rerun.newlyPublishedPackages).toEqual([]);
  });

  it("resumes a partial prior publication and rejects mismatched registry bytes", async () => {
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
      artifact("@sheetwrite/react", "2.1.3"),
    ];
    const queried: string[] = [];
    const published: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => {
        queried.push(`${item.name}@${item.version}`);
        const canonical = artifacts.find(
          (artifact) => artifact.name === item.name && artifact.version === item.version,
        );
        if (canonical === undefined) throw new Error("Unexpected package query");
        return canonical === artifacts[0]
          ? {
              name: item.name,
              version: item.version,
              dist: { integrity: canonical.integrity },
            }
          : undefined;
      },
      async (_root, item) => {
        published.push(`${item.name}@${item.version}`);
        return { name: item.name, version: item.version, integrity: item.integrity };
      },
    );
    expect(queried).toEqual(artifacts.map((item) => `${item.name}@${item.version}`));
    expect(published).toEqual(artifacts.slice(1).map((item) => `${item.name}@${item.version}`));
    expect(result.verifiedPackages.map((entry) => entry.name)).toEqual(
      artifacts.map((item) => item.name),
    );
    expect(result.newlyPublishedPackages.map((entry) => entry.name)).toEqual(
      artifacts.slice(1).map((item) => item.name),
    );

    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [artifacts[0]!],
        async (item) => ({
          name: item.name,
          version: item.version,
          dist: { integrity: "sha512-different" },
        }),
        async () => {
          throw new Error("must not republish mismatched bytes");
        },
      ),
    ).rejects.toThrow("integrity does not match");
  });

  it("requires explicit npm publication identity", () => {
    expect(publishedPackageFrom({ name: "@sheetwrite/core", version: "0.2.0" })).toEqual({
      name: "@sheetwrite/core",
      version: "0.2.0",
    });
    expect(
      publishedPackageFrom({
        "@sheetwrite/core": {
          id: "@sheetwrite/core@0.2.0",
          name: "@sheetwrite/core",
          version: "0.2.0",
          size: 381363,
          unpackedSize: 2005268,
          shasum: "557be78d365d7f77f48485907835685cb953d737",
          integrity:
            "sha512-QAJ3U891g0fM2LE7d+gxGJlUHaZwRhFqqHuOhPpXJUHzsnYP5JpSwXFUfxwrij5v2SCdcHeZwT06szZ13R0BNg==",
          filename: "sheetwrite-core-0.2.0.tgz",
          files: [{ path: "package.json", size: 1769, mode: 420 }],
          entryCount: 293,
          bundled: [],
        },
      }),
    ).toEqual({
      name: "@sheetwrite/core",
      version: "0.2.0",
    });
    expect(() => publishedPackageFrom({ id: "@sheetwrite/core@0.2.0" })).toThrow(
      "explicit package name and version",
    );
  });

  it("verifies mixed registry versions, integrity, latest tags, and propagation retries", async () => {
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
    ];
    const registryQueries: string[] = [];
    const latestQueries: string[] = [];
    let pauses = 0;
    await verifyPublishedArtifacts(
      artifacts,
      async (item) => {
        registryQueries.push(`${item.name}@${item.version}`);
        if (registryQueries.length === 1) throw new Error("registry has not propagated");
        return { name: item.name, version: item.version, dist: { integrity: item.integrity } };
      },
      async (name) => {
        latestQueries.push(name);
        return artifacts.find((item) => item.name === name)!.version;
      },
      2,
      async () => {
        pauses += 1;
      },
    );
    expect(pauses).toBe(1);
    expect(registryQueries).toEqual([
      "@sheetwrite/wasm@0.7.0",
      "@sheetwrite/wasm@0.7.0",
      "@sheetwrite/core@1.4.0",
    ]);
    expect(latestQueries).toEqual(["@sheetwrite/wasm", "@sheetwrite/core"]);

    const core = artifact("@sheetwrite/core", "1.4.0");
    expect(() =>
      assertRegistryPackage(
        core,
        { name: core.name, version: core.version, dist: { integrity: "sha512-wrong" } },
        core.version,
      ),
    ).toThrow("integrity does not match");
    expect(() =>
      assertRegistryPackage(
        core,
        { name: core.name, version: core.version, dist: { integrity: core.integrity } },
        "1.3.0",
      ),
    ).toThrow("latest is 1.3.0");
  });
});
