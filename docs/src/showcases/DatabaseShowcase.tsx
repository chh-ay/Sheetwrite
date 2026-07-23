import {
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncStateSnapshot,
  type Theme,
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
  kind: "info" | "pending" | "commit" | "warn" | "error";
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

function resolveDatabaseGridTheme(host: HTMLElement): Partial<Theme> {
  const mode = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  host.dataset.gridTheme = mode;

  const probe = document.createElement("span");
  probe.ariaHidden = "true";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  host.append(probe);
  const resolveColor = (value: string): string => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const token = (name: string): string => resolveColor(`var(${name})`);
  const mix = (name: string, amount: number): string =>
    resolveColor(`color-mix(in srgb, var(${name}) ${amount}%, transparent)`);
  probe.style.font = "500 13px var(--sw-font-body)";
  const font = getComputedStyle(probe).font;
  const theme: Partial<Theme> = {
    bg: token("--sw-surface-1"),
    fg: token("--sw-fg"),
    gridLine: token("--sw-border"),
    headerBg: token("--sw-surface-2"),
    headerFg: token("--sw-accent-strong"),
    selection: mix("--sw-accent", 14),
    selectionBorder: token("--sw-accent"),
    searchMatch: mix("--sw-demo-warn", 25),
    searchActiveMatch: token("--sw-demo-warn"),
    highlight: mix("--sw-accent", 20),
    font,
  };
  probe.remove();
  return theme;
}

function mountDatabaseGrid(host: HTMLElement, snapshot: unknown): Grid {
  return createGridFromSnapshot(host, snapshot, { theme: resolveDatabaseGridTheme(host) });
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
          callbacks.onLog(
            "pending",
            `Pending write ${event.mutation.clientMutationId} persisted to IndexedDB`,
          );
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
  const grid = mountDatabaseGrid(host, snapshot);
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
  const [recoveryState, setRecoveryState] = useState("Opening IndexedDB…");

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
    async (announce: string | null, recovered: string) => {
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
        setRecoveryState(recovered);
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
    void boot(null, "Loaded from IndexedDB").then(() => {
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
    const observer = new MutationObserver(() => {
      const session = sessionRef.current;
      const host = hostRef.current;
      if (session && host) session.grid.replaceTheme(resolveDatabaseGridTheme(host));
    });
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
        "Reopened from IndexedDB",
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
    const grid = mountDatabaseGrid(host, latest);
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
      await boot(
        "Demo databases deleted; reseeded from the canonical ledger at v0",
        "Reseeded in IndexedDB",
      );
    });

  const activity = syncState?.activity ?? "hydrating";
  const pendingCount = syncState?.pendingCount ?? 0;
  const ready = status === "ready";
  const diagnosticCounters: ReadonlyArray<{ id: string; label: string; value: string }> = [
    {
      id: "dbx-snapshot-version",
      label: "Snapshot revision",
      value: String(stats?.snapshotVersion ?? 0),
    },
    { id: "dbx-tail", label: "Tail records", value: String(stats?.tailLength ?? 0) },
    { id: "dbx-reads", label: "IDB reads", value: String(stats?.reads ?? 0) },
    { id: "dbx-writes", label: "IDB writes", value: String(stats?.writes ?? 0) },
  ];

  return (
    <section
      aria-busy={status === "loading"}
      aria-label="IndexedDB persistence showcase"
      className="sw-dbx"
      data-testid="dbx-instrument"
    >
      <header className="sw-dbx__statusbar">
        <div className="sw-dbx__document-title">
          <span>Durable workbook</span>
          <h2>Expedition ledger</h2>
        </div>
        <p
          className="sw-dbx__status"
          data-activity={activity}
          data-status={status}
          data-testid="dbx-status"
        >
          {status === "ready" ? "Ready" : status === "error" ? "Error" : "Loading"}
          <span className="sw-dbx__status-detail">{statusDetail}</span>
        </p>
        <p className="sw-dbx__probe">
          Live total <output data-testid="dbx-total">{total}</output>
        </p>
      </header>

      <dl aria-label="Authoritative durability state" className="sw-dbx__durability">
        <div>
          <dt>Revision</dt>
          <dd data-testid="dbx-version">{stats?.currentVersion ?? 0}</dd>
        </div>
        <div>
          <dt>Pending writes</dt>
          <dd data-state={pendingCount > 0 ? "queued" : undefined} data-testid="dbx-pending">
            {pendingCount}
          </dd>
        </div>
        <div>
          <dt>Reload state</dt>
          <dd data-testid="dbx-reload">{recoveryState}</dd>
        </div>
        <div>
          <dt>Allocated</dt>
          <dd data-testid="dbx-bytes">{stats ? formatBytes(stats.storedBytes) : "0 B"}</dd>
        </div>
      </dl>

      <div className="sw-dbx__challenge">
        <p id="dbx-challenge-copy">
          <strong>Edit an amount. Watch it become durable.</strong>
          <span>
            Pause autosave to hold a pending write, save it, then reopen the same document from
            IndexedDB.
          </span>
        </p>
        <fieldset aria-label="Durability actions" className="sw-dbx__controls">
          <div className="sw-dbx__primary-actions">
            <button
              aria-label="Edit next amount by 1 — Commit sample edit"
              aria-describedby="dbx-challenge-copy"
              className="sw-dbx__button sw-dbx__primary-action"
              data-variant="primary"
              disabled={!ready}
              onClick={commitSampleEdit}
              type="button"
            >
              Edit amount +1
            </button>
            <label className="sw-dbx__switch" data-state={autosave ? "on" : "paused"}>
              <input
                aria-label="Autosave"
                checked={autosave}
                disabled={!ready}
                onChange={(event) => {
                  autosaveRef.current = event.currentTarget.checked;
                  setAutosave(event.currentTarget.checked);
                  if (event.currentTarget.checked) saveNow();
                }}
                type="checkbox"
              />
              <span aria-hidden="true" className="sw-dbx__switch-track">
                <span className="sw-dbx__switch-thumb" />
              </span>
              <span aria-hidden="true" className="sw-dbx__switch-copy">
                <span>Autosave</span>
                <span className="sw-dbx__switch-state">{autosave ? "On" : "Paused"}</span>
              </span>
            </label>
          </div>
          <div className="sw-dbx__session-actions">
            <button
              aria-label="Save pending now"
              className="sw-dbx__button"
              disabled={!ready}
              onClick={saveNow}
              type="button"
            >
              Save pending
            </button>
            <button
              aria-label="Close and reopen session"
              className="sw-dbx__button"
              disabled={!ready}
              onClick={simulateReload}
              type="button"
            >
              Reopen session
            </button>
          </div>
        </fieldset>
      </div>

      <div className="sw-dbx__workspace">
        <div
          aria-label="Expedition ledger workbook"
          className="sw-dbx__grid"
          data-testid="dbx-grid"
          ref={hostRef}
          role="application"
        />
        <aside aria-labelledby="dbx-log-title" className="sw-dbx__journal">
          <header>
            <div>
              <span>Adjacent evidence</span>
              <h3 id="dbx-log-title">Commit journal</h3>
            </div>
            <span className="sw-dbx__chip" data-activity={activity}>
              {activity}
            </span>
          </header>
          <ol aria-live="polite" className="sw-dbx__log" data-testid="dbx-log">
            {log.length === 0 ? (
              <li className="sw-dbx__log-empty">
                Change an amount in the Grid. The durable write and acknowledgement will appear
                here.
              </li>
            ) : (
              log.map((entry) => (
                <li data-kind={entry.kind} key={entry.id}>
                  {entry.text}
                </li>
              ))
            )}
          </ol>
        </aside>
      </div>

      <details className="sw-dbx__diagnostics" data-testid="dbx-diagnostics">
        <summary>Failure lab &amp; storage diagnostics</summary>
        <div className="sw-dbx__diagnostics-body">
          <div className="sw-dbx__diagnostic-controls">
            <fieldset className="sw-dbx__control-group">
              <legend>Lost acknowledgement</legend>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={loseNextAck}
                type="button"
              >
                Lose next acknowledgement
              </button>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={retryPending}
                type="button"
              >
                Retry pending commit
              </button>
            </fieldset>
            <fieldset className="sw-dbx__control-group">
              <legend>Conflict &amp; reset</legend>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={externalCommit}
                type="button"
              >
                External writer commit
              </button>
              <button
                className="sw-dbx__button"
                data-variant="danger"
                disabled={!ready}
                onClick={resetDemo}
                type="button"
              >
                Reset demo data
              </button>
            </fieldset>
          </div>
          <section aria-labelledby="dbx-counters-title" className="sw-dbx__storage">
            <h3 id="dbx-counters-title">Storage internals</h3>
            <dl className="sw-dbx__counters">
              {diagnosticCounters.map((counter) => (
                <div key={counter.id}>
                  <dt>{counter.label}</dt>
                  <dd data-testid={counter.id}>{counter.value}</dd>
                </div>
              ))}
            </dl>
            <p className="sw-dbx__note">
              Compaction folds the operation tail into snapshot revision after{" "}
              {COMPACTION.maxTailRecords} tail records or {formatBytes(COMPACTION.maxTailBytes)}.
            </p>
          </section>
          <section aria-labelledby="dbx-architecture-title" className="sw-dbx__architecture">
            <h3 id="dbx-architecture-title">Architecture boundary</h3>
            <p>
              The Grid feeds a durable pending queue. The demo adapter sequences commits into
              IndexedDB; your product supplies the same PersistenceAdapter contract over its own
              database and transport.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
