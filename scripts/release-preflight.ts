import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const repositoryRoot = resolve(import.meta.dir, "..");

async function run(command: readonly string[]): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd: repositoryRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
  }
  return stdout.trim();
}

async function packageVersion(name: string): Promise<string> {
  const directory = name.slice("@sheetwrite/".length);
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "packages", directory, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string") throw new Error(`${name} has no version`);
  return manifest.version;
}

async function main(): Promise<void> {
  const expectedSha = process.env.EXPECTED_SHA;
  const expectedVersion = process.env.RELEASE_VERSION;
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  if (!expectedVersion) throw new Error("RELEASE_VERSION is required");

  const actualSha = await run(["git", "rev-parse", "HEAD"]);
  if (actualSha !== expectedSha)
    throw new Error(`Checked out ${actualSha}, expected ${expectedSha}`);
  await run(["git", "merge-base", "--is-ancestor", expectedSha, "origin/develop"]);
  if ((await run(["git", "status", "--porcelain", "--untracked-files=all"])) !== "") {
    throw new Error("Release checkout is not clean");
  }

  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const version = await packageVersion(name);
    if (version !== expectedVersion) {
      throw new Error(`${name} is ${version}, expected ${expectedVersion}`);
    }
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== "chh-ay/sheetwrite") {
    throw new Error(
      `Release workflow must run from chh-ay/sheetwrite, received ${repository ?? "unset"}`,
    );
  }
  const visibility = await run(["gh", "api", `repos/${repository}`, "--jq", ".visibility"]);
  if (visibility !== "public")
    throw new Error(`Repository visibility is ${visibility}, expected public`);

  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const child = Bun.spawn(["npm", "view", `${name}@${expectedVersion}`, "version", "--json"], {
      cwd: repositoryRoot,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode === 0 && stdout.trim() !== "") {
      throw new Error(`${name}@${expectedVersion} already exists in the public registry`);
    }
    if (exitCode !== 0 && !stderr.includes("E404")) {
      throw new Error(`Could not verify ${name}@${expectedVersion} registry state: ${stderr}`);
    }
  }

  console.log(`Release preflight passed for ${expectedSha} at version ${expectedVersion}`);
}

await main();
