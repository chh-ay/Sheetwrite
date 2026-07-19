import {
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncStateSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import "@sheetwrite/core/styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShowcaseLinkError, ShowcaseNetworkLink } from "./collaboration-protocol.js";
import {
  DATABASE_DOCUMENT_ID,
  DATABASE_TOTAL_CELL,
  deleteShowcaseDatabase,
  makeDatabaseSeedSnapshot,
  type ShowcaseDatabaseStats,
  ShowcaseIndexedDbAdapter,
} from "./showcase-database.js";

const DOCUMENT_DATABASE = "sheetwrite-showcase-database";
const QUEUE_DATABASE = "sheetwrite-showcase-database-queue";
const COMPACTION = { maxTailRecords: 8, maxTailBytes: 64 * 1024 } as const;
const LOG_LIMIT = 14;
const SAMPLE_ROWS = 5;

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

interface LogEntry {
  id: number;
  kind: "info" | "commit" | "warn" | "error";
  text: string;
}

interface DatabaseSession {
  adapter: ShowcaseIndexedDbAdapter;
  link: ShowcaseNetworkLink;
  storage: IndexedDbPendingCommitStorage;
  grid: Grid;
  sync: SyncCoordinator;
  disposers: Array<() => void>;
}

interface SessionCallbacks {
  onStats(stats: ShowcaseDatabaseStats): void;
  onSyncState(state: SyncStateSnapshot): void;
  onLog(kind: LogEntry["kind"], text: string): void;
  onConflict(response: ConflictResponse): void;
  autosave(): boolean;
}

let nextMutation = 1;

function createMutationId(): string {
  return `dbx-${Date.now().toString(36)}-${nextMutation++}`;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`;
}

/** Attaches the storage-gauge and sync-event listeners one session needs. */
function wireSession(session: DatabaseSession, callbacks: SessionCallbacks): void {
  const { adapter, sync } = session;
  session.disposers.push(adapter.subscribeStats(callbacks.onStats));
  session.disposers.push(
    sync.on((event) => {
      switch (event.type) {
        case "state":
          callbacks.onSyncState(event.state);
          break;
        case "pending":
          if (callbacks.autosave()) {
            void sync.flush().catch(() => {
              // Failures are surfaced through the "error" event below.
            });
          }
          break;
        case "acknowledged":
          callbacks.onLog(
            "commit",
            event.duplicate
              ? `Duplicate acknowledgement for ${event.clientMutationId}: already stored as v${event.version}, applied once`
              : `Committed v${event.version} (${event.clientMutationId})`,
          );
          break;
        case "restored":
          if (event.pending.length > 0) {
            callbacks.onLog(
              "info",
              `Restored ${event.pending.length} durable pending commit${event.pending.length === 1 ? "" : "s"} from IndexedDB`,
            );
          }
          break;
        case "conflict":
          callbacks.onLog(
            "warn",
            `Base-version conflict at v${event.mutation.baseVersion}: another writer reached v${event.response.currentVersion} first`,
          );
          callbacks.onConflict(event.response);
          break;
        case "error":
          if (event.error instanceof ShowcaseLinkError) {
            callbacks.onLog("warn", event.error.message);
          } else {
            callbacks.onLog(
              "error",
              event.error instanceof Error ? event.error.message : String(event.error),
            );
          }
          break;
        default:
          break;
      }
    }),
  );
}

async function openSession(
  host: HTMLElement,
  callbacks: SessionCallbacks,
): Promise<DatabaseSession> {
  await initSheetwrite();
  const adapter = await ShowcaseIndexedDbAdapter.open(makeDatabaseSeedSnapshot(), {
    databaseName: DOCUMENT_DATABASE,
    compaction: COMPACTION,
    maxConflictTailVersions: 16,
  });
  const snapshot = await adapter.load(DATABASE_DOCUMENT_ID);
  host.replaceChildren();
  const grid = createGridFromSnapshot(host, snapshot);
  const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE });
  const link = new ShowcaseNetworkLink(adapter);
  const sync = new SyncCoordinator(grid, link, {
    documentId: DATABASE_DOCUMENT_ID,
    serverVersion: snapshot.version ?? 0,
    pendingStorage: storage,
    createMutationId,
  });
  const session: DatabaseSession = { adapter, link, storage, grid, sync, disposers: [] };
  wireSession(session, callbacks);
  await sync.ready();
  if (sync.pendingCount > 0 && callbacks.autosave()) {
    await sync.flush().catch(() => {});
  }
  callbacks.onSyncState(sync.state);
  callbacks.onStats(adapter.stats());
  return session;
}

function disposeSession(session: DatabaseSession, keepStores = false): void {
  for (const dispose of session.disposers) dispose();
  session.disposers.length = 0;
  session.sync.destroy();
  session.grid.destroy();
  if (!keepStores) {
    session.storage.close();
    session.adapter.close();
  }
}

export default function DatabaseShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DatabaseSession | null>(null);
  const autosaveRef = useRef(true);
  const logIdRef = useRef(0);
  const busyRef = useRef(false);
  const snapshotVersionRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusDetail, setStatusDetail] = useState("Opening IndexedDB…");
  const [stats, setStats] = useState<ShowcaseDatabaseStats | null>(null);
  const [syncState, setSyncState] = useState<SyncStateSnapshot | null>(null);
  const [autosave, setAutosave] = useState(true);
  const [total, setTotal] = useState<string>("–");
  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = useCallback((kind: LogEntry["kind"], text: string) => {
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, kind, text };
    setLog((entries) => [entry, ...entries].slice(0, LOG_LIMIT));
  }, []);

  const readTotal = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const resolved = session.grid.store.getCell(DATABASE_TOTAL_CELL).resolved;
    setTotal(
      typeof resolved === "number" ? resolved.toLocaleString("en-US") : String(resolved ?? "–"),
    );
  }, []);

  // One stable callback object; handlers always read the latest closure state
  // through refs, so remounted sessions never hold stale listeners.
  const callbacksRef = useRef<SessionCallbacks>(null as unknown as SessionCallbacks);
  callbacksRef.current = {
    onStats: (next) => {
      const previous = snapshotVersionRef.current;
      if (previous !== null && next.snapshotVersion > previous) {
        pushLog(
          "info",
          `Compacted: operation tail folded into snapshot v${next.snapshotVersion}, tail length ${next.tailLength}`,
        );
      }
      snapshotVersionRef.current = next.snapshotVersion;
      setStats(next);
      readTotal();
    },
    onSyncState: (state) => {
      setSyncState(state);
      readTotal();
    },
    onLog: pushLog,
    onConflict: (response) => {
      void recoverFromConflict(response);
    },
    autosave: () => autosaveRef.current,
  };
  const stableCallbacks = useRef<SessionCallbacks>({
    onStats: (next) => callbacksRef.current.onStats(next),
    onSyncState: (state) => callbacksRef.current.onSyncState(state),
    onLog: (kind, text) => callbacksRef.current.onLog(kind, text),
    onConflict: (response) => callbacksRef.current.onConflict(response),
    autosave: () => callbacksRef.current.autosave(),
  }).current;

  const boot = useCallback(
    async (announce: string | null) => {
      const host = hostRef.current;
      if (!host) return;
      setStatus("loading");
      setStatusDetail("Opening IndexedDB…");
      try {
        const session = await openSession(host, stableCallbacks);
        sessionRef.current = session;
        snapshotVersionRef.current = session.adapter.stats().snapshotVersion;
        setStatus("ready");
        setStatusDetail("Live against real IndexedDB");
        readTotal();
        if (announce) pushLog("info", announce);
      } catch (error) {
        setStatus("error");
        setStatusDetail(error instanceof Error ? error.message : String(error));
      }
    },
    [pushLog, readTotal, stableCallbacks],
  );

  useEffect(() => {
    let cancelled = false;
    void boot(null).then(() => {
      if (cancelled && sessionRef.current) {
        disposeSession(sessionRef.current);
        sessionRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      if (sessionRef.current) {
        disposeSession(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, [boot]);

  useEffect(() => {
    const observer = new MutationObserver(() => sessionRef.current?.grid.replaceTheme({}));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  /** Runs one control action at a time so overlapping clicks cannot interleave. */
  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    void action()
      .catch((error: unknown) => {
        if (!(error instanceof ShowcaseLinkError)) {
          pushLog("error", error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        busyRef.current = false;
      });
  };

  const commitSampleEdit = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const row = (session.sync.serverVersion + session.sync.pendingCount) % SAMPLE_ROWS;
      const current = session.grid.store.getCell({ sheet: "ledger", row, col: 1 }).resolved;
      const quantity = typeof current === "number" ? current + 1 : 1;
      const outcome = session.grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "ledger", row, col: 1 },
            value: { kind: "literal", value: quantity },
          },
        ],
      });
      if (outcome.status !== "applied") {
        pushLog("error", `Sample edit was not applied: ${outcome.status}`);
      }
    });

  const saveNow = () =>
    run(async () => {
      await sessionRef.current?.sync.flush();
    });

  const loseNextAck = () =>
    run(async () => {
      sessionRef.current?.link.dropNextAcknowledgement();
      pushLog(
        "info",
        "The next acknowledgement will be dropped after the server stores the commit",
      );
    });

  const retryPending = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const head = session.sync.pendingCommits()[0];
      if (!head) {
        pushLog("info", "Nothing pending to retry");
        return;
      }
      pushLog("info", `Retrying ${head.clientMutationId} with its original mutation id`);
      await session.sync.retry(head.clientMutationId);
    });

  const simulateReload = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      disposeSession(session);
      sessionRef.current = null;
      await boot(
        "Session closed and reopened: committed state and the durable queue came back from IndexedDB",
      );
    });

  const externalCommit = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const version = session.adapter.stats().currentVersion;
      const response = await session.adapter.commit({
        documentId: DATABASE_DOCUMENT_ID,
        baseVersion: version,
        clientMutationId: `external-${Date.now().toString(36)}-${nextMutation++}`,
        operations: [
          {
            op: "set",
            addr: { sheet: "ledger", row: 4, col: 2 },
            value: { kind: "literal", value: Number((1.5 + (version + 1) * 0.1).toFixed(2)) },
          },
        ],
      });
      if (response.status === "applied") {
        pushLog(
          "warn",
          `External writer committed v${response.version} directly to the database — this tab is now stale`,
        );
      }
    });

  /**
   * The documented host recovery loop: rebase every pending commit over the
   * server's operation tail, clear the stale durable ids, remount from the
   * latest materialized snapshot, and resubmit the safe results as new
   * mutations. Rebase conflicts keep the queue intact for manual review.
   */
  const recoverFromConflict = async (response: ConflictResponse) => {
    const session = sessionRef.current;
    const host = hostRef.current;
    if (!session || !host) return;
    if (!response.operationsSinceBase) {
      pushLog("error", "Manual review required: the conflict returned no operation tail");
      return;
    }
    const pending = session.sync.pendingCommits();
    const remoteOperations = response.operationsSinceBase.flatMap((entry) => [...entry.operations]);
    const rebasedBatches: DocumentOp[][] = [];
    for (const record of pending) {
      const result = rebaseDocumentOperations(record.operations, remoteOperations);
      if (result.status === "conflict") {
        pushLog("error", `Manual review required: ${result.conflict.message}`);
        return;
      }
      rebasedBatches.push([...result.operations]);
    }
    for (const record of pending) {
      await session.storage.remove(DATABASE_DOCUMENT_ID, record.clientMutationId);
    }
    disposeSession(session, true);
    sessionRef.current = null;

    const latest = await session.adapter.load(DATABASE_DOCUMENT_ID);
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, latest);
    const sync = new SyncCoordinator(grid, session.link, {
      documentId: DATABASE_DOCUMENT_ID,
      serverVersion: latest.version ?? 0,
      pendingStorage: session.storage,
      createMutationId,
    });
    const next: DatabaseSession = {
      adapter: session.adapter,
      link: session.link,
      storage: session.storage,
      grid,
      sync,
      disposers: [],
    };
    wireSession(next, stableCallbacks);
    sessionRef.current = next;
    await sync.ready();
    for (const batch of rebasedBatches) {
      const outcome = grid.applyTransaction({ patches: batch });
      if (outcome.status !== "applied") {
        pushLog("error", `Rebased local transaction was not applied: ${outcome.status}`);
        return;
      }
    }
    await sync.flush();
    stableCallbacks.onSyncState(sync.state);
    readTotal();
    pushLog(
      "commit",
      `Recovered: remounted at v${latest.version ?? 0} and resubmitted ${rebasedBatches.length} rebased commit${rebasedBatches.length === 1 ? "" : "s"} as new mutations`,
    );
  };

  const resetDemo = () =>
    run(async () => {
      const session = sessionRef.current;
      if (session) {
        disposeSession(session);
        sessionRef.current = null;
      }
      await deleteShowcaseDatabase(DOCUMENT_DATABASE);
      await deleteShowcaseDatabase(QUEUE_DATABASE);
      await boot("Demo databases deleted; reseeded from the canonical ledger at v0");
    });

  const activity = syncState?.activity ?? "hydrating";
  const pendingCount = syncState?.pendingCount ?? 0;
  const counters: ReadonlyArray<{ id: string; label: string; value: string; queued?: boolean }> = [
    { id: "dbx-version", label: "Head version", value: String(stats?.currentVersion ?? 0) },
    {
      id: "dbx-snapshot-version",
      label: "Snapshot version",
      value: String(stats?.snapshotVersion ?? 0),
    },
    { id: "dbx-tail", label: "Tail records", value: String(stats?.tailLength ?? 0) },
    {
      id: "dbx-pending",
      label: "Pending commits",
      value: String(pendingCount),
      queued: pendingCount > 0,
    },
    { id: "dbx-reads", label: "IDB reads", value: String(stats?.reads ?? 0) },
    { id: "dbx-writes", label: "IDB writes", value: String(stats?.writes ?? 0) },
    { id: "dbx-bytes", label: "Stored", value: stats ? formatBytes(stats.storedBytes) : "0 B" },
  ];

  return (
    <section aria-label="IndexedDB persistence showcase" className="sw-dbx">
      <div className="sw-dbx__stage">
        <header className="sw-dbx__statusbar">
          <p
            className="sw-dbx__status"
            data-activity={activity}
            data-status={status}
            data-testid="dbx-status"
          >
            {status === "ready" ? "Ready" : status === "error" ? "Error" : "Loading"}
            <span className="sw-dbx__status-detail">{statusDetail}</span>
          </p>
          <div className="sw-dbx__readouts">
            <span className="sw-dbx__chip" data-activity={activity}>
              {activity}
            </span>
            <p className="sw-dbx__probe">
              Ledger total <output data-testid="dbx-total">{total}</output>
            </p>
          </div>
        </header>
        <div
          aria-label="Expedition ledger workbook"
          className="sw-dbx__grid"
          ref={hostRef}
          role="application"
        />
        <div aria-label="Database controls" className="sw-dbx__controls" role="toolbar">
          <fieldset aria-label="Commit controls" className="sw-dbx__control-group">
            <span className="sw-dbx__group-label">Commit</span>
            <button
              className="sw-dbx__button"
              data-variant="primary"
              onClick={commitSampleEdit}
              type="button"
            >
              Commit sample edit
            </button>
            <button className="sw-dbx__button" onClick={saveNow} type="button">
              Save pending now
            </button>
            <label className="sw-dbx__switch">
              <input
                checked={autosave}
                onChange={(event) => {
                  autosaveRef.current = event.currentTarget.checked;
                  setAutosave(event.currentTarget.checked);
                  if (event.currentTarget.checked) saveNow();
                }}
                type="checkbox"
              />
              Autosave
            </label>
          </fieldset>
          <fieldset aria-label="Failure injection" className="sw-dbx__control-group">
            <span className="sw-dbx__group-label">Faults</span>
            <button
              className="sw-dbx__button"
              data-variant="quiet"
              onClick={loseNextAck}
              type="button"
            >
              Lose next acknowledgement
            </button>
            <button
              className="sw-dbx__button"
              data-variant="quiet"
              onClick={retryPending}
              type="button"
            >
              Retry pending commit
            </button>
          </fieldset>
          <fieldset aria-label="Session lifecycle" className="sw-dbx__control-group">
            <span className="sw-dbx__group-label">Session</span>
            <button
              className="sw-dbx__button"
              data-variant="quiet"
              onClick={externalCommit}
              type="button"
            >
              External writer commit
            </button>
            <button
              className="sw-dbx__button"
              data-variant="quiet"
              onClick={simulateReload}
              type="button"
            >
              Close and reopen session
            </button>
            <button
              className="sw-dbx__button"
              data-variant="danger"
              onClick={resetDemo}
              type="button"
            >
              Reset demo data
            </button>
          </fieldset>
        </div>
      </div>

      <aside className="sw-dbx__side">
        <section aria-labelledby="dbx-counters-title" className="sw-dbx__panel">
          <h3 id="dbx-counters-title">Live storage gauges</h3>
          <dl className="sw-dbx__counters">
            {counters.map((counter) => (
              <div key={counter.id}>
                <dt>{counter.label}</dt>
                <dd data-state={counter.queued ? "queued" : undefined} data-testid={counter.id}>
                  {counter.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="sw-dbx__note">
            Compaction folds the operation tail into one snapshot record after{" "}
            {COMPACTION.maxTailRecords} tail records or {formatBytes(COMPACTION.maxTailBytes)}.
          </p>
        </section>
        <section aria-labelledby="dbx-log-title" className="sw-dbx__panel">
          <h3 id="dbx-log-title">Commit journal</h3>
          <ol aria-live="polite" className="sw-dbx__log" data-testid="dbx-log">
            {log.length === 0 ? (
              <li className="sw-dbx__log-empty">
                Edit the grid or press “Commit sample edit” — every acknowledgement lands here.
              </li>
            ) : (
              log.map((entry) => (
                <li data-kind={entry.kind} key={entry.id}>
                  {entry.text}
                </li>
              ))
            )}
          </ol>
        </section>
      </aside>
    </section>
  );
}
