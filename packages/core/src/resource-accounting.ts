import type { ResourceOwnerBytes } from "./types/store.js";
export type { ResourceOwnerBytes } from "./types/store.js";

/** Stable protocol for runtime ownership and operation-cost reports. */
export const RUNTIME_RESOURCE_SCHEMA_VERSION = 2 as const;
/** Flat WASM store-memory protocol version; decoders reject any mismatch. */
export const STORE_MEMORY_PROTOCOL_VERSION = 3 as const;
/** Version of the deterministic hash-table capacity estimate used by store owners. */
export const STORE_MEMORY_HASH_ESTIMATE_VERSION = 1 as const;

/** Stable ordered owner list encoded by the WASM store-memory protocol. */
export const WASM_MEMORY_OWNERS = [
  "wasm.dense.kinds",
  "wasm.dense.payloads",
  "wasm.dense.styles",
  "wasm.paged.kinds",
  "wasm.paged.payloads",
  "wasm.paged.styles",
  "wasm.paged.loaded-bitmaps",
  "wasm.paged.dirty-bitmaps",
  "wasm.paged.indexes",
  "wasm.string-pool.utf8",
  "wasm.string-pool.spans",
  "wasm.string-index",
  "wasm.formulas",
  "wasm.dependency-nodes",
  "wasm.dependency-edges",
  "wasm.sheet-indexes-metadata",
  "wasm.spill-ranges",
  "wasm.spill-owners",
  "wasm.spill-blockers",
] as const;

/** One retained-memory owner reported by the WASM cell store. */
export type WasmMemoryOwner = (typeof WASM_MEMORY_OWNERS)[number];
/** User-visible operation whose retained and transient resource costs are measured. */
export type RuntimeResourceOperation =
  | "startup"
  | "scroll"
  | "ingest"
  | "edit"
  | "dirty-clear"
  | "formula-recompute"
  | "auto-fit"
  | "export"
  | "snapshot"
  | "persistence"
  | "teardown";
/** Measurement point within one resource-accounted operation. */
export type RuntimeResourcePhase = "before" | "peak" | "settled" | "after-destroy";
/** Direction of a measured JS/WASM boundary crossing. */
export type BoundaryDirection = "js-to-wasm" | "wasm-to-js";
/** Whether a measured boundary crossing transfers one scalar or a packed batch. */
export type BoundaryTransferKind = "bulk" | "scalar";

/** Decoded, fail-closed retained-memory ownership report from the WASM store. */
export interface StoreMemoryBreakdown {
  readonly protocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
  readonly hashTableEstimateVersion: typeof STORE_MEMORY_HASH_ESTIMATE_VERSION;
  readonly owners: readonly ResourceOwnerBytes[];
  readonly logicalLiveBytes: number;
  readonly allocatedCapacityBytes: number;
  /** Linear-memory pages are a runtime observation and are never summed into live payload. */
  readonly wasmCommittedBytes: number | null;
  /** Allocator internals are intentionally not fabricated from `size_of_val`. */
  readonly allocatorMarginBytes: number | null;
  readonly unaccountedBytes: number;
}

/** Fixed-cardinality boundary crossing counters for one operation. */
export interface BoundaryOperationStats {
  readonly operation: RuntimeResourceOperation;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly largestTransferBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
}

/** Available runtime-level memory observations, kept separate from retained owner totals. */
export interface RuntimeMemoryObservation {
  readonly usedJSHeapSize: number | null;
  readonly arrayBufferBytes: number | null;
  readonly externalBytes: number | null;
  readonly browserBackingStoreBytes: number | null;
}

/** Operation-scoped transient peak, excluded from retained owner totals. */
export interface TransientResourcePeak {
  readonly owner: string;
  readonly peakBytes: number;
  readonly allocations: number;
  readonly measurement: "instrumented-operation-peak";
}

/** Complete retained-resource and boundary snapshot for one operation phase. */
export interface RuntimeResourceSnapshot {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly phase: RuntimeResourcePhase;
  readonly wasm: StoreMemoryBreakdown;
  readonly jsOwners: readonly ResourceOwnerBytes[];
  readonly boundary: readonly BoundaryOperationStats[];
  readonly runtime: RuntimeMemoryObservation;
  readonly totals: {
    /** Sum of owner logical bytes only. Boundary and runtime observations are excluded. */
    readonly logicalLiveBytes: number;
    /** Sum of owner allocated bytes only. Boundary and runtime observations are excluded. */
    readonly allocatedCapacityBytes: number;
  };
}

export interface ResourceOwnerDelta {
  readonly owner: string;
  readonly logicalBytes: number;
  readonly allocatedBytes: number;
  readonly entries: number;
}

/** Owner and runtime deltas between two phases of the same operation. */
export interface RuntimeResourcePhaseDelta {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly from: RuntimeResourcePhase;
  readonly to: RuntimeResourcePhase;
  readonly owners: readonly ResourceOwnerDelta[];
  readonly runtime: {
    readonly usedJSHeapSize: number | null;
    readonly arrayBufferBytes: number | null;
    readonly externalBytes: number | null;
    readonly browserBackingStoreBytes: number | null;
  };
}

interface MutableBoundaryOperationStats {
  ffiCalls: number;
  jsToWasmBytes: number;
  wasmToJsBytes: number;
  largestTransferBytes: number;
  bulkCalls: number;
  scalarCalls: number;
}

const RESOURCE_OPERATIONS = [
  "startup",
  "scroll",
  "ingest",
  "edit",
  "dirty-clear",
  "formula-recompute",
  "auto-fit",
  "export",
  "snapshot",
  "persistence",
  "teardown",
] as const satisfies readonly RuntimeResourceOperation[];

const OPERATION_INDEX: Record<RuntimeResourceOperation, number> = {
  startup: 0,
  scroll: 1,
  ingest: 2,
  edit: 3,
  "dirty-clear": 4,
  "formula-recompute": 5,
  "auto-fit": 6,
  export: 7,
  snapshot: 8,
  persistence: 9,
  teardown: 10,
};

/** Fixed-cardinality counters: recording a boundary crossing never appends a trace event. */
export class BoundaryResourceAccounting {
  private readonly counters: MutableBoundaryOperationStats[] = RESOURCE_OPERATIONS.map(() => ({
    ffiCalls: 0,
    jsToWasmBytes: 0,
    wasmToJsBytes: 0,
    largestTransferBytes: 0,
    bulkCalls: 0,
    scalarCalls: 0,
  }));

  record(
    operation: RuntimeResourceOperation,
    direction: BoundaryDirection,
    bytes: number,
    kind: BoundaryTransferKind,
    calls = 1,
    largestTransferBytes = bytes,
  ): void {
    assertNonNegativeSafeInteger(bytes, "boundary bytes");
    assertNonNegativeSafeInteger(calls, "boundary calls");
    assertNonNegativeSafeInteger(largestTransferBytes, "largest boundary transfer bytes");
    const counter = this.counters[OPERATION_INDEX[operation]]!;
    const nextFfiCalls = safeCounterSum(counter.ffiCalls, calls, "boundary FFI calls");
    const nextJsToWasm =
      direction === "js-to-wasm"
        ? safeCounterSum(counter.jsToWasmBytes, bytes, "JS-to-WASM bytes")
        : counter.jsToWasmBytes;
    const nextWasmToJs =
      direction === "wasm-to-js"
        ? safeCounterSum(counter.wasmToJsBytes, bytes, "WASM-to-JS bytes")
        : counter.wasmToJsBytes;
    const nextBulkCalls =
      kind === "bulk"
        ? safeCounterSum(counter.bulkCalls, calls, "bulk boundary calls")
        : counter.bulkCalls;
    const nextScalarCalls =
      kind === "scalar"
        ? safeCounterSum(counter.scalarCalls, calls, "scalar boundary calls")
        : counter.scalarCalls;
    counter.ffiCalls = nextFfiCalls;
    counter.jsToWasmBytes = nextJsToWasm;
    counter.wasmToJsBytes = nextWasmToJs;
    counter.largestTransferBytes = Math.max(counter.largestTransferBytes, largestTransferBytes);
    counter.bulkCalls = nextBulkCalls;
    counter.scalarCalls = nextScalarCalls;
  }

  reset(): void {
    for (const counter of this.counters) {
      counter.ffiCalls = 0;
      counter.jsToWasmBytes = 0;
      counter.wasmToJsBytes = 0;
      counter.largestTransferBytes = 0;
      counter.bulkCalls = 0;
      counter.scalarCalls = 0;
    }
  }

  snapshot(): BoundaryOperationStats[] {
    return RESOURCE_OPERATIONS.map((operation, index) => ({
      operation,
      ...this.counters[index]!,
    }));
  }
}

/** Decode the flat Rust protocol and fail closed on version/order/total drift. */
export function decodeStoreMemoryStats(
  encoded: ArrayLike<number>,
  wasmCommittedBytes: number | null,
): StoreMemoryBreakdown {
  const expectedLength = 5 + WASM_MEMORY_OWNERS.length * 3;
  if (encoded.length !== expectedLength) {
    throw new Error(`Store memory protocol length ${encoded.length}; expected ${expectedLength}`);
  }
  if (encoded[0] !== STORE_MEMORY_PROTOCOL_VERSION) {
    throw new Error(`Unsupported store memory protocol ${encoded[0]}`);
  }
  if (encoded[1] !== WASM_MEMORY_OWNERS.length) {
    throw new Error(
      `Store memory owner count ${encoded[1]}; expected ${WASM_MEMORY_OWNERS.length}`,
    );
  }
  if (encoded[2] !== STORE_MEMORY_HASH_ESTIMATE_VERSION) {
    throw new Error(`Unsupported hash-table estimate ${encoded[2]}`);
  }

  const owners: ResourceOwnerBytes[] = [];
  for (let index = 0; index < WASM_MEMORY_OWNERS.length; index++) {
    const offset = 3 + index * 3;
    const logicalBytes = encoded[offset]!;
    const allocatedBytes = encoded[offset + 1]!;
    const entries = encoded[offset + 2]!;
    assertOwnerValues(WASM_MEMORY_OWNERS[index]!, logicalBytes, allocatedBytes, entries);
    owners.push({
      owner: WASM_MEMORY_OWNERS[index]!,
      logicalBytes,
      allocatedBytes,
      entries,
      measurement:
        index === 7 ||
        index === 8 ||
        index === 11 ||
        index === 12 ||
        index === 13 ||
        index === 15 ||
        index === 16 ||
        index === 17
          ? "hash-capacity-v1"
          : "exact-capacity",
    });
  }
  const logicalLiveBytes = encoded[encoded.length - 2]!;
  const allocatedCapacityBytes = encoded[encoded.length - 1]!;
  const ownerLogical = sumOwnerBytes(owners, "logicalBytes");
  const ownerAllocated = sumOwnerBytes(owners, "allocatedBytes");
  if (logicalLiveBytes !== ownerLogical || allocatedCapacityBytes !== ownerAllocated) {
    throw new Error(
      `Store memory totals drift: encoded ${logicalLiveBytes}/${allocatedCapacityBytes}, owners ${ownerLogical}/${ownerAllocated}`,
    );
  }
  if (wasmCommittedBytes !== null)
    assertNonNegativeSafeInteger(wasmCommittedBytes, "WASM committed bytes");
  return {
    protocolVersion: STORE_MEMORY_PROTOCOL_VERSION,
    hashTableEstimateVersion: STORE_MEMORY_HASH_ESTIMATE_VERSION,
    owners,
    logicalLiveBytes,
    allocatedCapacityBytes,
    wasmCommittedBytes,
    allocatorMarginBytes: null,
    unaccountedBytes: 0,
  };
}

/** Construct a zero-owner store report when no WASM store is available. */
export function emptyStoreMemoryStats(wasmCommittedBytes: number | null): StoreMemoryBreakdown {
  const encoded = new Float64Array(5 + WASM_MEMORY_OWNERS.length * 3);
  encoded[0] = STORE_MEMORY_PROTOCOL_VERSION;
  encoded[1] = WASM_MEMORY_OWNERS.length;
  encoded[2] = STORE_MEMORY_HASH_ESTIMATE_VERSION;
  return decodeStoreMemoryStats(encoded, wasmCommittedBytes);
}

/** Build and validate one operation-phase snapshot without double-counting runtime observations. */
export function createRuntimeResourceSnapshot(input: {
  operation: RuntimeResourceOperation;
  phase: RuntimeResourcePhase;
  wasm: StoreMemoryBreakdown;
  jsOwners?: readonly ResourceOwnerBytes[];
  boundary?: readonly BoundaryOperationStats[];
  runtime?: RuntimeMemoryObservation;
}): RuntimeResourceSnapshot {
  const jsOwners = input.jsOwners ? [...input.jsOwners] : [];
  const boundary = input.boundary ? [...input.boundary] : [];
  for (const owner of jsOwners) {
    assertOwnerValues(owner.owner, owner.logicalBytes, owner.allocatedBytes, owner.entries);
  }
  const totals = {
    logicalLiveBytes: input.wasm.logicalLiveBytes + sumOwnerBytes(jsOwners, "logicalBytes"),
    allocatedCapacityBytes:
      input.wasm.allocatedCapacityBytes + sumOwnerBytes(jsOwners, "allocatedBytes"),
  };
  const snapshot: RuntimeResourceSnapshot = {
    schemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    operation: input.operation,
    phase: input.phase,
    wasm: input.wasm,
    jsOwners,
    boundary,
    runtime: input.runtime ?? observeRuntimeMemory(),
    totals,
  };
  assertRuntimeResourceSnapshot(snapshot);
  return snapshot;
}

/** Reject overlap, negative values, and attempts to fold runtime observations into owner totals. */
export function assertRuntimeResourceSnapshot(snapshot: RuntimeResourceSnapshot): void {
  if (snapshot.schemaVersion !== RUNTIME_RESOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported runtime resource schema ${snapshot.schemaVersion}`);
  }
  const owners = [...snapshot.wasm.owners, ...snapshot.jsOwners];
  const seen = new Set<string>();
  for (const owner of owners) {
    if (seen.has(owner.owner)) throw new Error(`Resource owner counted twice: ${owner.owner}`);
    seen.add(owner.owner);
    assertOwnerValues(owner.owner, owner.logicalBytes, owner.allocatedBytes, owner.entries);
  }
  if (snapshot.wasm.unaccountedBytes !== 0) {
    throw new Error(`Unaccounted WASM bytes: ${snapshot.wasm.unaccountedBytes}`);
  }
  const logical = sumOwnerBytes(owners, "logicalBytes");
  const allocated = sumOwnerBytes(owners, "allocatedBytes");
  if (
    snapshot.totals.logicalLiveBytes !== logical ||
    snapshot.totals.allocatedCapacityBytes !== allocated
  ) {
    throw new Error(
      `Runtime resource totals double-count or omit bytes: ${snapshot.totals.logicalLiveBytes}/${snapshot.totals.allocatedCapacityBytes} != ${logical}/${allocated}`,
    );
  }
}

/** Diff two validated phases of the same operation by exclusive resource owner. */
export function diffRuntimeResourcePhases(
  before: RuntimeResourceSnapshot,
  after: RuntimeResourceSnapshot,
): RuntimeResourcePhaseDelta {
  if (before.operation !== after.operation) {
    throw new Error(`Cannot diff ${before.operation} against ${after.operation}`);
  }
  assertRuntimeResourceSnapshot(before);
  assertRuntimeResourceSnapshot(after);
  const beforeOwners = new Map(
    [...before.wasm.owners, ...before.jsOwners].map((owner) => [owner.owner, owner] as const),
  );
  const afterOwners = new Map(
    [...after.wasm.owners, ...after.jsOwners].map((owner) => [owner.owner, owner] as const),
  );
  const names = new Set([...beforeOwners.keys(), ...afterOwners.keys()]);
  const owners = [...names].sort().map((owner): ResourceOwnerDelta => {
    const previous = beforeOwners.get(owner);
    const next = afterOwners.get(owner);
    return {
      owner,
      logicalBytes: (next?.logicalBytes ?? 0) - (previous?.logicalBytes ?? 0),
      allocatedBytes: (next?.allocatedBytes ?? 0) - (previous?.allocatedBytes ?? 0),
      entries: (next?.entries ?? 0) - (previous?.entries ?? 0),
    };
  });
  return {
    schemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    operation: before.operation,
    from: before.phase,
    to: after.phase,
    owners,
    runtime: {
      usedJSHeapSize: nullableDelta(before.runtime.usedJSHeapSize, after.runtime.usedJSHeapSize),
      arrayBufferBytes: nullableDelta(
        before.runtime.arrayBufferBytes,
        after.runtime.arrayBufferBytes,
      ),
      externalBytes: nullableDelta(before.runtime.externalBytes, after.runtime.externalBytes),
      browserBackingStoreBytes: nullableDelta(
        before.runtime.browserBackingStoreBytes,
        after.runtime.browserBackingStoreBytes,
      ),
    },
  };
}

/** Observe runtime memory buckets available in the current JS host without fabricating missing data. */
export function observeRuntimeMemory(): RuntimeMemoryObservation {
  const performanceMemory = (
    globalThis.performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  const processMemory = (
    globalThis as typeof globalThis & {
      process?: { memoryUsage?: () => { arrayBuffers?: number; external?: number } };
    }
  ).process?.memoryUsage?.();
  const usedJSHeapSize = finiteObservation(performanceMemory?.usedJSHeapSize);
  const arrayBufferBytes = finiteObservation(processMemory?.arrayBuffers);
  const externalBytes = finiteObservation(processMemory?.external);
  return {
    usedJSHeapSize,
    arrayBufferBytes,
    externalBytes,
    // Chromium's backing-store bucket is only available through CDP metrics;
    // browser benchmarks inject it into the serialized artifact separately.
    browserBackingStoreBytes: null,
  };
}

function sumOwnerBytes(
  owners: readonly ResourceOwnerBytes[],
  field: "logicalBytes" | "allocatedBytes",
): number {
  return owners.reduce((total, owner) => total + owner[field], 0);
}

function assertOwnerValues(
  owner: string,
  logicalBytes: number,
  allocatedBytes: number,
  entries: number,
): void {
  if (!owner) throw new Error("Resource owner name must not be empty");
  assertNonNegativeSafeInteger(logicalBytes, `${owner} logical bytes`);
  assertNonNegativeSafeInteger(allocatedBytes, `${owner} allocated bytes`);
  assertNonNegativeSafeInteger(entries, `${owner} entries`);
  if (allocatedBytes < logicalBytes) {
    throw new Error(`${owner} allocated bytes ${allocatedBytes} are below logical ${logicalBytes}`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer; received ${value}`);
  }
}

function finiteObservation(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function safeCounterSum(current: number, increment: number, name: string): number {
  const value = current + increment;
  if (!Number.isSafeInteger(value)) throw new Error(`${name} exceeded Number.MAX_SAFE_INTEGER`);
  return value;
}

function nullableDelta(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : after - before;
}
