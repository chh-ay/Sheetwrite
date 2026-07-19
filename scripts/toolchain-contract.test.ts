import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import { assertReviewedActionPins, parseWorkflowContract } from "./workflow-contract.js";
import {
  BUN_VERSION,
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly packageManager?: string;
  readonly engines?: Readonly<Record<string, string>>;
};
const rustToolchain = readFileSync(resolve(root, "rust-toolchain.toml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const versionWorkflow = readFileSync(resolve(root, ".github/workflows/version.yml"), "utf8");
const parsedWorkflow = parseWorkflowContract(workflow, "CI workflow");
const parsedVersionWorkflow = parseWorkflowContract(versionWorkflow, "version workflow");
const nodeVersion = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const WORKFLOW_BUN_VERSION = "$" + "{{ env.BUN_VERSION }}";
const WORKFLOW_NODE_VERSION = "$" + "{{ env.NODE_VERSION }}";
const sizeBudget = JSON.parse(readFileSync(resolve(root, "scripts/size-budgets.json"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, string>>;
};

function commandOutput(command: readonly [string, ...string[]]): string {
  const result = Bun.spawnSync([...command], { cwd: root, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

describe("documentation hosting contract", () => {
  it("keeps deployment Vercel-only", () => {
    expect(existsSync(resolve(root, ".github/workflows/docs.yml"))).toBeFalse();
    expect(existsSync(resolve(root, "vercel.json"))).toBeTrue();
  });
});

describe("contributor and CI toolchain contract", () => {
  it("pins Bun while preserving the documented consumer engine range", () => {
    expect(packageManifest.packageManager).toBe(`bun@${BUN_VERSION}`);
    expect(packageManifest.engines?.bun).toBe(">=1.3.0");
    expect(workflow).toContain(`BUN_VERSION: "${BUN_VERSION}"`);
    expect(workflow).toContain(`bun-version: ${WORKFLOW_BUN_VERSION}`);
  });

  it("pins Node and npm as exact release inputs", () => {
    expect(nodeVersion).toBe(NODE_VERSION);
    expect(packageManifest.engines?.node).toBe(">=24.3.0 <25");
    expect(workflow).toContain(`NODE_VERSION: "${NODE_VERSION}"`);
    expect(workflow).toContain(`NPM_VERSION: "${NPM_VERSION}"`);
    expect(workflow).toContain(`node-version: ${WORKFLOW_NODE_VERSION}`);
    expect(workflow).toContain('npm install --global "npm@$NPM_VERSION"');
    expect(workflow).toContain('test "$(node --version)" = "v$NODE_VERSION"');
    expect(workflow).toContain('test "$(npm --version)" = "$NPM_VERSION"');
    expect(sizeBudget.toolchain?.node).toBe(NODE_VERSION);
    expect(sizeBudget.toolchain?.npm).toBe(NPM_VERSION);
  });

  it("pins Rust, its WASM target, wasm-pack, cargo-audit, and coverage tooling", () => {
    expect(rustToolchain).toContain(`channel = "${RUST_VERSION}"`);
    expect(rustToolchain).toContain('components = ["llvm-tools-preview"]');
    expect(rustToolchain).toContain(`targets = ["${WASM_TARGET}"]`);
    expect(workflow).toContain(`RUST_VERSION: "${RUST_VERSION}"`);
    expect(workflow).toContain(`WASM_TARGET: "${WASM_TARGET}"`);
    expect(workflow).toContain(`WASM_PACK_VERSION: "${WASM_PACK_VERSION}"`);
    expect(workflow).toContain(`CARGO_AUDIT_VERSION: "${CARGO_AUDIT_VERSION}"`);
    expect(workflow).toContain(`CARGO_LLVM_COV_VERSION: "${CARGO_LLVM_COV_VERSION}"`);
    expect(workflow).toContain(
      'cargo install cargo-llvm-cov --version "$CARGO_LLVM_COV_VERSION" --locked',
    );
    expect(workflow).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
  });

  it("pins every third-party action to its reviewed immutable commit", () => {
    expect(() =>
      assertReviewedActionPins([
        { name: "CI", workflow: parsedWorkflow },
        { name: "version", workflow: parsedVersionWorkflow },
      ]),
    ).not.toThrow();
    expect(workflow).not.toMatch(
      /(?:bun-version|NODE_VERSION|NPM_VERSION|RUST_VERSION|WASM_PACK_VERSION):\s*(?:latest|stable)\b/,
    );
  });

  it("connects every required gate to one reusable artifact build", () => {
    const jobs = parsedWorkflow.jobs ?? {};
    const needsOf = (name: string): readonly string[] => {
      const needs = jobs[name]?.needs;
      return typeof needs === "string" ? [needs] : (needs ?? []);
    };
    const dependsOn = (name: string, dependency: string, seen = new Set<string>()): boolean => {
      if (seen.has(name)) return false;
      seen.add(name);
      return needsOf(name).some((need) => need === dependency || dependsOn(need, dependency, seen));
    };
    const commandsFor = (name: string): string[] =>
      (jobs[name]?.steps ?? []).flatMap((step) => (step.run ? [step.run] : []));

    const artifactBuilders = Object.keys(jobs).filter((name) =>
      commandsFor(name).some((command) => command.includes("release:prepare")),
    );
    expect(artifactBuilders).toHaveLength(1);
    const artifactBuild = artifactBuilders[0]!;

    const requiredNeeds = needsOf("required");
    expect(new Set(requiredNeeds)).toEqual(
      new Set(Object.keys(jobs).filter((name) => name !== "required")),
    );
    expect(jobs.required?.name).toBe("Required CI");
    for (const gate of requiredNeeds) {
      if (gate === artifactBuild || dependsOn(artifactBuild, gate)) continue;
      expect(dependsOn(gate, artifactBuild)).toBeTrue();
    }

    const consumers = Object.keys(jobs).filter((name) => dependsOn(name, artifactBuild));
    for (const consumer of consumers) {
      expect(commandsFor(consumer).some((command) => command.includes("release:prepare"))).toBe(
        false,
      );
      expect(commandsFor(consumer).some((command) => command.includes("npm pack"))).toBe(false);
    }

    const npmInstalls = Object.keys(jobs)
      .flatMap(commandsFor)
      .filter((command) => command.includes("npm install --global"));
    expect(npmInstalls.length).toBeGreaterThan(0);
    expect(
      npmInstalls.every((command) => command.includes('npm install --global "npm@$NPM_VERSION"')),
    ).toBeTrue();

    for (const job of Object.values(jobs)) {
      expect(job["timeout-minutes"]).toBeGreaterThan(0);
    }
    const commands = Object.keys(jobs).flatMap(commandsFor).join("\n");
    expect(commands.match(/release:prepare/g)).toHaveLength(1);
    expect(commands).toContain("verify:packed -- --artifacts");
    expect(commands).toContain("verify:bundlers -- --artifacts");
    expect(commands).toContain("size-report.ts check --artifacts");
    expect(commands).toContain("test:coverage");
    expect(commands).toContain("test:browser");
  });

  it("gates the exact docs artifact without weakening Required CI", () => {
    const jobs = parsedWorkflow.jobs ?? {};
    const preflight = jobs.preflight;
    const classifier = preflight?.steps?.find((step) => step.id === "paths");
    expect(preflight?.outputs?.docs_required).toBe("$" + "{{ steps.paths.outputs.docs_required }}");
    expect(classifier?.run).toContain("ci-paths.ts");
    expect(new Set(jobs["docs-build"]?.needs as string[])).toEqual(
      new Set(["preflight", "artifact-build", "delivery-size"]),
    );
    expect(jobs["docs-build"]?.if).toBe("needs.preflight.outputs.docs_required == 'true'");

    const docsCommand = jobs["docs-build"]?.steps
      ?.flatMap((step) => (step.run ? [step.run] : []))
      .join("\n");
    expect(docsCommand).toContain("docs:generate");
    expect(docsCommand).not.toContain("docs:check");
    expect(docsCommand).toContain("@sheetwrite/docs-start' build");
    expect(JSON.stringify(jobs["delivery-size"])).toContain("delivery-size-evidence");
    expect(JSON.stringify(jobs["docs-build"])).toContain("delivery-size-evidence");

    const requiredCommand = jobs.required?.steps?.find((step) =>
      step.run?.includes('test "$PREFLIGHT" = success'),
    )?.run;
    expect(requiredCommand).toContain('if [ "$DOCS_REQUIRED" = "true" ]');
    expect(requiredCommand).toContain('test "$DOCS" = skipped');
    expect(requiredCommand).toContain('test "$BROWSER" = skipped');
  });

  it("shares a source-keyed Rust compilation cache across build and test jobs", () => {
    const jobs = parsedWorkflow.jobs ?? {};
    for (const jobName of ["artifact-build", "unit-coverage"]) {
      const cache = jobs[jobName]?.steps?.find(
        (step) =>
          step.uses?.startsWith("actions/cache@") && step.with?.path === "packages/wasm/target",
      );
      expect(cache, jobName).toBeDefined();
      expect(cache?.with?.key).toContain("wasm-target-");
      expect(cache?.with?.key).toContain("packages/wasm/src/**/*.rs");
      expect(cache?.with?.["restore-keys"]).toContain("wasm-target-");
    }
  });

  it("matches the active pinned tools", () => {
    expect(commandOutput(["bun", "--version"])).toBe(BUN_VERSION);
    expect(process.versions.node).toBe(NODE_VERSION);
    expect(commandOutput(["npm", "--version"])).toBe(NPM_VERSION);
    expect(commandOutput(["rustc", "--version"])).toMatch(
      new RegExp(`^rustc ${RUST_VERSION.replaceAll(".", "\\.")}\\b`),
    );
    expect(commandOutput(["wasm-pack", "--version"])).toBe(`wasm-pack ${WASM_PACK_VERSION}`);
  }, 60_000);
});
