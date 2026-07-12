import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(fixturesRoot, "../..");
const stagingRoot = join(fixturesRoot, ".staging");
const tarballRoot = join(fixturesRoot, ".packed");
const packageDirectories = [
  "packages/wasm",
  "packages/core",
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
await mkdir(tarballRoot, { recursive: true });
await stageAndPack("packages/wasm", "sheetwrite-wasm.tgz");
await stageAndPack("packages/core", "sheetwrite-core.tgz");
await stageAndPack("packages/react", "sheetwrite-react.tgz");
await stageAndPack("packages/vue", "sheetwrite-vue.tgz");
await stageAndPack("packages/svelte", "sheetwrite-svelte.tgz");
await rm(stagingRoot, { recursive: true, force: true });

for (const fixture of ["vite", "webpack", "next"]) {
  const cwd = join(fixturesRoot, fixture);
  await rm(join(cwd, "node_modules"), { recursive: true, force: true });
  console.log(`\n=== ${fixture} bundler fixture ===`);
  await run("npm", ["run", "build"], cwd);
}

console.log("\nAll bundler fixtures passed");
