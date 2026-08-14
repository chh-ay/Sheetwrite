import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertOutputDirectoryEmpty,
  RELEASE_ARTIFACT_MANIFEST,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  RELEASE_BUILD_COMMAND,
  type ReleaseArtifactManifest,
  releaseModeDirty,
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

const TEST_RELEASE_VERSION = "0.4.0";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function tarballName(name: string, version = TEST_RELEASE_VERSION): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

function manifest(): ReleaseArtifactManifest {
  return {
    schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    sourceCommit: "a".repeat(40),
    dirty: false,
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
    buildCommand: RELEASE_BUILD_COMMAND,
    packages: PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
      name,
      version: TEST_RELEASE_VERSION,
      path: tarballName(name),
      bytes: 1,
      unpackedBytes: 1,
      fileCount: 1,
      files: ["package.json"],
      shasum: "b".repeat(40),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
      sha512: "c".repeat(128),
      internalDependencies: {},
    })),
  };
}

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-artifact-test-"));
  temporaryRoots.push(root);
  return root;
}

const REQUIRED_FILES: Readonly<Record<string, readonly string[]>> = {
  "@sheetwrite/wasm": [
    "README.md",
    "LICENSE",
    "loader.d.ts",
    "loader.mjs",
    "loader-browser.mjs",
    "loader-node.mjs",
    "pkg/sheetwrite_wasm.d.ts",
    "pkg/sheetwrite_wasm.js",
    "pkg/sheetwrite_wasm_bg.wasm",
    "pkg/sheetwrite_wasm_bg.wasm.d.ts",
  ],
  "@sheetwrite/core": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/worker.d.ts",
    "dist/worker.js",
    "styles.css",
    "shell.css",
  ],
  "@sheetwrite/xlsx": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/index.js.map",
  ],
  "@sheetwrite/react": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js", "styles.css"],
  "@sheetwrite/vue": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js", "styles.css"],
  "@sheetwrite/svelte": ["README.md", "LICENSE", "src/Grid.svelte", "src/index.ts", "styles.css"],
};

async function writeTarball(
  root: string,
  artifactName: string,
  packedName = artifactName,
  manifestOverrides: Record<string, unknown> = {},
  maliciousPath = false,
): Promise<ReleaseArtifactManifest["packages"][number]> {
  const stageRoot = join(root, `stage-${artifactName.replaceAll("/", "-")}`);
  const packageRoot = join(stageRoot, "package");
  await mkdir(packageRoot, { recursive: true });
  const packedManifestValue = {
    name: packedName,
    version: TEST_RELEASE_VERSION,
    ...manifestOverrides,
  };
  const packedManifest = `${JSON.stringify(packedManifestValue)}\n`;
  await writeFile(join(packageRoot, "package.json"), packedManifest);
  const files = ["package.json", ...(REQUIRED_FILES[artifactName] ?? [])].sort();
  for (const file of files) {
    if (file === "package.json") continue;
    await mkdir(join(packageRoot, file, ".."), { recursive: true });
    await writeFile(join(packageRoot, file), `${file}\n`);
  }

  const path = tarballName(artifactName);
  const tarArguments = [
    "-czf",
    join(root, path),
    ...(maliciousPath ? ["--transform=s#^package/README.md$#../escape#"] : []),
    "-C",
    stageRoot,
    ...files.map((file) => `package/${file}`),
  ];
  const packed = Bun.spawnSync(["tar", ...tarArguments], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await rm(stageRoot, { force: true, recursive: true });
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const bytes = new Uint8Array(await readFile(join(root, path)));
  return {
    name: artifactName,
    version: TEST_RELEASE_VERSION,
    path,
    bytes: bytes.byteLength,
    unpackedBytes:
      Buffer.byteLength(packedManifest) +
      files
        .filter((file) => file !== "package.json")
        .reduce((sum, file) => sum + Buffer.byteLength(`${file}\n`), 0),
    fileCount: files.length,
    files,
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    sha512: createHash("sha512").update(bytes).digest("hex"),
    internalDependencies: Object.fromEntries(
      ["dependencies", "devDependencies", "peerDependencies"].flatMap((field) =>
        Object.entries(
          (packedManifestValue[field as keyof typeof packedManifestValue] as unknown as
            | Record<string, string>
            | undefined) ?? {},
        ).filter(([name]) => PUBLISHABLE_PACKAGE_ORDER.includes(name as never)),
      ),
    ),
  };
}

describe("canonical release artifacts", () => {
  it("accepts a valid canonical manifest", () => {
    expect(() => validateReleaseManifest(manifest())).not.toThrow();
  });

  it("rejects source maps in the published core package", () => {
    const base = manifest();
    const packages = base.packages.map((artifact) =>
      artifact.name === "@sheetwrite/core"
        ? {
            ...artifact,
            fileCount: 2,
            files: ["dist/index.js.map", "package.json"],
          }
        : artifact,
    );
    expect(() => validateReleaseManifest({ ...base, packages })).toThrow(
      "@sheetwrite/core published files must exclude source maps",
    );
  });

  it("rewrites workspace ranges and enforces release cleanliness", () => {
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
    expect(releaseModeDirty("verification", "")).toBe(false);
    expect(releaseModeDirty("verification", " M package.json\n")).toBe(true);
    expect(() => releaseModeDirty("release", "")).not.toThrow();
    expect(() => releaseModeDirty("release", " M package.json\n")).toThrow("Release tree is dirty");
    expect(() => assertOutputDirectoryEmpty([])).not.toThrow();
    expect(() => assertOutputDirectoryEmpty(["stale.tgz"])).toThrow("not empty");
  });

  it("accepts independent stable versions and an ordered package subset", () => {
    const base = manifest();
    const versions = ["0.1.0", "0.2.0", "1.0.0", "0.4.0", "2.1.0", "0.6.0"];
    const mixedPackages = base.packages.map((artifact, index) => ({
      ...artifact,
      version: versions[index]!,
      path: tarballName(artifact.name, versions[index]!),
    }));
    expect(() => validateReleaseManifest({ ...base, packages: mixedPackages })).not.toThrow();
    expect(() =>
      validateReleaseManifest({
        ...base,
        packages: [mixedPackages[0]!, mixedPackages[2]!, mixedPackages[5]!],
      }),
    ).not.toThrow();
    expect(() => validateReleaseManifest({ ...base, packages: [] })).toThrow("non-empty");
  });

  it("rejects duplicate, unknown, and out-of-order package identities", () => {
    const base = manifest();
    const duplicate: ReleaseArtifactManifest = {
      ...base,
      packages: [base.packages[0]!, { ...base.packages[1]!, name: base.packages[0]!.name }],
    };
    expect(() => validateReleaseManifest(duplicate)).toThrow("Duplicate release package");

    const unknown: ReleaseArtifactManifest = {
      ...base,
      packages: [{ ...base.packages[0]!, name: "@sheetwrite/unknown" }],
    };
    expect(() => validateReleaseManifest(unknown)).toThrow(
      "Unknown release package @sheetwrite/unknown",
    );

    const outOfOrder: ReleaseArtifactManifest = {
      ...base,
      packages: [base.packages[1]!, base.packages[0]!],
    };
    expect(() => validateReleaseManifest(outOfOrder)).toThrow("dependency order");
  });

  it("rejects an incorrect packaged internal dependency version", () => {
    const base = manifest();
    const packages = base.packages.slice(0, 2).map((artifact, index) => ({
      ...artifact,
      version: index === 0 ? "0.1.0" : "0.2.0",
      path: tarballName(artifact.name, index === 0 ? "0.1.0" : "0.2.0"),
      internalDependencies:
        index === 1 ? { "@sheetwrite/wasm": "0.9.0" } : artifact.internalDependencies,
    }));
    expect(() => validateReleaseManifest({ ...base, packages })).toThrow(
      "@sheetwrite/core internal dependency @sheetwrite/wasm must be 0.1.0",
    );
  });

  it("round-trips an ordered artifact subset", async () => {
    const root = await temporaryDirectory();
    const packageNames = [
      PUBLISHABLE_PACKAGE_ORDER[0]!,
      PUBLISHABLE_PACKAGE_ORDER[2]!,
      PUBLISHABLE_PACKAGE_ORDER[5]!,
    ];
    const packages = await Promise.all(packageNames.map((name) => writeTarball(root, name)));
    const releaseManifest: ReleaseArtifactManifest = { ...manifest(), packages };
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(releaseManifest),
    );
    expect(await verifyReleaseArtifacts(root)).toEqual(releaseManifest);
  });

  it("rejects an absent package dependency at the wrong source version", async () => {
    const root = await temporaryDirectory();
    const artifact = await writeTarball(root, "@sheetwrite/react", "@sheetwrite/react", {
      dependencies: { "@sheetwrite/core": "0.1.0" },
    });
    const releaseManifest: ReleaseArtifactManifest = {
      ...manifest(),
      packages: [artifact],
    };
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(releaseManifest),
    );
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      `@sheetwrite/react internal dependency @sheetwrite/core must be ${TEST_RELEASE_VERSION}`,
    );
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
    const lastIndex = tamperedBytes.length - 1;
    if (lastIndex < 0) throw new Error("Expected a non-empty tarball");
    tamperedBytes[lastIndex] = tamperedBytes[lastIndex]! ^ 1;
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

  it("rejects lifecycle scripts and missing exact-case package targets", async () => {
    const lifecycleRoot = await temporaryDirectory();
    const lifecyclePackages = await Promise.all(
      PUBLISHABLE_PACKAGE_ORDER.map((name, index) =>
        writeTarball(
          lifecycleRoot,
          name,
          name,
          index === 0 ? { scripts: { prepublishOnly: "exit 1" } } : {},
        ),
      ),
    );
    await writeFile(
      join(lifecycleRoot, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest({ ...manifest(), packages: lifecyclePackages }),
    );
    await expect(verifyReleaseArtifacts(lifecycleRoot)).rejects.toThrow("retains prepublishOnly");

    const exportRoot = await temporaryDirectory();
    const exportPackages = await Promise.all(
      PUBLISHABLE_PACKAGE_ORDER.map((name, index) =>
        writeTarball(exportRoot, name, name, index === 0 ? { exports: "./Missing.js" } : {}),
      ),
    );
    await writeFile(
      join(exportRoot, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest({ ...manifest(), packages: exportPackages }),
    );
    await expect(verifyReleaseArtifacts(exportRoot)).rejects.toThrow(
      "package target does not exist with exact case",
    );
  });

  it("rejects malicious archive paths before trusting the file list", async () => {
    const root = await temporaryDirectory();
    const packages = await Promise.all(
      PUBLISHABLE_PACKAGE_ORDER.map((name, index) =>
        writeTarball(root, name, name, {}, index === 0),
      ),
    );
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest({ ...manifest(), packages }),
    );
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow("malicious archive path");
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
