import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertGeneratedOutputsAbsent, validateExportTargets } from "./verify-clean-build.js";

const fixtureRoots: string[] = [];

async function exportFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-clean-exports-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "packages/core/dist"), { recursive: true });
  await writeFile(
    join(root, "packages/core/package.json"),
    `${JSON.stringify({
      name: "@sheetwrite/core",
      main: "./dist/index.js",
      module: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./styles.css": "./styles.css",
      },
    })}\n`,
  );
  await writeFile(join(root, "packages/core/dist/index.js"), "export const ready = true;\n");
  await writeFile(join(root, "packages/core/styles.css"), ":root {}\n");
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("clean-build export validation", () => {
  it("fails when a generated declaration target is absent and passes when the build recreates it", async () => {
    const root = await exportFixture();
    expect(() => validateExportTargets(root)).toThrow("@sheetwrite/core:./dist/index.d.ts");
    await writeFile(
      join(root, "packages/core/dist/index.d.ts"),
      "export declare const ready: boolean;\n",
    );
    expect(validateExportTargets(root)).toEqual([
      "@sheetwrite/core:./dist/index.d.ts",
      "@sheetwrite/core:./dist/index.js",
      "@sheetwrite/core:./styles.css",
    ]);
  });

  it("fails when a declared source export is absent", async () => {
    const root = await exportFixture();
    await writeFile(join(root, "packages/core/dist/index.d.ts"), "export {};\n");
    await rm(join(root, "packages/core/styles.css"));
    expect(() => validateExportTargets(root)).toThrow("@sheetwrite/core:./styles.css");
  });

  it("refuses a workspace that already contains generated output", async () => {
    const root = await exportFixture();
    expect(() => assertGeneratedOutputsAbsent(root)).toThrow("packages/core/dist");
    await rm(join(root, "packages/core/dist"), { recursive: true });
    expect(() => assertGeneratedOutputsAbsent(root)).not.toThrow();
  });
});
