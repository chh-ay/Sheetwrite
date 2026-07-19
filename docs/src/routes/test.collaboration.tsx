import {
  createGridFromSnapshot,
  initSheetwrite,
  type PendingCommit,
  PresenceCoordinator,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ShowcaseCollaborationServer,
  ShowcasePresenceBus,
} from "../showcases/collaboration-protocol.js";
import { deleteShowcaseDatabase } from "../showcases/showcase-database.js";

export const Route = createFileRoute("/test/collaboration")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: CollaborationFixture,
});

const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  documentId: "browser-collaboration",
  version: 0,
  workbook: { activeSheet: "s1" },
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      order: 0,
      rowCount: 4,
      columns: [
        { key: "a", header: "A", width: 120, type: "number" },
        { key: "b", header: "B", width: 120, type: "number" },
      ],
      cells: [],
    },
  ],
};

async function exerciseCollaboration(hostA: HTMLDivElement, hostB: HTMLDivElement) {
  await initSheetwrite();
  const server = new ShowcaseCollaborationServer(snapshot);
  const gridA = createGridFromSnapshot(hostA, snapshot);
  const gridB = createGridFromSnapshot(hostB, snapshot);
  let nextMutation = 1;
  const syncA = new SyncCoordinator(gridA, server, {
    documentId: "browser-collaboration",
    serverVersion: 0,
    createMutationId: () => `browser-a-${nextMutation++}`,
  });
  const syncB = new SyncCoordinator(gridB, server, {
    documentId: "browser-collaboration",
    serverVersion: 0,
  });
  const presenceBus = new ShowcasePresenceBus();
  const presenceA = new PresenceCoordinator(gridA, presenceBus.endpoint(), {
    actor: { id: "actor-a", displayName: "Actor A", color: "#dc2626" },
    heartbeatMs: 0,
  });
  const presenceB = new PresenceCoordinator(gridB, presenceBus.endpoint(), {
    actor: { id: "actor-b", displayName: "Actor B", color: "#2563eb" },
    heartbeatMs: 0,
  });

  try {
    syncA.subscribe(server);
    syncB.subscribe(server);
    gridA.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: 21 },
        },
      ],
    });
    await syncA.sendNext();
    gridA.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "formula", src: "=A1*2" },
        },
      ],
    });
    await syncA.sendNext();
    gridA.renameSheet("s1", "Shared");
    await syncA.sendNext();

    const literal = gridB.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved;
    const formula = gridB.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved;
    const sheetName = gridB.store.getWorkbook().sheets[0]?.name;
    if (literal !== 21 || formula !== 42 || sheetName !== "Shared") {
      throw new Error("Two-grid server sequencing did not converge cell/formula/metadata state");
    }

    gridA.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    await presenceA.publishNow();
    gridB.refresh();
    const presenceRects = hostB.querySelectorAll('[data-sheetwrite-presence="actor-a"]');
    if (presenceRects.length === 0) throw new Error("Remote presence overlay was not painted");

    const databaseName = "sheetwrite-browser-collaboration-test";
    await deleteShowcaseDatabase(databaseName);
    const durable = new IndexedDbPendingCommitStorage({ databaseName });
    const pending: PendingCommit = {
      documentId: "browser-collaboration",
      baseVersion: 3,
      clientMutationId: "durable-browser-m1",
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 0 },
          value: { kind: "literal", value: 84 },
        },
      ],
    };
    await durable.put(pending);
    durable.close();
    await Promise.resolve();
    const reopened = new IndexedDbPendingCommitStorage({ databaseName });
    try {
      const loadBounds = { maxRecords: 16, maxOperations: 256, maxBytes: 1024 * 1024 };
      const restored = await reopened.load("browser-collaboration", loadBounds);
      if (restored.length !== 1 || restored[0]?.clientMutationId !== "durable-browser-m1") {
        throw new Error("IndexedDB pending commit did not survive reopen");
      }
      await reopened.remove("browser-collaboration", "durable-browser-m1");
      if ((await reopened.load("browser-collaboration", loadBounds)).length !== 0) {
        throw new Error("Acknowledged IndexedDB commit was not removed");
      }
      return {
        literal,
        formula,
        sheetName,
        presenceRects: presenceRects.length,
        restoredMutation: restored[0]?.clientMutationId,
        version: syncB.serverVersion,
      };
    } finally {
      reopened.close();
    }
  } finally {
    presenceA.destroy();
    presenceB.destroy();
    syncA.destroy();
    syncB.destroy();
    gridA.destroy();
    gridB.destroy();
  }
}

function CollaborationFixture() {
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ status: "running" | "ready" | "error"; text: string }>({
    status: "running",
    text: "running",
  });

  useEffect(() => {
    if (hostA.current === null || hostB.current === null) return;
    let cancelled = false;
    void exerciseCollaboration(hostA.current, hostB.current).then(
      (payload) => {
        if (!cancelled) setResult({ status: "ready", text: JSON.stringify(payload) });
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            status: "error",
            text: error instanceof Error ? (error.stack ?? error.message) : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="sw-test-fixture">
      <pre id="result" data-status={result.status}>
        {result.text}
      </pre>
      <div ref={hostA} style={{ width: 520, height: 260 }} />
      <div ref={hostB} style={{ width: 520, height: 260 }} />
    </main>
  );
}
