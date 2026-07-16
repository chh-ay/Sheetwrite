import { resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");

/**
 * Protocol-binding capture stamp shared by every benchmark artifact. The docs
 * evidence page refuses to publish numbers whose provenance (commit, tree
 * cleanliness, capture time) cannot be established.
 */
export interface ProtocolCaptureMeta {
  readonly commit: string;
  readonly dirty: boolean;
  readonly timestamp: string;
}

function gitOutput(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

export function protocolCaptureMeta(): ProtocolCaptureMeta {
  return {
    commit: gitOutput(["rev-parse", "HEAD"]),
    dirty: gitOutput(["status", "--porcelain", "--untracked-files=no"]).length > 0,
    timestamp: new Date().toISOString(),
  };
}
