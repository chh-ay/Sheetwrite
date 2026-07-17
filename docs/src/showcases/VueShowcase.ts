import type {
  ChangeEvent,
  DataSource,
  DataSourcePage,
  DocumentOp,
  Grid,
  GridEvents,
  PersistenceAdapter,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  RowData,
  Selection,
  VersionedOperation,
  Workbook,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { SheetwriteStore, SyncCoordinator } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { FileSpreadsheet, Server } from "lucide-vue-next";
import { computed, defineComponent, h, onBeforeUnmount, ref, shallowRef } from "vue";
import { VUE_SHOWCASE_THEME } from "./revenue.js";
import "@sheetwrite/vue/styles.css";

// ── Showcase: streaming datasource + versioned sync pipeline ─────────────────
// One million rows are NEVER materialized up front: the grid asks a paged
// `DataSource` for exactly the visible window. Local document transactions enter
// a mutation-ID queue; a delayed in-memory server rejects the first attempt so
// the next explicit acknowledgement demonstrates a stable-ID retry.

interface VueGridHandle {
  grid: Grid | null;
}

declare global {
  interface Window {
    __sheetwriteVueGrid?: Grid;
  }
}

const ROWS = 1_000_000;
const PAGE_LATENCY_MS = 120;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];

const workbook: Workbook = {
  activeSheet: "orders",
  sheets: [
    {
      id: "orders",
      name: "Orders",
      rowCount: ROWS,
      columns: [
        { key: "id", header: "Order", width: 110, type: "number" },
        { key: "date", header: "Date", width: 140, type: "text" },
        { key: "customer", header: "Customer", width: 280, type: "text" },
        { key: "city", header: "City", width: 210, type: "text" },
        { key: "status", header: "Status", width: 170, type: "text" },
        {
          key: "amount",
          header: "Amount",
          width: 190,
          type: "currency",
          numberFormat: "$#,##0.00",
        },
      ],
    },
    {
      id: "review",
      name: "Review queue",
      rowCount: 12,
      columns: [
        { key: "id", header: "Order", width: 110, type: "number" },
        { key: "date", header: "Date", width: 140, type: "text" },
        { key: "customer", header: "Customer", width: 280, type: "text" },
        { key: "city", header: "City", width: 210, type: "text" },
        { key: "status", header: "Status", width: 170, type: "text" },
        {
          key: "amount",
          header: "Amount",
          width: 190,
          type: "currency",
          numberFormat: "$#,##0.00",
        },
      ],
    },
  ],
};

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: true } as const;
const PAGED_STORAGE = { mode: "paged", chunkRows: 4096, cacheBytes: 32 * 1024 * 1024 } as const;

const integer = new Intl.NumberFormat("en-US");

class DemoVersionedAdapter implements PersistenceAdapter {
  private version = 0;
  private failedFirstAttempt = false;
  private readonly applied = new Map<string, number>();
  private readonly log: VersionedOperation[] = [];

  load(_documentId: string, _signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return Promise.reject(
      new Error("The streaming demo starts from its datasource, not a snapshot"),
    );
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const duplicateVersion = this.applied.get(request.clientMutationId);
        if (duplicateVersion !== undefined) {
          resolve({
            status: "duplicate",
            version: duplicateVersion,
            clientMutationId: request.clientMutationId,
          });
          return;
        }
        if (!this.failedFirstAttempt) {
          this.failedFirstAttempt = true;
          reject(new Error("simulated acknowledgement timeout — retry keeps the mutation ID"));
          return;
        }
        if (request.baseVersion !== this.version) {
          resolve({
            status: "conflict",
            currentVersion: this.version,
            operationsSinceBase: this.log.filter(
              (operation) => operation.version > request.baseVersion,
            ),
          });
          return;
        }
        this.version += 1;
        this.applied.set(request.clientMutationId, this.version);
        this.log.push({
          version: this.version,
          clientMutationId: request.clientMutationId,
          operations: JSON.parse(JSON.stringify(request.operations)) as DocumentOp[],
        });
        resolve({
          status: "applied",
          version: this.version,
          clientMutationId: request.clientMutationId,
        });
      }, 450);
      request.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Sync request aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

const App = defineComponent({
  setup() {
    const gridComponent = shallowRef<VueGridHandle | null>(null);
    const readOnly = ref(false);
    const frozen = ref(true);
    const viewWindow = ref({ first: 0, last: 0 });
    const pagesLoaded = ref(0);
    const pendingCount = ref(0);
    const serverVersion = ref(0);
    const syncBusy = ref(false);
    const selection = ref("none");
    const log = ref<string[]>([]);
    const searchQuery = ref("");

    const gridOf = () => gridComponent.value?.grid ?? null;
    const syncAdapter = new DemoVersionedAdapter();
    let sync: SyncCoordinator | null = null;
    let mutationSequence = 0;
    let pendingReveal: { addr: { sheet: "orders"; row: number; col: number } } | null = null;

    function revealCommittedPage(start: number, end: number): void {
      const reveal = pendingReveal;
      if (!reveal || reveal.addr.row < start || reveal.addr.row >= end) return;
      const grid = gridOf();
      if (!grid) {
        pendingReveal = null;
        return;
      }
      if (grid.store.getCellLoadState?.(reveal.addr) === "unloaded") {
        requestAnimationFrame(() => revealCommittedPage(start, end));
        return;
      }
      grid.setSelection(null);
      grid.setSelection({ kind: "cell", addr: reveal.addr });
      grid.scrollToCell(reveal.addr);
      pendingReveal = null;
    }

    // Paint the first page immediately so navigation never lands on an empty
    // canvas. Later page requests retain visible latency for the streaming demo.
    let firstRequest = true;
    const datasource: DataSource = {
      getRows: ({ start, end, signal, revision }) => {
        const { promise, resolve, reject } = Promise.withResolvers<DataSourcePage>();
        const latency = firstRequest ? 0 : PAGE_LATENCY_MS;
        firstRequest = false;
        const timer = setTimeout(() => {
          const rows: RowData[] = [];
          for (let r = start; r < end; r++) {
            const day = new Date(Date.UTC(2020, 0, 1 + (r % 1461)));
            rows.push({
              id: r + 1,
              date: day.toISOString().slice(0, 10),
              customer: `Customer ${String(r + 1).padStart(7, "0")}`,
              city: CITIES[r % CITIES.length] ?? "",
              status: r % 9 === 0 ? "review" : "confirmed",
              amount: Math.round((Math.sin(r) * 0.5 + 0.5) * 500_000) / 100,
            });
          }
          pagesLoaded.value += 1;
          resolve({ start, rows, revision });
          requestAnimationFrame(() => revealCommittedPage(start, end));
        }, latency);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            if (pendingReveal && pendingReveal.addr.row >= start && pendingReveal.addr.row < end) {
              pendingReveal = null;
            }
            reject(new DOMException("Datasource request aborted", "AbortError"));
          },
          { once: true },
        );
        return promise;
      },
    };

    function pushLog(line: string): void {
      log.value = [`${new Date().toISOString().slice(11, 19)}  ${line}`, ...log.value].slice(0, 12);
    }

    function refreshSync(): void {
      pendingCount.value = sync?.pendingCount ?? 0;
      serverVersion.value = sync?.serverVersion ?? 0;
    }

    async function acknowledge(): Promise<void> {
      if (!sync || syncBusy.value) return;
      const pending = sync.pendingCommits().find((mutation) => mutation.status === "pending");
      if (!pending) return;
      syncBusy.value = true;
      pushLog(`send        ${pending.clientMutationId} at v${pending.baseVersion}`);
      try {
        const response = await sync.send(pending.clientMutationId);
        if (response?.status === "conflict") {
          pushLog(`conflict    server is v${response.currentVersion}; local work retained`);
        } else if (response) {
          pushLog(
            `${response.status === "duplicate" ? "duplicate" : "server ack"}  ${pending.clientMutationId} → v${response.version}`,
          );
        }
      } catch (error) {
        pushLog(`retry ready ${pending.clientMutationId}: ${String(error)}`);
      } finally {
        syncBusy.value = false;
        refreshSync();
      }
    }

    function simulateEdit(): void {
      const grid = gridOf();
      if (!grid) return;
      const row = Math.max(0, viewWindow.value.first - 1);
      const addr = { sheet: "orders", row, col: 4 };
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr,
            value: { kind: "literal", value: row % 9 === 0 ? "confirmed" : "review" },
          },
        ],
      });
      refreshSync();
    }

    function datasourceMatch(query: string): { row: number; col: number } | null {
      const normalized = query.trim().toLocaleLowerCase();
      const cityIndex = CITIES.findIndex((city) => city.toLocaleLowerCase() === normalized);
      if (cityIndex >= 0) {
        const start = Math.min(ROWS - 1, Math.max(0, viewWindow.value.last) + 100_000);
        const row = start + ((cityIndex - (start % CITIES.length) + CITIES.length) % CITIES.length);
        return { row: row < ROWS ? row : cityIndex, col: 3 };
      }
      const customer = /^customer\s+0*(\d+)$/i.exec(query.trim());
      if (customer?.[1]) {
        const row = Number(customer[1]) - 1;
        if (Number.isInteger(row) && row >= 0 && row < ROWS) return { row, col: 2 };
      }
      return null;
    }

    function searchOrders(query: string): void {
      const grid = gridOf();
      if (!grid) return;
      pendingReveal = null;
      const datasourceAddress = datasourceMatch(query);
      if (datasourceAddress) {
        const normalizedQuery = query.trim();
        const addr = { sheet: "orders" as const, ...datasourceAddress };
        pendingReveal = { addr };
        grid.setActiveSheet("orders");
        grid.setSelection({ kind: "cell", addr });
        grid.scrollToCell(addr);
        pushLog(`datasource lookup "${normalizedQuery}" · row ${integer.format(addr.row + 1)}`);
        return;
      }
      const result = grid.search(query.trim());
      if (result.matches.length > 0) {
        grid.findNext();
      } else {
        pushLog(`search "${query}" · no matches in the loaded window`);
      }
    }

    function simulateSearch(): void {
      searchQuery.value = "Tokyo";
      searchOrders("Tokyo");
    }

    function jumpToMiddle(): void {
      const grid = gridOf();
      if (!grid) return;
      const addr = { sheet: "orders" as const, row: 499_999, col: 0 };
      pendingReveal = { addr };
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      pushLog(`viewport jump · row ${integer.format(addr.row + 1)}`);
    }

    const syncLabel = computed(() =>
      syncBusy.value
        ? `Sending mutation · server v${serverVersion.value}`
        : pendingCount.value === 0
          ? `All changes synced · server v${serverVersion.value}`
          : `${pendingCount.value} pending mutation(s) · server v${serverVersion.value}`,
    );

    onBeforeUnmount(() => {
      pendingReveal = null;
      sync?.destroy();
    });
    onBeforeUnmount(() => {
      delete window.__sheetwriteVueGrid;
    });

    return () =>
      h(
        "section",
        {
          class: "sw-demo-app sw-vue-demo",
          "data-framework": "vue",
        },
        [
          h("main", { class: "sw-demo-main", id: "orders" }, [
            h("header", { class: "sw-demo-controlbar" }, [
              h("div", { class: "sw-demo-controlbar__identity" }, [
                h("span", { class: "sw-demo-product__mark", "aria-hidden": "true" }, [
                  h(FileSpreadsheet, { size: 16 }),
                ]),
                h("div", [
                  h("h2", "Order operations"),
                  h("span", `${integer.format(ROWS)} virtual rows`),
                ]),
              ]),
              h(
                "div",
                {
                  class: "sw-demo-controlbar__controls",
                  role: "toolbar",
                  "aria-label": "Order controls",
                },
                [
                  h("label", { class: "sw-demo-controlbar__search" }, [
                    h("span", { class: "sw-visually-hidden" }, "Search orders"),
                    h("input", {
                      type: "search",
                      value: searchQuery.value,
                      placeholder: "City or customer ID",
                      "aria-label": "Search orders",
                      onInput: (event: Event) => {
                        searchQuery.value = (event.target as HTMLInputElement).value;
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        if (event.key === "Enter") searchOrders(searchQuery.value);
                      },
                    }),
                  ]),
                  h(
                    "button",
                    { type: "button", onClick: () => searchOrders(searchQuery.value) },
                    "Locate",
                  ),
                  h("button", { type: "button", onClick: simulateSearch }, "Locate Tokyo"),
                  h("button", { type: "button", onClick: jumpToMiddle }, "Jump to row 500,000"),
                  h("button", { type: "button", onClick: simulateEdit }, "Edit visible row"),
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: pendingCount.value === 0 || syncBusy.value,
                      onClick: () => void acknowledge(),
                    },
                    syncBusy.value ? "Sending…" : "Acknowledge",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      "aria-pressed": frozen.value,
                      onClick: () => {
                        frozen.value = !frozen.value;
                        gridOf()?.setFrozen(0, frozen.value ? 1 : 0);
                      },
                    },
                    "Freeze first column",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      "aria-pressed": readOnly.value,
                      onClick: () => {
                        readOnly.value = !readOnly.value;
                      },
                    },
                    "Read only",
                  ),
                ],
              ),
              h(
                "span",
                { class: "sw-demo-controlbar__state", role: "status", "data-state": "ready" },
                [h(Server, { size: 14, "aria-hidden": "true" }), " Paged datasource"],
              ),
            ]),
            h("div", { class: "sw-vue-workspace" }, [
              h("div", { class: "sw-demo-grid" }, [
                h(SheetwriteGrid, {
                  ref: gridComponent,
                  workbook,
                  datasource,
                  datasourceStorage: PAGED_STORAGE,
                  theme: VUE_SHOWCASE_THEME,
                  readOnly: readOnly.value,
                  config: GRID_CONFIG,
                  style: "height: 100%",
                  onReady: ({ grid }: { grid: Grid }) => {
                    window.__sheetwriteVueGrid = grid;
                    if (!(grid.store instanceof SheetwriteStore)) {
                      throw new Error("Vue streaming demo requires SheetwriteStore");
                    }
                    grid.setFrozen(0, 1);
                    sync?.destroy();
                    sync = new SyncCoordinator(grid, syncAdapter, {
                      documentId: "vue-stream",
                      serverVersion: 0,
                      createMutationId: () => `vue-${++mutationSequence}`,
                    });
                    sync.on((event) => {
                      refreshSync();
                      if (event.type === "pending") {
                        pushLog(
                          `queued ${event.mutation.clientMutationId} at v${event.mutation.baseVersion}`,
                        );
                      } else if (event.type === "conflict") {
                        pushLog(`conflict · server v${event.response.currentVersion}`);
                      }
                    });
                    refreshSync();
                    pushLog(`grid ready · ${integer.format(ROWS)} virtual rows`);
                  },
                  onSelectionChange: (value: Selection | null) => {
                    selection.value =
                      value?.kind === "cell"
                        ? `R${value.addr.row + 1} C${value.addr.col + 1}`
                        : (value?.kind ?? "none");
                  },
                  onViewportChange: (event: GridEvents["scroll"]) => {
                    viewWindow.value = { first: event.firstRow + 1, last: event.lastRow + 1 };
                  },
                  "onEdit-begin": (event: GridEvents["edit-begin"]) => {
                    pushLog(`edit-begin · R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  "onEdit-commit": (event: GridEvents["edit-commit"]) => {
                    pushLog(`edit-commit · R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  onGridChange: (event: ChangeEvent) => {
                    pushLog(
                      `${event.source} · ${event.transaction.patches.length} operation(s) · epoch ${event.epoch ?? "-"}`,
                    );
                    refreshSync();
                  },
                  onSearch: (result: GridEvents["search"]) => {
                    pushLog(`search "${result.query}" · ${result.matches.length} matches`);
                  },
                  onActiveSheetChange: (event: GridEvents["active-sheet"]) => {
                    pushLog(`active sheet · ${String(event.sheet)}`);
                  },
                }),
              ]),
              h(
                "aside",
                { class: "sw-vue-activity", id: "activity", "aria-label": "Event pipeline" },
                [
                  h("div", [h("p", "EVENT PIPELINE"), h("strong", "Host-visible operations")]),
                  h("output", { "data-testid": "sync", id: "sync" }, syncLabel.value),
                  h(
                    "ol",
                    log.value.length > 0
                      ? log.value.map((line, index) => h("li", { key: `${index}-${line}` }, line))
                      : [h("li", "Interact with the grid to populate this log.")],
                  ),
                ],
              ),
            ]),
            h("footer", { class: "sw-demo-status sw-demo-status--metrics" }, [
              h(
                "span",
                `Cached ${integer.format(viewWindow.value.first)}–${integer.format(viewWindow.value.last)}`,
              ),
              h("span", `${integer.format(pagesLoaded.value)} page requests`),
              h("span", `${integer.format(pendingCount.value)} pending`),
              h("span", `Server v${serverVersion.value}`),
              h("span", `Selection · ${selection.value}`),
            ]),
          ]),
        ],
      );
  },
});

export default App;
