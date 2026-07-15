import { resolve } from "node:path";
import { buildReleaseArtifacts, verifyReleaseArtifacts } from "./release-artifacts.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const defaultArtifactRoot = resolve(repositoryRoot, "test-results/release-artifacts");

export function releaseConsumerCommands(
  artifactRoot: string,
): ReadonlyArray<readonly [string, ...string[]]> {
  const root = resolve(artifactRoot);
  return [
    ["bun", "scripts/verify-packed-consumer.ts", "--artifacts", root],
    ["node", "test/bundler-fixtures/run.mjs", "--artifacts", root],
    ["bun", "scripts/size-report.ts", "check", "--artifacts", root, "--reuse-bundlers"],
  ];
}

async function run(command: readonly [string, ...string[]], artifactRoot: string): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SHEETWRITE_ARTIFACT_ONLY: "1",
      SHEETWRITE_RELEASE_ARTIFACTS: resolve(artifactRoot),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function cli(): Promise<void> {
  const suppliedArtifacts = optionValue("--artifacts");
  const artifactRoot = resolve(suppliedArtifacts ?? defaultArtifactRoot);
  if (suppliedArtifacts === undefined) await buildReleaseArtifacts(artifactRoot);
  else await verifyReleaseArtifacts(artifactRoot);

  for (const command of releaseConsumerCommands(artifactRoot)) {
    await run(command, artifactRoot);
    await verifyReleaseArtifacts(artifactRoot);
  }
  console.log(`Canonical release verification passed for ${artifactRoot}`);
}

if (import.meta.main) await cli();
