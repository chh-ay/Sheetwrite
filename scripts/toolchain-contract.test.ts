import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";

const root = resolve(import.meta.dir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly packageManager?: string;
  readonly engines?: Readonly<Record<string, string>>;
};
const rustToolchain = readFileSync(resolve(root, "rust-toolchain.toml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");

const EXPECTED_ACTION_PINS: Readonly<Record<string, string>> = {
  "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",
  "oven-sh/setup-bun": "735343b667d3e6f658f44d0eca948eb6282f2b76",
  "actions/cache": "5a3ec84eff668545956fd18022155c47e93e2684",
  "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
};

function commandOutput(command: readonly [string, ...string[]]): string {
  const result = Bun.spawnSync([...command], { cwd: root, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

describe("contributor and CI toolchain contract", () => {
  it("pins Bun while preserving the documented consumer engine range", () => {
    expect(packageManifest.packageManager).toBe("bun@1.3.14");
    expect(packageManifest.engines?.bun).toBe(">=1.3.0");
    expect(workflow).toContain('BUN_VERSION: "1.3.14"');
    expect(workflow).toContain("bun-version: 1.3.14");
  });

  it("pins Rust, its WASM target, wasm-pack, cargo-audit, and coverage tooling", () => {
    expect(rustToolchain).toContain('channel = "1.96.0"');
    expect(rustToolchain).toContain('components = ["llvm-tools-preview"]');
    expect(rustToolchain).toContain('targets = ["wasm32-unknown-unknown"]');
    expect(workflow).toContain('RUST_VERSION: "1.96.0"');
    expect(workflow).toContain('WASM_TARGET: "wasm32-unknown-unknown"');
    expect(workflow).toContain(`WASM_PACK_VERSION: "${WASM_PACK_VERSION}"`);
    expect(workflow).toContain('CARGO_AUDIT_VERSION: "0.22.2"');
    expect(workflow).toContain('CARGO_LLVM_COV_VERSION: "0.8.7"');
    expect(workflow).toContain(
      'cargo install cargo-llvm-cov --version "$CARGO_LLVM_COV_VERSION" --locked',
    );
    expect(workflow).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
  });

  it("pins every third-party action to its reviewed immutable commit", () => {
    const uses = [...workflow.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+)/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const match of uses) {
      const action = match[1];
      const reference = match[2];
      expect(action).toBeDefined();
      expect(reference).toMatch(/^[0-9a-f]{40}$/);
      expect(reference).toBe(EXPECTED_ACTION_PINS[action!]);
    }
    expect(new Set(uses.map((match) => match[1]))).toEqual(
      new Set(Object.keys(EXPECTED_ACTION_PINS)),
    );
    expect(workflow).not.toMatch(
      /(?:bun-version|RUST_VERSION|WASM_PACK_VERSION):\s*(?:latest|stable)\b/,
    );
  });

  it("uses the same canonical local commands in CI", () => {
    const orderedCommands = [
      "bun scripts/verify-clean-build.ts --assert-absent",
      "bun install --frozen-lockfile",
      "bun scripts/install-wasm-pack.ts",
      "bun run browser:install",
      "bun run verify:ci",
      "bun run test:coverage",
      "bun run test:browser",
      "bun run changeset:status -- --since=origin/develop",
    ];
    const positions = orderedCommands.map((command) => workflow.indexOf(command));
    expect(positions.every((position) => position >= 0)).toBeTrue();
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(workflow).not.toContain("bun run build:wasm");
    expect(workflow).not.toContain("bunx @changesets/cli");
  });

  it("matches the active pinned tools", () => {
    expect(commandOutput(["bun", "--version"])).toBe("1.3.14");
    expect(commandOutput(["rustc", "--version"])).toMatch(/^rustc 1\.96\.0\b/);
    expect(commandOutput(["wasm-pack", "--version"])).toBe(`wasm-pack ${WASM_PACK_VERSION}`);
  }, 60_000);
});
