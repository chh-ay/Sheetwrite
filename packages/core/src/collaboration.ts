import { createGridFromSnapshot, type SnapshotGridOptions } from "./persistence.js";
import type { PresenceOverlay, Range, Selection } from "./types/coordinates.js";
import type { Sheet, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";

/** Public collaborator identity attached to presence updates. */
export interface PresenceActor {
  id: string;
  displayName?: string;
  color?: string;
}

/** Ephemeral collaborator selection and activity update. */
export interface PresenceMessage {
  actor: PresenceActor;
  activeSheet: string;
  selections: readonly Range[];
  sentAt: number;
}

/** Host transport contract for ephemeral presence messages. */
export interface PresenceTransport {
  publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
  subscribe(
    listener: (message: PresenceMessage) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
}

/** Controls which ephemeral collaborator details may be transmitted. */
export interface PresencePrivacyOptions {
  shareDisplayName?: boolean;
  shareSelection?: boolean;
  receivePresence?: boolean;
  allowActor?: (actor: Readonly<PresenceActor>) => boolean;
}

/** Identity, privacy, and timing options for presence coordination. */
export interface PresenceCoordinatorOptions {
  actor: PresenceActor;
  privacy?: PresencePrivacyOptions;
  heartbeatMs?: number;
  timeoutMs?: number;
  maxActors?: number;
  maxRangesPerActor?: number;
  now?: () => number;
}

/** Connection or actor transition emitted by presence coordination. */
export type PresenceCoordinatorEvent =
  | { type: "published"; message: PresenceMessage }
  | { type: "updated"; actorId: string }
  | { type: "expired"; actorId: string }
  | { type: "error"; error: unknown };

type PresenceListener = (event: PresenceCoordinatorEvent) => void;

interface ReceivedPresence {
  message: PresenceMessage;
  receivedAt: number;
}

/** Ephemeral presence lifecycle; it never calls a document mutation API. */
export class PresenceCoordinator {
  private readonly listeners = new Set<PresenceListener>();
  private readonly remote = new Map<string, ReceivedPresence>();
  private readonly abortController = new AbortController();
  private readonly disposeSelection: () => void;
  private readonly disposeActiveSheet: () => void;
  private readonly disposeTransport?: () => void;
  private readonly now: () => number;
  private readonly heartbeatMs: number;
  private readonly timeoutMs: number;
  private readonly maxActors: number;
  private readonly maxRanges: number;
  private heartbeatTimer?: number;
  private destroyed = false;

  constructor(
    private readonly grid: Grid,
    private readonly transport: PresenceTransport,
    private readonly options: PresenceCoordinatorOptions,
  ) {
    if (!options.actor.id) throw new Error("Presence actor ID is required");
    this.now = options.now ?? Date.now;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.maxActors = Math.max(1, options.maxActors ?? 32);
    this.maxRanges = Math.max(1, options.maxRangesPerActor ?? 8);
    this.disposeSelection = grid.on("selection", () => this.queuePublish());
    this.disposeActiveSheet = grid.on("active-sheet", () => this.queuePublish());
    this.disposeTransport = transport.subscribe(
      (message) => this.receive(message),
      this.abortController.signal,
    );
    if (this.heartbeatMs > 0 && typeof window !== "undefined") {
      this.heartbeatTimer = window.setInterval(() => {
        this.pruneStale();
        this.queuePublish();
      }, this.heartbeatMs);
    }
    this.queuePublish();
  }

  on(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  remotePresence(): readonly PresenceMessage[] {
    return [...this.remote.values()].map(({ message }) => clonePresenceMessage(message));
  }

  async publishNow(): Promise<void> {
    if (this.destroyed) return;
    const privacy = this.options.privacy;
    const actor: PresenceActor = {
      id: this.options.actor.id,
      ...(privacy?.shareDisplayName === false || !this.options.actor.displayName
        ? {}
        : { displayName: this.options.actor.displayName }),
      ...(this.options.actor.color ? { color: this.options.actor.color } : {}),
    };
    const sheet = this.activeSheet();
    const message: PresenceMessage = {
      actor,
      activeSheet: sheet.id,
      selections:
        privacy?.shareSelection === false
          ? []
          : selectionRanges(this.grid.getSelection(), sheet).slice(0, this.maxRanges),
      sentAt: this.now(),
    };
    try {
      await this.transport.publish(clonePresenceMessage(message), this.abortController.signal);
      if (!this.destroyed) this.emit({ type: "published", message: clonePresenceMessage(message) });
    } catch (error) {
      if (!this.destroyed) this.emit({ type: "error", error });
    }
  }

  pruneStale(): void {
    if (this.destroyed) return;
    const cutoff = this.now() - this.timeoutMs;
    let changed = false;
    for (const [actorId, entry] of this.remote) {
      if (entry.receivedAt > cutoff) continue;
      this.remote.delete(actorId);
      changed = true;
      this.emit({ type: "expired", actorId });
    }
    if (changed) this.paintPresence();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController.abort("Sheetwrite presence coordinator destroyed");
    this.disposeSelection();
    this.disposeActiveSheet();
    this.disposeTransport?.();
    if (this.heartbeatTimer !== undefined && typeof window !== "undefined") {
      window.clearInterval(this.heartbeatTimer);
    }
    this.remote.clear();
    this.grid.setPresenceOverlays(null);
    this.listeners.clear();
  }

  private receive(input: PresenceMessage): void {
    if (this.destroyed || this.options.privacy?.receivePresence === false) return;
    const message = normalizePresenceMessage(input, this.maxRanges);
    if (!message || message.actor.id === this.options.actor.id) return;
    if (this.options.privacy?.allowActor && !this.options.privacy.allowActor(message.actor)) return;

    if (!this.remote.has(message.actor.id) && this.remote.size >= this.maxActors) {
      let oldestId: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [actorId, entry] of this.remote) {
        if (entry.receivedAt >= oldestAt) continue;
        oldestId = actorId;
        oldestAt = entry.receivedAt;
      }
      if (oldestId) this.remote.delete(oldestId);
    }
    this.remote.set(message.actor.id, { message, receivedAt: this.now() });
    this.paintPresence();
    this.emit({ type: "updated", actorId: message.actor.id });
  }

  private activeSheet(): Sheet {
    const workbook = this.grid.store.getWorkbook();
    const active = this.grid.getActiveSheet();
    const sheet = workbook.sheets.find((candidate) => candidate.id === active);
    if (!sheet) throw new Error(`Presence active sheet does not exist: ${active}`);
    return sheet;
  }

  private paintPresence(): void {
    const overlays: PresenceOverlay[] = [];
    for (const { message } of this.remote.values()) {
      overlays.push({
        actorId: message.actor.id,
        ...(message.actor.displayName ? { displayName: message.actor.displayName } : {}),
        color: message.actor.color ?? "#2563eb",
        activeSheet: message.activeSheet,
        ranges: message.selections,
      });
    }
    this.grid.setPresenceOverlays(overlays);
  }

  private queuePublish(): void {
    void this.publishNow();
  }

  private emit(event: PresenceCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Host-provided metadata describing a saved workbook revision. */
export interface RevisionSummary {
  version: number;
  createdAt: string;
  actor?: PresenceActor;
  label?: string;
}

/** Versioned restore request submitted to a revision adapter. */
export interface RevisionRestoreRequest {
  documentId: string;
  targetVersion: number;
  baseVersion: number;
  clientMutationId: string;
  signal?: AbortSignal;
}

/** Applied or conflict acknowledgement for a revision restore. */
export type RevisionRestoreResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      snapshot: WorkbookSnapshot;
    }
  | { status: "duplicate"; version: number; clientMutationId: string }
  | { status: "conflict"; currentVersion: number };

/** Host persistence contract for revision history and restore. */
export interface RevisionAdapter {
  listRevisions(documentId: string, signal?: AbortSignal): Promise<readonly RevisionSummary[]>;
  loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise<unknown>;
  /** Must create a new auditable server version; never rewind storage in place. */
  restoreRevision(request: RevisionRestoreRequest): Promise<RevisionRestoreResponse>;
}

/** Document identity and version options for revision coordination. */
export interface RevisionCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  migrateSnapshot?: (snapshot: unknown) => unknown;
}

/** State or restore transition emitted by revision coordination. */
export type RevisionCoordinatorEvent =
  | { type: "restored"; targetVersion: number; version: number }
  | { type: "conflict"; targetVersion: number; currentVersion: number }
  | { type: "error"; error: unknown };

type RevisionListener = (event: RevisionCoordinatorEvent) => void;

/** Coordinates listing and restoring host-owned workbook revisions. */
export class RevisionCoordinator {
  private readonly abortController = new AbortController();
  private readonly listeners = new Set<RevisionListener>();
  private version: number;

  constructor(
    private readonly adapter: RevisionAdapter,
    private readonly options: RevisionCoordinatorOptions,
  ) {
    this.version = options.serverVersion;
  }

  get serverVersion(): number {
    return this.version;
  }

  on(listener: RevisionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): Promise<readonly RevisionSummary[]> {
    return this.adapter.listRevisions(this.options.documentId, this.abortController.signal);
  }

  async preview(
    host: HTMLElement,
    version: number,
    options: SnapshotGridOptions = {},
  ): Promise<Grid> {
    const input = await this.adapter.loadRevision(
      this.options.documentId,
      version,
      this.abortController.signal,
    );
    const snapshot = this.options.migrateSnapshot ? this.options.migrateSnapshot(input) : input;
    return createGridFromSnapshot(host, snapshot, { ...options, readOnly: true });
  }

  async restore(targetVersion: number, clientMutationId: string): Promise<RevisionRestoreResponse> {
    try {
      const response = await this.adapter.restoreRevision({
        documentId: this.options.documentId,
        targetVersion,
        baseVersion: this.version,
        clientMutationId,
        signal: this.abortController.signal,
      });
      if (response.status === "conflict") {
        this.version = Math.max(this.version, response.currentVersion);
        this.emit({
          type: "conflict",
          targetVersion,
          currentVersion: response.currentVersion,
        });
        return response;
      }
      this.version = Math.max(this.version, response.version);
      if (response.status === "applied") {
        this.emit({ type: "restored", targetVersion, version: response.version });
      }
      return response;
    } catch (error) {
      this.emit({ type: "error", error });
      throw error;
    }
  }

  destroy(): void {
    this.abortController.abort("Sheetwrite revision coordinator destroyed");
    this.listeners.clear();
  }

  private emit(event: RevisionCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Stable host-provided identity displayed on a comment message. */
export interface CommentAuthorRef {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

/** Document location to which a comment thread is attached. */
export type CommentAnchor =
  | { kind: "cell"; address: { sheet: string; row: number; col: number } }
  | { kind: "range"; range: Range };

/** One immutable author message in a comment thread. */
export interface CommentMessage {
  id: string;
  author: CommentAuthorRef;
  body: string;
  createdAt: string;
  editedAt?: string;
}

/** Versioned discussion anchored to a document location. */
export interface CommentThread {
  id: string;
  documentId: string;
  anchor: CommentAnchor;
  version: number;
  messages: readonly CommentMessage[];
  resolved: boolean;
  resolvedBy?: CommentAuthorRef;
  resolvedAt?: string;
}

/** Serializable operation that creates or updates comment state. */
export type CommentMutation =
  | {
      kind: "create";
      threadId: string;
      messageId: string;
      anchor: CommentAnchor;
      body: string;
    }
  | { kind: "reply"; threadId: string; messageId: string; body: string }
  | { kind: "resolve"; threadId: string; resolved: boolean };

/** Versioned comment mutation submitted to a host adapter. */
export interface CommentMutationRequest {
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  mutation: CommentMutation;
  signal?: AbortSignal;
}

/** Applied, duplicate, or conflict acknowledgement for a comment mutation. */
export type CommentMutationResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      thread: CommentThread;
    }
  | { status: "duplicate"; version: number; clientMutationId: string }
  | { status: "conflict"; currentVersion: number };

/** Versioned comment-thread listing returned by a host adapter. */
export interface CommentListResult {
  version: number;
  threads: readonly CommentThread[];
}

/** Comment mutation paired with its assigned server version. */
export interface VersionedCommentEvent {
  version: number;
  thread: CommentThread;
  clientMutationId?: string;
}

/** Host persistence contract for versioned comment threads. */
export interface CommentAdapter {
  listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
  mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
  subscribeComments?(
    documentId: string,
    listener: (event: VersionedCommentEvent) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
}

/** Document identity and initial version for comment coordination. */
export interface CommentCoordinatorOptions {
  documentId: string;
  serverVersion?: number;
}

/** State transition emitted by the comment coordinator. */
export type CommentCoordinatorEvent =
  | { type: "loaded"; version: number; threads: readonly CommentThread[] }
  | { type: "changed"; version: number; thread: CommentThread }
  | { type: "conflict"; currentVersion: number }
  | { type: "gap"; expectedVersion: number; receivedVersion: number }
  | { type: "error"; error: unknown };

type CommentListener = (event: CommentCoordinatorEvent) => void;

/** Transport/auth-neutral comment state with server-owned author and timestamp fields. */
export class CommentCoordinator {
  private readonly abortController = new AbortController();
  private readonly listeners = new Set<CommentListener>();
  private readonly threads = new Map<string, CommentThread>();
  private readonly disposeRemote?: () => void;
  private version: number;

  constructor(
    private readonly adapter: CommentAdapter,
    private readonly options: CommentCoordinatorOptions,
  ) {
    this.version = options.serverVersion ?? 0;
    this.disposeRemote = adapter.subscribeComments?.(
      options.documentId,
      (event) => this.applyVersionedEvent(event),
      this.abortController.signal,
    );
  }

  get serverVersion(): number {
    return this.version;
  }

  on(listener: CommentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  commentThreads(): readonly CommentThread[] {
    return [...this.threads.values()].map(cloneCommentThread);
  }

  async load(): Promise<readonly CommentThread[]> {
    try {
      const result = await this.adapter.listComments(
        this.options.documentId,
        this.abortController.signal,
      );
      const next = new Map<string, CommentThread>();
      for (const input of result.threads) {
        const thread = validateCommentThread(input, this.options.documentId);
        next.set(thread.id, thread);
      }
      this.threads.clear();
      for (const [id, thread] of next) this.threads.set(id, thread);
      this.version = result.version;
      const threads = this.commentThreads();
      this.emit({ type: "loaded", version: this.version, threads });
      return threads;
    } catch (error) {
      this.emit({ type: "error", error });
      throw error;
    }
  }

  create(
    threadId: string,
    messageId: string,
    anchor: CommentAnchor,
    body: string,
    clientMutationId: string,
  ): Promise<CommentMutationResponse> {
    return this.mutate({ kind: "create", threadId, messageId, anchor, body }, clientMutationId);
  }

  reply(
    threadId: string,
    messageId: string,
    body: string,
    clientMutationId: string,
  ): Promise<CommentMutationResponse> {
    return this.mutate({ kind: "reply", threadId, messageId, body }, clientMutationId);
  }

  resolve(
    threadId: string,
    resolved: boolean,
    clientMutationId: string,
  ): Promise<CommentMutationResponse> {
    return this.mutate({ kind: "resolve", threadId, resolved }, clientMutationId);
  }

  async mutate(
    mutation: CommentMutation,
    clientMutationId: string,
  ): Promise<CommentMutationResponse> {
    try {
      const response = await this.adapter.mutateComment({
        documentId: this.options.documentId,
        baseVersion: this.version,
        clientMutationId,
        mutation: cloneJsonValue(mutation),
        signal: this.abortController.signal,
      });
      if (response.status === "conflict") {
        this.version = Math.max(this.version, response.currentVersion);
        this.emit({ type: "conflict", currentVersion: response.currentVersion });
        return response;
      }
      this.version = Math.max(this.version, response.version);
      if (response.status === "applied") {
        const thread = validateCommentThread(response.thread, this.options.documentId);
        if (thread.id !== mutation.threadId) {
          throw new Error("Comment response changed the stable thread ID");
        }
        this.threads.set(thread.id, thread);
        this.emit({
          type: "changed",
          version: response.version,
          thread: cloneCommentThread(thread),
        });
      }
      return response;
    } catch (error) {
      this.emit({ type: "error", error });
      throw error;
    }
  }

  destroy(): void {
    this.abortController.abort("Sheetwrite comment coordinator destroyed");
    this.disposeRemote?.();
    this.threads.clear();
    this.listeners.clear();
  }

  private applyVersionedEvent(event: VersionedCommentEvent): void {
    if (event.version <= this.version) return;
    if (event.version !== this.version + 1) {
      this.emit({
        type: "gap",
        expectedVersion: this.version + 1,
        receivedVersion: event.version,
      });
      return;
    }
    try {
      const thread = validateCommentThread(event.thread, this.options.documentId);
      this.threads.set(thread.id, thread);
      this.version = event.version;
      this.emit({ type: "changed", version: event.version, thread: cloneCommentThread(thread) });
    } catch (error) {
      this.emit({ type: "error", error });
    }
  }

  private emit(event: CommentCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function selectionRanges(selection: Selection | null, sheet: Sheet): Range[] {
  if (!selection) return [];
  switch (selection.kind) {
    case "cell":
      return [
        {
          sheet: selection.addr.sheet,
          start: { row: selection.addr.row, col: selection.addr.col },
          end: { row: selection.addr.row, col: selection.addr.col },
        },
      ];
    case "range":
      return [cloneJsonValue(selection.range)];
    case "row":
      return sheet.columns.length === 0
        ? []
        : [
            {
              sheet: selection.sheet,
              start: { row: selection.row, col: 0 },
              end: { row: selection.row, col: sheet.columns.length - 1 },
            },
          ];
    case "column":
      return sheet.rowCount === 0
        ? []
        : [
            {
              sheet: selection.sheet,
              start: { row: 0, col: selection.col },
              end: { row: sheet.rowCount - 1, col: selection.col },
            },
          ];
    case "multi":
      return cloneJsonValue(selection.ranges);
  }
}

function normalizePresenceMessage(
  input: PresenceMessage,
  maxRanges: number,
): PresenceMessage | null {
  if (
    !input ||
    typeof input.actor?.id !== "string" ||
    input.actor.id.length === 0 ||
    typeof input.activeSheet !== "string" ||
    !Array.isArray(input.selections) ||
    !Number.isFinite(input.sentAt)
  ) {
    return null;
  }
  const selections = input.selections
    .filter(
      (range) =>
        typeof range?.sheet === "string" &&
        Number.isFinite(range.start?.row) &&
        Number.isFinite(range.start?.col) &&
        Number.isFinite(range.end?.row) &&
        Number.isFinite(range.end?.col),
    )
    .slice(0, maxRanges)
    .map((range) => cloneJsonValue(range));
  return {
    actor: {
      id: input.actor.id,
      ...(input.actor.displayName ? { displayName: input.actor.displayName } : {}),
      ...(input.actor.color ? { color: input.actor.color } : {}),
    },
    activeSheet: input.activeSheet,
    selections,
    sentAt: input.sentAt,
  };
}

function clonePresenceMessage(message: PresenceMessage): PresenceMessage {
  return cloneJsonValue(message);
}

function validateCommentThread(input: CommentThread, documentId: string): CommentThread {
  if (
    !input?.id ||
    input.documentId !== documentId ||
    !Number.isInteger(input.version) ||
    !Array.isArray(input.messages) ||
    input.messages.length === 0
  ) {
    throw new Error("Comment adapter returned an invalid thread");
  }
  for (const message of input.messages) {
    if (
      !message.id ||
      !message.author?.id ||
      !message.createdAt ||
      typeof message.body !== "string"
    ) {
      throw new Error("Comment authorship and timestamps must be supplied by the server adapter");
    }
  }
  if (input.resolved && (!input.resolvedBy?.id || !input.resolvedAt)) {
    throw new Error("Resolved comments require server-owned resolver and timestamp metadata");
  }
  return cloneCommentThread(input);
}

function cloneCommentThread(thread: CommentThread): CommentThread {
  return cloneJsonValue(thread);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
