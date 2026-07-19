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
          <h2>Dispatch board — field tablet</h2>
          <span>{OFFLINE_ROWS} tickets · durable IndexedDB outbox</span>
        </div>
      </div>

      <button
        type="button"
        class="sw-svw-toggle"
        data-testid="connection-toggle"
        role="switch"
        aria-checked={online}
        aria-label="Connection to dispatch server"
        disabled={!ready}
        onclick={toggleConnection}
      >
        {#if online}
          <Cloud size={15} aria-hidden="true" /> Online
        {:else}
          <CloudOff size={15} aria-hidden="true" /> Offline
        {/if}
      </button>

      <div class="sw-svw-shellbar" bind:this={chromeHost}></div>

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
    </header>

    <div class="sw-demo-workspace">
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

      <aside class="sw-demo-activity sw-svw-rail" id="sync" aria-label="Synchronization state">
        <div class="sw-svw-sync">
          <p>SYNC</p>
          <strong role="status" data-testid="sync-status">{statusLabel}</strong>
          <span data-testid="server-version">server v{syncState?.serverVersion ?? 0}</span>
        </div>

        <div class="sw-svw-actions" role="group" aria-label="Workbench actions">
          <button type="button" data-variant="primary" data-testid="log-button" disabled={!ready} onclick={() => session?.logNextEntry()}>
            Log field update
          </button>
          <button type="button" data-testid="colleague-button" disabled={!session} onclick={() => void session?.colleagueCommit()}>
            <Users size={14} aria-hidden="true" /> HQ commits work
          </button>
          <button type="button" data-variant="quiet" data-testid="remount-button" disabled={!ready} onclick={() => session?.remountIsland()}>
            <RefreshCw size={14} aria-hidden="true" /> Remount island
          </button>
        </div>

        {#if conflict}
          <div class="sw-svw-conflict" role="alert" data-testid="conflict-panel">
            <p>CONFLICT</p>
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
              <GitMerge size={14} aria-hidden="true" /> Merge & resync
            </button>
          </div>
        {/if}

        <div class="sw-svw-outbox">
          <p>DURABLE OUTBOX <span data-testid="queue-count">{queue.length}</span></p>
          {#if queue.length === 0}
            <p class="sw-demo-activity__empty">
              Empty — every edit has been acknowledged by the server.
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
        </div>

        <div class="sw-svw-feed">
          <p>SYNC ACTIVITY</p>
          <ol data-testid="activity-feed" aria-live="polite" aria-label="Recent synchronization activity">
            {#each feed as entry (entry.id)}
              <li data-tone={entry.tone}>{entry.text}</li>
            {/each}
          </ol>
        </div>
      </aside>
    </div>

    <footer class="sw-demo-status sw-demo-status--metrics">
      <span>{OFFLINE_ROWS} dispatch rows</span>
      <span>server v{syncState?.serverVersion ?? 0}</span>
      <span>outbox {queue.length}</span>
      <span>{online ? "online" : "offline"}</span>
      <span class="sw-demo-status__binding">
        <Radio size={13} aria-hidden="true" /> Svelte 5 runes · durable sync
      </span>
    </footer>
  </main>
</section>
