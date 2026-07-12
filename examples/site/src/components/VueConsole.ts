import type {
  ChangeEvent,
  DataSource,
  DataSourcePage,
  Grid,
  GridEvents,
  RowData,
  Selection,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/vue";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import "@sheetwrite/vue/styles.css";

const SIMPLE_ROWS = [
  { name: "Notebook", price: 12.5 },
  { name: "Pen", price: 2.25 },
];
const SIMPLE_COLUMNS = [
  { key: "name", title: "Product" },
  { key: "price", title: "Price", type: "currency" as const },
];

// ── Showcase: streaming datasource + transaction/sync pipeline ────────────────
// One million rows are NEVER materialized up front: the grid asks a paged
// `DataSource` for exactly the visible window (with overscan), placeholders
// paint until each page resolves, and every committed edit flows through the
// store's dirty queue until the "server" acknowledges it with `markClean`.

interface VueGridHandle {
  grid: Grid | null;
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

const integer = new Intl.NumberFormat("en-US");

const App = defineComponent({
  setup() {
    const gridComponent = shallowRef<VueGridHandle | null>(null);
    const dark = ref(true);
    const readOnly = ref(false);
    const frozen = ref(true);
    const viewWindow = ref({ first: 0, last: 0 });
    const pagesLoaded = ref(0);
    const dirtyCount = ref(0);
    const selection = ref("none");
    const log = ref<string[]>([]);
    const searchQuery = ref("");

    const gridOf = () => gridComponent.value?.grid ?? null;

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
        }, latency);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
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
      refreshDirty();
    }

    function simulateSearch(): void {
      searchQuery.value = "Tokyo";
      gridOf()?.search("Tokyo");
    }

    const actionIcon = (path: string) =>
      h(
        "svg",
        {
          viewBox: "0 0 24 24",
          "aria-hidden": "true",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.8",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        [h("path", { d: path })],
      );

    const syncLabel = computed(() =>
      dirtyCount.value === 0 ? "All changes synced" : `${dirtyCount.value} unsynced patch(es)`,
    );

    // The adapter owns client-side WASM initialization.
    const ready = ref(true);

    return () =>
      !ready.value
        ? h("p", { role: "status" }, "Loading the WASM engine…")
        : h("main", { class: "example-shell", "data-theme": dark.value ? "dark" : undefined }, [
            h("div", { class: "example-body" }, [
              h("div", { class: "example-grid" }, [
                h("div", { class: "stream-strip" }, [
                  h("span", "Visible-window rendering"),
                  h(
                    "output",
                    `cache rows ${integer.format(viewWindow.value.first)}–${integer.format(viewWindow.value.last)} (includes overscan) · ${pagesLoaded.value} requests`,
                  ),
                ]),
                h(SheetwriteGrid, {
                  ref: gridComponent,
                  workbook,
                  datasource,
                  theme: dark.value ? DARK_THEME : LIGHT_THEME,
                  readOnly: readOnly.value,
                  config: GRID_CONFIG,
                  style: "flex: 1; min-height: 0",
                  onReady: ({ grid }: { grid: Grid }) => {
                    grid.setFrozen(0, 1);
                    pushLog(`grid ready — ${integer.format(ROWS)} virtual rows`);
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
                    pushLog(`edit-begin  R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  "onEdit-commit": (event: GridEvents["edit-commit"]) => {
                    pushLog(`edit-commit R${event.addr.row + 1} C${event.addr.col + 1}`);
                  },
                  onGridChange: (event: ChangeEvent) => {
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
                  onActiveSheetChange: (event: GridEvents["active-sheet"]) => {
                    pushLog(`active-sheet ${String(event.sheet)}`);
                  },
                }),
              ]),
              h("aside", { class: "example-log", "aria-label": "Event pipeline" }, [
                h("h2", "Event pipeline"),
                h(
                  "p",
                  { class: "example-hint" },
                  "Run the sequence below. Each action hits the real grid API and appears in the log.",
                ),
                h("div", { class: "event-actions" }, [
                  h("button", { type: "button", onClick: simulateEdit }, [
                    actionIcon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"),
                    h("span", [h("b", "1"), " Edit visible row"]),
                  ]),
                  h("button", { type: "button", onClick: simulateSearch }, [
                    actionIcon("m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0"),
                    h("span", [h("b", "2"), " Search Tokyo"]),
                  ]),
                ]),
                h("output", { "data-testid": "sync", class: "example-sync" }, syncLabel.value),
                h(
                  "button",
                  {
                    type: "button",
                    class: "acknowledge",
                    disabled: dirtyCount.value === 0,
                    onClick: acknowledge,
                  },
                  [actionIcon("m5 12 4 4L19 6"), h("span", [h("b", "3"), " Acknowledge changes"])],
                ),
                h(
                  "ul",
                  log.value.map((line, index) => h("li", { key: `${index}-${line}` }, line)),
                ),
              ]),
            ]),
            h(
              "details",
              { class: "example-simple", "aria-label": "Quick-start Sheetwrite example" },
              [
                h(
                  "summary",
                  "Quick start: everything above is the advanced grid — a basic one is 6 lines",
                ),
                h("div", { class: "example-simple-body" }, [
                  h(
                    "pre",
                    { class: "example-simple-code" },
                    `<script setup>
import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
</script>

<Sheetwrite
  :columns="[
    { key: 'name', title: 'Product' },
    { key: 'price', title: 'Price', type: 'currency' },
  ]"
  :default-rows="[
    { name: 'Notebook', price: 12.5 },
    { name: 'Pen', price: 2.25 },
  ]"
  :height="180"
/>`,
                  ),
                  h(Sheetwrite, {
                    columns: SIMPLE_COLUMNS,
                    defaultRows: SIMPLE_ROWS,
                    height: 180,
                    theme: dark.value ? DARK_THEME : LIGHT_THEME,
                  }),
                ]),
              ],
            ),
            h(
              "div",
              { class: "example-controls example-footer", role: "toolbar", "aria-label": "Status" },
              [
                h("output", { "data-testid": "window" }, [
                  `Cached rows ${integer.format(viewWindow.value.first)}–${integer.format(viewWindow.value.last)} `,
                  `of ${integer.format(ROWS)} (including overscan) · ${pagesLoaded.value} pages fetched`,
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
                  "◀ Prev",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      gridOf()?.findNext();
                    },
                  },
                  "Next ▶",
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
                  "Freeze Order col",
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
