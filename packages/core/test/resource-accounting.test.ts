import { describe, expect, it } from "bun:test";
import {
  assertRuntimeResourceSnapshot,
  BoundaryResourceAccounting,
  createRuntimeResourceSnapshot,
  decodeStoreMemoryStats,
  diffRuntimeResourcePhases,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  WASM_MEMORY_OWNERS,
  type ResourceOwnerBytes,
  type RuntimeResourceSnapshot,
} from "../src/resource-accounting.js";

function encodedStoreMemory(
  overrides: Partial<Record<(typeof WASM_MEMORY_OWNERS)[number], [number, number, number]>> = {},
) {
  const encoded = [1, WASM_MEMORY_OWNERS.length, 1];
  let logical = 0;
  let allocated = 0;
  for (const owner of WASM_MEMORY_OWNERS) {
    const values = overrides[owner] ?? [0, 0, 0];
    encoded.push(...values);
    logical += values[0];
    allocated += values[1];
  }
  encoded.push(logical, allocated);
  return encoded;
}

function jsOwner(
  owner: string,
  logicalBytes: number,
  allocatedBytes = logicalBytes,
): ResourceOwnerBytes {
  return {
    owner,
    logicalBytes,
    allocatedBytes,
    entries: logicalBytes === 0 ? 0 : 1,
    measurement: "typed-array-byte-length",
  };
}

describe("runtime resource accounting", () => {
  it("decodes exact tiny-owner totals without treating committed pages as live bytes", () => {
    const wasm = decodeStoreMemoryStats(
      encodedStoreMemory({
        "wasm.dense.kinds": [2, 4, 2],
        "wasm.dense.payloads": [16, 32, 2],
        "wasm.string-pool.utf8": [3, 8, 3],
      }),
      64 * 1024,
    );
    expect(wasm.logicalLiveBytes).toBe(21);
    expect(wasm.allocatedCapacityBytes).toBe(44);
    expect(wasm.wasmCommittedBytes).toBe(64 * 1024);

    const snapshot = createRuntimeResourceSnapshot({
      operation: "startup",
      phase: "settled",
      wasm,
      jsOwners: [jsOwner("js.datasource.loaded", 5, 8)],
      runtime: {
        usedJSHeapSize: 999_999,
        arrayBufferBytes: 777,
        externalBytes: 888,
        browserBackingStoreBytes: 666,
      },
    });
    expect(snapshot.totals).toEqual({ logicalLiveBytes: 26, allocatedCapacityBytes: 52 });
  });

  it("rejects owner overlap and committed/backing-store double counting", () => {
    const wasm = decodeStoreMemoryStats(encodedStoreMemory(), 64 * 1024);
    const valid = createRuntimeResourceSnapshot({
      operation: "scroll",
      phase: "peak",
      wasm,
      jsOwners: [jsOwner("js.viewport.buffers", 32)],
      runtime: {
        usedJSHeapSize: 100,
        arrayBufferBytes: 200,
        externalBytes: 300,
        browserBackingStoreBytes: 400,
      },
    });
    const duplicate = {
      ...valid,
      jsOwners: [...valid.jsOwners, jsOwner("wasm.dense.kinds", 1)],
      totals: { logicalLiveBytes: 33, allocatedCapacityBytes: 33 },
    } satisfies RuntimeResourceSnapshot;
    expect(() => assertRuntimeResourceSnapshot(duplicate)).toThrow("counted twice");

    const doubleCounted = {
      ...valid,
      totals: {
        logicalLiveBytes: valid.totals.logicalLiveBytes + wasm.wasmCommittedBytes!,
        allocatedCapacityBytes: valid.totals.allocatedCapacityBytes,
      },
    } satisfies RuntimeResourceSnapshot;
    expect(() => assertRuntimeResourceSnapshot(doubleCounted)).toThrow("double-count or omit");
  });

  it("fails closed on protocol drift, negatives, capacity inversion, and unaccounted bytes", () => {
    const badVersion = encodedStoreMemory();
    badVersion[0] = 2;
    expect(() => decodeStoreMemoryStats(badVersion, null)).toThrow(
      "Unsupported store memory protocol",
    );

    const negative = encodedStoreMemory();
    negative[3] = -1;
    negative[negative.length - 2] = -1;
    expect(() => decodeStoreMemoryStats(negative, null)).toThrow("non-negative safe integer");

    const inverted = encodedStoreMemory({ "wasm.dense.kinds": [2, 1, 2] });
    expect(() => decodeStoreMemoryStats(inverted, null)).toThrow("below logical");

    const wasm = decodeStoreMemoryStats(encodedStoreMemory(), null);
    const snapshot = createRuntimeResourceSnapshot({
      operation: "ingest",
      phase: "settled",
      wasm,
    });
    expect(() =>
      assertRuntimeResourceSnapshot({
        ...snapshot,
        wasm: { ...snapshot.wasm, unaccountedBytes: 1 },
      }),
    ).toThrow("Unaccounted WASM bytes");
  });

  it("keeps boundary work in bounded per-operation counters", () => {
    const counters = new BoundaryResourceAccounting();
    counters.record("scroll", "js-to-wasm", 16, "bulk");
    counters.record("scroll", "wasm-to-js", 80, "bulk", 2);
    counters.record("edit", "js-to-wasm", 8, "scalar");

    const scroll = counters.snapshot().find((entry) => entry.operation === "scroll")!;
    expect(scroll).toEqual({
      operation: "scroll",
      ffiCalls: 3,
      jsToWasmBytes: 16,
      wasmToJsBytes: 80,
      largestTransferBytes: 80,
      bulkCalls: 3,
      scalarCalls: 0,
    });
    expect(counters.snapshot()).toHaveLength(11);

    counters.reset();
    expect(counters.snapshot().every((entry) => entry.ffiCalls === 0)).toBe(true);
  });

  it("reports owner and runtime phase deltas without mutating either snapshot", () => {
    const wasm = decodeStoreMemoryStats(encodedStoreMemory(), null);
    const before = createRuntimeResourceSnapshot({
      operation: "edit",
      phase: "before",
      wasm,
      runtime: {
        usedJSHeapSize: 100,
        arrayBufferBytes: 20,
        externalBytes: null,
        browserBackingStoreBytes: null,
      },
    });
    const after = createRuntimeResourceSnapshot({
      operation: "edit",
      phase: "settled",
      wasm,
      jsOwners: [jsOwner("js.history.snapshots", 64, 80)],
      runtime: {
        usedJSHeapSize: 180,
        arrayBufferBytes: 44,
        externalBytes: null,
        browserBackingStoreBytes: null,
      },
    });
    const delta = diffRuntimeResourcePhases(before, after);
    expect(delta.schemaVersion).toBe(RUNTIME_RESOURCE_SCHEMA_VERSION);
    expect(delta.owners.find((owner) => owner.owner === "js.history.snapshots")).toEqual({
      owner: "js.history.snapshots",
      logicalBytes: 64,
      allocatedBytes: 80,
      entries: 1,
    });
    expect(delta.runtime).toEqual({
      usedJSHeapSize: 80,
      arrayBufferBytes: 24,
      externalBytes: null,
      browserBackingStoreBytes: null,
    });
    expect(before.jsOwners).toEqual([]);
  });
});
