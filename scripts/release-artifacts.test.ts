import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertOutputDirectoryEmpty,
  assertReleaseTreeClean,
  expectedArtifactFiles,
  INITIAL_RELEASE_VERSION,
  RELEASE_ARTIFACT_MANIFEST,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  type ReleaseArtifactManifest,
  serializeReleaseManifest,
  validateReleaseManifest,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
import {
  BUN_VERSION,
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  PUBLISHABLE_PACKAGE_ORDER,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function tarballName(name: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${INITIAL_RELEASE_VERSION}.tgz`;
}

function manifest(): ReleaseArtifactManifest {
  return {
    schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    sourceCommit: "a".repeat(40),
    toolchain: {
      bun: BUN_VERSION,
      node: NODE_VERSION,
      npm: NPM_VERSION,
      rust: RUST_VERSION,
      wasmTarget: WASM_TARGET,
      wasmPack: WASM_PACK_VERSION,
      cargoAudit: CARGO_AUDIT_VERSION,
      cargoLlvmCov: CARGO_LLVM_COV_VERSION,
    },
    packages: PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
      name,
      version: INITIAL_RELEASE_VERSION,
      path: tarballName(name),
      bytes: 1,
      unpackedBytes: 1,
      fileCount: 1,
      files: ["package.json"],
      shasum: "b".repeat(40),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
    })),
  };
}

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-artifact-test-"));
  temporaryRoots.push(root);
  return root;
}

describe("canonical release artifacts", () => {
  it("requires one ordered 0.1.0 artifact for every publishable package", () => {
    const value = manifest();
    expect(() => validateReleaseManifest(value)).not.toThrow();
    expect(value.packages.map((artifact) => artifact.name)).toEqual([...PUBLISHABLE_PACKAGE_ORDER]);
    expect(new Set(value.packages.map((artifact) => artifact.version))).toEqual(
      new Set([INITIAL_RELEASE_VERSION]),
    );
    expect(expectedArtifactFiles()).toHaveLength(7);
    expect(expectedArtifactFiles()).toEqual(
      [RELEASE_ARTIFACT_MANIFEST, ...value.packages.map((artifact) => artifact.path)].sort(),
    );
  });

  it("serializes the manifest deterministically", () => {
    const value = manifest();
    expect(serializeReleaseManifest(value)).toBe(serializeReleaseManifest(value));
    expect(serializeReleaseManifest(value).endsWith("\n")).toBeTrue();
  });

  it("rejects a dirty release tree and a non-empty output directory", () => {
    expect(() => assertReleaseTreeClean("")).not.toThrow();
    expect(() => assertReleaseTreeClean(" M package.json\n")).toThrow("Release tree is dirty");
    expect(() => assertOutputDirectoryEmpty([])).not.toThrow();
    expect(() => assertOutputDirectoryEmpty(["stale.tgz"])).toThrow("not empty");
  });

  it("rejects wrong, duplicate, and missing package identities", () => {
    const base = manifest();
    const wrongVersion: ReleaseArtifactManifest = {
      ...base,
      packages: base.packages.map((artifact, index) =>
        index === 0 ? { ...artifact, version: "0.1.1" } : artifact,
      ),
    };
    expect(() => validateReleaseManifest(wrongVersion)).toThrow("must remain version 0.1.0");

    const duplicate: ReleaseArtifactManifest = {
      ...base,
      packages: base.packages.map((artifact, index) =>
        index === 1 ? { ...artifact, name: base.packages[0]!.name } : artifact,
      ),
    };
    expect(() => validateReleaseManifest(duplicate)).toThrow();

    const missing: ReleaseArtifactManifest = {
      ...base,
      packages: base.packages.slice(0, -1),
    };
    expect(() => validateReleaseManifest(missing)).toThrow("exactly 6 packages");
  });

  it("rejects an empty artifact directory", async () => {
    const root = await temporaryDirectory();
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(RELEASE_ARTIFACT_MANIFEST);
  });

  it("rejects a manifest whose canonical tarballs are missing", async () => {
    const root = await temporaryDirectory();
    await mkdir(root, { recursive: true });
    await writeFile(join(root, RELEASE_ARTIFACT_MANIFEST), serializeReleaseManifest(manifest()));
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      "Release artifact directory must contain exactly",
    );
  });
});
