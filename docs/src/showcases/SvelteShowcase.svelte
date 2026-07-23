<script lang="ts">
// Svelte 5 runes island for the offline/collaborative dispatch workbench.
// The adapter owns canonical mount/reset/destroy of the Grid; a framework-
// neutral session (svelte-workbench.ts) owns the durable outbox, connectivity,
// presence, and conflict recovery. Runes only mirror observable state.
import type { Grid, PresenceMessage, SyncMutationRecord, SyncStateSnapshot } from "@sheetwrite/core";
import { createFormulaBar, createNameBox, createSelectionStatus } from "@sheetwrite/core/shell";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import { Cloud, CloudOff, GitMerge, Radio, RefreshCw, Users } from "lucide-svelte";
import { OFFLINE_ROWS, OFFLINE_LOCAL_ACTOR, OFFLINE_THEME } from "./scenarios/offline.js";
import {
  SvelteWorkbenchSession,
  type WorkbenchConflict,
  type WorkbenchFeedEntry,
  type WorkbenchMount,
} from "./svelte-workbench.js";
import "@sheetwrite/svelte/styles.css";
import "@sheetwrite/core/shell.css";

/** Hoisted: a stable identity means the adapter never reconfigures per render. */
const GRID_CONFIG = { toolbar: false } as const;

let session = $state<SvelteWorkbenchSession>();
let bootError = $state<string>();
let mount = $state<WorkbenchMount>();
let generation = $state(1);
let remountNote = $state("initial");
let grid = $state<Grid>();
let online = $state(true);
let merging = $state(false);
let syncState = $state<SyncStateSnapshot>();
let queue = $state<readonly SyncMutationRecord[]>([]);
let conflict = $state<WorkbenchConflict | null>(null);
let peers = $state<readonly PresenceMessage[]>([]);
let feed = $state<WorkbenchFeedEntry[]>([]);
let chromeHost = $state<HTMLDivElement>();
let gridWrap = $state<HTMLDivElement>();

const statusLabel = $derived.by(() => {
  if (bootError) return `Boot failed: ${bootError}`;
  const state = syncState;
  if (!state) return "Preparing the workbook…";
  switch (state.activity) {
    case "hydrating":
      return "Restoring the durable outbox…";
    case "persisting":
      return "Writing the outbox…";
    case "sending":
      return "Syncing queued edits…";
    case "conflict":
      return "Base-version conflict — merge required";
    case "error":
      return "Sync error — see activity";
    case "destroyed":
      return "Disconnected";
    case "pending":
      return online
        ? `${state.pendingCount} edit${state.pendingCount === 1 ? "" : "s"} waiting to sync`
        : `${state.pendingCount} edit${state.pendingCount === 1 ? "" : "s"} queued offline`;
    case "idle":
      return online
        ? `All changes synced · server v${state.serverVersion}`
        : `Offline · in sync at v${state.serverVersion}`;
  }
});

const ready = $derived(
  session !== undefined && grid !== undefined && syncState?.activity !== "hydrating",
);

const journey = $derived.by(() => {
  const state = syncState;
  if (bootError) {
    return {
      state: "error",
      title: "Dispatch could not start",
      detail: "The workbook did not boot. Review the sync activity before retrying.",
    };
  }
  if (!state || state.activity === "hydrating") {
    return {
      state: "loading",
      title: "Restoring field state",
      detail: "Opening the dispatch board and its durable IndexedDB outbox.",
    };
  }
  if (conflict || state.activity === "conflict") {
    return {
      state: "conflict",
      title: "Review the version conflict",
      detail: "HQ moved the server ahead. Inspect the evidence, then merge the queued field edit.",
    };
  }
  if (state.activity === "error") {
    return {
      state: "error",
      title: "Sync needs attention",
      detail: "Your local edits remain visible. Review the activity below for the failed step.",
    };
  }
  if (!online && queue.length === 0) {
    return {
      state: "offline",
      title: "Edit a ticket without signal",
      detail: "The Grid stays editable. Your next field update will be written to the durable outbox.",
    };
  }
  if (!online) {
    return {
      state: "pending",
      title: `${queue.length} field edit${queue.length === 1 ? " is" : "s are"} safe`,
      detail: "The device owns this pending work. Reconnect above to drain it in order.",
    };
  }
  if (state.activity === "sending" || state.activity === "persisting" || queue.length > 0) {
    return {
      state: "pending",
      title: "Draining the durable outbox",
      detail: "Queued edits are crossing to dispatch in order; acknowledgements advance the server version.",
    };
  }
  if (state.serverVersion > 0) {
    return {
      state: "resolved",
      title: "Field handoff complete",
      detail: `The queue is empty and dispatch has acknowledged every edit through server v${state.serverVersion}.`,
    };
  }
  return {
    state: "connected",
    title: "Take the board offline",
    detail: "Disconnect above, edit a live ticket, then reconnect to prove the durable handoff.",
  };
});

// One session per island lifetime; it outlives every grid generation.
$effect(() => {
  let cancelled = false;
  let created: SvelteWorkbenchSession | undefined;
  void SvelteWorkbenchSession.create({
    onState: (state) => {
      syncState = state;
    },
    onQueue: (records) => {
      queue = records;
    },
    onConflict: (report) => {
      conflict = report;
    },
    onPeers: (remote) => {
      peers = remote;
    },
    onFeed: (entry) => {
      feed = [entry, ...feed].slice(0, 7);
    },
    onRemount: (nextMount, note) => {
      mount = nextMount;
      remountNote = note;
      generation += 1;
    },
  }).then(
    (value) => {
      if (cancelled) {
        value.destroy();
        return;
      }
      created = value;
      session = value;
      mount = value.initialMount();
    },
    (error: unknown) => {
      if (!cancelled) bootError = error instanceof Error ? error.message : String(error);
    },
  );
  return () => {
    cancelled = true;
    created?.destroy();
  };
});

// Connect each published Grid generation to the session; the cleanup runs when
// the adapter resets, the island remounts, or the component unmounts.
$effect(() => {
  const activeGrid = grid;
  const activeSession = session;
  const activeMount = mount;
  if (!activeGrid || !activeSession || !activeMount) return;
  activeSession.connect(activeGrid, activeMount.version);
  (window as { __sheetwriteSvelteGrid?: Grid }).__sheetwriteSvelteGrid = activeGrid;
  return () => {
    delete (window as { __sheetwriteSvelteGrid?: Grid }).__sheetwriteSvelteGrid;
    activeSession.disconnect();
  };
});

$effect(() => {
  const activeGrid = grid;
  if (!activeGrid) return;
  const observer = new MutationObserver(() => activeGrid.replaceTheme(OFFLINE_THEME));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
});

// Shell chrome (name box, formula bar, selection status) binds to the same
// Grid handle the adapter publishes — chrome composition without a wrapper.
$effect(() => {
  const active = grid;
  const chrome = chromeHost;
  if (!active || !chrome) return;
  const focusGrid = (): void => {
    gridWrap?.querySelector<HTMLElement>(".sheetwrite")?.focus();
  };
  const pieces = [
    createNameBox(chrome, active, { focusGrid }),
    createFormulaBar(chrome, active, { focusGrid }),
    createSelectionStatus(chrome, active),
  ];
  chrome.querySelector<HTMLInputElement>(".sheetwrite-shell-namebox")?.setAttribute("placeholder", "A1");
  chrome
    .querySelector<HTMLInputElement>(".sheetwrite-shell-formula")
    ?.setAttribute("placeholder", "Select a ticket cell or enter a value");
  return () => {
    for (const piece of pieces) piece.destroy();
  };
});

function toggleConnection(): void {
  if (!session) return;
  online = !online;
  void session.setOnline(online);
}

async function mergeConflict(): Promise<void> {
  if (!session || merging) return;
  merging = true;
  try {
    await session.mergeAndResync();
  } finally {
    merging = false;
  }
}
</script>

<section class="sw-demo-app sw-svw" data-framework="svelte" data-generation={generation} data-remount-note={remountNote}>
  <main class="sw-demo-main" id="dispatch">
    <header class="sw-demo-controlbar sw-svw-chrome">
      <div class="sw-demo-controlbar__identity">
        <span class="sw-demo-product__mark" aria-hidden="true">
          <Radio size={16} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Field dispatch</h2>
          <span>{OFFLINE_ROWS} live tickets</span>
        </div>
      </div>

      <button
        type="button"
        class="sw-svw-toggle"
        data-state={journey.state}
        data-testid="connection-toggle"
        role="switch"
        aria-checked={online}
        aria-label="Connection to dispatch server"
        disabled={!ready}
        onclick={toggleConnection}
      >
        {#if online}
          <Cloud size={15} aria-hidden="true" />
          {syncState?.activity === "sending" ? "Draining" : "Connected"}
        {:else}
          <CloudOff size={15} aria-hidden="true" />
          {queue.length > 0 ? `Offline · ${queue.length}` : "Offline"}
        {/if}
      </button>

      <div class="sw-svw-shellbar" bind:this={chromeHost}></div>

      <div class="sw-svw-collaborators">
        <span>Working here</span>
        <ul class="sw-svw-presence" data-testid="presence-list" aria-label="Collaborators on this document">
          <li style:--sw-svw-peer={OFFLINE_LOCAL_ACTOR.color}>
            {OFFLINE_LOCAL_ACTOR.displayName}
          </li>
          {#each peers as peer (peer.actor.id)}
            <li style:--sw-svw-peer={peer.actor.color}>
              {peer.actor.displayName ?? peer.actor.id}
            </li>
          {/each}
        </ul>
      </div>
    </header>

    <div class="sw-demo-workspace" data-journey-state={journey.state}>
      <section class="sw-svw-gridstage" aria-label="Editable field dispatch workbook">
        <header>
          <strong>Dispatch Grid</strong>
          <span>Edit ticket status directly or use the field action.</span>
        </header>
        <div class="sw-demo-grid" bind:this={gridWrap}>
          {#if mount}
            {#key generation}
              <SheetwriteGrid
                bind:grid
                workbook={mount.workbook}
                data={mount.data}
                theme={OFFLINE_THEME}
                config={GRID_CONFIG}
                fill
              />
            {/key}
          {/if}
        </div>
      </section>

      <aside class="sw-demo-activity sw-svw-rail" id="sync" aria-label="Offline field handoff">
        <section class="sw-svw-mission" data-state={journey.state}>
          <div class="sw-svw-mission__eyebrow">
            <span>FIELD HANDOFF</span>
            <span data-testid="server-version">server v{syncState?.serverVersion ?? 0}</span>
          </div>
          <h3>{journey.title}</h3>
          <strong role="status" data-testid="sync-status">{statusLabel}</strong>
          <p>{journey.detail}</p>
          <button
            type="button"
            data-variant={online ? "secondary" : "primary"}
            data-testid="log-button"
            disabled={!ready}
            onclick={() => session?.logNextEntry()}
          >
            {online ? "Edit next ticket" : "Edit next ticket offline"}
          </button>
        </section>

        <section class="sw-svw-outbox" aria-labelledby="sw-svw-outbox-title">
          <div class="sw-svw-sectionhead">
            <h3 id="sw-svw-outbox-title">Durable outbox</h3>
            <span data-testid="queue-count">{queue.length}</span>
          </div>
          {#if queue.length === 0}
            <p class="sw-demo-activity__empty">
              {journey.state === "resolved"
                ? `Drained — acknowledged through server v${syncState?.serverVersion ?? 0}.`
                : "No field edits waiting for dispatch."}
            </p>
          {:else}
            <ol data-testid="pending-queue" aria-label="Edits waiting for server acknowledgement">
              {#each queue as record (record.clientMutationId)}
                <li data-status={record.status}>
                  <code>{record.clientMutationId}</code>
                  <span>{record.status}</span>
                  <span>base v{record.baseVersion}</span>
                </li>
              {/each}
            </ol>
          {/if}
        </section>

        {#if conflict}
          <section class="sw-svw-conflict" role="alert" data-testid="conflict-panel">
            <div class="sw-svw-sectionhead">
              <h3>Version conflict</h3>
              <span>v{conflict.baseVersion} → v{conflict.currentVersion}</span>
            </div>
            <strong>
              <code>{conflict.clientMutationId}</code> is based on v{conflict.baseVersion}; the server is at v{conflict.currentVersion}.
            </strong>
            <ul aria-label="Remote commits since your base version">
              {#each conflict.remoteSummaries as summary (summary)}
                <li>{summary}</li>
              {/each}
            </ul>
            <span>
              {conflict.rebase === "clean"
                ? "Conservative rebase: no overlap with your queued edits."
                : "Overlapping edits — your queued values win on resync."}
            </span>
            <button type="button" data-testid="merge-button" disabled={merging} onclick={() => void mergeConflict()}>
              <GitMerge size={14} aria-hidden="true" /> {merging ? "Merging…" : "Merge & resync"}
            </button>
          </section>
        {/if}

        <section class="sw-svw-feed" aria-labelledby="sw-svw-feed-title">
          <div class="sw-svw-sectionhead">
            <h3 id="sw-svw-feed-title">What happened</h3>
            <span>live</span>
          </div>
          <ol data-testid="activity-feed" aria-live="polite" aria-label="Recent synchronization activity">
            {#if feed.length === 0}
              <li>Connection and queue events will appear here.</li>
            {:else}
              {#each feed as entry (entry.id)}
                <li data-tone={entry.tone}>{entry.text}</li>
              {/each}
            {/if}
          </ol>
        </section>

        <details class="sw-svw-tools" data-testid="rare-actions">
          <summary>Recovery scenarios</summary>
          <p>Prove concurrent HQ work or remount the Svelte island while its outbox is offline.</p>
          <div class="sw-svw-actions" role="group" aria-label="Recovery scenario actions">
            <button type="button" data-testid="colleague-button" disabled={!session} onclick={() => void session?.colleagueCommit()}>
              <Users size={14} aria-hidden="true" /> HQ commits work
            </button>
            <button type="button" data-variant="quiet" data-testid="remount-button" disabled={!ready} onclick={() => session?.remountIsland()}>
              <RefreshCw size={14} aria-hidden="true" /> Remount island
            </button>
          </div>
        </details>
      </aside>
    </div>

    <footer class="sw-demo-status sw-demo-status--metrics">
      <span>{OFFLINE_ROWS} dispatch rows</span>
      <span>server v{syncState?.serverVersion ?? 0}</span>
      <span>outbox {queue.length}</span>
      <span>{online ? "connected" : "offline"}</span>
      <span class="sw-demo-status__binding">
        <Radio size={13} aria-hidden="true" /> Svelte 5 runes · IndexedDB queue
      </span>
    </footer>
  </main>
</section>
