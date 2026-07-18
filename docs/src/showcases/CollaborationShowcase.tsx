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

  const bootClient = async (key: ClientKey): Promise<void> => {
    const host = hostRefs[key].current;
    const server = serverRef.current;
    const bus = busRef.current;
    if (!host || !server || !bus) return;
    const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
    const link = new ShowcaseNetworkLink(server);
    const snapshot = await server.load(COLLABORATION_DOCUMENT_ID);
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

  const bootAll = async () => {
    setStatus("loading");
    setStatusDetail("Starting the in-page server…");
    try {
      await initSheetwrite();
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
      await bootClient("a");
      await bootClient("b");
      // Both clients are subscribed now; announce presence deterministically.
      await clientsRef.current.a?.presence.publishNow();
      await clientsRef.current.b?.presence.publishNow();
      setStatus("ready");
      setStatusDetail("Two live clients, one sequencing server");
    } catch (error) {
      setStatus("error");
      setStatusDetail(error instanceof Error ? error.message : String(error));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the public page owns one mount/unmount session; reset invokes the current callbacks explicitly.
  useEffect(() => {
    let cancelled = false;
    void bootAll().then(() => {
      if (cancelled) {
        for (const key of CLIENT_KEYS) disposeClient(key);
        serverDisposerRef.current?.();
      }
    });
    return () => {
      cancelled = true;
      for (const key of CLIENT_KEYS) disposeClient(key);
      serverDisposerRef.current?.();
      serverDisposerRef.current = null;
      serverRef.current = null;
      busRef.current = null;
    };
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
      setViews({ a: EMPTY_CLIENT_VIEW, b: EMPTY_CLIENT_VIEW });
      await bootAll();
    })();
  };

  return (
    <section aria-label="Collaboration protocol proof" className="sw-clb">
      <header className="sw-clb__statusbar">
        <p className="sw-clb__status" data-status={status} data-testid="clb-status">
          <span aria-hidden="true" className="sw-clb__status-dot" />
          {status === "ready" ? "Ready" : status === "error" ? "Error" : "Loading"}
          <span className="sw-clb__status-detail">{statusDetail}</span>
        </p>
        <button className="sw-clb__button" data-variant="danger" onClick={resetDemo} type="button">
          Reset demo
        </button>
      </header>

      <div className="sw-clb__clients">
        {CLIENT_KEYS.map((key) => {
          const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
          const view = views[key];
          return (
            <ClientPanel
              actor={actor}
              key={key}
              onHold={() => holdNextBroadcast(key)}
              onLoseAck={() => loseNextAck(key)}
              onRelease={() => releaseHeld(key)}
              onRetry={() => retryPending(key)}
              onSampleEdit={() => sampleEdit(key)}
              onToggleOnline={(online) => toggleOnline(key, online)}
              slug={key}
              view={view}
            >
              <div
                aria-label={`${actor.displayName}'s workbook`}
                className="sw-clb__grid"
                data-testid={`clb-${key}-grid`}
                ref={hostRefs[key]}
                role="application"
              />
            </ClientPanel>
          );
        })}
      </div>

      <section aria-labelledby="clb-server-title" className="sw-clb__server">
        <header>
          <h3 id="clb-server-title">In-page sequencing server</h3>
          <p className="sw-clb__server-meta">
            Head version <output data-testid="clb-server-version">v{serverVersion}</output>
          </p>
          <button className="sw-clb__button" onClick={serverEdit} type="button">
            Server-authored commit
          </button>
        </header>
        <ol aria-live="polite" className="sw-clb__server-log" data-testid="clb-server-log">
          {serverLog.length === 0 ? (
            <li className="sw-clb__log-empty">
              Every commit request lands here with its sequencing decision.
            </li>
          ) : (
            serverLog.map((entry) => (
              <li data-ack={entry.status} key={entry.id}>
                {entry.text}
              </li>
            ))
          )}
        </ol>
        <p className="sw-clb__server-note">
          Demo-only: this server lives in the page so the protocol is observable. It implements the
          same <code>PersistenceAdapter</code> + <code>RemoteOperationSource</code> pair your
          backend implements over its own transport and database.
        </p>
      </section>
    </section>
  );
}

interface ClientPanelProps {
  actor: ShowcaseActor;
  children: ReactNode;
  onHold(): void;
  onLoseAck(): void;
  onRelease(): void;
  onRetry(): void;
  onSampleEdit(): void;
  onToggleOnline(online: boolean): void;
  slug: ClientKey;
  view: ClientView;
}

function ClientPanel({
  actor,
  children,
  onHold,
  onLoseAck,
  onRelease,
  onRetry,
  onSampleEdit,
  onToggleOnline,
  slug,
  view,
}: Readonly<ClientPanelProps>) {
  const connection = view.online ? "online" : "offline";
  return (
    <article
      aria-label={`Client ${actor.displayName}`}
      className="sw-clb__client"
      data-client={slug}
    >
      <header className="sw-clb__client-head">
        <span className="sw-clb__actor">
          <span
            aria-hidden="true"
            className="sw-clb__actor-dot"
            style={{ background: actor.color }}
          />
          {actor.displayName}
        </span>
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
            onChange={(event) => onToggleOnline(event.currentTarget.checked)}
            type="checkbox"
          />
          Online
        </label>
      </header>

      {children}

      <div
        aria-label={`${actor.displayName}'s network controls`}
        className="sw-clb__controls"
        role="toolbar"
      >
        <button
          className="sw-clb__button"
          data-variant="primary"
          onClick={onSampleEdit}
          type="button"
        >
          Edit {actor.displayName === "Ana" ? "“Import pipeline”" : "“Offline drain QA”"}
        </button>
        <button className="sw-clb__button" onClick={onLoseAck} type="button">
          Lose next ack
        </button>
        <button className="sw-clb__button" onClick={onRetry} type="button">
          Retry pending
        </button>
        <button className="sw-clb__button" onClick={onHold} type="button">
          Hold next broadcast
        </button>
        <button className="sw-clb__button" onClick={onRelease} type="button">
          Release held
          {view.linkState && view.linkState.heldBroadcasts > 0
            ? ` (${view.linkState.heldBroadcasts})`
            : ""}
        </button>
      </div>

      <dl className="sw-clb__stats">
        <div>
          <dt>Server version</dt>
          <dd data-testid={`clb-${slug}-version`}>v{view.syncState?.serverVersion ?? 0}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd data-testid={`clb-${slug}-pending`}>{view.syncState?.pendingCount ?? 0}</dd>
        </div>
        <div>
          <dt>Committed total</dt>
          <dd data-testid={`clb-${slug}-total`}>{view.total}</dd>
        </div>
      </dl>

      <div className="sw-clb__presence">
        <span className="sw-clb__presence-label">Sees</span>
        <ul
          aria-label={`Collaborators visible to ${actor.displayName}`}
          data-testid={`clb-${slug}-roster`}
        >
          {view.roster.length === 0 ? (
            <li className="sw-clb__presence-empty">no one yet</li>
          ) : (
            view.roster.map((message) => (
              <li key={message.actor.id}>
                <span
                  aria-hidden="true"
                  className="sw-clb__actor-dot"
                  style={{ background: message.actor.color ?? "#94a3b8" }}
                />
                {message.actor.displayName ?? message.actor.id}
              </li>
            ))
          )}
        </ul>
      </div>

      <ol
        aria-label={`${actor.displayName}'s sync events`}
        aria-live="polite"
        className="sw-clb__log"
        data-testid={`clb-${slug}-log`}
      >
        {view.log.length === 0 ? (
          <li className="sw-clb__log-empty">Sync events appear here.</li>
        ) : (
          view.log.map((entry) => (
            <li data-kind={entry.kind} key={entry.id}>
              {entry.text}
            </li>
          ))
        )}
      </ol>
    </article>
  );
}
