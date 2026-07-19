import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import playwrightConfig from "../test/browser/playwright.config.js";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertReviewedActionPins,
  parseWorkflowContract,
  REVIEWED_ACTION_PINS,
  type WorkflowContract,
  type WorkflowJob,
} from "./workflow-contract.js";
import {
  BUN_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const workflowSources = {
  ci: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
  release: readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"),
} as const;
const WORKFLOW_BUN_VERSION = "$" + "{{ env.BUN_VERSION }}";
const WORKFLOW_NODE_VERSION = "$" + "{{ env.NODE_VERSION }}";
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

function workflows(): Readonly<Record<keyof typeof workflowSources, WorkflowContract>> {
  return {
    ci: parseWorkflowContract(workflowSources.ci, "CI workflow"),
    release: parseWorkflowContract(workflowSources.release, "release workflow"),
  };
}

function setupStep(job: WorkflowJob, action: string) {
  return job.steps?.find((step) => step.uses?.startsWith(`${action}@`));
}

function commands(job: WorkflowJob): string {
  return (job.steps ?? []).flatMap((step) => (step.run ? [step.run] : [])).join("\n");
}

describe("CI and release workflow contracts", () => {
  it("parses jobs and steps through one fail-closed workflow seam", () => {
    const parsed = workflows();
    expect(Object.keys(parsed.ci.jobs).length).toBeGreaterThan(1);
    expect(Object.keys(parsed.release.jobs)).toEqual(["identity", "publish"]);

    expect(() => parseWorkflowContract("jobs: []", "fixture")).toThrow(
      "fixture.jobs must be a non-empty object",
    );
    expect(() =>
      parseWorkflowContract("jobs:\n  check:\n    steps:\n      - name: incomplete", "fixture"),
    ).toThrow("must define run or uses");
    expect(() =>
      parseWorkflowContract(
        "jobs:\n  check:\n    steps:\n      - run: echo ok\n        uses: owner/action@0123456789012345678901234567890123456789",
        "fixture",
      ),
    ).toThrow("cannot define both run and uses");
  });

  it("requires every third-party action in both workflows to use its reviewed commit SHA", () => {
    const parsed = workflows();
    expect(() =>
      assertReviewedActionPins([
        { name: "CI", workflow: parsed.ci },
        { name: "release", workflow: parsed.release },
      ]),
    ).not.toThrow();

    const branchReference = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: actions/checkout@main",
      "branch fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "branch fixture", workflow: branchReference }], {
        "actions/checkout": REVIEWED_ACTION_PINS["actions/checkout"]!,
      }),
    ).toThrow("must use a 40-character SHA");

    const unknownAction = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: unreviewed/action@0123456789012345678901234567890123456789",
      "unknown fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "unknown fixture", workflow: unknownAction }], {}),
    ).toThrow("action is not reviewed");
  });

  it("keeps each workflow's required toolchain versions in parity", () => {
    const parsed = workflows();
    for (const [name, workflow] of Object.entries(parsed)) {
      const expectedEnv = { BUN_VERSION, NODE_VERSION, NPM_VERSION } as const;
      for (const [key, value] of Object.entries(expectedEnv)) {
        expect(workflow.env?.[key], `${name} ${key}`).toBe(value);
      }
      const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
      const nodeSetups = steps.filter((step) => step.uses?.startsWith("actions/setup-node@"));
      const bunSetups = steps.filter((step) => step.uses?.startsWith("oven-sh/setup-bun@"));
      expect(nodeSetups.length, `${name} Node setup`).toBeGreaterThan(0);
      expect(bunSetups.length, `${name} Bun setup`).toBeGreaterThan(0);
      expect(
        nodeSetups.every((step) => step.with?.["node-version"] === WORKFLOW_NODE_VERSION),
      ).toBeTrue();
      expect(
        bunSetups.every((step) => step.with?.["bun-version"] === WORKFLOW_BUN_VERSION),
      ).toBeTrue();
      expect(
        steps
          .flatMap((step) => (step.run ? [step.run] : []))
          .filter((command) => command.includes("npm install --global"))
          .every((command) => command.includes('npm install --global "npm@$NPM_VERSION"')),
      ).toBeTrue();
    }

    for (const [key, value] of Object.entries({
      RUST_VERSION,
      WASM_TARGET,
      WASM_PACK_VERSION,
    })) {
      expect(parsed.ci.env?.[key], `CI ${key}`).toBe(value);
      expect(parsed.release.env?.[key], `release ${key}`).toBeUndefined();
    }
    expect(commands(parsed.release.jobs.identity!)).not.toContain("install-wasm-pack");
    expect(commands(parsed.release.jobs.publish!)).not.toContain("install-wasm-pack");
  });

  it("installs and runs all browser projects on supported Ubuntu while limiting portable engines", () => {
    const browserJob = workflows().ci.jobs["browser-smoke"]!;
    expect(browserJob["runs-on"]).toBe("ubuntu-latest");
    expect(commands(browserJob)).toContain("bun run browser:install");
    expect(commands(browserJob)).toContain("bun run test:browser");
    expect(packageManifest.scripts?.["browser:install"]).toBe(
      "playwright install --with-deps chromium firefox webkit",
    );
    expect(packageManifest.scripts?.["test:browser:portability"]).toContain("--grep @portability");

    const projectByName = Object.fromEntries(
      (playwrightConfig.projects ?? []).map((project) => [project.name, project]),
    );
    expect(Object.keys(projectByName)).toEqual(["chromium", "firefox", "webkit"]);
    expect(projectByName.chromium?.grep).toBeUndefined();
    expect(String(projectByName.firefox?.grep)).toBe("/@portability/");
    expect(String(projectByName.webkit?.grep)).toBe("/@portability/");
  });

  it("applies the canonical JavaScript toolchain to the trusted publishing job", () => {
    const publish = workflows().release.jobs.publish!;
    expect(publish.environment).toBe("npm-release");
    expect(publish.permissions).toEqual({
      actions: "read",
      contents: "write",
      "id-token": "write",
    });
    expect(setupStep(publish, "actions/setup-node")?.with?.["node-version"]).toBe(
      WORKFLOW_NODE_VERSION,
    );
    expect(setupStep(publish, "actions/setup-node")?.with?.["registry-url"]).toBeUndefined();
    expect(setupStep(publish, "oven-sh/setup-bun")?.with?.["bun-version"]).toBe(
      WORKFLOW_BUN_VERSION,
    );
    expect(commands(publish)).toContain('npm install --global "npm@$NPM_VERSION"');
    expect(commands(publish)).toContain("release-publish.ts");
    expect(commands(publish)).toContain("gh release create");
  });
});
