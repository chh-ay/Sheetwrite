import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
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

async function withStaticServer(root, runWithOrigin) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = resolve(root, `.${relativePath}`);
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      const contentType =
        extname(file) === ".html"
          ? "text/html; charset=utf-8"
          : extname(file) === ".js"
            ? "text/javascript; charset=utf-8"
            : extname(file) === ".css"
              ? "text/css; charset=utf-8"
              : extname(file) === ".wasm"
                ? "application/wasm"
                : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  const listening = Promise.withResolvers();
  server.once("error", listening.reject);
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Fixture static server did not publish a TCP port");
  }
  try {
    await runWithOrigin(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = Promise.withResolvers();
    server.close(closed.resolve);
    await closed.promise;
  }
}

async function assertLifecyclePages(browser, root, pages) {
  await withStaticServer(root, async (origin) => {
    for (const [path, expected] of pages) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(
          () => document.documentElement.dataset.sheetwriteLifecycle === "passed",
          undefined,
          { timeout: 20_000 },
        );
      } catch (error) {
        throw new Error(
          `${path} did not complete mounted lifecycle\n${errors.join("\n")}\nbody: ${await page.locator("body").innerText()}`,
          { cause: error },
        );
      }
      const body = await page.locator("body").innerText();
      if (!body.includes(expected)) {
        throw new Error(`${path} did not publish expected lifecycle marker ${expected}`);
      }
      if (errors.length > 0) {
        throw new Error(`${path} emitted browser errors:\n${errors.join("\n")}`);
      }
      await page.close();
    }
  });
}

await rm(stagingRoot, { recursive: true, force: true });
await rm(tarballRoot, { recursive: true, force: true });
await rm(join(repositoryRoot, "test-results/bundlers"), {
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

const browser = await chromium.launch({ headless: true });
try {
  await assertLifecyclePages(browser, join(fixturesRoot, "vite/dist"), [
    ["/react.html", "react ready/edit/reset/unmount passed"],
    ["/vue.html", "vue ready/edit/reset/unmount passed"],
    ["/svelte.html", "svelte ready/edit/reset/unmount passed"],
  ]);
  await assertLifecyclePages(browser, join(fixturesRoot, "next/out"), [
    ["/", "next ready/edit/reset/unmount passed"],
  ]);
} finally {
  await browser.close();
}

if (artifactManifestDigest !== undefined) {
  console.log(`\nArtifact manifest SHA-512: ${artifactManifestDigest}`);
}
console.log("\nAll bundler fixtures passed");
