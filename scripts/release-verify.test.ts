import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { releaseConsumerCommands } from "./release-verify.js";

const repositoryRoot = resolve(import.meta.dir, "..");

function guardedRun(command: readonly [string, ...string[]]): {
  readonly exitCode: number;
  readonly output: string;
} {
  const result = Bun.spawnSync([...command], {
    cwd: repositoryRoot,
    env: { ...process.env, SHEETWRITE_ARTIFACT_ONLY: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  };
}

describe("canonical artifact consumer graph", () => {
  it("routes one absolute artifact directory through every delivery gate", () => {
    const artifactRoot = resolve(repositoryRoot, "test-results/release-artifact-fixture");
    const commands = releaseConsumerCommands(artifactRoot);
    expect(commands).toEqual([
      ["bun", "scripts/verify-packed-consumer.ts", "--artifacts", artifactRoot],
      ["node", "test/bundler-fixtures/run.mjs", "--artifacts", artifactRoot],
      ["bun", "scripts/size-report.ts", "check", "--artifacts", artifactRoot, "--reuse-bundlers"],
    ]);
    expect(
      commands.every((command) => command.filter((value) => value === artifactRoot).length === 1),
    ).toBeTrue();
  });

  it("forbids every consumer's standalone packing fallback in artifact-only mode", () => {
    for (const command of [
      ["bun", "scripts/verify-packed-consumer.ts"],
      ["node", "test/bundler-fixtures/run.mjs"],
      ["bun", "scripts/size-report.ts", "check", "--reuse-bundlers"],
    ] as const) {
      const result = guardedRun(command);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("Artifact-only");
    }
  });
});
