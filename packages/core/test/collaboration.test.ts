import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type CommentAdapter,
  CommentCoordinator,
  type CommentListResult,
  type CommentMutationRequest,
  type CommentMutationResponse,
  type CommentThread,
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  PresenceCoordinator,
  type PresenceMessage,
  type PresenceTransport,
  type RevisionAdapter,
  RevisionCoordinator,
  type RevisionRestoreRequest,
  type RevisionRestoreResponse,
  type VersionedCommentEvent,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});
afterEach(() => {
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
});

function snapshot(version = 7): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "collab-doc",
    version,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount: 20,
        columns: [
          { key: "a", header: "A", width: 100, type: "text" },
          { key: "b", header: "B", width: 100, type: "text" },
        ],
        cells: [],
      },
    ],
  };
}

function mountGrid(input = snapshot()): { grid: Grid; host: HTMLDivElement } {
  const host = document.createElement("div");
  host.style.width = "600px";
  host.style.height = "300px";
  document.body.appendChild(host);
  return { grid: createGridFromSnapshot(host, input), host };
}

class PresenceBus {
  private readonly listeners = new Set<(message: PresenceMessage) => void>();

  endpoint(): PresenceTransport {
    return {
      publish: (message) => {
        for (const listener of this.listeners) listener(structuredClone(message));
      },
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }
}

function serverThread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "thread-1",
    documentId: "collab-doc",
    anchor: { kind: "cell", address: { sheet: "s1", row: 1, col: 0 } },
    version: 1,
    messages: [
      {
        id: "message-1",
        author: { id: "server-user", displayName: "Server User" },
        body: "Check this",
        createdAt: "2026-07-13T12:00:00.000Z",
      },
    ],
    resolved: false,
    ...overrides,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe("presence coordinator", () => {
  it("truncates remote selections, preserves the document, and expires presence", async () => {
    const bus = new PresenceBus();
    const left = mountGrid();
    const right = mountGrid();
    let now = 1_000;
    const leftPresence = new PresenceCoordinator(left.grid, bus.endpoint(), {
      actor: { id: "left", displayName: "Left User", color: "#ef4444" },
      heartbeatMs: 0,
      timeoutMs: 100,
      maxRangesPerActor: 2,
      now: () => now,
    });
    const rightPresence = new PresenceCoordinator(right.grid, bus.endpoint(), {
      actor: { id: "right", displayName: "Right User", color: "#2563eb" },
      heartbeatMs: 0,
      timeoutMs: 100,
      maxRangesPerActor: 2,
      now: () => now,
    });
    const before = right.grid.exportSnapshot();

    left.grid.setSelection({
      kind: "multi",
      ranges: [
        { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
        { sheet: "s1", start: { row: 4, col: 0 }, end: { row: 5, col: 1 } },
        { sheet: "s1", start: { row: 7, col: 0 }, end: { row: 8, col: 1 } },
      ],
    });
    await Promise.resolve();
    right.grid.refresh();

    expect(rightPresence.remotePresence()).toEqual([
      {
        actor: { id: "left", displayName: "Left User", color: "#ef4444" },
        activeSheet: "s1",
        selections: [
          { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
          { sheet: "s1", start: { row: 4, col: 0 }, end: { row: 5, col: 1 } },
        ],
        sentAt: 1_000,
      },
    ]);
    const presenceLabels = right.host.querySelectorAll('[data-sheetwrite-presence-label="left"]');
    expect(presenceLabels.length).toBeGreaterThan(0);
    expect(presenceLabels[0]?.getAttribute("title")).toBe("Left User");
    expect(right.grid.exportSnapshot()).toEqual(before);

    now = 1_101;
    rightPresence.pruneStale();
    right.grid.refresh();
    expect(rightPresence.remotePresence()).toEqual([]);
    expect(right.host.querySelectorAll('[data-sheetwrite-presence="left"]')).toHaveLength(0);

    leftPresence.destroy();
    rightPresence.destroy();
    left.grid.destroy();
    right.grid.destroy();
  });

  it("honors outbound display-name and selection privacy", async () => {
    const bus = new PresenceBus();
    const privateGrid = mountGrid();
    const receiverGrid = mountGrid();
    const sender = new PresenceCoordinator(privateGrid.grid, bus.endpoint(), {
      actor: { id: "private", displayName: "Hidden Name", color: "#111111" },
      privacy: { shareDisplayName: false, shareSelection: false },
      heartbeatMs: 0,
    });
    const receiver = new PresenceCoordinator(receiverGrid.grid, bus.endpoint(), {
      actor: { id: "receiver" },
      heartbeatMs: 0,
    });

    privateGrid.grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 1 } });
    await Promise.resolve();
    expect(receiver.remotePresence()[0]).toMatchObject({
      actor: { id: "private", color: "#111111" },
      selections: [],
    });
    expect(receiver.remotePresence()[0]?.actor.displayName).toBeUndefined();

    sender.destroy();
    receiver.destroy();
    privateGrid.grid.destroy();
    receiverGrid.grid.destroy();
  });
});

describe("revision coordinator", () => {
  it("migrates previews into read-only grids and restores as a newer auditable version", async () => {
    const requests: RevisionRestoreRequest[] = [];
    const adapter: RevisionAdapter = {
      async listRevisions() {
        return [{ version: 3, createdAt: "2026-07-13T10:00:00.000Z", label: "Before import" }];
      },
      async loadRevision() {
        return { ...snapshot(3), schemaVersion: 0 };
      },
      async restoreRevision(request) {
        requests.push(request);
        return {
          status: "applied",
          version: 8,
          clientMutationId: request.clientMutationId,
          snapshot: snapshot(8),
        };
      },
    };
    const coordinator = new RevisionCoordinator(adapter, {
      documentId: "collab-doc",
      serverVersion: 7,
      migrateSnapshot: (input) => ({ ...(input as WorkbookSnapshot), schemaVersion: 1 }),
    });

    const previewHost = document.createElement("div");
    document.body.appendChild(previewHost);
    const preview = await coordinator.preview(previewHost, 3);
    expect(
      preview.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "literal", value: "blocked" },
          },
        ],
      }),
    ).toMatchObject({ status: "noop", reason: "read-only" });

    const restored = await coordinator.restore(3, "restore-m1");
    expect(restored).toMatchObject({ status: "applied", version: 8 });
    expect(requests[0]).toMatchObject({
      documentId: "collab-doc",
      targetVersion: 3,
      baseVersion: 7,
      clientMutationId: "restore-m1",
    });
    expect(coordinator.serverVersion).toBe(8);
    preview.destroy();
    coordinator.destroy();
  });

  it("surfaces revision restore conflicts without rewinding state", async () => {
    const adapter: RevisionAdapter = {
      async listRevisions() {
        return [];
      },
      async loadRevision() {
        return snapshot();
      },
      async restoreRevision(): Promise<RevisionRestoreResponse> {
        return { status: "conflict", currentVersion: 9 };
      },
    };
    const coordinator = new RevisionCoordinator(adapter, {
      documentId: "collab-doc",
      serverVersion: 7,
    });
    expect(await coordinator.restore(2, "restore-conflict")).toEqual({
      status: "conflict",
      currentVersion: 9,
    });
    expect(coordinator.serverVersion).toBe(9);
    coordinator.destroy();
  });
});

describe("comment coordinator", () => {
  it("keeps identity host-owned while requiring server authorship and timestamps", async () => {
    const requests: CommentMutationRequest[] = [];
    let remoteListener: ((event: VersionedCommentEvent) => void) | undefined;
    const adapter: CommentAdapter = {
      async listComments() {
        return { version: 1, threads: [serverThread()] };
      },
      async mutateComment(request) {
        requests.push(request);
        const messages = [
          ...serverThread().messages,
          ...(request.mutation.kind === "reply"
            ? [
                {
                  id: request.mutation.messageId,
                  author: { id: "authenticated-host-user" },
                  body: request.mutation.body,
                  createdAt: "2026-07-13T12:05:00.000Z",
                },
              ]
            : []),
        ];
        return {
          status: "applied",
          version: request.baseVersion + 1,
          clientMutationId: request.clientMutationId,
          thread: serverThread({ version: request.baseVersion + 1, messages }),
        };
      },
      subscribeComments(_documentId, listener) {
        remoteListener = listener;
      },
    };
    const coordinator = new CommentCoordinator(adapter, {
      documentId: "collab-doc",
    });
    expect(await coordinator.load()).toHaveLength(1);

    await coordinator.reply("thread-1", "message-2", "I fixed it", "comment-m1");
    expect(requests[0]).toMatchObject({
      documentId: "collab-doc",
      baseVersion: 1,
      clientMutationId: "comment-m1",
      mutation: {
        kind: "reply",
        threadId: "thread-1",
        messageId: "message-2",
        body: "I fixed it",
      },
    });
    expect("author" in requests[0]!.mutation).toBe(false);
    expect(coordinator.commentThreads()[0]?.messages[1]).toMatchObject({
      id: "message-2",
      author: { id: "authenticated-host-user" },
      createdAt: "2026-07-13T12:05:00.000Z",
    });

    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    remoteListener?.({ version: 4, thread: serverThread({ version: 4 }) });
    expect(events).toContain("gap");
    expect(coordinator.serverVersion).toBe(2);
    coordinator.destroy();
  });

  it("forwards resolve mutations with the current server version", async () => {
    let request: CommentMutationRequest | undefined;
    const adapter: CommentAdapter = {
      async listComments() {
        return { version: 3, threads: [serverThread({ version: 3 })] };
      },
      async mutateComment(input) {
        request = input;
        return { status: "conflict", currentVersion: 4 };
      },
    };
    const coordinator = new CommentCoordinator(adapter, {
      documentId: "collab-doc",
      serverVersion: 3,
    });

    await expect(coordinator.resolve("thread-1", true, "comment-resolve")).resolves.toEqual({
      status: "conflict",
      currentVersion: 4,
    });
    expect(request).toMatchObject({
      documentId: "collab-doc",
      baseVersion: 3,
      clientMutationId: "comment-resolve",
      mutation: { kind: "resolve", threadId: "thread-1", resolved: true },
    });
    coordinator.destroy();
  });

  it("rejects comment responses without server-owned attribution metadata", async () => {
    const adapter: CommentAdapter = {
      async listComments() {
        return { version: 0, threads: [] };
      },
      async mutateComment(request) {
        return {
          status: "applied",
          version: 1,
          clientMutationId: request.clientMutationId,
          thread: serverThread({
            id: request.mutation.threadId,
            version: 1,
            messages: [
              {
                id: "message-bad",
                author: { id: "" },
                body: "missing attribution",
                createdAt: "",
              },
            ],
          }),
        };
      },
    };
    const coordinator = new CommentCoordinator(adapter, { documentId: "collab-doc" });
    await expect(
      coordinator.create(
        "thread-bad",
        "message-bad",
        { kind: "cell", address: { sheet: "s1", row: 0, col: 0 } },
        "Bad",
        "comment-bad",
      ),
    ).rejects.toThrow("server adapter");
    coordinator.destroy();
  });

  it("discards a stale list when a streamed event advances state", async () => {
    const listing = deferred<CommentListResult>();
    let remoteListener: ((event: VersionedCommentEvent) => void) | undefined;
    const adapter: CommentAdapter = {
      listComments: () => listing.promise,
      async mutateComment() {
        return { status: "conflict", currentVersion: 2 };
      },
      subscribeComments(_documentId, listener) {
        remoteListener = listener;
      },
    };
    const coordinator = new CommentCoordinator(adapter, {
      documentId: "collab-doc",
      serverVersion: 1,
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));

    const pending = coordinator.load();
    remoteListener?.({
      version: 2,
      thread: serverThread({ id: "thread-live", version: 2 }),
    });
    listing.resolve({
      version: 1,
      threads: [serverThread({ id: "thread-stale", version: 1 })],
    });

    expect(await pending).toEqual(coordinator.commentThreads());
    expect(coordinator.serverVersion).toBe(2);
    expect(coordinator.commentThreads().map((thread) => thread.id)).toEqual(["thread-live"]);
    expect(events).toEqual(["changed"]);
    coordinator.destroy();
  });

  it("does not rewind to a list older than the current version", async () => {
    const adapter: CommentAdapter = {
      async listComments() {
        return { version: 3, threads: [serverThread({ version: 3 })] };
      },
      async mutateComment() {
        return { status: "conflict", currentVersion: 4 };
      },
    };
    const coordinator = new CommentCoordinator(adapter, {
      documentId: "collab-doc",
      serverVersion: 4,
    });
    expect(await coordinator.load()).toEqual([]);
    expect(coordinator.serverVersion).toBe(4);
    expect(coordinator.commentThreads()).toEqual([]);
    coordinator.destroy();
  });

  it("accepts a same-version event after rejecting invalid mutation metadata", async () => {
    let remoteListener: ((event: VersionedCommentEvent) => void) | undefined;
    const mutation = deferred<CommentMutationResponse>();
    const adapter: CommentAdapter = {
      async listComments() {
        return { version: 0, threads: [] };
      },
      mutateComment: () => mutation.promise,
      subscribeComments(_documentId, listener) {
        remoteListener = listener;
      },
    };
    const coordinator = new CommentCoordinator(adapter, { documentId: "collab-doc" });
    const pending = coordinator.create(
      "thread-race",
      "message-race",
      { kind: "cell", address: { sheet: "s1", row: 0, col: 0 } },
      "Race",
      "comment-race",
    );
    mutation.resolve({
      status: "applied",
      version: 1,
      clientMutationId: "comment-race",
      thread: serverThread({
        id: "thread-race",
        version: 1,
        messages: [
          {
            id: "message-race",
            author: { id: "" },
            body: "invalid",
            createdAt: "",
          },
        ],
      }),
    });
    await expect(pending).rejects.toThrow("server adapter");
    expect(coordinator.serverVersion).toBe(0);

    remoteListener?.({
      version: 1,
      thread: serverThread({ id: "thread-race", version: 1 }),
    });
    expect(coordinator.serverVersion).toBe(1);
    expect(coordinator.commentThreads().map((thread) => thread.id)).toEqual(["thread-race"]);
    coordinator.destroy();
  });

  it("does not commit pending list or mutation responses after destroy", async () => {
    const listing = deferred<CommentListResult>();
    const mutation = deferred<CommentMutationResponse>();
    const adapter: CommentAdapter = {
      listComments: () => listing.promise,
      mutateComment: () => mutation.promise,
    };
    const coordinator = new CommentCoordinator(adapter, { documentId: "collab-doc" });
    const pendingList = coordinator.load();
    const pendingMutation = coordinator.create(
      "thread-destroyed",
      "message-destroyed",
      { kind: "cell", address: { sheet: "s1", row: 0, col: 0 } },
      "Destroyed",
      "comment-destroyed",
    );
    coordinator.destroy();
    listing.resolve({ version: 1, threads: [serverThread({ version: 1 })] });
    mutation.resolve({
      status: "applied",
      version: 2,
      clientMutationId: "comment-destroyed",
      thread: serverThread({ id: "thread-destroyed", version: 2 }),
    });

    expect(await pendingList).toEqual([]);
    expect(await pendingMutation).toMatchObject({ status: "applied", version: 2 });
    expect(coordinator.serverVersion).toBe(0);
    expect(coordinator.commentThreads()).toEqual([]);
  });
});
