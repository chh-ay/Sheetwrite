import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReleasePackageArtifact } from "./release-artifacts.js";
import { releaseVersionFromTag, successfulCiRunId } from "./release-preflight.js";
import {
  assertCanonicalReleaseIdentity,
  assertRegistryPackage,
  publishArtifactsIdempotently,
  publishedPackageFrom,
  verifyPublishedArtifacts,
} from "./release-publish.js";
import { parseWorkflowContract } from "./workflow-contract.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/release.yml");

async function workflow() {
  const source = await readFile(workflowPath, "utf8");
  return { parsed: parseWorkflowContract(source, "release workflow"), source };
}

function artifact(name: string): ReleasePackageArtifact {
  return {
    name,
    version: "0.2.0",
    path: `${name.slice("@sheetwrite/".length)}.tgz`,
    bytes: 1,
    unpackedBytes: 1,
    fileCount: 1,
    files: ["package.json"],
    shasum: "0".repeat(40),
    integrity: `sha512-${name}`,
    sha512: "0".repeat(128),
    internalDependencies: {},
  };
}

describe("tag-triggered release workflow", () => {
  it("accepts only stable semantic-version tags and serializes release runs", async () => {
    const { parsed } = await workflow();
    const trigger = parsed.on as { push?: { tags?: string[] }; workflow_dispatch?: unknown };
    expect(trigger.push?.tags).toEqual(["v*"]);
    expect(trigger.workflow_dispatch).toBeUndefined();
    expect(parsed.concurrency).toEqual({ group: "npm-release", "cancel-in-progress": false });
    expect(
      existsSync(resolve(repositoryRoot, ".github/workflows/bootstrap-release.yml")),
    ).toBeFalse();
    expect(releaseVersionFromTag("v0.2.0")).toBe("0.2.0");
    expect(releaseVersionFromTag("v12.34.56")).toBe("12.34.56");
    expect(() => releaseVersionFromTag("0.2.0")).toThrow("exact stable semantic version");
    expect(() => releaseVersionFromTag("v0.2.0-beta.1")).toThrow("exact stable semantic version");
  });

  it("accepts only a successful completed push CI run for the exact commit", () => {
    const sha = "a".repeat(40);
    expect(
      successfulCiRunId(
        {
          workflow_runs: [
            {
              id: 42,
              head_sha: sha,
              event: "push",
              status: "completed",
              conclusion: "success",
            },
          ],
        },
        sha,
      ),
    ).toBe(42);
    for (const override of [
      { head_sha: "b".repeat(40) },
      { event: "pull_request" },
      { status: "in_progress" },
      { conclusion: "failure" },
    ]) {
      expect(() =>
        successfulCiRunId(
          {
            workflow_runs: [
              {
                id: 42,
                head_sha: sha,
                event: "push",
                status: "completed",
                conclusion: "success",
                ...override,
              },
            ],
          },
          sha,
        ),
      ).toThrow("no successful completed push CI run");
    }
  });

  it("binds canonical artifact bytes to the tagged version and commit", () => {
    const sha = "a".repeat(40);
    const artifacts = PUBLISHABLE_PACKAGE_ORDER.map(artifact);
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: sha, packages: artifacts }, "0.2.0", sha),
    ).not.toThrow();
    expect(() =>
      assertCanonicalReleaseIdentity(
        { sourceCommit: "b".repeat(40), packages: artifacts },
        "0.2.0",
        sha,
      ),
    ).toThrow("Canonical artifacts came from");
    expect(() =>
      assertCanonicalReleaseIdentity(
        { sourceCommit: sha, packages: [{ ...artifacts[0]!, version: "0.1.0" }] },
        "0.2.0",
        sha,
      ),
    ).toThrow("expected 0.2.0");
  });

  it("derives one immutable tag identity and reuses its successful CI artifacts", async () => {
    const { parsed, source } = await workflow();
    expect(Object.keys(parsed.jobs ?? {})).toEqual(["identity", "publish"]);
    expect(source).toMatch(/git rev-parse "\$\{RELEASE_TAG\}\^\{commit\}"/);
    expect(source).toMatch(/version=\$\{RELEASE_TAG#v\}/);
    expect(source).not.toContain("workflow_dispatch");
    expect(JSON.stringify(parsed.jobs?.publish)).toContain("needs.identity.outputs.commit");
    expect(JSON.stringify(parsed.jobs?.publish)).toContain("needs.identity.outputs.ci_run_id");
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
    expect(commands).toContain("gh release create");
    expect(commands).toContain("--generate-notes");
    expect(commands).not.toMatch(
      /verify:ci|verify:release-quality|test:coverage|test:browser|release:prepare|release-verify\.ts|install-wasm-pack|browser:install/,
    );
    expect(source).not.toMatch(
      /secrets\.(?:NODE_AUTH_TOKEN|NPM_TOKEN)|changeset publish|release-stage/,
    );
  });

  it("publishes canonical packages sequentially", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const artifacts = PUBLISHABLE_PACKAGE_ORDER.map(artifact);
    const entries = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async () => undefined,
      async (_root, item) => {
        started.push(item.name);
        expect(completed).toHaveLength(started.length - 1);
        await Promise.resolve();
        completed.push(item.name);
        return { name: item.name, version: item.version, integrity: item.integrity };
      },
    );
    expect(started).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(completed).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(entries.map((entry) => entry.name)).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
  });

  it("resumes a partially published release only from matching registry bytes", async () => {
    const artifacts = PUBLISHABLE_PACKAGE_ORDER.map(artifact);
    const published: string[] = [];
    const entries = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) =>
        item === artifacts[0]
          ? { name: item.name, version: item.version, dist: { integrity: item.integrity } }
          : undefined,
      async (_root, item) => {
        published.push(item.name);
        return { name: item.name, version: item.version, integrity: item.integrity };
      },
    );
    expect(published).toEqual(PUBLISHABLE_PACKAGE_ORDER.slice(1));
    expect(entries.map((entry) => entry.name)).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);

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
    expect(() => publishedPackageFrom({ id: "@sheetwrite/core@0.2.0" })).toThrow(
      "explicit package name and version",
    );
  });

  it("verifies registry identity, integrity, latest tags, and propagation retries", async () => {
    const artifacts = PUBLISHABLE_PACKAGE_ORDER.map(artifact);
    let queries = 0;
    let pauses = 0;
    await verifyPublishedArtifacts(
      artifacts,
      async (item) => {
        queries += 1;
        if (queries === 1) throw new Error("registry has not propagated");
        return { name: item.name, version: item.version, dist: { integrity: item.integrity } };
      },
      async () => "0.2.0",
      2,
      async () => {
        pauses += 1;
      },
    );
    expect(pauses).toBe(1);
    expect(queries).toBe(artifacts.length + 1);

    const core = artifact("@sheetwrite/core");
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
        "0.1.0",
      ),
    ).toThrow("latest is 0.1.0");
  });
});
