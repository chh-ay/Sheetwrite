import { describe, expect, it } from "bun:test";
import {
  assertCleanMatrixCapture,
  decideWasmProfile,
  parseWasmProfileMatrix,
} from "../src/wasm-profile-matrix.js";

const HASH = {
  input: "a".repeat(64),
  runner: "b".repeat(64),
  tool: "c".repeat(64),
  evidence: "d".repeat(64),
  stdout: "e".repeat(64),
  stderr: "f".repeat(64),
} as const;
const COMMIT = "1".repeat(40);

function gate(wasmSha256: string, kind: "formula" | "render") {
  return {
    status: "passed",
    commands:
      kind === "formula"
        ? [["bun", "run", "bench:formula"]]
        : [
            ["bun", "run", "bench:render"],
            ["bun", "run", "bench:check"],
          ],
    exitCode: 0,
    artifactPath: `bench/results/candidate-${wasmSha256.slice(0, 8)}.json`,
    evidenceSha256: wasmSha256,
    wasmSha256,
    commit: COMMIT,
    runnerFingerprint: HASH.runner,
  };
}

function fixture() {
  const variants = [
    { wasmOpt: "-O3", rawBytes: 1_000, gzipBytes: 500, brotliBytes: 400, hash: "2" },
    { wasmOpt: "-Os", rawBytes: 950, gzipBytes: 480, brotliBytes: 390, hash: "3" },
    { wasmOpt: "-Oz", rawBytes: 900, gzipBytes: 470, brotliBytes: 380, hash: "4" },
  ].map(({ wasmOpt, rawBytes, gzipBytes, brotliBytes, hash }) => {
    const artifactSha256 = hash.repeat(64);
    return {
      wasmOpt,
      inputWasmSha256: HASH.input,
      artifact: { rawBytes, gzipBytes, brotliBytes, sha256: artifactSha256 },
      formulaGate: gate(artifactSha256, "formula"),
      renderGate: gate(artifactSha256, "render"),
    };
  });
  return {
    schemaVersion: 1,
    protocol: "wasm-post-link-profile-matrix-v1",
    provenance: {
      commit: COMMIT,
      dirty: false,
      timestamp: "2026-08-09T12:00:00.000Z",
      host: "controlled-host",
      rustc: "rustc 1.90.0",
      cargo: "cargo 1.90.0",
      wasmPack: "wasm-pack 0.13.1",
      wasmOptVersion: "wasm-opt version 123",
      wasmOptSha256: HASH.tool,
      bun: "1.3.14",
    },
    rustProfile: { optLevel: 3, lto: "fat", codegenUnits: 1 },
    postLink: {
      inputWasmSha256: HASH.input,
      compression: { gzipLevel: 9, brotliQuality: 11, brotliMode: "generic" },
    },
    decisionPolicy: {
      sizeMetric: "brotliBytes",
      requireFormulaGate: true,
      requireRenderGate: true,
    },
    captureOrder: {
      formula: ["-O3", "-Oz", "-Os"],
      render: ["-Os", "-O3", "-Oz"],
    },
    variants,
    storeOnlyProbe: {
      provenance: {
        commit: COMMIT,
        dirty: false,
        timestamp: "2026-08-09T12:01:00.000Z",
      },
      command: [
        "cargo",
        "check",
        "--target",
        "wasm32-unknown-unknown",
        "--no-default-features",
        "--message-format=json",
      ],
      outcome: "blocked",
      exitCode: 101,
      stdoutSha256: HASH.stdout,
      stderrSha256: HASH.stderr,
      blockers: [
        {
          id: "formula-entry-ast",
          kind: "dependency-cycle",
          owner: "types::FormulaEntry::ast",
          dependency: "calc::Ast",
          reason: "stored syntax crosses the boundary",
        },
        {
          id: "dependency-index",
          kind: "dependency-cycle",
          owner: "store::CellStore::dep_index",
          dependency: "eval::DepIndex",
          reason: "dependency state crosses the boundary",
        },
      ],
    },
  };
}

describe("WASM post-link matrix evidence", () => {
  it("keeps Rust opt-level separate and selects by the declared Brotli policy", () => {
    const parsed = parseWasmProfileMatrix(fixture());
    expect(parsed.rustProfile.optLevel).toBe(3);
    expect(parsed.variants.map(({ wasmOpt }) => wasmOpt)).toEqual(["-O3", "-Os", "-Oz"]);
    expect(decideWasmProfile(parsed)).toEqual({
      status: "recommended",
      wasmOpt: "-Oz",
      baseline: "-O3",
      savedBytes: { raw: 100, gzip: 30, brotli: 20 },
    });
  });

  it("treats tracked and untracked worktree entries as dirty capture inputs", () => {
    expect(() => assertCleanMatrixCapture(" M packages/wasm/Cargo.toml")).toThrow(
      "requires a completely clean tree",
    );
    expect(() => assertCleanMatrixCapture("?? local-input.wasm")).toThrow(
      "requires a completely clean tree",
    );
    expect(() => assertCleanMatrixCapture("")).not.toThrow();
  });

  it("rejects a matrix that changes the Rust optimization knob", () => {
    const evidence = fixture();
    evidence.rustProfile.optLevel = 2;
    expect(() => parseWasmProfileMatrix(evidence)).toThrow("rustProfile.optLevel must be 3");
  });

  it("rejects variants that do not share one pre-post-link artifact", () => {
    const evidence = fixture();
    evidence.variants[1]!.inputWasmSha256 = "9".repeat(64);
    expect(() => parseWasmProfileMatrix(evidence)).toThrow(
      "-Os did not use the shared pre-post-link artifact",
    );
  });

  it("rejects incomplete profiles and size evidence", () => {
    const missingProfile = fixture();
    missingProfile.variants.pop();
    expect(() => parseWasmProfileMatrix(missingProfile)).toThrow(
      "variants must contain -O3, -Os, and -Oz exactly once",
    );

    const missingSize = fixture();
    Reflect.deleteProperty(missingSize.variants[2]!.artifact, "gzipBytes");
    expect(() => parseWasmProfileMatrix(missingSize)).toThrow("artifact.gzipBytes");
  });

  it("rejects non-gating and report-only benchmark commands", () => {
    const preliminary = fixture();
    preliminary.variants[0]!.formulaGate.commands = [
      ["bun", "run", "bench:formula", "--preliminary"],
    ];
    expect(() => parseWasmProfileMatrix(preliminary)).toThrow(
      "must run the gating formula benchmark",
    );

    const reportOnly = fixture();
    reportOnly.variants[0]!.renderGate.commands[1]!.push("--report-only");
    expect(() => parseWasmProfileMatrix(reportOnly)).toThrow(
      "must run the render capture and fail-closed check",
    );
  });

  it("rejects attempts to opt out of either required performance gate", () => {
    const evidence = fixture();
    evidence.decisionPolicy.requireRenderGate = false;
    expect(() => parseWasmProfileMatrix(evidence)).toThrow(
      "decisionPolicy.requireRenderGate must be true",
    );
  });

  it("rejects dirty or unmatched runner provenance", () => {
    const dirty = fixture();
    dirty.provenance.dirty = true;
    expect(() => parseWasmProfileMatrix(dirty)).toThrow("provenance.dirty must be false");

    const unmatched = fixture();
    unmatched.variants[2]!.renderGate.runnerFingerprint = "9".repeat(64);
    expect(() => parseWasmProfileMatrix(unmatched)).toThrow(
      "renderGate runner provenance is incomparable",
    );
  });

  it("blocks the decision when any formula or render gate fails", () => {
    const formulaFailure = fixture();
    formulaFailure.variants[2]!.formulaGate.status = "failed";
    formulaFailure.variants[2]!.formulaGate.exitCode = 1;
    expect(decideWasmProfile(formulaFailure)).toEqual({
      status: "blocked",
      failures: ["-Oz formula gate failed"],
    });

    const renderFailure = fixture();
    renderFailure.variants[1]!.renderGate.status = "failed";
    renderFailure.variants[1]!.renderGate.exitCode = 1;
    expect(decideWasmProfile(renderFailure)).toEqual({
      status: "blocked",
      failures: ["-Os render gate failed"],
    });
  });

  it("requires both structural blockers when the store-only probe is blocked", () => {
    const parsed = parseWasmProfileMatrix(fixture());
    expect(parsed.storeOnlyProbe.outcome).toBe("blocked");
    expect(parsed.storeOnlyProbe.blockers.map(({ id }) => id)).toEqual([
      "formula-entry-ast",
      "dependency-index",
    ]);

    const incomplete = fixture();
    incomplete.storeOnlyProbe.blockers.pop();
    expect(() => parseWasmProfileMatrix(incomplete)).toThrow(
      "must report both dependency-cycle blockers",
    );
  });

  it("binds the store-only probe to the clean matrix commit", () => {
    const mismatched = fixture();
    mismatched.storeOnlyProbe.provenance.commit = "9".repeat(40);
    expect(() => parseWasmProfileMatrix(mismatched)).toThrow(
      "storeOnlyProbe commit does not match matrix provenance",
    );

    const dirty = fixture();
    dirty.storeOnlyProbe.provenance.dirty = true;
    expect(() => parseWasmProfileMatrix(dirty)).toThrow(
      "storeOnlyProbe.provenance.dirty must be false",
    );
  });

  it("does not let a successful probe retain blocker claims", () => {
    const evidence = fixture();
    evidence.storeOnlyProbe.outcome = "compiled";
    evidence.storeOnlyProbe.exitCode = 0;
    expect(() => parseWasmProfileMatrix(evidence)).toThrow(
      "compiled store-only probe cannot claim dependency-cycle blockers",
    );
  });

  it("blocks a recommendation when the compile probe failure is unclassified", () => {
    const evidence = fixture();
    evidence.storeOnlyProbe.outcome = "failed";
    evidence.storeOnlyProbe.blockers = [];
    expect(decideWasmProfile(evidence)).toEqual({
      status: "blocked",
      failures: ["store-only compile probe failed without a classified outcome"],
    });
  });

  it("rejects build-only captures as recommendation evidence", () => {
    const evidence = fixture();
    evidence.protocol = "wasm-post-link-build-capture-v1";
    Reflect.deleteProperty(evidence, "captureOrder");
    expect(() => decideWasmProfile(evidence)).toThrow(
      'protocol must be "wasm-post-link-profile-matrix-v1"',
    );
  });
});
