// Shared PersistenceAdapter conformance exercise. Deliberately free of any
// test-framework and runtime core imports so the same checks run under the
// bun unit runner (MemoryPersistenceAdapter) and inside a browser fixture
// (the docs IndexedDB showcase adapter) without bundling a second core copy.
import type {
  DocumentOp,
  PersistenceAdapter,
  PersistenceCommitResponse,
  WorkbookSnapshot,
} from "../packages/core/src/index.js";

export const PERSISTENCE_CONFORMANCE_DOCUMENT_ID = "persistence-conformance";

/** Seed workbook every conforming adapter under test starts from. */
export function makePersistenceConformanceSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: PERSISTENCE_CONFORMANCE_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Conformance",
        order: 0,
        rowCount: 8,
        columns: [
          { key: "a", header: "A", width: 120, type: "number" },
          { key: "b", header: "B", width: 120, type: "number" },
        ],
        cells: [],
      },
    ],
  };
}

export interface PersistenceConformanceHarness {
  adapter: PersistenceAdapter;
  /**
   * Optional restart simulation: return a fresh adapter over the same durable
   * storage. Enables the reload-persistence and durable-idempotency checks.
   */
  reopen?: () => Promise<PersistenceAdapter>;
  /**
   * Optional bounded-recovery probe: commit this many extra transactions,
   * then require a conflict from the original base version to answer with a
   * full snapshot instead of an operation tail. Only adapters with bounded
   * tails (compaction or conflict-tail ceilings) pass this section.
   */
  boundedConflictTail?: { overflowCommits: number };
}

export interface PersistenceConformanceReport {
  /** Stable names of every passed check, in execution order. */
  checks: string[];
  /** Adapter head version when the exercise finished. */
  headVersion: number;
}

function fail(check: string, detail: string): never {
  throw new Error(`Persistence conformance failed at "${check}": ${detail}`);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function setLiteral(row: number, col: number, value: number): DocumentOp {
  return { op: "set", addr: { sheet: "s1", row, col }, value: { kind: "literal", value } };
}

/** Reads a literal cell value back out of a snapshot's block layout. */
export function readSnapshotLiteral(
  snapshot: WorkbookSnapshot,
  sheetId: string,
  row: number,
  col: number,
): unknown {
  const sheet = snapshot.sheets.find((entry) => entry.id === sheetId);
  if (!sheet) return undefined;
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (block.startRow + cell.rowOffset === row && block.startCol + cell.colOffset === col) {
        return cell.value.kind === "literal" ? cell.value.value : cell.value;
      }
    }
  }
  return undefined;
}

function assertConflictShape(
  check: string,
  response: PersistenceCommitResponse,
  baseVersion: number,
): asserts response is Extract<PersistenceCommitResponse, { status: "conflict" }> {
  if (response.status !== "conflict") {
    fail(check, `expected conflict, received ${response.status}`);
  }
  if (response.currentVersion <= baseVersion) {
    fail(check, `conflict currentVersion ${response.currentVersion} must exceed ${baseVersion}`);
  }
  const tail = response.operationsSinceBase;
  if (tail !== undefined) {
    let expected = baseVersion + 1;
    for (const operation of tail) {
      if (operation.version !== expected) {
        fail(check, `conflict tail is not contiguous at version ${operation.version}`);
      }
      expected += 1;
    }
    if (tail.at(-1)?.version !== response.currentVersion) {
      fail(check, "conflict tail must end at currentVersion");
    }
    return;
  }
  if (response.snapshot === undefined) {
    fail(check, "conflict must carry an operation tail or a snapshot");
  }
  if ((response.snapshot.version ?? 0) !== response.currentVersion) {
    fail(check, "conflict snapshot version must equal currentVersion");
  }
}

/**
 * Runs the shared persistence semantics against one adapter: snapshot load,
 * versioned append, duplicate idempotency, base-version conflicts with
 * recoverable payloads, abort propagation, and (optionally) bounded conflict
 * tails plus reload durability. Throws on the first violation.
 */
export async function runPersistenceConformance(
  harness: PersistenceConformanceHarness,
): Promise<PersistenceConformanceReport> {
  const documentId = PERSISTENCE_CONFORMANCE_DOCUMENT_ID;
  const checks: string[] = [];
  let adapter = harness.adapter;

  let check = "loads the seeded snapshot";
  const seeded = await adapter.load(documentId);
  if (seeded.documentId !== documentId) fail(check, `wrong documentId ${seeded.documentId}`);
  const baseVersion = seeded.version ?? 0;
  checks.push(check);

  check = "rejects unknown documents with not-found";
  try {
    await adapter.load("missing-document");
    fail(check, "load resolved for an unknown document");
  } catch (error) {
    if (errorCode(error) !== "not-found") {
      fail(check, `expected code not-found, received ${errorCode(error) ?? String(error)}`);
    }
  }
  checks.push(check);

  check = "applies a commit at the current base version";
  const first = await adapter.commit({
    documentId,
    baseVersion,
    clientMutationId: "conformance-m1",
    operations: [setLiteral(0, 0, 21)],
  });
  if (first.status !== "applied" || first.version !== baseVersion + 1) {
    fail(check, `expected applied@${baseVersion + 1}, received ${JSON.stringify(first)}`);
  }
  if (first.clientMutationId !== "conformance-m1") {
    fail(check, "applied response must echo the client mutation id");
  }
  checks.push(check);

  check = "materializes applied operations into load";
  const afterFirst = await adapter.load(documentId);
  if ((afterFirst.version ?? 0) !== baseVersion + 1) {
    fail(check, `loaded version ${afterFirst.version} != ${baseVersion + 1}`);
  }
  if (readSnapshotLiteral(afterFirst, "s1", 0, 0) !== 21) {
    fail(check, "committed literal was not readable from the loaded snapshot");
  }
  checks.push(check);

  check = "returns duplicate for a replayed mutation id";
  const replay = await adapter.commit({
    documentId,
    baseVersion,
    clientMutationId: "conformance-m1",
    operations: [setLiteral(0, 0, 21)],
  });
  if (replay.status !== "duplicate" || replay.version !== baseVersion + 1) {
    fail(check, `expected duplicate@${baseVersion + 1}, received ${JSON.stringify(replay)}`);
  }
  checks.push(check);

  check = "answers stale base versions with a recoverable conflict";
  const conflicted = await adapter.commit({
    documentId,
    baseVersion,
    clientMutationId: "conformance-m2",
    operations: [setLiteral(1, 0, 7)],
  });
  assertConflictShape(check, conflicted, baseVersion);
  checks.push(check);

  check = "applies the rebased commit after conflict recovery";
  const rebased = await adapter.commit({
    documentId,
    baseVersion: conflicted.currentVersion,
    clientMutationId: "conformance-m2",
    operations: [setLiteral(1, 0, 7)],
  });
  if (rebased.status !== "applied" || rebased.version !== conflicted.currentVersion + 1) {
    fail(
      check,
      `expected applied@${conflicted.currentVersion + 1}, got ${JSON.stringify(rebased)}`,
    );
  }
  checks.push(check);
  let headVersion = rebased.version;

  check = "rejects an already-aborted commit signal";
  const aborted = new AbortController();
  aborted.abort();
  try {
    await adapter.commit({
      documentId,
      baseVersion: headVersion,
      clientMutationId: "conformance-aborted",
      operations: [setLiteral(1, 1, 99)],
      signal: aborted.signal,
    });
    fail(check, "commit resolved despite an aborted signal");
  } catch (error) {
    if (errorCode(error) !== "aborted") {
      fail(check, `expected code aborted, received ${errorCode(error) ?? String(error)}`);
    }
  }
  if (((await adapter.load(documentId)).version ?? 0) !== headVersion) {
    fail(check, "aborted commit must not advance the head version");
  }
  checks.push(check);

  if (harness.boundedConflictTail) {
    check = "falls back to a snapshot once the conflict tail is out of reach";
    for (let index = 0; index < harness.boundedConflictTail.overflowCommits; index++) {
      const fill = await adapter.commit({
        documentId,
        baseVersion: headVersion,
        clientMutationId: `conformance-fill-${index}`,
        operations: [setLiteral(2, 0, index)],
      });
      if (fill.status !== "applied") fail(check, `fill commit ${index} was ${fill.status}`);
      headVersion = fill.version;
    }
    const distant = await adapter.commit({
      documentId,
      baseVersion,
      clientMutationId: "conformance-distant",
      operations: [setLiteral(3, 0, 1)],
    });
    assertConflictShape(check, distant, baseVersion);
    if (distant.operationsSinceBase !== undefined) {
      fail(check, "distant conflict must not replay an unbounded operation tail");
    }
    checks.push(check);

    check = "keeps duplicate detection across compaction";
    const replayAfterCompaction = await adapter.commit({
      documentId,
      baseVersion,
      clientMutationId: "conformance-m1",
      operations: [setLiteral(0, 0, 21)],
    });
    if (
      replayAfterCompaction.status !== "duplicate" ||
      replayAfterCompaction.version !== baseVersion + 1
    ) {
      fail(
        check,
        `expected duplicate@${baseVersion + 1}, got ${JSON.stringify(replayAfterCompaction)}`,
      );
    }
    checks.push(check);
  }

  if (harness.reopen) {
    check = "persists committed state across reopen";
    adapter = await harness.reopen();
    const reloaded = await adapter.load(documentId);
    if ((reloaded.version ?? 0) !== headVersion) {
      fail(check, `reopened version ${reloaded.version} != ${headVersion}`);
    }
    if (readSnapshotLiteral(reloaded, "s1", 0, 0) !== 21) {
      fail(check, "committed literal did not survive reopen");
    }
    checks.push(check);

    check = "keeps duplicate detection across reopen";
    const durableReplay = await adapter.commit({
      documentId,
      baseVersion,
      clientMutationId: "conformance-m1",
      operations: [setLiteral(0, 0, 21)],
    });
    if (durableReplay.status !== "duplicate" || durableReplay.version !== baseVersion + 1) {
      fail(check, `expected duplicate@${baseVersion + 1}, got ${JSON.stringify(durableReplay)}`);
    }
    checks.push(check);
  }

  return { checks, headVersion };
}
