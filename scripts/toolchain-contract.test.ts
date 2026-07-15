import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  BUN_VERSION,
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly packageManager?: string;
  readonly engines?: Readonly<Record<string, string>>;
};
const rustToolchain = readFileSync(resolve(root, "rust-toolchain.toml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const nodeVersion = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const sizeBudget = JSON.parse(readFileSync(resolve(root, "scripts/size-budgets.json"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, string>>;
};

const EXPECTED_ACTION_PINS: Readonly<Record<string, string>> = {
  "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",
  "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
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
    expect(packageManifest.packageManager).toBe(`bun@${BUN_VERSION}`);
    expect(packageManifest.engines?.bun).toBe(">=1.3.0");
    expect(workflow).toContain(`BUN_VERSION: "${BUN_VERSION}"`);
    expect(workflow).toContain(`bun-version: ${BUN_VERSION}`);
  });

  it("pins Node and npm as exact release inputs", () => {
    expect(nodeVersion).toBe(NODE_VERSION);
    expect(packageManifest.engines?.node).toBe(">=24.3.0 <25");
    expect(workflow).toContain(`NODE_VERSION: "${NODE_VERSION}"`);
    expect(workflow).toContain(`NPM_VERSION: "${NPM_VERSION}"`);
    expect(workflow).toContain(`node-version: ${NODE_VERSION}`);
    expect(workflow).toContain(`npm install --global npm@${NPM_VERSION}`);
    expect(workflow).toContain(`test "$(node --version)" = "v${NODE_VERSION}"`);
    expect(workflow).toContain(`test "$(npm --version)" = "${NPM_VERSION}"`);
    expect(sizeBudget.toolchain?.node).toBe(NODE_VERSION);
    expect(sizeBudget.toolchain?.npm).toBe(NPM_VERSION);
  });

  it("pins Rust, its WASM target, wasm-pack, cargo-audit, and coverage tooling", () => {
    expect(rustToolchain).toContain(`channel = "${RUST_VERSION}"`);
    expect(rustToolchain).toContain('components = ["llvm-tools-preview"]');
    expect(rustToolchain).toContain(`targets = ["${WASM_TARGET}"]`);
    expect(workflow).toContain(`RUST_VERSION: "${RUST_VERSION}"`);
    expect(workflow).toContain(`WASM_TARGET: "${WASM_TARGET}"`);
    expect(workflow).toContain(`WASM_PACK_VERSION: "${WASM_PACK_VERSION}"`);
    expect(workflow).toContain(`CARGO_AUDIT_VERSION: "${CARGO_AUDIT_VERSION}"`);
    expect(workflow).toContain(`CARGO_LLVM_COV_VERSION: "${CARGO_LLVM_COV_VERSION}"`);
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
      /(?:bun-version|NODE_VERSION|NPM_VERSION|RUST_VERSION|WASM_PACK_VERSION):\s*(?:latest|stable)\b/,
    );
  });

  it("uses the same canonical local commands in CI", () => {
    const orderedCommands = [
      `npm install --global npm@${NPM_VERSION}`,
      "bun scripts/verify-clean-build.ts --assert-absent",
      "bun install --frozen-lockfile",
      "bun run changeset:status -- --since=origin/develop",
      "bun scripts/install-wasm-pack.ts",
      "bun run browser:install",
      "bun run verify:ci",
      "bun run test:coverage",
      "bun run test:browser",
    ];
    const positions = orderedCommands.map((command) => workflow.indexOf(command));
    expect(positions.every((position) => position >= 0)).toBeTrue();
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(workflow).not.toContain("bun run build:wasm");
    expect(workflow).not.toContain("bunx @changesets/cli");
  });

  it("matches the active pinned tools", () => {
    expect(commandOutput(["bun", "--version"])).toBe(BUN_VERSION);
    expect(process.versions.node).toBe(NODE_VERSION);
    expect(commandOutput(["npm", "--version"])).toBe(NPM_VERSION);
    expect(commandOutput(["rustc", "--version"])).toMatch(
      new RegExp(`^rustc ${RUST_VERSION.replaceAll(".", "\\.")}\\b`),
    );
    expect(commandOutput(["wasm-pack", "--version"])).toBe(`wasm-pack ${WASM_PACK_VERSION}`);
  }, 60_000);
});
