import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

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

export function parseCiRunId(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) {
    throw new Error("CI_RUN_ID must be a positive integer");
  }
  const runId = Number(value);
  if (!Number.isSafeInteger(runId)) throw new Error("CI_RUN_ID must be a safe integer");
  return runId;
}

async function main(): Promise<void> {
  const expectedSha = process.env.EXPECTED_SHA;
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const ciRunId = parseCiRunId(process.env.CI_RUN_ID);

  const actualSha = await run(["git", "rev-parse", "HEAD"]);
  if (actualSha !== expectedSha) {
    throw new Error(`Checked out ${actualSha}, expected ${expectedSha}`);
  }
  await run(["git", "merge-base", "--is-ancestor", expectedSha, "origin/develop"]);
  if ((await run(["git", "status", "--porcelain", "--untracked-files=all"])) !== "") {
    throw new Error("Release checkout is not clean");
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== "chh-ay/sheetwrite") {
    throw new Error(
      `Release workflow must run from chh-ay/sheetwrite, received ${repository ?? "unset"}`,
    );
  }
  const visibility = await run(["gh", "api", `repos/${repository}`, "--jq", ".visibility"]);
  if (visibility !== "public") {
    throw new Error(`Repository visibility is ${visibility}, expected public`);
  }

  await run(["npm", "ping", "--registry", "https://registry.npmjs.org"]);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(outputPath, `commit=${expectedSha}\nci_run_id=${ciRunId}\n`, "utf8");

  console.log(`Release preflight passed for ${expectedSha} using CI run ${ciRunId}`);
}

if (import.meta.main) await main();
