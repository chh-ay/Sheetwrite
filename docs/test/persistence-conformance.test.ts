import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { initSheetwrite, MemoryPersistenceAdapter } from "@sheetwrite/core";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import {
  makePersistenceConformanceSnapshot,
  runPersistenceConformance,
} from "../../test/persistence-conformance.js";
import {
  type ShowcaseDatabaseStats,
  ShowcaseIndexedDbAdapter,
} from "../src/showcases/showcase-database.ts";

const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
const keyRangeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
});

afterEach(() => {
  if (indexedDbDescriptor) Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
  else Reflect.deleteProperty(globalThis, "indexedDB");
  if (keyRangeDescriptor) Object.defineProperty(globalThis, "IDBKeyRange", keyRangeDescriptor);
  else Reflect.deleteProperty(globalThis, "IDBKeyRange");
});

const SHARED_CHECKS = [
  "loads the seeded snapshot",
  "rejects unknown documents with not-found",
  "applies a commit at the current base version",
  "materializes applied operations into load",
  "returns duplicate for a replayed mutation id",
  "answers stale base versions with a recoverable conflict",
  "applies the rebased commit after conflict recovery",
  "rejects an already-aborted commit signal",
] as const;

describe("persistence conformance", () => {
  it("passes against the in-memory reference adapter", async () => {
    const adapter = new MemoryPersistenceAdapter(makePersistenceConformanceSnapshot());
    const report = await runPersistenceConformance({ adapter });
    expect(report.checks).toEqual([...SHARED_CHECKS]);
    expect(report.headVersion).toBe(2);
  });

  it("passes against the IndexedDB showcase adapter with bounded tails and reopen", async () => {
    const options = {
      databaseName: "sheetwrite-conformance",
      compaction: { maxTailRecords: 4 },
      maxConflictTailVersions: 4,
    };
    let adapter = await ShowcaseIndexedDbAdapter.open(
      makePersistenceConformanceSnapshot(),
      options,
    );
    let writerStats: ShowcaseDatabaseStats | undefined;
    const report = await runPersistenceConformance({
      adapter,
      boundedConflictTail: { overflowCommits: 8 },
      reopen: async () => {
        writerStats = adapter.stats();
        adapter.close();
        adapter = await ShowcaseIndexedDbAdapter.open(
          makePersistenceConformanceSnapshot(),
          options,
        );
        return adapter;
      },
    });
    expect(report.checks).toEqual([
      ...SHARED_CHECKS,
      "falls back to a snapshot once the conflict tail is out of reach",
      "keeps duplicate detection across compaction",
      "persists committed state across reopen",
      "keeps duplicate detection across reopen",
    ]);
    // Eight fill commits over a four-record ceiling must have compacted: the
    // snapshot record advances while the surviving tail stays bounded. Write
    // gauges belong to the instance that performed the commits; the reopened
    // instance proves reads and durable state.
    const stats = adapter.stats();
    expect(report.headVersion).toBe(10);
    expect(stats.currentVersion).toBe(10);
    expect(stats.snapshotVersion).toBeGreaterThan(0);
    expect(stats.tailLength).toBeLessThanOrEqual(4);
    expect(stats.reads).toBeGreaterThan(0);
    expect(stats.storedBytes).toBeGreaterThan(0);
    expect(writerStats?.writes ?? 0).toBeGreaterThan(0);
    adapter.close();
  });

  it("compacts on byte pressure alone", async () => {
    const adapter = await ShowcaseIndexedDbAdapter.open(makePersistenceConformanceSnapshot(), {
      databaseName: "sheetwrite-byte-compaction",
      compaction: { maxTailRecords: 1_000, maxTailBytes: 1 },
    });
    const applied = await adapter.commit({
      documentId: "persistence-conformance",
      baseVersion: 0,
      clientMutationId: "byte-compaction-m1",
      operations: [
        { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 5 } },
      ],
    });
    expect(applied.status).toBe("applied");
    const stats = adapter.stats();
    expect(stats.snapshotVersion).toBe(1);
    expect(stats.currentVersion).toBe(1);
    expect(stats.tailLength).toBe(0);
    adapter.close();
  });
});
