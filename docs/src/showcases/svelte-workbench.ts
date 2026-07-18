// Framework-neutral host integration for the /svelte/ offline workbench.
//
// One session = one in-page collaboration server, one presence bus, and one
// durable IndexedDB outbox. Grid generations connect and disconnect as the
// Svelte island mounts, resets, and remounts; the session outlives them the
// same way a host-owned sync layer outlives component lifecycles. Protocol
// behavior lives in the shared collaboration module and @sheetwrite/core —
// this file only wires it to observable workbench state.

import {
  type ColumnarData,
  type Grid,
  type PersistenceCommitResponse,
  PresenceCoordinator,
  type PresenceMessage,
  type PresenceTransport,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type SyncMutationRecord,
  type SyncStateSnapshot,
  type VersionedOperation,
  type Workbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import { ShowcaseCollaborationServer, ShowcasePresenceBus } from "./collaboration-protocol.js";
import {
  createOfflineData,
  createOfflineSeedSnapshot,
  createOfflineWorkbook,
  OFFLINE_COLLEAGUE_ACTOR,
  OFFLINE_COLUMNS,
  OFFLINE_DOCUMENT_ID,
  OFFLINE_LOCAL_ACTOR,
  OFFLINE_SHEET_ID,
  offlineColleagueEdit,
  offlineColleagueEditRow,
  offlineColleagueEditText,
  offlineLocalEdit,
  offlineLocalEditRow,
} from "./scenarios/offline.js";

/** Durable pending-commit outbox; deleted on session boot so demos restart clean. */
export const SVELTE_WORKBENCH_OUTBOX = "sheetwrite-svelte-workbench-outbox";

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

/** Construction-bound grid inputs for one island generation. */
export interface WorkbenchMount {
  workbook: Workbook;
  data: ColumnarData;
  /** Server version the mounted content corresponds to. */
  version: number;
}

/** Base-version conflict surfaced for explicit host-side recovery. */
export interface WorkbenchConflict {
  clientMutationId: string;
  baseVersion: number;
  currentVersion: number;
  /** Remote commits the stale base missed, oldest first. */
  remoteSummaries: readonly string[];
  /** Conservative-rebase verdict for the queued work against those commits. */
  rebase: "clean" | "needs-review";
}

export type WorkbenchFeedTone = "info" | "ok" | "warn" | "err";

/** One bounded sync-activity line rendered by the island. */
export interface WorkbenchFeedEntry {
  id: number;
  tone: WorkbenchFeedTone;
  text: string;
}

/** Host callbacks fed exclusively from coordinator events and session actions. */
export interface WorkbenchCallbacks {
  onState(state: SyncStateSnapshot): void;
  onQueue(queue: readonly SyncMutationRecord[]): void;
  onConflict(conflict: WorkbenchConflict | null): void;
  onPeers(peers: readonly PresenceMessage[]): void;
  onFeed(entry: WorkbenchFeedEntry): void;
  /** The island must recreate its grid from `mount` (durable queue restores on top). */
  onRemount(mount: WorkbenchMount, note: string): void;
}

interface GridLink {
  readonly grid: Grid;
  readonly sync: SyncCoordinator;
  presence: PresenceCoordinator | null;
  offSync?: () => void;
  offPresence?: () => void;
  disposeRemote?: () => void;
}

const COLUMN_HEADERS: readonly string[] = createOfflineWorkbook().sheets[0]!.columns.map(
  (column) => column.header ?? column.key,
);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeRemoteCommit(entry: VersionedOperation): string {
  const first = entry.operations[0];
  const target =
    first?.op === "set"
      ? ` — ${COLUMN_HEADERS[first.addr.col] ?? "cell"} on ticket ${first.addr.row + 1}`
      : "";
  const count = entry.operations.length;
  return `v${entry.version} · ${count} change${count === 1 ? "" : "s"}${target}`;
}

async function resetOutbox(databaseName: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    // A blocked or failed delete only means stale records stay visible in the
    // outbox list; never wedge boot over demo cleanup.
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/**
 * Rebuild construction-bound grid inputs from an authoritative snapshot.
 * The scenario scripts only write literal values, so cell styles are the
 * only snapshot detail this mount path does not carry.
 */
function mountFromSnapshot(snapshot: WorkbookSnapshot): WorkbenchMount {
  const sheet = snapshot.sheets[0];
  if (!sheet) throw new Error("Offline snapshot lost its dispatch sheet");
  const workbook: Workbook = {
    activeSheet: snapshot.workbook.activeSheet,
    sheets: [
      {
        id: sheet.id,
        name: sheet.name,
        rowCount: sheet.rowCount,
        columns: sheet.columns,
        ...(sheet.frozenRows !== undefined ? { frozenRows: sheet.frozenRows } : {}),
        ...(sheet.frozenCols !== undefined ? { frozenCols: sheet.frozenCols } : {}),
      },
    ],
  };
  const keyed = sheet.columns.map(() =>
    new Array<ColumnarData["columns"][string][number]>(sheet.rowCount).fill(null),
  );
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const column = keyed[block.startCol + cell.colOffset];
      if (!column || row >= sheet.rowCount) continue;
      column[row] = cell.value.kind === "literal" ? cell.value.value : cell.value;
    }
  }
  const columns: ColumnarData["columns"] = {};
  sheet.columns.forEach((column, index) => {
    columns[column.key] = keyed[index]!;
  });
  return {
    workbook,
    data: { rowCount: sheet.rowCount, columns },
    version: snapshot.version ?? 0,
  };
}

/**
 * Owns the offline/collaborative state the Svelte island renders: the durable
 * pending queue, connectivity, reconnect drain, presence, conflict recovery,
 * and the authoritative base snapshot remounts hydrate from.
 */
export class SvelteWorkbenchSession {
  private readonly server: ShowcaseCollaborationServer;
  private readonly bus = new ShowcasePresenceBus();
  private readonly colleagueTransport: PresenceTransport;
  private readonly storage: IndexedDbPendingCommitStorage;
  private readonly callbacks: WorkbenchCallbacks;
  /** Last state known to match the server head; remounts hydrate from it. */
  private baseSnapshot: WorkbookSnapshot;
  private link: GridLink | null = null;
  private conflictContext: { mutation: SyncMutationRecord; response: ConflictResponse } | null =
    null;
  private lastColleaguePresence: PresenceMessage | null = null;
  private online = true;
  private destroyed = false;
  private feedSeq = 0;
  private mutationSeq = 0;
  private localStep = 0;
  private colleagueStep = 0;

  static async create(callbacks: WorkbenchCallbacks): Promise<SvelteWorkbenchSession> {
    await resetOutbox(SVELTE_WORKBENCH_OUTBOX);
    return new SvelteWorkbenchSession(callbacks);
  }

  private constructor(callbacks: WorkbenchCallbacks) {
    this.callbacks = callbacks;
    const seed = createOfflineSeedSnapshot();
    this.server = new ShowcaseCollaborationServer(seed);
    this.baseSnapshot = seed;
    this.colleagueTransport = this.bus.endpoint();
    this.storage = new IndexedDbPendingCommitStorage({ databaseName: SVELTE_WORKBENCH_OUTBOX });
  }

  get isOnline(): boolean {
    return this.online;
  }

  /** Pristine construction-bound inputs for the first island generation. */
  initialMount(): WorkbenchMount {
    return { workbook: createOfflineWorkbook(), data: createOfflineData(), version: 0 };
  }

  /** Wire one grid generation; replaces any previous link. */
  connect(grid: Grid, mountVersion: number): void {
    this.disconnect();
    this.conflictContext = null;
    this.callbacks.onConflict(null);
    const sync = new SyncCoordinator(grid, this.server, {
      documentId: OFFLINE_DOCUMENT_ID,
      serverVersion: mountVersion,
      pendingStorage: this.storage,
      initialConnection: this.online ? "online" : "offline",
      createMutationId: () => `you-${++this.mutationSeq}`,
    });
    const link: GridLink = { grid, sync, presence: null };
    this.link = link;
    link.offSync = sync.on((event) => this.handleSyncEvent(link, event));
    if (this.online) {
      link.disposeRemote = sync.subscribe(this.server);
      this.attachPresence(link);
    }
    this.callbacks.onState(sync.state);
    this.callbacks.onQueue(sync.pendingCommits());
    void sync
      .ready()
      .then(() => {
        if (this.destroyed || this.link !== link) return;
        if (this.online && sync.pendingCount > 0) return sync.flush().then(() => undefined);
        return undefined;
      })
      .catch((error: unknown) => this.feed("err", describeError(error)));
  }

  /** Tear down the current grid generation's coordinators. */
  disconnect(): void {
    const link = this.link;
    if (!link) return;
    this.link = null;
    link.offSync?.();
    link.offPresence?.();
    link.presence?.destroy();
    link.disposeRemote?.();
    link.sync.destroy();
  }

  /** Host-controlled connectivity: gates sending, remote intake, and presence. */
  async setOnline(online: boolean): Promise<void> {
    if (this.destroyed || this.online === online) return;
    this.online = online;
    const link = this.link;
    if (!online) {
      if (link) {
        link.sync.setOnline(false);
        link.disposeRemote?.();
        link.disposeRemote = undefined;
        link.offPresence?.();
        link.offPresence = undefined;
        link.presence?.destroy();
        link.presence = null;
      }
      this.callbacks.onPeers([]);
      this.feed("warn", "Offline — edits keep committing locally and queue in the durable outbox");
      return;
    }
    this.feed("info", "Reconnecting…");
    if (!link) return;
    link.disposeRemote = link.sync.subscribe(this.server);
    link.sync.setOnline(true);
    this.attachPresence(link);
    try {
      const responses = await link.sync.flush();
      if (!responses.some((response) => response.status === "conflict")) {
        await this.reconcileAfterDrain(link);
      }
    } catch (error) {
      this.feed("err", describeError(error));
    }
  }

  /** Scripted field edit: a normal grid transaction, admitted into the outbox. */
  logNextEntry(): void {
    const link = this.link;
    if (!link || this.destroyed) return;
    const step = this.localStep;
    const row = offlineLocalEditRow(step);
    const result = link.grid.applyTransaction({ patches: offlineLocalEdit(step) });
    if (result.status !== "applied") {
      this.feed("err", `Edit rejected (${result.status}) — the durable outbox may be full`);
      return;
    }
    this.localStep += 1;
    link.grid.setSelection({
      kind: "cell",
      addr: { sheet: OFFLINE_SHEET_ID, row, col: OFFLINE_COLUMNS.status },
    });
  }

  /** HQ commits directly against the server head — live remote work when online, divergence when offline. */
  async colleagueCommit(): Promise<void> {
    if (this.destroyed) return;
    const step = this.colleagueStep++;
    const row = offlineColleagueEditRow(step);
    try {
      const version = await this.server.commitServerOperations(
        OFFLINE_DOCUMENT_ID,
        offlineColleagueEdit(step),
      );
      this.publishColleaguePresence(row);
      this.feed(
        this.online ? "ok" : "warn",
        this.online
          ? `${OFFLINE_COLLEAGUE_ACTOR.displayName} assigned ${offlineColleagueEditText(step)} (server v${version})`
          : `${OFFLINE_COLLEAGUE_ACTOR.displayName} committed server v${version} while you're offline — reconnect to converge`,
      );
    } catch (error) {
      this.feed("err", describeError(error));
    }
  }

  /**
   * Explicit host recovery for a base-version conflict: bring the grid up to
   * the server head, rebase the durable queue onto it, and drain.
   */
  async mergeAndResync(): Promise<void> {
    const link = this.link;
    const context = this.conflictContext;
    if (!link || !context || this.destroyed) return;
    try {
      const remote = context.response.operationsSinceBase;
      if (remote && remote.length > 0) {
        const rebase = rebaseDocumentOperations(
          context.mutation.operations,
          remote.flatMap((entry) => entry.operations),
        );
        for (const entry of remote) link.grid.applyRemoteOperations(entry.operations);
        const head = await this.server.load(OFFLINE_DOCUMENT_ID);
        await link.sync.resumeAfterReload(head);
        if (rebase.status === "conflict") {
          // Overlapping edits: reassert queued local values so the view matches
          // what the resent outbox will make authoritative.
          for (const record of link.sync.pendingCommits()) {
            link.grid.applyRemoteOperations(record.operations);
          }
        }
        this.conflictContext = null;
        this.callbacks.onConflict(null);
        this.feed(
          "ok",
          `Merged ${remote.length} remote commit${remote.length === 1 ? "" : "s"} — ${
            rebase.status === "rebased"
              ? "no overlap with queued work"
              : "overlapping edits; queued local values win on resync"
          }`,
        );
        await link.sync.flush();
        return;
      }
      // The server could not enumerate the gap: reload from its snapshot and
      // remount; the rebased durable queue restores on top of it.
      const head = context.response.snapshot ?? (await this.server.load(OFFLINE_DOCUMENT_ID));
      await link.sync.resumeAfterReload(head);
      this.conflictContext = null;
      this.callbacks.onConflict(null);
      this.baseSnapshot = head;
      this.feed("info", `Reloading the document at server v${head.version ?? 0}`);
      this.callbacks.onRemount(mountFromSnapshot(head), "conflict-reload");
    } catch (error) {
      this.feed("err", describeError(error));
    }
  }

  /** Full island remount; pending work must survive through the durable outbox. */
  remountIsland(): void {
    if (this.destroyed) return;
    const pending = this.link?.sync.pendingCount ?? 0;
    this.feed(
      "info",
      pending > 0
        ? `Remounting — ${pending} durable edit${pending === 1 ? "" : "s"} will restore from IndexedDB`
        : "Remounting the island",
    );
    this.callbacks.onRemount(mountFromSnapshot(this.baseSnapshot), "manual");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disconnect();
    this.storage.close();
  }

  private handleSyncEvent(link: GridLink, event: SyncCoordinatorEvent): void {
    if (this.destroyed || this.link !== link) return;
    switch (event.type) {
      case "state":
        this.callbacks.onState(event.state);
        this.callbacks.onQueue(link.sync.pendingCommits());
        this.captureBase(link, event.state);
        break;
      case "restored":
        if (event.pending.length > 0) {
          this.feed(
            "info",
            `Restored ${event.pending.length} durable edit${event.pending.length === 1 ? "" : "s"} from the IndexedDB outbox`,
          );
        }
        break;
      case "pending":
        this.feed(
          "info",
          `Outbox: ${event.mutation.clientMutationId} queued durably (${event.mutation.operations.length} op${event.mutation.operations.length === 1 ? "" : "s"})`,
        );
        break;
      case "sending":
        this.feed("info", `Sending ${event.mutation.clientMutationId}…`);
        break;
      case "acknowledged":
        this.feed(
          "ok",
          `Server v${event.version} acknowledged ${event.clientMutationId}${event.duplicate ? " (duplicate retry)" : ""}`,
        );
        break;
      case "conflict":
        this.conflictContext = { mutation: event.mutation, response: event.response };
        this.callbacks.onConflict(this.buildConflict(event.mutation, event.response));
        this.feed(
          "warn",
          `Conflict: ${event.mutation.clientMutationId} is based on v${event.mutation.baseVersion} but the server is at v${event.response.currentVersion}`,
        );
        break;
      case "remote-applied":
        this.feed(
          "ok",
          `Applied remote v${event.operation.version} from ${
            event.operation.clientMutationId?.startsWith("showcase-server-")
              ? (OFFLINE_COLLEAGUE_ACTOR.displayName ?? "HQ")
              : "a collaborator"
          }`,
        );
        break;
      case "reloaded":
        this.feed("info", `Outbox rebased onto server v${event.serverVersion}`);
        break;
      case "reload-required":
        this.feed(
          "warn",
          `Reload required: expected v${event.expectedVersion}, received v${event.receivedVersion}`,
        );
        break;
      case "storage-error":
        this.feed("err", `Outbox storage error: ${describeError(event.error)}`);
        break;
      case "error":
        this.feed("err", describeError(event.error));
        break;
      case "persisting":
        break;
    }
  }

  /** Snapshot the grid whenever it is fully synced; remounts hydrate from it. */
  private captureBase(link: GridLink, state: SyncStateSnapshot): void {
    if (state.pendingCount !== 0 || state.activity !== "idle" || this.conflictContext) return;
    this.baseSnapshot = {
      ...link.grid.exportSnapshot(),
      documentId: OFFLINE_DOCUMENT_ID,
      version: state.serverVersion,
    };
  }

  /** After a clean drain, detect a server that moved ahead while offline. */
  private async reconcileAfterDrain(link: GridLink): Promise<void> {
    const head = await this.server.load(OFFLINE_DOCUMENT_ID);
    const headVersion = head.version ?? 0;
    if (this.destroyed || this.link !== link || headVersion <= link.sync.serverVersion) return;
    this.baseSnapshot = head;
    this.feed(
      "info",
      `Server moved ahead to v${headVersion} while offline — reloading the document`,
    );
    this.callbacks.onRemount(mountFromSnapshot(head), "reload");
  }

  private buildConflict(
    mutation: SyncMutationRecord,
    response: ConflictResponse,
  ): WorkbenchConflict {
    const remote = response.operationsSinceBase ?? [];
    const rebase =
      remote.length === 0
        ? "clean"
        : rebaseDocumentOperations(
              mutation.operations,
              remote.flatMap((entry) => entry.operations),
            ).status === "rebased"
          ? "clean"
          : "needs-review";
    return {
      clientMutationId: mutation.clientMutationId,
      baseVersion: mutation.baseVersion,
      currentVersion: response.currentVersion,
      remoteSummaries: remote.map(describeRemoteCommit),
      rebase,
    };
  }

  private attachPresence(link: GridLink): void {
    const presence = new PresenceCoordinator(link.grid, this.bus.endpoint(), {
      actor: OFFLINE_LOCAL_ACTOR,
      heartbeatMs: 0,
    });
    link.presence = presence;
    link.offPresence = presence.on((event) => {
      if (event.type === "updated" || event.type === "expired") {
        this.callbacks.onPeers(presence.remotePresence());
      } else if (event.type === "error") {
        this.feed("err", describeError(event.error));
      }
    });
    // Bring the colleague back into view immediately after (re)connecting.
    if (this.lastColleaguePresence) {
      void this.colleagueTransport.publish({ ...this.lastColleaguePresence, sentAt: Date.now() });
    } else {
      this.publishColleaguePresence(offlineColleagueEditRow(this.colleagueStep));
    }
  }

  private publishColleaguePresence(row: number): void {
    const message: PresenceMessage = {
      actor: OFFLINE_COLLEAGUE_ACTOR,
      activeSheet: OFFLINE_SHEET_ID,
      selections: [
        {
          sheet: OFFLINE_SHEET_ID,
          start: { row, col: OFFLINE_COLUMNS.crew },
          end: { row, col: OFFLINE_COLUMNS.crew },
        },
      ],
      sentAt: Date.now(),
    };
    this.lastColleaguePresence = message;
    void this.colleagueTransport.publish(message);
  }

  private feed(tone: WorkbenchFeedTone, text: string): void {
    if (this.destroyed) return;
    this.callbacks.onFeed({ id: ++this.feedSeq, tone, text });
  }
}
