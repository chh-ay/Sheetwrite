import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertOutputDirectoryEmpty,
  assertReleaseTreeClean,
  INITIAL_RELEASE_VERSION,
  RELEASE_ARTIFACT_MANIFEST,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  type ReleaseArtifactManifest,
  rewriteWorkspaceRanges,
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

async function writeTarball(
  root: string,
  artifactName: string,
  packedName = artifactName,
): Promise<ReleaseArtifactManifest["packages"][number]> {
  const stageRoot = join(root, `stage-${artifactName.replaceAll("/", "-")}`);
  const packageRoot = join(stageRoot, "package");
  await mkdir(packageRoot, { recursive: true });
  const packedManifest = `${JSON.stringify({
    name: packedName,
    version: INITIAL_RELEASE_VERSION,
  })}\n`;
  await writeFile(join(packageRoot, "package.json"), packedManifest);

  const path = tarballName(artifactName);
  const packed = Bun.spawnSync(["tar", "-czf", join(root, path), "-C", stageRoot, "package"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await rm(stageRoot, { force: true, recursive: true });
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const bytes = new Uint8Array(await readFile(join(root, path)));
  return {
    name: artifactName,
    version: INITIAL_RELEASE_VERSION,
    path,
    bytes: bytes.byteLength,
    unpackedBytes: Buffer.byteLength(packedManifest),
    fileCount: 1,
    files: ["package.json"],
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
}

describe("canonical release artifacts", () => {
  it("accepts a valid canonical manifest", () => {
    expect(() => validateReleaseManifest(manifest())).not.toThrow();
  });

  it("rewrites only workspace ranges and rejects an unversioned internal dependency", () => {
    const versions = new Map([
      ["@sheetwrite/core", "0.1.0"],
      ["@sheetwrite/react", "0.1.0"],
      ["@sheetwrite/vue", "0.1.0"],
    ]);
    expect(
      rewriteWorkspaceRanges(
        {
          registry: "^9.0.0",
          "@sheetwrite/core": "workspace:*",
          "@sheetwrite/react": "workspace:^",
          "@sheetwrite/vue": "workspace:~",
        },
        versions,
      ),
    ).toEqual({
      registry: "^9.0.0",
      "@sheetwrite/core": "0.1.0",
      "@sheetwrite/react": "0.1.0",
      "@sheetwrite/vue": "0.1.0",
    });
    expect(() =>
      rewriteWorkspaceRanges({ "@sheetwrite/missing": "workspace:*" }, versions),
    ).toThrow("No release version found for @sheetwrite/missing");
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

  it("round-trips tarballs and detects checksum and packed-identity tampering", async () => {
    const root = await temporaryDirectory();
    const packages = await Promise.all(
      PUBLISHABLE_PACKAGE_ORDER.map((name) => writeTarball(root, name)),
    );
    let releaseManifest: ReleaseArtifactManifest = { ...manifest(), packages };
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(releaseManifest),
    );
    expect(await verifyReleaseArtifacts(root)).toEqual(releaseManifest);

    const first = packages[0]!;
    const tarballPath = join(root, first.path);
    const originalBytes = new Uint8Array(await readFile(tarballPath));
    const tamperedBytes = originalBytes.slice();
    tamperedBytes[tamperedBytes.length - 1] ^= 1;
    await writeFile(tarballPath, tamperedBytes);
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(`${first.name} shasum changed`);

    await writeFile(tarballPath, originalBytes);
    const wrongIdentity = await writeTarball(root, first.name, "@sheetwrite/tampered");
    releaseManifest = {
      ...releaseManifest,
      packages: [wrongIdentity, ...packages.slice(1)],
    };
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(releaseManifest),
    );
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      `${first.name} packed manifest identity changed`,
    );
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
