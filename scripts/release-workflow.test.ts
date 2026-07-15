import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReleasePackageArtifact } from "./release-artifacts.js";
import { type StageSummaryEntry, stageArtifactsInOrder, stageIdFrom } from "./release-stage.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/release.yml");

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown> };
type Job = {
  needs?: string | string[];
  environment?: string;
  permissions?: Record<string, string>;
  steps?: Step[];
};
type Workflow = {
  on?: { workflow_dispatch?: { inputs?: Record<string, { required?: boolean }> } };
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
};

async function workflow(): Promise<{ parsed: Workflow; source: string }> {
  const source = await readFile(workflowPath, "utf8");
  return { parsed: Bun.YAML.parse(source) as Workflow, source };
}

function artifact(name: string): ReleasePackageArtifact {
  return {
    name,
    version: "0.1.0",
    path: `${name.slice("@sheetwrite/".length)}.tgz`,
    bytes: 1,
    unpackedBytes: 1,
    fileCount: 1,
    files: ["package.json"],
    shasum: "0".repeat(40),
    integrity: `sha512-${name}`,
  };
}

describe("stage-only release workflow", () => {
  it("requires an exact commit and version and serializes release runs", async () => {
    const { parsed } = await workflow();
    const inputs = parsed.on?.workflow_dispatch?.inputs;
    expect(Object.keys(inputs ?? {}).sort()).toEqual(["expected_sha", "version"]);
    expect(inputs?.expected_sha?.required).toBe(true);
    expect(inputs?.version?.required).toBe(true);
    expect(parsed.concurrency).toEqual({ group: "npm-release", "cancel-in-progress": false });
  });

  it("isolates OIDC and maintainer approval to the protected staging job", async () => {
    const { parsed } = await workflow();
    expect(parsed.permissions).toEqual({ contents: "read" });
    const jobs = parsed.jobs ?? {};
    expect(Object.keys(jobs)).toEqual(["preflight", "prepare", "package-gates", "stage"]);
    expect(jobs.stage?.needs).toEqual(["prepare", "package-gates"]);
    expect(jobs.stage?.environment).toBe("npm-release");
    expect(jobs.stage?.permissions).toEqual({ contents: "read", "id-token": "write" });
    for (const [name, job] of Object.entries(jobs)) {
      if (name !== "stage") expect(job.permissions?.["id-token"]).toBeUndefined();
    }
  });

  it("rehashes downloaded artifacts and exposes no direct or token publication path", async () => {
    const { parsed, source } = await workflow();
    const jobs = parsed.jobs ?? {};
    for (const name of ["package-gates", "stage"]) {
      const steps = jobs[name]?.steps ?? [];
      expect(steps.some((step) => step.uses?.startsWith("actions/download-artifact@"))).toBe(true);
      expect(steps.some((step) => step.run?.includes("release:verify-artifacts"))).toBe(true);
    }
    expect(jobs.prepare?.steps?.some((step) => step.with?.["if-no-files-found"] === "error")).toBe(
      true,
    );
    expect(source).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|\.npmrc|changeset publish|npm publish/);
    expect(source.match(/scripts\/release-stage\.ts/g)).toHaveLength(1);
  });

  it("stages canonical package order one at a time and records review commands", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const artifacts = PUBLISHABLE_PACKAGE_ORDER.map(artifact);
    const entries = await stageArtifactsInOrder("/artifacts", artifacts, async (_root, item) => {
      started.push(item.name);
      expect(completed).toHaveLength(started.length - 1);
      await Promise.resolve();
      completed.push(item.name);
      const stageId = `stage-${completed.length}`;
      return {
        package: item.name,
        version: item.version,
        tarballSha512: item.integrity,
        stageId,
        reviewCommands: [
          `npm stage view ${stageId}`,
          `npm stage download ${stageId}`,
          `npm stage approve ${stageId}`,
        ],
      } satisfies StageSummaryEntry;
    });
    expect(started).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(completed).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(entries.map((entry) => entry.package)).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(entries[0]?.reviewCommands).toEqual([
      "npm stage view stage-1",
      "npm stage download stage-1",
      "npm stage approve stage-1",
    ]);
  });

  it("extracts only an explicit stage identifier from npm JSON", () => {
    expect(stageIdFrom({ name: "@sheetwrite/wasm", stageId: "abc12345" })).toBe("abc12345");
    expect(stageIdFrom({ package: { name: "@sheetwrite/wasm" } })).toBeUndefined();
  });
});
