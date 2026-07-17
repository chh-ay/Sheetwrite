import { describe, expect, it } from "bun:test";
import { requiresDocumentationBuild } from "./ci-paths.js";

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
