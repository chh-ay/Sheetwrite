import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  type ReleaseCommandContext,
  type ReleaseVerificationRunner,
  runReleaseVerification,
} from "./release-verify.js";

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
  it("runs every delivery capability once against one verified artifact-only root", async () => {
    type Event =
      | { readonly kind: "build" | "verify"; readonly root: string }
      | {
          readonly kind: "consumer";
          readonly command: readonly [string, ...string[]];
          readonly context: ReleaseCommandContext;
        };
    const events: Event[] = [];
    const runner: ReleaseVerificationRunner = {
      async buildArtifacts(root) {
        events.push({ kind: "build", root });
      },
      async verifyArtifacts(root) {
        events.push({ kind: "verify", root });
      },
      async runConsumer(command, context) {
        events.push({ kind: "consumer", command, context });
      },
    };
    const suppliedRoot = resolve(
      repositoryRoot,
      "test-results",
      "..",
      "test-results",
      "release-artifact-fixture",
    );
    const artifactRoot = await runReleaseVerification(suppliedRoot, true, runner);
    const consumers = events.filter(
      (event): event is Extract<Event, { kind: "consumer" }> => event.kind === "consumer",
    );

    expect(events[0]).toEqual({ kind: "verify", root: artifactRoot });
    expect(events.some((event) => event.kind === "build")).toBeFalse();
    expect(
      consumers.every((event) => {
        const index = events.indexOf(event);
        return (
          events.slice(0, index).some((candidate) => candidate.kind === "verify") &&
          event.context.artifactRoot === artifactRoot &&
          event.context.artifactOnly &&
          event.context.env.SHEETWRITE_ARTIFACT_ONLY === "1" &&
          event.context.env.SHEETWRITE_RELEASE_ARTIFACTS === artifactRoot &&
          event.command.filter((argument) => argument === artifactRoot).length === 1
        );
      }),
    ).toBeTrue();

    const capabilityRuns: Record<string, number> = {
      "release audit": 0,
      "packed consumer": 0,
      "bundler consumer": 0,
      "delivery size": 0,
    };
    for (const { command } of consumers) {
      if (command.includes("scripts/release-audit.ts"))
        capabilityRuns["release audit"] = (capabilityRuns["release audit"] ?? 0) + 1;
      else if (command.includes("scripts/verify-packed-consumer.ts"))
        capabilityRuns["packed consumer"] = (capabilityRuns["packed consumer"] ?? 0) + 1;
      else if (command.includes("test/bundler-fixtures/run.mjs"))
        capabilityRuns["bundler consumer"] = (capabilityRuns["bundler consumer"] ?? 0) + 1;
      else if (command.includes("scripts/size-report.ts"))
        capabilityRuns["delivery size"] = (capabilityRuns["delivery size"] ?? 0) + 1;
      else throw new Error(`unknown delivery capability: ${command.join(" ")}`);
    }
    expect(capabilityRuns).toEqual({
      "release audit": 1,
      "packed consumer": 1,
      "bundler consumer": 1,
      "delivery size": 1,
    });
  });

  it("forbids every consumer's standalone packing fallback in artifact-only mode", () => {
    for (const command of [
      ["bun", "scripts/verify-packed-consumer.ts"],
      ["node", "test/bundler-fixtures/run.mjs"],
      ["bun", "scripts/size-report.ts", "report", "--reuse-bundlers"],
    ] as const) {
      const result = guardedRun(command);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("Artifact-only");
    }
  });
});
