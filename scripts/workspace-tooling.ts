import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PUBLISHABLE_PACKAGE_ORDER = [
  "@sheetwrite/wasm",
  "@sheetwrite/core",
  "@sheetwrite/xlsx",
  "@sheetwrite/react",
  "@sheetwrite/vue",
  "@sheetwrite/svelte",
] as const;

export const PACKAGE_TYPECHECK_ORDER = [
  "@sheetwrite/wasm",
  "@sheetwrite/core",
  "@sheetwrite/xlsx",
  "@sheetwrite/react",
  "@sheetwrite/vue",
  "@sheetwrite/svelte",
] as const;

export interface CommandNode {
  readonly id: string;
  readonly command: readonly [string, ...string[]];
  readonly cwd?: string;
  readonly diagnosticPolicy?: "astro";
}

interface WorkspaceManifest {
  readonly name?: string;
  readonly publishConfig?: unknown;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const packageNode = (name: string, operation: "build" | "typecheck"): CommandNode => ({
  id: `${operation}:${name}`,
  command: ["bun", "run", "--filter", name, operation],
});

export const PACKAGE_BUILD_NODES: readonly CommandNode[] = PUBLISHABLE_PACKAGE_ORDER.map((name) =>
  packageNode(name, "build"),
);

export const PACKAGE_TYPECHECK_NODES: readonly CommandNode[] = PACKAGE_TYPECHECK_ORDER.map((name) =>
  packageNode(name, "typecheck"),
);

export const EXAMPLE_BUILD_NODES: readonly CommandNode[] = [
  {
    id: "build:@sheetwrite/example-site",
    command: ["bun", "run", "--filter", "@sheetwrite/example-site", "build"],
  },
  {
    id: "verify:example-xlsx-isolation",
    command: ["bun", "scripts/verify-example-xlsx-isolation.ts"],
  },
];

export const EXAMPLE_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:@sheetwrite/example-site",
    command: ["bun", "run", "--filter", "@sheetwrite/example-site", "typecheck"],
    diagnosticPolicy: "astro",
  },
];

export const VERIFICATION_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:verification",
    command: ["bunx", "tsc", "--noEmit", "-p", "tsconfig.verification.json"],
  },
  {
    id: "typecheck:consumer-nodenext",
    command: ["bunx", "tsc", "--noEmit", "-p", "test/consumer-nodenext"],
  },
];

export const BENCH_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:@sheetwrite/bench",
    command: ["bun", "run", "--filter", "@sheetwrite/bench", "typecheck"],
  },
];

export const TYPECHECK_NODES: readonly CommandNode[] = [
  ...PACKAGE_TYPECHECK_NODES,
  ...BENCH_TYPECHECK_NODES,
  ...EXAMPLE_TYPECHECK_NODES,
  ...VERIFICATION_TYPECHECK_NODES,
];

const TOOLING_TESTS: CommandNode = {
  id: "test:tooling-contracts",
  command: [
    "bun",
    "test",
    "scripts/toolchain-contract.test.ts",
    "scripts/workspace-tooling.test.ts",
    "scripts/dependency-audit.test.ts",
    "scripts/verify-clean-build.test.ts",
    "scripts/size-report.test.ts",
  ],
};

export const VERIFY_CI_NODES: readonly CommandNode[] = [
  TOOLING_TESTS,
  {
    id: "audit:javascript",
    command: ["bun", "scripts/dependency-audit.ts"],
  },
  {
    id: "test:rust",
    command: ["cargo", "test"],
    cwd: "packages/wasm",
  },
  {
    id: "audit:rust",
    command: ["cargo", "audit"],
    cwd: "packages/wasm",
  },
  ...PACKAGE_BUILD_NODES,
  {
    id: "verify:exports",
    command: ["bun", "scripts/verify-clean-build.ts", "--validate-current"],
  },
  ...TYPECHECK_NODES,
  {
    id: "lint",
    command: ["bun", "run", "lint"],
  },
  {
    id: "test:unit",
    command: [
      "bun",
      "test",
      "packages",
      "test/browser/canvas-assertions.test.ts",
      "scripts/public-api.test.ts",
      "bench/test",
    ],
  },
  ...EXAMPLE_BUILD_NODES,
  {
    id: "verify:node-esm",
    command: ["bun", "run", "verify:node-esm"],
  },
  {
    id: "verify:packed",
    command: ["bun", "run", "verify:packed"],
  },
  {
    id: "verify:bundlers",
    command: ["bun", "run", "verify:bundlers"],
  },
  {
    id: "verify:public-api",
    command: ["bun", "run", "api:check"],
  },
  {
    id: "verify:benchmarks",
    command: ["bun", "run", "--filter", "@sheetwrite/bench", "bench:verify"],
  },
  {
    id: "verify:delivery-size",
    command: ["bun", "scripts/size-report.ts", "check", "--reuse-bundlers"],
  },
];

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(readFileSync(path, "utf8")) as WorkspaceManifest;
}

function internalDependencies(manifest: WorkspaceManifest): readonly string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ].filter((name) => name.startsWith("@sheetwrite/"));
}

export function validateWorkspaceGraph(
  root: string,
  packageOrder: readonly string[] = PUBLISHABLE_PACKAGE_ORDER,
): void {
  const packagesRoot = resolve(root, "packages");
  const manifests = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readManifest(resolve(packagesRoot, entry.name, "package.json")));
  const packageManifests = new Map(
    manifests.flatMap((manifest) => (manifest.name ? [[manifest.name, manifest] as const] : [])),
  );
  const graphSet = new Set(packageOrder);
  if (graphSet.size !== packageOrder.length) {
    throw new Error("The publishable package graph contains a duplicate package");
  }

  const required = manifests
    .filter(
      (manifest) => manifest.publishConfig !== undefined || manifest.scripts?.build !== undefined,
    )
    .map((manifest) => manifest.name)
    .filter((name): name is string => name !== undefined)
    .sort();
  const missing = required.filter((name) => !graphSet.has(name));
  const unknown = packageOrder.filter((name) => !packageManifests.has(name));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `Canonical package graph mismatch (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`,
    );
  }

  for (const [index, name] of packageOrder.entries()) {
    const manifest = packageManifests.get(name);
    if (!manifest?.scripts?.build) {
      throw new Error(`${name} must declare a build script`);
    }
    if (!manifest.scripts.typecheck) {
      throw new Error(`${name} must declare a typecheck script`);
    }
    for (const dependency of internalDependencies(manifest)) {
      const dependencyIndex = packageOrder.indexOf(dependency);
      if (dependencyIndex >= 0 && dependencyIndex >= index) {
        throw new Error(`${name} must run after its dependency ${dependency}`);
      }
    }
  }

  for (const relativePath of ["bench/package.json", "examples/site/package.json"]) {
    const manifest = readManifest(resolve(root, relativePath));
    if (!manifest.scripts?.typecheck) {
      throw new Error(`${manifest.name ?? relativePath} must declare a typecheck script`);
    }
  }
}

export function assertUniqueOrderedNodes(nodes: readonly CommandNode[]): void {
  const ids = nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("The command graph contains a duplicate node");
  }
  const buildIds = PACKAGE_BUILD_NODES.map((node) => node.id);
  const positions = buildIds.map((id) => ids.indexOf(id));
  const presentBuilds = positions.filter((position) => position >= 0);
  if (presentBuilds.length > 0 && presentBuilds.length !== buildIds.length) {
    throw new Error("The command graph omits a package build node");
  }
  if (
    positions.some(
      (position, index) => position >= 0 && index > 0 && position <= (positions[index - 1] ?? -1),
    )
  ) {
    throw new Error("Package build nodes are not dependency ordered");
  }
}

function assertCleanAstroDiagnostics(output: string): void {
  if (/Couldn(?:'|’)t find package|Cannot find package/i.test(output)) {
    throw new Error("Astro emitted a package-resolution diagnostic");
  }
  if (/\b[1-9]\d* (?:errors?|warnings?|hints?)\b/i.test(output)) {
    throw new Error("Astro emitted non-zero diagnostics");
  }
}

async function executeNode(root: string, node: CommandNode): Promise<void> {
  console.log(`::workspace-node::${node.id}`);
  const capture = node.diagnosticPolicy !== undefined;
  const child = Bun.spawn([...node.command], {
    cwd: resolve(root, node.cwd ?? "."),
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdin: "inherit",
    stdout: capture ? "pipe" : "inherit",
    stderr: capture ? "pipe" : "inherit",
  });
  if (capture) {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    const output = `${stdout}\n${stderr}`;
    if (node.diagnosticPolicy === "astro") assertCleanAstroDiagnostics(output);
    if (exitCode !== 0) throw new Error(`${node.id} failed with exit code ${exitCode}`);
    return;
  }
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${node.id} failed with exit code ${exitCode}`);
}

export async function runNodes(root: string, nodes: readonly CommandNode[]): Promise<void> {
  assertUniqueOrderedNodes(nodes);
  for (const node of nodes) await executeNode(root, node);
}

function nodesForMode(mode: string): readonly CommandNode[] {
  switch (mode) {
    case "build":
      return PACKAGE_BUILD_NODES;
    case "build-examples":
      return EXAMPLE_BUILD_NODES;
    case "typecheck-packages":
      return PACKAGE_TYPECHECK_NODES;
    case "typecheck-examples":
      return EXAMPLE_TYPECHECK_NODES;
    case "typecheck-bench":
      return BENCH_TYPECHECK_NODES;
    case "typecheck":
      return TYPECHECK_NODES;
    case "verify-ci":
      return VERIFY_CI_NODES;
    default:
      throw new Error(`Unknown workspace tooling mode: ${mode}`);
  }
}

export async function main(
  args: readonly string[],
  root = resolve(import.meta.dir, ".."),
): Promise<void> {
  const mode = args.find((argument) => !argument.startsWith("--"));
  if (!mode) throw new Error("A workspace tooling mode is required");
  validateWorkspaceGraph(root);
  const nodes = nodesForMode(mode);
  if (args.includes("--dry-run")) {
    for (const node of nodes) {
      console.log(
        `${node.id}\t${node.command.map((argument) => JSON.stringify(argument)).join(" ")}`,
      );
    }
    return;
  }
  await runNodes(root, nodes);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
