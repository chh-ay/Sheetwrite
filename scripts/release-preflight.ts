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

export function releaseVersionFromTag(tag: string): string {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`Release tag ${tag} must be an exact stable semantic version`);
  return tag.slice(1);
}

async function main(): Promise<void> {
  const expectedSha = process.env.EXPECTED_SHA;
  const releaseTag = process.env.RELEASE_TAG;
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  if (!releaseTag) throw new Error("RELEASE_TAG is required");
  const expectedVersion = releaseVersionFromTag(releaseTag);

  const actualSha = await run(["git", "rev-parse", "HEAD"]);
  if (actualSha !== expectedSha)
    throw new Error(`Checked out ${actualSha}, expected ${expectedSha}`);
  const taggedSha = await run(["git", "rev-parse", `${releaseTag}^{commit}`]);
  if (taggedSha !== expectedSha) {
    throw new Error(`${releaseTag} targets ${taggedSha}, expected ${expectedSha}`);
  }
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

  await run(["npm", "ping", "--registry", "https://registry.npmjs.org"]);

  console.log(`Release preflight passed for ${expectedSha} at version ${expectedVersion}`);
}

if (import.meta.main) await main();
