import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";
import {
  assertCleanMatrixCapture,
  decideWasmProfile,
  type MatrixGateEvidence,
  parseWasmProfileMatrix,
  type StoreOnlyProbe,
  WASM_OPT_PROFILES,
  type WasmOptProfile,
} from "../bench/src/wasm-profile-matrix.js";

const ROOT = resolve(import.meta.dir, "..");
const WASM_CRATE = resolve(ROOT, "packages/wasm");
const STORE_ONLY_COMMAND = [
  "cargo",
  "check",
  "--target",
  "wasm32-unknown-unknown",
  "--no-default-features",
  "--message-format=json",
] as const;
const STORE_ONLY_SENTINEL = "SHEETWRITE_STORE_ONLY_BLOCKED";

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

interface BuildVariant {
  readonly wasmOpt: WasmOptProfile;
  readonly inputWasmSha256: string;
  readonly artifactPath: string;
  readonly artifact: {
    readonly rawBytes: number;
    readonly gzipBytes: number;
    readonly brotliBytes: number;
    readonly sha256: string;
  };
}

interface BuildCapture {
  readonly schemaVersion: number;
  readonly protocol: string;
  readonly provenance: { readonly commit: string; readonly dirty: false };
  readonly rustProfile: unknown;
  readonly postLink: unknown;
  readonly variants: readonly BuildVariant[];
}

interface GateCapture extends MatrixGateEvidence {
  readonly wasmOpt: WasmOptProfile;
}

interface GateCaptureManifest {
  readonly schemaVersion: number;
  readonly protocol: string;
  readonly gate: "formula" | "render";
  readonly captures: readonly GateCapture[];
}

function gateEvidence(capture: GateCapture): MatrixGateEvidence {
  return {
    status: capture.status,
    commands: capture.commands,
    exitCode: capture.exitCode,
    artifactPath: capture.artifactPath,
    evidenceSha256: capture.evidenceSha256,
    wasmSha256: capture.wasmSha256,
    commit: capture.commit,
    runnerFingerprint: capture.runnerFingerprint,
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function run(command: readonly string[], cwd = ROOT): CommandResult {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function successfulOutput(command: readonly string[], cwd = ROOT): string {
  const result = run(command, cwd);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed: ${Buffer.from(result.stderr).toString("utf8").trim()}`,
    );
  }
  return Buffer.from(result.stdout).toString("utf8").trim();
}

function argument(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function optionalArgument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`${name} requires a value`);
  return value;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertControlledCargoProfile(): void {
  const cargo = readFileSync(resolve(WASM_CRATE, "Cargo.toml"), "utf8");
  const release = cargo.match(/\[profile\.release\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";
  if (
    !/^opt-level\s*=\s*3\s*$/mu.test(release) ||
    !/^lto\s*=\s*"fat"\s*$/mu.test(release) ||
    !/^codegen-units\s*=\s*1\s*$/mu.test(release)
  ) {
    throw new Error("Cargo release profile must remain opt-level=3, lto=fat, codegen-units=1");
  }
}

function assertCleanTree(): string {
  const commit = successfulOutput(["git", "rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("git returned a non-full commit hash");
  assertCleanMatrixCapture(
    successfulOutput(["git", "status", "--porcelain", "--untracked-files=all"]),
  );
  return commit;
}

function compressedSizes(data: Uint8Array): {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
} {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

function postLink(
  wasmOptPath: string,
  inputPath: string,
  outputDirectory: string,
  outputRoot: string,
): BuildVariant[] {
  const input = readFileSync(inputPath);
  const inputWasmSha256 = sha256(input);
  const variants: BuildVariant[] = [];
  for (const wasmOpt of WASM_OPT_PROFILES) {
    const label = wasmOpt.slice(1).toLowerCase();
    const temporaryOutput = resolve(outputDirectory, `sheetwrite-${label}.wasm`);
    const result = run([wasmOptPath, inputPath, wasmOpt, "-o", temporaryOutput]);
    if (result.exitCode !== 0) {
      throw new Error(`${wasmOpt} failed: ${Buffer.from(result.stderr).toString("utf8").trim()}`);
    }
    const artifact = readFileSync(temporaryOutput);
    const artifactPath = resolve(outputRoot, "artifacts", `sheetwrite-${label}.wasm`);
    mkdirSync(dirname(artifactPath), { recursive: true });
    copyFileSync(temporaryOutput, artifactPath);
    variants.push({
      wasmOpt,
      inputWasmSha256,
      artifactPath,
      artifact: {
        ...compressedSizes(artifact),
        sha256: sha256(artifact),
      },
    });
  }
  return variants;
}

function captureBuild(args: readonly string[]): void {
  assertControlledCargoProfile();
  const commit = assertCleanTree();
  const wasmOptPath = resolve(argument(args, "--wasm-opt"));
  const output = resolve(argument(args, "--output"));
  const outputRoot = dirname(output);
  const temporary = mkdtempSync(join(tmpdir(), "sheetwrite-wasm-profile-"));
  try {
    const buildDirectory = resolve(temporary, "unoptimized");
    const build = run(
      [
        "wasm-pack",
        "build",
        "--target",
        "web",
        "--release",
        "--no-opt",
        "--out-dir",
        buildDirectory,
      ],
      WASM_CRATE,
    );
    if (build.exitCode !== 0) {
      throw new Error(
        `wasm-pack build failed: ${Buffer.from(build.stderr).toString("utf8").trim()}`,
      );
    }
    const inputPath = resolve(buildDirectory, "sheetwrite_wasm_bg.wasm");
    const variants = postLink(wasmOptPath, inputPath, temporary, outputRoot);
    const wasmOptBytes = readFileSync(wasmOptPath);
    const capture = {
      schemaVersion: 1,
      protocol: "wasm-post-link-build-capture-v1",
      provenance: {
        commit,
        dirty: false,
        timestamp: new Date().toISOString(),
        host: hostname(),
        rustc: successfulOutput(["rustc", "--version"]),
        cargo: successfulOutput(["cargo", "--version"]),
        wasmPack: successfulOutput(["wasm-pack", "--version"]),
        wasmOptVersion: successfulOutput([wasmOptPath, "--version"]),
        wasmOptSha256: sha256(wasmOptBytes),
        bun: Bun.version,
      },
      rustProfile: { optLevel: 3, lto: "fat", codegenUnits: 1 },
      postLink: {
        inputWasmSha256: variants[0]!.inputWasmSha256,
        compression: { gzipLevel: 9, brotliQuality: 11, brotliMode: "generic" },
      },
      variants,
      completion: {
        status: "gates-required",
        required: ["formulaGate", "renderGate", "storeOnlyProbe"],
      },
    };
    writeJson(output, capture);
    process.stdout.write(`${output}\n`);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function captureStoreOnlyProbe(args: readonly string[]): void {
  const commit = assertCleanTree();
  const output = resolve(argument(args, "--output"));
  const result = run(STORE_ONLY_COMMAND, WASM_CRATE);
  const stdoutText = Buffer.from(result.stdout).toString("utf8");
  const stderrText = Buffer.from(result.stderr).toString("utf8");
  const recognizedBlock =
    result.exitCode !== 0 && `${stdoutText}\n${stderrText}`.includes(STORE_ONLY_SENTINEL);
  const outcome: StoreOnlyProbe["outcome"] =
    result.exitCode === 0 ? "compiled" : recognizedBlock ? "blocked" : "failed";
  const blockers: StoreOnlyProbe["blockers"] = recognizedBlock
    ? [
        {
          id: "formula-entry-ast",
          kind: "dependency-cycle",
          owner: "types::FormulaEntry::ast",
          dependency: "calc::Ast",
          reason: "stored formula syntax is owned by the data-store type graph",
        },
        {
          id: "dependency-index",
          kind: "dependency-cycle",
          owner: "store::CellStore::dep_index",
          dependency: "eval::DepIndex",
          reason: "recalculation dependency state is owned directly by CellStore",
        },
      ]
    : [];
  const probe: StoreOnlyProbe = {
    provenance: {
      commit,
      dirty: false,
      timestamp: new Date().toISOString(),
    },
    command: STORE_ONLY_COMMAND,
    outcome,
    exitCode: result.exitCode,
    stdoutSha256: sha256(result.stdout),
    stderrSha256: sha256(result.stderr),
    blockers,
  };
  writeJson(output, probe);
  process.stdout.write(`${output}: ${outcome}\n`);
  if (outcome === "failed") process.exitCode = 1;
}

function readGateManifest(path: string, expectedGate: "formula" | "render"): GateCaptureManifest {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as GateCaptureManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.protocol !== "wasm-post-link-gate-capture-v1" ||
    manifest.gate !== expectedGate ||
    !Array.isArray(manifest.captures)
  ) {
    throw new Error(`${expectedGate} gate manifest has the wrong protocol or gate kind`);
  }
  const modes = manifest.captures.map(({ wasmOpt }) => wasmOpt);
  if (
    modes.length !== WASM_OPT_PROFILES.length ||
    new Set(modes).size !== WASM_OPT_PROFILES.length ||
    !WASM_OPT_PROFILES.every((profile) => modes.includes(profile))
  ) {
    throw new Error(`${expectedGate} gate manifest must capture -O3, -Os, and -Oz exactly once`);
  }
  return manifest;
}

function assertCaptureFiles(build: BuildCapture, manifests: readonly GateCaptureManifest[]): void {
  for (const variant of build.variants) {
    const actual = sha256(readFileSync(resolve(ROOT, variant.artifactPath)));
    if (actual !== variant.artifact.sha256) {
      throw new Error(`${variant.wasmOpt} build artifact hash no longer matches its capture`);
    }
  }
  for (const manifest of manifests) {
    for (const capture of manifest.captures) {
      const actual = sha256(readFileSync(resolve(ROOT, capture.artifactPath)));
      if (actual !== capture.evidenceSha256) {
        throw new Error(
          `${manifest.gate}/${capture.wasmOpt} evidence hash does not match its file`,
        );
      }
    }
  }
}

function assemble(args: readonly string[]): void {
  const build = JSON.parse(
    readFileSync(resolve(argument(args, "--build")), "utf8"),
  ) as BuildCapture;
  if (
    build.schemaVersion !== 1 ||
    build.protocol !== "wasm-post-link-build-capture-v1" ||
    !Array.isArray(build.variants)
  ) {
    throw new Error("build input is not a WASM post-link build capture");
  }
  const formula = readGateManifest(resolve(argument(args, "--formula-gates")), "formula");
  const render = readGateManifest(resolve(argument(args, "--render-gates")), "render");
  const storeOnlyProbe = JSON.parse(
    readFileSync(resolve(argument(args, "--store-probe")), "utf8"),
  ) as StoreOnlyProbe;
  if (
    storeOnlyProbe.provenance.dirty !== false ||
    storeOnlyProbe.provenance.commit !== build.provenance.commit
  ) {
    throw new Error("store-only probe must come from the clean build capture commit");
  }
  assertCaptureFiles(build, [formula, render]);
  const formulaByProfile = new Map(formula.captures.map((capture) => [capture.wasmOpt, capture]));
  const renderByProfile = new Map(render.captures.map((capture) => [capture.wasmOpt, capture]));
  const matrix = {
    schemaVersion: 1,
    protocol: "wasm-post-link-profile-matrix-v1",
    provenance: build.provenance,
    rustProfile: build.rustProfile,
    postLink: build.postLink,
    decisionPolicy: {
      sizeMetric: "brotliBytes",
      requireFormulaGate: true,
      requireRenderGate: true,
    },
    captureOrder: {
      formula: formula.captures.map(({ wasmOpt }) => wasmOpt),
      render: render.captures.map(({ wasmOpt }) => wasmOpt),
    },
    variants: build.variants.map((variant) => {
      const formulaCapture = formulaByProfile.get(variant.wasmOpt);
      const renderCapture = renderByProfile.get(variant.wasmOpt);
      if (!formulaCapture || !renderCapture) {
        throw new Error(`${variant.wasmOpt} is missing gate evidence`);
      }
      const formulaGate = gateEvidence(formulaCapture);
      const renderGate = gateEvidence(renderCapture);
      return {
        wasmOpt: variant.wasmOpt,
        inputWasmSha256: variant.inputWasmSha256,
        artifact: variant.artifact,
        formulaGate,
        renderGate,
      };
    }),
    storeOnlyProbe,
  };
  const parsed = parseWasmProfileMatrix(matrix);
  const output = resolve(argument(args, "--output"));
  writeJson(output, parsed);
  const decision = decideWasmProfile(parsed);
  process.stdout.write(`${output}\n${JSON.stringify(decision, null, 2)}\n`);
  if (decision.status === "blocked") process.exitCode = 1;
}

function decide(args: readonly string[]): void {
  const input = resolve(argument(args, "--input"));
  const raw = JSON.parse(readFileSync(input, "utf8")) as unknown;
  const evidence = parseWasmProfileMatrix(raw);
  const decision = decideWasmProfile(evidence);
  const output = optionalArgument(args, "--output");
  if (output) writeJson(resolve(output), decision);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  if (decision.status === "blocked") process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === "build") captureBuild(args);
else if (command === "probe-store") captureStoreOnlyProbe(args);
else if (command === "assemble") assemble(args);
else if (command === "decide") decide(args);
else {
  throw new Error(
    `usage:\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} build --wasm-opt PATH --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} probe-store --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} assemble --build PATH --formula-gates PATH --render-gates PATH --store-probe PATH --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} decide --input PATH [--output PATH]`,
  );
}
