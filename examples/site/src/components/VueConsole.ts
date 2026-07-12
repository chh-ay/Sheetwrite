import type {
  ChangeEvent,
  DataSource,
  Grid,
  GridEvents,
  RowData,
  Selection,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import { ensureSheetwrite } from "../lib/sheetwrite";
import "@sheetwrite/core/styles.css";

// ── Showcase: streaming datasource + transaction/sync pipeline ────────────────
// One million rows are NEVER materialized up front: the grid asks a paged
// `DataSource` for exactly the visible window (with overscan), placeholders
// paint until each page resolves, and every committed edit flows through the
// store's dirty queue until the "server" acknowledges it with `markClean`.

interface VueGridHandle {
  getGrid(): Grid | null;
}

const ROWS = 1_000_000;
const PAGE_LATENCY_MS = 120;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];

const LIGHT_THEME: Partial<Theme> = {
  bg: "#ffffff",
  fg: "#1f2430",
  gridLine: "#e2e8f0",
  headerBg: "#0f172a",
  headerFg: "#e2e8f0",
  selection: "#0ea5e922",
  selectionBorder: "#0ea5e9",
};
const DARK_THEME: Partial<Theme> = {
  bg: "#0b1120",
  fg: "#e2e8f0",
  gridLine: "#1e293b",
  headerBg: "#020617",
  headerFg: "#7dd3fc",
  selection: "#38bdf822",
  selectionBorder: "#38bdf8",
};

const workbook: Workbook = {
  activeSheet: "orders",
  sheets: [
    {
      id: "orders",
      name: "Orders",
      rowCount: ROWS,
      columns: [
        { key: "id", header: "Order", width: 100, type: "number" },
        { key: "date", header: "Date", width: 110, type: "text" },
        { key: "customer", header: "Customer", width: 220, type: "text" },
        { key: "city", header: "City", width: 140, type: "text" },
        { key: "status", header: "Status", width: 110, type: "text" },
        {
          key: "amount",
          header: "Amount",
          width: 130,
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
        { key: "id", header: "Order", width: 100, type: "number" },
        { key: "date", header: "Date", width: 110, type: "text" },
        { key: "customer", header: "Customer", width: 220, type: "text" },
        { key: "city", header: "City", width: 140, type: "text" },
        { key: "status", header: "Status", width: 110, type: "text" },
        {
          key: "amount",
          header: "Amount",
          width: 130,
          type: "currency",
          numberFormat: "$#,##0.00",
        },
      ],
    },
  ],
};

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: true } as const;

const integer = new Intl.NumberFormat("en-US");

const App = defineComponent({
  setup() {
    const gridComponent = shallowRef<VueGridHandle | null>(null);
    const dark = ref(false);
    const readOnly = ref(false);
    const frozen = ref(true);
    const viewWindow = ref({ first: 0, last: 0 });
    const pagesLoaded = ref(0);
    const dirtyCount = ref(0);
    const selection = ref("none");
    const log = ref<string[]>([]);
    const searchQuery = ref("");

    const gridOf = () => gridComponent.value?.getGrid() ?? null;

    // Paged source with visible latency: scroll fast and watch placeholders
    // resolve. Each call serves one contiguous [start, end) block.
    const datasource: DataSource = {
      getRows: async (_sheet, start, end) => {
        const { promise, resolve } = Promise.withResolvers<RowData[]>();
        setTimeout(() => {
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
          resolve(rows);
        }, PAGE_LATENCY_MS);
        return promise;
      },
    };

    function pushLog(line: string): void {
      log.value = [`${new Date().toISOString().slice(11, 19)}  ${line}`, ...log.value].slice(0, 12);
    }

    function refreshDirty(): void {
      dirtyCount.value = gridOf()?.store.getDirty().length ?? 0;
    }

    function acknowledge(): void {
      const grid = gridOf();
      if (!grid) return;
      // A real host POSTs `getDirty()` patches, then confirms them; `markClean`
      // drops exactly the acknowledged prefix from the dirty queue.
      const patches = grid.store.getDirty();
      grid.store.markClean(patches);
      refreshDirty();
      pushLog(`server ack: ${patches.length} patch(es) confirmed`);
    }

    const syncLabel = computed(() =>
      dirtyCount.value === 0 ? "All changes synced" : `${dirtyCount.value} unsynced patch(es)`,
    );

    // Client-only island: gate grid creation on the shared WASM init.
    const ready = ref(false);
    void ensureSheetwrite().then(() => {
      ready.value = true;
    });

    return () =>
      !ready.value
        ? h("p", { role: "status" }, "Loading the WASM engine…")
        : h("main", { class: "example-shell", "data-theme": dark.value ? "dark" : undefined }, [
            h("div", { class: "example-body" }, [
              h("div", { class: "example-grid" }, [
                h(SheetwriteGrid, {
                  ref: gridComponent,
                  workbook,
                  datasource,
                  theme: dark.value ? DARK_THEME : LIGHT_THEME,
                  readOnly: readOnly.value,
                  config: GRID_CONFIG,
                  style: "height: 100%",
                  onReady: (grid: Grid) => {
                    grid.setFrozen(0, 1);
                    pushLog(`grid ready — ${integer.format(ROWS)} virtual rows`);
                  },
                  onSelection: (value: Selection | null) => {
                    selection.value =
                      value?.kind === "cell"
                        ? `R${value.addr.row + 1} C${value.addr.col + 1}`
                        : (value?.kind ?? "none");
                  },
                  onScroll: (event: GridEvents["scroll"]) => {
                    viewWindow.value = { first: event.firstRow + 1, last: event.lastRow + 1 };
                  },
                  "onEdit-begin": (event: GridEvents["edit-begin"]) => {
                    pushLog(`edit-begin  R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  "onEdit-commit": (event: GridEvents["edit-commit"]) => {
                    pushLog(`edit-commit R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  onChange: (event: ChangeEvent) => {
                    pushLog(
                      `change      ${event.changes.length} cell(s), epoch ${event.epoch ?? "-"}`,
                    );
                    refreshDirty();
                  },
                  onSearch: (result: GridEvents["search"]) => {
                    pushLog(
                      `search      "${result.query}" ${result.matches.length} match(es), active ${result.active < 0 ? "none" : result.active + 1}`,
                    );
                  },
                  onActiveSheet: (event: GridEvents["active-sheet"]) => {
                    pushLog(`active-sheet ${String(event.sheet)}`);
                  },
                }),
              ]),
              h("aside", { class: "example-log", "aria-label": "Event pipeline" }, [
                h("h2", "Event pipeline"),
                h("p", { class: "example-hint" }, [
                  "Every keystroke below is a grid event. Edit a cell (double-click or type), ",
                  "then acknowledge the dirty queue like a server would.",
                ]),
                h("output", { "data-testid": "sync", class: "example-sync" }, syncLabel.value),
                h(
                  "button",
                  { type: "button", disabled: dirtyCount.value === 0, onClick: acknowledge },
                  "Acknowledge (markClean)",
                ),
                h(
                  "ul",
                  log.value.map((line, index) => h("li", { key: `${index}-${line}` }, line)),
                ),
              ]),
            ]),
            h(
              "div",
              { class: "example-controls example-footer", role: "toolbar", "aria-label": "Status" },
              [
                h("output", { "data-testid": "window" }, [
                  `Painting rows ${integer.format(viewWindow.value.first)}–${integer.format(viewWindow.value.last)} `,
                  `of ${integer.format(ROWS)} · ${pagesLoaded.value} pages fetched`,
                ]),
                h("output", {}, `Selection: ${selection.value}`),
                h("label", [
                  "Search ",
                  h("input", {
                    type: "search",
                    value: searchQuery.value,
                    placeholder: "e.g. Tokyo",
                    "aria-label": "Search grid",
                    onInput: (event: Event) => {
                      searchQuery.value = (event.target as HTMLInputElement).value;
                      gridOf()?.search(searchQuery.value);
                    },
                  }),
                ]),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      gridOf()?.findPrev();
                    },
                  },
                  "Previous match",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      gridOf()?.findNext();
                    },
                  },
                  "Next match",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      gridOf()?.setActiveSheet("orders");
                    },
                  },
                  "Orders sheet",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      gridOf()?.setActiveSheet("review");
                    },
                  },
                  "Review sheet",
                ),
                h("span", { class: "example-divider" }),
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
                  "Freeze Order column",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    "aria-pressed": dark.value,
                    onClick: () => {
                      dark.value = !dark.value;
                    },
                  },
                  "Dark theme",
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
          ]);
  },
});

export default App;
