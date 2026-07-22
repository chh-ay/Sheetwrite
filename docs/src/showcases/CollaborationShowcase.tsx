import {
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type PersistenceCommitResponse,
  PresenceCoordinator,
  type PresenceMessage,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncStateSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import "@sheetwrite/core/styles.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  COLLABORATION_ACTORS,
  COLLABORATION_DOCUMENT_ID,
  COLLABORATION_TOTAL_CELL,
  makeCollaborationSnapshot,
  type ShowcaseActor,
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  type ShowcaseLinkState,
  ShowcaseNetworkLink,
  ShowcasePresenceBus,
} from "./collaboration-protocol.js";

const LOG_LIMIT = 10;
const SERVER_LOG_LIMIT = 12;
type ClientKey = "a" | "b";
const CLIENT_KEYS: readonly ClientKey[] = ["a", "b"];
const SAMPLE_ROW: Record<ClientKey, number> = { a: 0, b: 3 };
const QUEUE_DATABASE: Record<ClientKey, string> = {
  a: "sheetwrite-showcase-collab-ana",
  b: "sheetwrite-showcase-collab-bram",
};

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

interface LogEntry {
  id: number;
  kind: "info" | "commit" | "remote" | "warn" | "error";
  text: string;
}

interface ClientRuntime {
  actor: ShowcaseActor;
  link: ShowcaseNetworkLink;
  storage: IndexedDbPendingCommitStorage;
  grid: Grid;
  sync: SyncCoordinator;
  presence: PresenceCoordinator;
  disposers: Array<() => void>;
}

interface ClientView {
  ready: boolean;
  online: boolean;
  syncState: SyncStateSnapshot | null;
  linkState: ShowcaseLinkState | null;
  total: string;
  roster: readonly PresenceMessage[];
  log: readonly LogEntry[];
}

const EMPTY_CLIENT_VIEW: ClientView = {
  ready: false,
  online: true,
  syncState: null,
  linkState: null,
  total: "–",
  roster: [],
  log: [],
};

let nextMutation = 1;

export default function CollaborationShowcase() {
  const hostRefs: Record<ClientKey, React.RefObject<HTMLDivElement | null>> = {
    a: useRef<HTMLDivElement>(null),
    b: useRef<HTMLDivElement>(null),
  };
  const serverRef = useRef<ShowcaseCollaborationServer | null>(null);
  const busRef = useRef<ShowcasePresenceBus | null>(null);
  const clientsRef = useRef<Record<ClientKey, ClientRuntime | null>>({ a: null, b: null });
  const serverDisposerRef = useRef<(() => void) | null>(null);
  const logIdRef = useRef(0);
  const recoveringRef = useRef<Record<ClientKey, boolean>>({ a: false, b: false });
  const bootGenerationRef = useRef(0);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusDetail, setStatusDetail] = useState("Starting the in-page server…");
  const [views, setViews] = useState<Record<ClientKey, ClientView>>({
    a: EMPTY_CLIENT_VIEW,
    b: EMPTY_CLIENT_VIEW,
  });
  const [serverLog, setServerLog] = useState<Array<LogEntry & { status: string }>>([]);
  const [serverVersion, setServerVersion] = useState(0);

  const patchView = (key: ClientKey, patch: Partial<ClientView>) => {
    setViews((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const pushClientLog = (key: ClientKey, kind: LogEntry["kind"], text: string) => {
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, kind, text };
    setViews((current) => ({
      ...current,
      [key]: { ...current[key], log: [entry, ...current[key].log].slice(0, LOG_LIMIT) },
    }));
  };

  const readClient = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    const resolved = runtime.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved;
    patchView(key, {
      total: typeof resolved === "number" ? String(resolved) : String(resolved ?? "–"),
      syncState: runtime.sync.state,
    });
  };

  const bootClient = async (key: ClientKey, generation: number): Promise<void> => {
    const host = hostRefs[key].current;
    const server = serverRef.current;
    const bus = busRef.current;
    if (!host || !server || !bus || generation !== bootGenerationRef.current) return;
    const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
    const link = new ShowcaseNetworkLink(server);
    const snapshot = await server.load(COLLABORATION_DOCUMENT_ID);
    if (generation !== bootGenerationRef.current) {
      link.destroy();
      return;
    }
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, snapshot);
    const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE[key] });
    const sync = new SyncCoordinator(grid, link, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: snapshot.version ?? 0,
      pendingStorage: storage,
      createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${nextMutation++}`,
    });
    const presence = new PresenceCoordinator(grid, bus.endpoint(), { actor, heartbeatMs: 0 });
    const runtime: ClientRuntime = { actor, link, storage, grid, sync, presence, disposers: [] };
    wireClient(key, runtime);
    clientsRef.current[key] = runtime;
    runtime.disposers.push(sync.subscribe(link));
    await sync.ready();
    if (generation !== bootGenerationRef.current) {
      if (clientsRef.current[key] === runtime) disposeClient(key);
      return;
    }
    if (sync.pendingCount > 0) await sync.flush().catch(() => {});
    patchView(key, { ready: true, online: true, linkState: link.state() });
    readClient(key);
  };

  const wireClient = (key: ClientKey, runtime: ClientRuntime) => {
    const { sync, link, presence } = runtime;
    runtime.disposers.push(
      sync.on((event) => {
        switch (event.type) {
          case "state":
            patchView(key, { syncState: event.state });
            readClient(key);
            break;
          case "pending":
            if (link.connected && sync.state.connection === "online") {
              void sync.flush().catch(() => {});
            }
            break;
          case "acknowledged":
            pushClientLog(
              key,
              "commit",
              event.duplicate
                ? `Duplicate acknowledgement: the server had already sequenced ${event.clientMutationId} at v${event.version}`
                : `Committed v${event.version}`,
            );
            break;
          case "remote-applied":
            pushClientLog(key, "remote", `Applied remote v${event.operation.version}`);
            readClient(key);
            break;
          case "restored":
            if (event.pending.length > 0) {
              pushClientLog(
                key,
                "info",
                `Restored ${event.pending.length} durable pending commit${event.pending.length === 1 ? "" : "s"}`,
              );
            }
            break;
          case "reload-required":
            pushClientLog(
              key,
              "warn",
              `Version gap: expected v${event.expectedVersion}, received v${event.receivedVersion} — buffered until the gap closes`,
            );
            break;
          case "conflict":
            pushClientLog(
              key,
              "warn",
              `Conflict: commit based on v${event.mutation.baseVersion}, server is at v${event.response.currentVersion}`,
            );
            void recoverClient(key, event.response);
            break;
          case "error":
            if (event.error instanceof ShowcaseLinkError) {
              pushClientLog(key, "warn", event.error.message);
            } else if (
              !(event.error instanceof Error && event.error.name === "SyncProtocolError")
            ) {
              pushClientLog(
                key,
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
    runtime.disposers.push(link.subscribeState((state) => patchView(key, { linkState: state })));
    runtime.disposers.push(
      presence.on((event) => {
        if (event.type === "updated" || event.type === "expired") {
          patchView(key, { roster: presence.remotePresence() });
        }
      }),
    );
  };

  const disposeClient = (key: ClientKey, keepStores = false) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    for (const dispose of runtime.disposers) dispose();
    runtime.disposers.length = 0;
    runtime.presence.destroy();
    runtime.sync.destroy();
    runtime.grid.destroy();
    runtime.link.destroy();
    if (!keepStores) runtime.storage.close();
    clientsRef.current[key] = null;
  };

  const bootAll = async (generation: number) => {
    setStatus("loading");
    setStatusDetail("Starting the in-page server…");
    try {
      await initSheetwrite();
      if (generation !== bootGenerationRef.current) return;
      const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
      serverRef.current = server;
      busRef.current = new ShowcasePresenceBus();
      setServerVersion(0);
      setServerLog([]);
      serverDisposerRef.current = server.observeCommits((record: ShowcaseCommitRecord) => {
        logIdRef.current += 1;
        const entry = {
          id: logIdRef.current,
          kind: "info" as const,
          status: record.status,
          text: `v${record.version} ${record.status} · ${record.clientMutationId} (${record.operationCount} op${record.operationCount === 1 ? "" : "s"})`,
        };
        setServerLog((entries) => [entry, ...entries].slice(0, SERVER_LOG_LIMIT));
        setServerVersion((current) => Math.max(current, record.version));
      });
      await bootClient("a", generation);
      if (generation !== bootGenerationRef.current) return;
      await bootClient("b", generation);
      if (generation !== bootGenerationRef.current) return;
      // Both clients are subscribed now; announce presence deterministically.
      await clientsRef.current.a?.presence.publishNow();
      await clientsRef.current.b?.presence.publishNow();
      if (generation !== bootGenerationRef.current) return;
      setStatus("ready");
      setStatusDetail("Two live clients, one sequencing server");
    } catch (error) {
      if (generation !== bootGenerationRef.current) return;
      setStatus("error");
      setStatusDetail(error instanceof Error ? error.message : String(error));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the public page owns one mount/unmount session; reset invokes the current callbacks explicitly.
  useEffect(() => {
    const generation = bootGenerationRef.current + 1;
    bootGenerationRef.current = generation;
    void bootAll(generation);
    return () => {
      if (bootGenerationRef.current === generation) bootGenerationRef.current += 1;
      for (const key of CLIENT_KEYS) disposeClient(key);
      serverDisposerRef.current?.();
      serverDisposerRef.current = null;
      serverRef.current = null;
      busRef.current = null;
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      for (const key of CLIENT_KEYS) clientsRef.current[key]?.grid.replaceTheme({});
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const sampleEdit = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    const row = SAMPLE_ROW[key];
    const addr = { sheet: "plan", row, col: 2 };
    const current = runtime.grid.store.getCell(addr).resolved;
    const points = typeof current === "number" ? current + 1 : 1;
    runtime.grid.setSelection({ kind: "cell", addr });
    const outcome = runtime.grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: points } }],
    });
    if (outcome.status !== "applied") {
      pushClientLog(key, "error", `Edit was not applied: ${outcome.status}`);
    }
    readClient(key);
  };

  const toggleOnline = (key: ClientKey, online: boolean) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    if (online) {
      runtime.link.setConnected(true);
      runtime.sync.setOnline(true);
      pushClientLog(key, "info", "Reconnected: queued broadcasts replayed, pending work draining");
    } else {
      runtime.sync.setOnline(false);
      runtime.link.setConnected(false);
      pushClientLog(key, "info", "Offline: edits keep committing locally into the durable queue");
    }
    patchView(key, { online, linkState: runtime.link.state() });
    readClient(key);
  };

  const loseNextAck = (key: ClientKey) => {
    clientsRef.current[key]?.link.dropNextAcknowledgement();
    pushClientLog(key, "info", "The next acknowledgement (and its echo) will be lost in transit");
  };

  const retryPending = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    const head = runtime.sync.pendingCommits()[0];
    if (!head) {
      pushClientLog(key, "info", "Nothing pending to retry");
      return;
    }
    pushClientLog(key, "info", `Retrying ${head.clientMutationId} with its original mutation id`);
    void runtime.sync.retry(head.clientMutationId).catch(() => {});
  };

  const holdNextBroadcast = (key: ClientKey) => {
    clientsRef.current[key]?.link.holdNextBroadcast();
    pushClientLog(key, "info", "The next inbound broadcast will be held back (delivery reordered)");
  };

  const releaseHeld = (key: ClientKey) => {
    clientsRef.current[key]?.link.releaseHeldBroadcasts();
  };

  const serverEdit = () => {
    const server = serverRef.current;
    if (!server) return;
    const runtime = clientsRef.current.a ?? clientsRef.current.b;
    const addr = { sheet: "plan", row: 4, col: 2 };
    const current = runtime?.grid.store.getCell(addr).resolved;
    const points = typeof current === "number" ? current + 1 : 3;
    void server
      .commitServerOperations(COLLABORATION_DOCUMENT_ID, [
        { op: "set", addr, value: { kind: "literal", value: points } },
      ])
      .catch(() => {});
  };

  /** Documented host recovery: rebase, clear stale durable ids, remount, resubmit. */
  const recoverClient = async (key: ClientKey, response: ConflictResponse) => {
    if (recoveringRef.current[key]) return;
    recoveringRef.current[key] = true;
    try {
      const runtime = clientsRef.current[key];
      const host = hostRefs[key].current;
      const server = serverRef.current;
      const bus = busRef.current;
      if (!runtime || !host || !server || !bus) return;
      if (!response.operationsSinceBase) {
        pushClientLog(key, "error", "Manual review required: no operation tail returned");
        return;
      }
      const pending = runtime.sync.pendingCommits();
      const remoteOperations = response.operationsSinceBase.flatMap((entry) => [
        ...entry.operations,
      ]);
      const rebasedBatches: DocumentOp[][] = [];
      for (const record of pending) {
        const result = rebaseDocumentOperations(record.operations, remoteOperations);
        if (result.status === "conflict") {
          pushClientLog(key, "error", `Manual review required: ${result.conflict.message}`);
          return;
        }
        rebasedBatches.push([...result.operations]);
      }
      pushClientLog(
        key,
        "info",
        `Rebasing ${rebasedBatches.length} pending commit${rebasedBatches.length === 1 ? "" : "s"} over ${response.operationsSinceBase.length} newer server version${response.operationsSinceBase.length === 1 ? "" : "s"}`,
      );
      for (const record of pending) {
        await runtime.storage.remove(COLLABORATION_DOCUMENT_ID, record.clientMutationId);
      }
      const { actor, link, storage } = runtime;
      for (const dispose of runtime.disposers) dispose();
      runtime.disposers.length = 0;
      runtime.presence.destroy();
      runtime.sync.destroy();
      runtime.grid.destroy();
      link.discardParkedBroadcasts();
      clientsRef.current[key] = null;

      const latest = response.snapshot ?? (await link.load(COLLABORATION_DOCUMENT_ID));
      host.replaceChildren();
      const grid = createGridFromSnapshot(host, latest);
      const sync = new SyncCoordinator(grid, link, {
        documentId: COLLABORATION_DOCUMENT_ID,
        serverVersion: latest.version ?? 0,
        pendingStorage: storage,
        createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${nextMutation++}`,
      });
      const presence = new PresenceCoordinator(grid, bus.endpoint(), { actor, heartbeatMs: 0 });
      const next: ClientRuntime = { actor, link, storage, grid, sync, presence, disposers: [] };
      wireClient(key, next);
      clientsRef.current[key] = next;
      next.disposers.push(sync.subscribe(link));
      await sync.ready();
      for (const batch of rebasedBatches) {
        const outcome = grid.applyTransaction({ patches: batch });
        if (outcome.status !== "applied") {
          pushClientLog(key, "error", `Rebased transaction was not applied: ${outcome.status}`);
          return;
        }
      }
      await sync.flush();
      await presence.publishNow();
      patchView(key, { ready: true, online: true, linkState: link.state() });
      readClient(key);
      pushClientLog(
        key,
        "commit",
        `Recovered at v${latest.version ?? 0}: rebased work resubmitted as new mutations`,
      );
    } catch (error) {
      pushClientLog(key, "error", error instanceof Error ? error.message : String(error));
    } finally {
      recoveringRef.current[key] = false;
    }
  };

  const resetDemo = () => {
    const generation = bootGenerationRef.current + 1;
    bootGenerationRef.current = generation;
    void (async () => {
      for (const key of CLIENT_KEYS) disposeClient(key);
      serverDisposerRef.current?.();
      serverDisposerRef.current = null;
      for (const key of CLIENT_KEYS) {
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const request = indexedDB.deleteDatabase(QUEUE_DATABASE[key]);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB deletion failed"));
        request.onblocked = () => resolve();
        await promise;
      }
      if (generation !== bootGenerationRef.current) return;
      setViews({ a: EMPTY_CLIENT_VIEW, b: EMPTY_CLIENT_VIEW });
      await bootAll(generation);
    })();
  };

  const bramPending = views.b.syncState?.pendingCount ?? 0;
  const challengePhase =
    !views.b.online && bramPending === 0
      ? "offline"
      : !views.b.online && bramPending > 0
        ? "queued"
        : views.b.online && bramPending > 0
          ? "reconnecting"
          : serverVersion > 0
            ? "resolved"
            : "initial";
  const challengeCopy = {
    initial: ["Start with a disconnect", "Take Bram offline. His Grid remains editable."],
    offline: [
      "Bram is offline",
      "Queue a real Grid edit while the server stays at its current head.",
    ],
    queued: [
      `${bramPending} edit${bramPending === 1 ? "" : "s"} waiting`,
      "Reconnect to sequence the durable queue and broadcast the result to Ana.",
    ],
    reconnecting: ["Queue is draining", "The server is sequencing Bram’s pending work in order."],
    resolved: ["Clients converged", "Both Grids now reflect the sequenced server history."],
  }[challengePhase];

  return (
    <section aria-label="Collaboration protocol showcase" className="sw-clb">
      <header className="sw-clb__statusbar">
        <div className="sw-clb__scenario-title">
          <p className="sw-clb__status" data-status={status} data-testid="clb-status">
            {status === "ready" ? "Live" : status === "error" ? "Error" : "Loading"}
            <span className="sw-clb__status-detail">{statusDetail}</span>
          </p>
          <div>
            <span className="sw-clb__kicker">Reconnect drill</span>
            <strong>One offline edit, one ordered resolution</strong>
          </div>
        </div>
      </header>

      <div className="sw-clb__workbench">
        <ClientPanel
          actor={COLLABORATION_ACTORS[0]}
          onSampleEdit={() => sampleEdit("a")}
          onToggleOnline={(online) => toggleOnline("a", online)}
          slug="a"
          view={views.a}
        >
          <div
            aria-label={`${COLLABORATION_ACTORS[0].displayName}'s workbook`}
            className="sw-clb__grid"
            data-testid="clb-a-grid"
            ref={hostRefs.a}
            role="application"
          />
        </ClientPanel>

        <section
          aria-labelledby="clb-sequence-title"
          className="sw-clb__sequence"
          data-phase={challengePhase}
          data-testid="clb-sequence"
        >
          <header>
            <span>Sequencing lane</span>
            <output data-testid="clb-server-version">v{serverVersion}</output>
          </header>
          <div aria-live="polite" className="sw-clb__challenge">
            <span className="sw-clb__challenge-state">{challengePhase}</span>
            <h3 id="clb-sequence-title">{challengeCopy[0]}</h3>
            <p>{challengeCopy[1]}</p>
          </div>
          <ol aria-label="Offline reconnect sequence" className="sw-clb__steps">
            <li data-current={challengePhase === "initial" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                disabled={status !== "ready" || !views.b.online}
                onClick={() => toggleOnline("b", false)}
                type="button"
              >
                <span aria-hidden="true">01</span> Take Bram offline
              </button>
            </li>
            <li data-current={challengePhase === "offline" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                data-variant="primary"
                disabled={status !== "ready" || views.b.online}
                onClick={() => sampleEdit("b")}
                type="button"
              >
                <span aria-hidden="true">02</span> Queue one Grid edit
              </button>
            </li>
            <li data-current={challengePhase === "queued" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                disabled={status !== "ready" || views.b.online}
                onClick={() => toggleOnline("b", true)}
                type="button"
              >
                <span aria-hidden="true">03</span> Reconnect
              </button>
            </li>
          </ol>
          <div aria-hidden="true" className="sw-clb__direction">
            <span>Ana</span>
            <i>commit → order → broadcast</i>
            <span>Bram</span>
          </div>
          <section aria-label="Recent server decisions" className="sw-clb__decisions">
            <h3>Server decisions</h3>
            <ol aria-live="polite" className="sw-clb__server-log" data-testid="clb-server-log">
              {serverLog.length === 0 ? (
                <li className="sw-clb__log-empty">Waiting for the first commit.</li>
              ) : (
                serverLog.map((entry) => (
                  <li data-ack={entry.status} key={entry.id}>
                    {entry.text}
                  </li>
                ))
              )}
            </ol>
          </section>
        </section>

        <ClientPanel
          actor={COLLABORATION_ACTORS[1]}
          onSampleEdit={() => sampleEdit("b")}
          onToggleOnline={(online) => toggleOnline("b", online)}
          slug="b"
          view={views.b}
        >
          <div
            aria-label={`${COLLABORATION_ACTORS[1].displayName}'s workbook`}
            className="sw-clb__grid"
            data-testid="clb-b-grid"
            ref={hostRefs.b}
            role="application"
          />
        </ClientPanel>
      </div>

      <details className="sw-clb__advanced">
        <summary>Advanced protocol faults</summary>
        <div className="sw-clb__advanced-body">
          {CLIENT_KEYS.map((key) => {
            const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
            const held = views[key].linkState?.heldBroadcasts ?? 0;
            return (
              <section
                aria-labelledby={`clb-${key}-faults-title`}
                className="sw-clb__fault-client"
                data-fault-client={key}
                key={key}
              >
                <h3 id={`clb-${key}-faults-title`}>{actor.displayName} · transport faults</h3>
                <div
                  aria-label={`${actor.displayName}'s advanced network controls`}
                  className="sw-clb__controls"
                  role="toolbar"
                >
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => loseNextAck(key)}
                    type="button"
                  >
                    Lose next ack
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => retryPending(key)}
                    type="button"
                  >
                    Retry pending
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => holdNextBroadcast(key)}
                    type="button"
                  >
                    Hold next broadcast
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => releaseHeld(key)}
                    type="button"
                  >
                    Release held
                    {held > 0 ? <span className="sw-clb__held-count">{held}</span> : null}
                  </button>
                </div>
                <ol
                  aria-label={`${actor.displayName}'s sync events`}
                  aria-live="polite"
                  className="sw-clb__log"
                  data-testid={`clb-${key}-log`}
                >
                  {views[key].log.length === 0 ? (
                    <li className="sw-clb__log-empty">Sync events appear here.</li>
                  ) : (
                    views[key].log.map((entry) => (
                      <li data-kind={entry.kind} key={entry.id}>
                        {entry.text}
                      </li>
                    ))
                  )}
                </ol>
              </section>
            );
          })}
          <section aria-labelledby="clb-server-tools-title" className="sw-clb__server-tools">
            <h3 id="clb-server-tools-title">Server and recovery</h3>
            <div className="sw-clb__controls">
              <button className="sw-clb__button" onClick={serverEdit} type="button">
                Server-authored commit
              </button>
              <button
                className="sw-clb__button"
                data-variant="danger"
                onClick={resetDemo}
                type="button"
              >
                Reset demo
              </button>
            </div>
            <p className="sw-clb__server-note">
              <span className="sw-clb__server-note-tag">Demo-only</span>
              <span>
                This in-page sequencer makes the real <code>PersistenceAdapter</code> +{" "}
                <code>RemoteOperationSource</code> boundary observable. Your backend supplies that
                transport and durable store.
              </span>
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}

interface ClientPanelProps {
  actor: ShowcaseActor;
  children: ReactNode;
  onSampleEdit(): void;
  onToggleOnline(online: boolean): void;
  slug: ClientKey;
  view: ClientView;
}

function ClientPanel({
  actor,
  children,
  onSampleEdit,
  onToggleOnline,
  slug,
  view,
}: Readonly<ClientPanelProps>) {
  const connection = view.online ? "online" : "offline";
  const pending = view.syncState?.pendingCount ?? 0;
  const latestEvent = view.log[0]?.text ?? "No sync events yet.";
  return (
    <article
      aria-label={`Client ${actor.displayName}`}
      className="sw-clb__client"
      data-client={slug}
      data-connection={connection}
    >
      <header className="sw-clb__client-head">
        <span className="sw-clb__actor">{actor.displayName}</span>
        <span
          className="sw-clb__connection"
          data-connection={connection}
          data-testid={`clb-${slug}-connection`}
        >
          {connection}
        </span>
        <label className="sw-clb__switch">
          <input
            checked={view.online}
            disabled={!view.ready}
            onChange={(event) => onToggleOnline(event.currentTarget.checked)}
            type="checkbox"
          />
          Online
        </label>
      </header>

      {children}

      <div className="sw-clb__client-action">
        <button
          className="sw-clb__button"
          disabled={!view.ready}
          onClick={onSampleEdit}
          type="button"
        >
          Edit {actor.displayName === "Ana" ? "“Import pipeline”" : "“Offline drain QA”"}
        </button>
        <p aria-live="polite">
          <span>Latest</span>
          {latestEvent}
        </p>
      </div>

      <dl className="sw-clb__stats">
        <div>
          <dt>Version</dt>
          <dd data-testid={`clb-${slug}-version`}>v{view.syncState?.serverVersion ?? 0}</dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd data-state={pending > 0 ? "queued" : undefined} data-testid={`clb-${slug}-pending`}>
            {pending}
          </dd>
        </div>
        <div>
          <dt>Grid total</dt>
          <dd data-testid={`clb-${slug}-total`}>{view.total}</dd>
        </div>
        <div className="sw-clb__presence">
          <dt>Presence</dt>
          <dd>
            <ul
              aria-label={`Collaborators visible to ${actor.displayName}`}
              data-testid={`clb-${slug}-roster`}
            >
              {view.roster.length === 0 ? (
                <li className="sw-clb__presence-empty">No one yet</li>
              ) : (
                view.roster.map((message) => (
                  <li key={message.actor.id}>{message.actor.displayName ?? message.actor.id}</li>
                ))
              )}
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}
