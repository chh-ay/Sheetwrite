import { resolve } from "node:path";
import { buildReleaseArtifacts, verifyReleaseArtifacts } from "./release-artifacts.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const defaultArtifactRoot = resolve(repositoryRoot, "test-results/release-artifacts");

export function releaseConsumerCommands(
  artifactRoot: string,
): ReadonlyArray<readonly [string, ...string[]]> {
  const root = resolve(artifactRoot);
  return [
    ["bun", "scripts/release-audit.ts", "--artifacts", root],
    ["bun", "scripts/verify-packed-consumer.ts", "--artifacts", root],
    ["node", "test/bundler-fixtures/run.mjs", "--artifacts", root],
    ["bun", "scripts/size-report.ts", "check", "--artifacts", root, "--reuse-bundlers"],
  ];
}

export interface ReleaseCommandContext {
  readonly artifactRoot: string;
  readonly artifactOnly: true;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface ReleaseVerificationRunner {
  buildArtifacts(artifactRoot: string): Promise<unknown>;
  verifyArtifacts(artifactRoot: string): Promise<unknown>;
  runConsumer(
    command: readonly [string, ...string[]],
    context: ReleaseCommandContext,
  ): Promise<void>;
}

const defaultRunner: ReleaseVerificationRunner = {
  buildArtifacts: buildReleaseArtifacts,
  verifyArtifacts: verifyReleaseArtifacts,
  async runConsumer(command, context): Promise<void> {
    const child = Bun.spawn([...command], {
      cwd: context.cwd,
      env: { ...context.env },
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  },
};

export async function runReleaseVerification(
  artifactRoot: string,
  artifactOnly: boolean,
  runner: ReleaseVerificationRunner = defaultRunner,
): Promise<string> {
  const root = resolve(artifactRoot);
  if (artifactOnly) await runner.verifyArtifacts(root);
  else await runner.buildArtifacts(root);

  const context: ReleaseCommandContext = {
    artifactRoot: root,
    artifactOnly: true,
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SHEETWRITE_ARTIFACT_ONLY: "1",
      SHEETWRITE_RELEASE_ARTIFACTS: root,
    },
  };
  for (const command of releaseConsumerCommands(root)) {
    await runner.runConsumer(command, context);
    await runner.verifyArtifacts(root);
  }
  return root;
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function cli(): Promise<void> {
  const suppliedArtifacts = optionValue("--artifacts");
  const artifactRoot = await runReleaseVerification(
    suppliedArtifacts ?? defaultArtifactRoot,
    suppliedArtifacts !== undefined,
  );
  console.log(`Canonical release verification passed for ${artifactRoot}`);
}

if (import.meta.main) await cli();
