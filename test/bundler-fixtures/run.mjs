import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bindCanonicalTarballIntegrities } from "../../scripts/release-lock-integrity.mjs";

const fixturesRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(fixturesRoot, "../..");
const stagingRoot = join(fixturesRoot, ".staging");
const tarballRoot = join(fixturesRoot, ".packed");
const packageDirectories = [
  "packages/wasm",
  "packages/core",
  "packages/xlsx",
  "packages/react",
  "packages/vue",
  "packages/svelte",
];
const sourceManifests = await Promise.all(
  packageDirectories.map(async (directory) =>
    JSON.parse(await readFile(join(repositoryRoot, directory, "package.json"), "utf8")),
  ),
);
const workspaceVersions = new Map(
  sourceManifests.map((manifest) => [manifest.name, manifest.version]),
);

function optionValue(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const artifactDirectory = optionValue("--artifacts");
const requiredArtifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifactDirectory === undefined) {
  throw new Error("Artifact-only bundler verification requires --artifacts");
}
if (
  requiredArtifacts !== undefined &&
  (artifactDirectory === undefined ||
    resolve(repositoryRoot, artifactDirectory) !== resolve(requiredArtifacts))
) {
  throw new Error("Bundler artifact input differs from the canonical artifact set");
}

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`),
        );
    });
  });
}

async function stageAndPack(packageDirectory, filename) {
  const sourceRoot = join(repositoryRoot, packageDirectory);
  const packageRoot = join(stagingRoot, basename(packageDirectory));
  const manifest = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
  const publishFiles = [...(manifest.files ?? []), "README.md"];
  await mkdir(packageRoot, { recursive: true });
  for (const path of publishFiles) {
    await cp(join(sourceRoot, path), join(packageRoot, path), { recursive: true });
  }
  await cp(join(repositoryRoot, "LICENSE"), join(packageRoot, "LICENSE"));
  if (manifest.dependencies) {
    manifest.dependencies = Object.fromEntries(
      Object.entries(manifest.dependencies).map(([name, range]) => {
        if (!range.startsWith("workspace:")) return [name, range];
        const version = workspaceVersions.get(name);
        if (!version) throw new Error(`No workspace version found for ${name}`);
        return [name, version];
      }),
    );
  }
  await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await run(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--filename", join(tarballRoot, filename)],
    packageRoot,
  );
}

await rm(stagingRoot, { recursive: true, force: true });
await rm(tarballRoot, { recursive: true, force: true });
await rm(join(repositoryRoot, "test-results/delivery-size/bundlers"), {
  recursive: true,
  force: true,
});
await mkdir(tarballRoot, { recursive: true });
let artifactManifestDigest;
const canonicalTarballs = new Map();
if (artifactDirectory === undefined) {
  for (const directory of packageDirectories) {
    const manifest = sourceManifests[packageDirectories.indexOf(directory)];
    if (manifest === undefined) throw new Error(`Missing source manifest for ${directory}`);
    await stageAndPack(directory, `sheetwrite-${basename(directory)}-${manifest.version}.tgz`);
    canonicalTarballs.set(
      manifest.name,
      join(tarballRoot, `sheetwrite-${basename(directory)}-${manifest.version}.tgz`),
    );
  }
} else {
  const artifactRoot = resolve(repositoryRoot, artifactDirectory);
  const releaseManifestBytes = await readFile(join(artifactRoot, "release-artifacts.json"));
  const releaseManifest = JSON.parse(releaseManifestBytes.toString("utf8"));
  artifactManifestDigest = `sha512-${createHash("sha512").update(releaseManifestBytes).digest("base64")}`;
  if (!Array.isArray(releaseManifest.packages) || releaseManifest.packages.length !== 6) {
    throw new Error("Canonical release manifest must contain exactly six packages");
  }
  for (const sourceManifest of sourceManifests) {
    const artifact = releaseManifest.packages.find((entry) => entry.name === sourceManifest.name);
    if (artifact === undefined || artifact.version !== sourceManifest.version) {
      throw new Error(`Missing canonical artifact for ${sourceManifest.name}`);
    }
    await cp(join(artifactRoot, artifact.path), join(tarballRoot, artifact.path));
    canonicalTarballs.set(sourceManifest.name, join(tarballRoot, artifact.path));
  }
}
await rm(stagingRoot, { recursive: true, force: true });

for (const fixture of ["vite", "webpack", "next"]) {
  const cwd = join(fixturesRoot, fixture);
  const lockPath = join(cwd, "package-lock.json");
  const manifestPath = join(cwd, "package.json");
  const [originalLock, originalManifest] = await Promise.all([
    readFile(lockPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(originalManifest);
  const fixtureTarballs = new Map();
  for (const packageName of Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (!packageName.startsWith("@sheetwrite/")) continue;
    const tarball = canonicalTarballs.get(packageName);
    if (tarball === undefined) throw new Error(`Missing canonical tarball for ${packageName}`);
    fixtureTarballs.set(packageName, tarball);
  }
  await rm(join(cwd, "node_modules"), { recursive: true, force: true });
  console.log(`\n=== ${fixture} bundler fixture ===`);
  try {
    await bindCanonicalTarballIntegrities(lockPath, fixtureTarballs);
    await run("npm", ["run", "build"], cwd);
  } finally {
    await Promise.all([
      writeFile(lockPath, originalLock),
      writeFile(manifestPath, originalManifest),
    ]);
  }
}

if (artifactManifestDigest !== undefined) {
  console.log(`\nArtifact manifest SHA-512: ${artifactManifestDigest}`);
}
console.log("\nAll bundler fixtures passed");
