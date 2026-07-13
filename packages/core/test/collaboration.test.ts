import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type CommentAdapter,
  CommentCoordinator,
  type CommentMutationRequest,
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
  rebaseDocumentOperations,
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

describe("presence coordinator", () => {
  it("shares bounded ephemeral selections, paints pooled overlays, and expires them", async () => {
    const bus = new PresenceBus();
    const left = mountGrid();
    const right = mountGrid();
    let now = 1_000;
    const leftPresence = new PresenceCoordinator(left.grid, bus.endpoint(), {
      actor: { id: "left", displayName: "Left User", color: "#ef4444" },
      heartbeatMs: 0,
      timeoutMs: 100,
      now: () => now,
    });
    const rightPresence = new PresenceCoordinator(right.grid, bus.endpoint(), {
      actor: { id: "right", displayName: "Right User", color: "#2563eb" },
      heartbeatMs: 0,
      timeoutMs: 100,
      now: () => now,
    });
    const before = right.grid.exportSnapshot();

    left.grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: -5, col: 0 }, end: { row: 999, col: 1 } },
    });
    await Promise.resolve();
    right.grid.refresh();

    expect(rightPresence.remotePresence()).toEqual([
      {
        actor: { id: "left", displayName: "Left User", color: "#ef4444" },
        activeSheet: "s1",
        selections: [{ sheet: "s1", start: { row: -5, col: 0 }, end: { row: 999, col: 1 } }],
        sentAt: 1_000,
      },
    ]);
    const presenceRects = right.host.querySelectorAll('[data-sheetwrite-presence="left"]');
    expect(presenceRects.length).toBeGreaterThan(0);
    expect(presenceRects[0]?.getAttribute("title")).toBe("Left User");
    expect(right.grid.exportSnapshot()).toEqual(before);

    const poolSize = right.host.querySelectorAll(".sheetwrite-overlay > div").length;
    left.grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
    await Promise.resolve();
    right.grid.refresh();
    expect(right.host.querySelectorAll(".sheetwrite-overlay > div").length).toBe(poolSize);

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
    expect(await coordinator.list()).toEqual([
      { version: 3, createdAt: "2026-07-13T10:00:00.000Z", label: "Before import" },
    ]);

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
});

describe("server-ordered structural rebase", () => {
  it("shifts non-overlapping literal edits across row and column insertion", () => {
    const result = rebaseDocumentOperations(
      [
        {
          op: "set",
          addr: { sheet: "s1", row: 3, col: 1 },
          value: { kind: "literal", value: "offline" },
        },
      ],
      [
        { op: "addRows", sheet: "s1", at: 1, count: 2 },
        {
          op: "addColumns",
          sheet: "s1",
          at: 0,
          columns: [{ key: "new", header: "New", width: 100, type: "text" }],
        },
      ],
    );
    expect(result).toEqual({
      status: "rebased",
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 5, col: 2 },
          value: { kind: "literal", value: "offline" },
        },
      ],
    });
  });

  it("characterizes overlapping delete, formula, range-paste, and sheet-lifecycle conflicts", () => {
    expect(
      rebaseDocumentOperations(
        [
          {
            op: "set",
            addr: { sheet: "s1", row: 2, col: 0 },
            value: { kind: "literal", value: 1 },
          },
        ],
        [{ op: "removeRows", sheet: "s1", at: 1, count: 3 }],
      ),
    ).toMatchObject({ status: "conflict", conflict: { code: "structural-overlap" } });

    expect(
      rebaseDocumentOperations(
        [
          {
            op: "set",
            addr: { sheet: "s1", row: 8, col: 0 },
            value: { kind: "formula", src: "=A1+1" },
          },
        ],
        [{ op: "addRows", sheet: "s1", at: 1, count: 1 }],
      ),
    ).toMatchObject({ status: "conflict", conflict: { code: "formula-structural" } });

    expect(
      rebaseDocumentOperations(
        [
          {
            op: "setBlock",
            range: { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 3, col: 1 } },
            block: { rowCount: 2, colCount: 2, values: [1, 2, 3, 4] },
          },
        ],
        [
          {
            op: "setRangeStyle",
            range: { sheet: "s1", start: { row: 3, col: 1 }, end: { row: 4, col: 1 } },
            style: { bold: true },
          },
        ],
      ),
    ).toMatchObject({ status: "conflict", conflict: { code: "overlapping-edit" } });

    expect(
      rebaseDocumentOperations(
        [{ op: "renameSheet", sheet: "s1", name: "Offline name" }],
        [{ op: "removeSheet", sheet: "s1" }],
      ),
    ).toMatchObject({ status: "conflict", conflict: { code: "sheet-removed" } });
  });
});
