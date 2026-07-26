import { describe, expect, it } from "bun:test";
import { requiresDocumentationBuild, requiresPerformanceRun } from "./ci-paths.js";

describe("documentation CI path classification", () => {
  it("runs for documentation, public API, package, and browser-contract changes", () => {
    for (const path of [
      "docs/src/routes/index.tsx",
      "packages/core/src/grid.ts",
      "packages/react/package.json",
      "packages/vue/README.md",
      "packages/wasm/src/lib.rs",
      "bench/results/render-results.json",
      "scripts/docs.ts",
      "test/browser/documentation-site.spec.ts",
      ".github/workflows/ci.yml",
      "bun.lock",
      "README.md",
    ]) {
      expect(requiresDocumentationBuild([path]), path).toBeTrue();
    }
  });

  it("skips only paths proven independent from generated documentation", () => {
    expect(
      requiresDocumentationBuild([
        ".changeset/release-note.md",
        ".github/ISSUE_TEMPLATE/bug-report.yml",
        "SECURITY.md",
        "packages/core/test/grid.test.ts",
        "bench/test/render-gate.test.ts",
        "scripts/release-workflow.test.ts",
        "test/adapter-lifecycle-contract.ts",
      ]),
    ).toBeFalse();
  });

  it("takes the expensive lane for mixed, unknown, and empty change sets", () => {
    expect(requiresDocumentationBuild(["README.md", "docs/src/router.tsx"])).toBeTrue();
    expect(requiresDocumentationBuild(["new-subsystem/config.json"])).toBeTrue();
    expect(requiresDocumentationBuild([])).toBeTrue();
  });
});

describe("performance CI path classification", () => {
  it("runs for engine, renderer, harness, manifest, and workflow changes", () => {
    for (const path of [
      "packages/core/src/canvas-paint.ts",
      "packages/core/src/store/data-engine.ts",
      "packages/wasm/src/query.rs",
      "packages/wasm/Cargo.toml",
      "packages/react/src/index.ts",
      "bench/src/render-driver.ts",
      // The gate compares fresh samples against this reference, so a change to it
      // must re-run the benchmark rather than skip it.
      "bench/results/render-baseline.json",
      "package.json",
      "bun.lock",
      ".github/workflows/ci.yml",
      "scripts/ci-paths.ts",
    ]) {
      expect(requiresPerformanceRun([path]), path).toBeTrue();
    }
  });

  it("skips only paths proven unable to move a measurement", () => {
    expect(
      requiresPerformanceRun([
        ".changeset/release-note.md",
        ".github/ISSUE_TEMPLATE/bug-report.yml",
        "README.md",
        "SECURITY.md",
        "docs/src/routes/index.tsx",
        "examples/vanilla/index.html",
        "packages/core/test/grid.test.ts",
        "packages/core/README.md",
        "bench/test/render-gate.test.ts",
        "scripts/release-workflow.test.ts",
        "test/browser/vanilla-workbench.spec.ts",
      ]),
    ).toBeFalse();
  });

  it("takes the expensive lane for mixed, unknown, and empty change sets", () => {
    expect(requiresPerformanceRun([".changeset/note.md", "packages/wasm/src/sheet.rs"])).toBeTrue();
    expect(requiresPerformanceRun(["new-subsystem/config.json"])).toBeTrue();
    expect(requiresPerformanceRun([])).toBeTrue();
  });
});
