/**
 * Typed capability inventory — the checked-in contract behind /showcases/.
 *
 * Every observable public product capability is listed here with exactly one
 * primary showcase owner, optional declared secondary coverage, the required
 * interaction, browser/runtime scope, accessibility contract, executable test
 * path, shared scenario/protocol bindings, and its explicit host-owned or
 * unsupported boundary. capability-validation.ts fails the docs build and the
 * inventory test suite when this contract is violated.
 */

export type CapabilityOwnerId =
  | "vanilla"
  | "react"
  | "vue"
  | "svelte"
  | "database"
  | "interoperability"
  | "engine"
  | "performance"
  | "collaboration";

export type CapabilityArea =
  | "editing"
  | "modeling"
  | "workflow"
  | "scale"
  | "interop"
  | "persistence"
  | "collaboration"
  | "lifecycle";

export type CapabilityScope = "browser" | "browser+worker" | "runtime";

export interface CapabilityOwner {
  id: CapabilityOwnerId;
  label: string;
  /** Route URL, trailing slash — every URL here must stay resolvable. */
  href: string;
  /** Repo-relative TanStack route file backing `href`. */
  routeFile: string;
  /** One-line bounded responsibility; owners must not duplicate each other. */
  responsibility: string;
  kind: "framework" | "capability";
}

export interface CapabilitySecondary {
  owner: CapabilityOwnerId;
  /** Declared intent — undeclared duplicate ownership fails validation. */
  reason: string;
}

export interface Capability {
  /** Stable `area.name` identifier. */
  id: string;
  title: string;
  area: CapabilityArea;
  /** Exactly one primary showcase owner. */
  primary: CapabilityOwnerId;
  secondary?: readonly CapabilitySecondary[];
  /** The user interaction that proves the capability on the owner route. */
  interaction: string;
  scope: CapabilityScope;
  /** What assistive-technology users can rely on while exercising it. */
  accessibility: string;
  /** Repo-relative executable contract; browser-scoped paths live in test/. */
  testPath: string;
  /** Repo-relative shared scenario/protocol modules this proof binds to. */
  sharedModules: readonly string[];
  /** Explicit host-owned or unsupported boundary shown on the hub. */
  boundary: string;
}

export const CAPABILITY_OWNERS: readonly CapabilityOwner[] = [
  {
    id: "vanilla",
    label: "Vanilla workbench",
    href: "/vanilla/",
    routeFile: "docs/src/routes/vanilla.tsx",
    responsibility:
      "Lowest-level engine and host boundary: explicit lifecycle, renderer selection, Worker fallback, workbook operations, framework-free integration.",
    kind: "framework",
  },
  {
    id: "react",
    label: "React workbench",
    href: "/react/",
    routeFile: "docs/src/routes/react.tsx",
    responsibility:
      "Controlled analytics product: query and filter controls, formulas and aggregates, derived summaries, import/export workflow, React reset semantics.",
    kind: "framework",
  },
  {
    id: "vue",
    label: "Vue workbench",
    href: "/vue/",
    routeFile: "docs/src/routes/vue.tsx",
    responsibility:
      "Composed business workflow: validation, protection, notes and metadata, workbook and sheet operations, host persistence state, explicit props and events.",
    kind: "framework",
  },
  {
    id: "svelte",
    label: "Svelte workbench",
    href: "/svelte/",
    routeFile: "docs/src/routes/svelte.tsx",
    responsibility:
      "Offline and collaborative product: durable pending work, connectivity and activity state, reconnect drain, persistence across remount.",
    kind: "framework",
  },
  {
    id: "database",
    label: "Database & document lifecycle",
    href: "/showcases/database/",
    routeFile: "docs/src/routes/showcases.database.tsx",
    responsibility:
      "Real browser IndexedDB persistence: snapshot load, append-only commits, retries, conflict tails, compaction, reload recovery, live counters.",
    kind: "capability",
  },
  {
    id: "interoperability",
    label: "Spreadsheet interoperability",
    href: "/showcases/interoperability/",
    routeFile: "docs/src/routes/showcases.interoperability.tsx",
    responsibility:
      "XLSX/Excel and CSV/TSV exchange against independent fixtures: fidelity, intentional loss, warnings, resource limits, optional package boundary.",
    kind: "capability",
  },
  {
    id: "engine",
    label: "Live engine view",
    href: "/showcases/engine/",
    routeFile: "docs/src/routes/showcases.engine.tsx",
    responsibility:
      "One real paged formula Grid with bounded request, result, formula, resource, drawing, and host-save events.",
    kind: "capability",
  },
  {
    id: "performance",
    label: "Performance & scale",
    href: "/showcases/performance/",
    routeFile: "docs/src/routes/showcases.performance.tsx",
    responsibility:
      "Million-row paging, wide pages, cache churn, Worker and main-thread rendering, WASM crossings, measured benchmark evidence.",
    kind: "capability",
  },
  {
    id: "collaboration",
    label: "Collaboration protocol",
    href: "/showcases/collaboration/",
    routeFile: "docs/src/routes/showcases.collaboration.tsx",
    responsibility:
      "Two-client protocol proof: sequencing, duplicate acknowledgements, presence, offline reconnect, version gaps, conflicts, recovery.",
    kind: "capability",
  },
];

const ENGINE_SCENARIO = "docs/src/showcases/scenarios/engine.ts";
const ENGINE_LIVE_SCENARIO = "docs/src/showcases/scenarios/engine-live.ts";
const ANALYTICS_SCENARIO = "docs/src/showcases/scenarios/analytics.ts";
const BUSINESS_SCENARIO = "docs/src/showcases/scenarios/business.ts";
const OFFLINE_SCENARIO = "docs/src/showcases/scenarios/offline.ts";
const INTEROP_SCENARIO = "docs/src/showcases/scenarios/interoperability.ts";
const SCALE_SCENARIO = "docs/src/showcases/scenarios/scale.ts";
const DATABASE_PROTOCOL = "docs/src/showcases/showcase-database.ts";
const COLLABORATION_PROTOCOL = "docs/src/showcases/collaboration-protocol.ts";

const VANILLA_SPEC = "test/browser/vanilla-workbench.spec.ts";
const REACT_SPEC = "test/browser/react-workbench.spec.ts";
const VUE_SPEC = "test/browser/vue-workbench.spec.ts";
const SVELTE_SPEC = "test/browser/svelte-workbench.spec.ts";
const INTEROP_SPEC = "test/browser/showcase-interoperability.spec.ts";
const PERFORMANCE_SPEC = "test/browser/showcase-performance.spec.ts";
const ENGINE_LIVE_SPEC = "test/browser/showcase-engine.spec.ts";
const DATABASE_COLLAB_SPEC = "test/browser/database-collaboration.spec.ts";
const LIFECYCLE_SPEC = "test/browser/framework-lifecycle.spec.ts";

const HOST_CHROME_BOUNDARY =
  "Product chrome beyond the shell pieces (menus, dialogs, app framing) is host-owned.";
const HOST_PERSISTENCE_BOUNDARY =
  "Authentication, authorization, transport, server database transactions, and deployment are host-owned.";

export const CAPABILITY_INVENTORY: readonly Capability[] = [
  // ── Editing & interaction ────────────────────────────────────────────────
  {
    id: "editing.cell-edit",
    title: "Cell editing",
    area: "editing",
    primary: "vanilla",
    secondary: [
      { owner: "react", reason: "Controlled reconciliation keeps the analytics grid editable." },
      { owner: "vue", reason: "Business workflow edits run through validation and protection." },
      { owner: "svelte", reason: "Offline edits queue durably before they sync." },
    ],
    interaction:
      "Double-click or press F2, type a value or formula, Enter commits, Escape cancels.",
    scope: "browser",
    accessibility:
      "Formula bar and name box are labeled inputs; the full edit path works keyboard-only.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: HOST_CHROME_BOUNDARY,
  },
  {
    id: "editing.selection",
    title: "Selection & navigation",
    area: "editing",
    primary: "vanilla",
    interaction:
      "Arrow and Shift+Arrow keyboard range selection, pointer drag, and name-box address jumps.",
    scope: "browser",
    accessibility: "Name box reflects the active address and is keyboard reachable at all times.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: HOST_CHROME_BOUNDARY,
  },
  {
    id: "editing.clipboard",
    title: "Clipboard copy, cut & paste",
    area: "editing",
    primary: "react",
    interaction: "Copy or cut a selected range, paste it elsewhere, values and styles arrive.",
    scope: "browser",
    accessibility: "Standard platform shortcuts (Ctrl/Cmd+C, X, V) work on the focused grid.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: "System-clipboard permission prompts and non-grid paste targets are browser-owned.",
  },
  {
    id: "editing.fill",
    title: "Fill & series",
    area: "editing",
    primary: "react",
    interaction: "Drag the fill handle (or fill down) to extend values and formula series.",
    scope: "browser",
    accessibility: "Fill results land in the document and are re-readable through the formula bar.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: HOST_CHROME_BOUNDARY,
  },
  {
    id: "editing.undo-redo",
    title: "Undo & redo",
    area: "editing",
    primary: "react",
    interaction: "Ctrl/Cmd+Z reverses committed transactions; Ctrl/Cmd+Y replays them.",
    scope: "browser",
    accessibility: "History shortcuts operate on the focused grid without pointer involvement.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: "Undo history is per-grid and in-memory; durable history is host-owned.",
  },
  {
    id: "editing.search-replace",
    title: "Search & replace",
    area: "editing",
    primary: "react",
    interaction: "Open the find bar, search across 100k rows, replace an occurrence.",
    scope: "browser",
    accessibility: "Find bar is a labeled input; match navigation works from the keyboard.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: HOST_CHROME_BOUNDARY,
  },
  {
    id: "workbook.sheet-operations",
    title: "Workbook & sheet operations",
    area: "editing",
    primary: "vue",
    interaction: "Add, rename, and switch sheets from the tab strip; cross-sheet state survives.",
    scope: "browser",
    accessibility: "Sheet tabs are focusable controls with accessible names.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: HOST_CHROME_BOUNDARY,
  },
  {
    id: "workbook.host-operations",
    title: "Programmatic workbook operations",
    area: "editing",
    primary: "vanilla",
    interaction:
      "Host buttons drive core-API document operations (insert rows/columns, structural edits).",
    scope: "browser",
    accessibility: "Host controls are real buttons with accessible names, not canvas hotspots.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: "The host owns when and why operations fire; the engine owns applying them.",
  },

  // ── Formulas, aggregation & query ────────────────────────────────────────
  {
    id: "formulas.entry-recalc",
    title: "Formula entry & recalculation",
    area: "modeling",
    primary: "react",
    interaction: "Type =SUM(...) into a cell; dependent KPI cells recalculate in the Rust engine.",
    scope: "browser",
    accessibility: "Formulas are entered through the labeled formula bar, keyboard-only.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary:
      "Function coverage is the documented engine set; volatile recalc scheduling is engine-owned.",
  },
  {
    id: "formulas.references-names",
    title: "Cross-sheet references & named ranges",
    area: "modeling",
    primary: "react",
    interaction:
      "Summary KPIs reference Pipeline!F ranges and the ANNUAL_ARR named range; edits propagate across sheets.",
    scope: "browser",
    accessibility: "Reference sources remain inspectable through the formula bar.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: "External-workbook references are unsupported; names live inside one document.",
  },
  {
    id: "data.aggregation",
    title: "Aggregation",
    area: "modeling",
    primary: "react",
    interaction:
      "SUM/AVG/MAX/MIN and per-market SUMIF aggregates over 100k rows update live after an edit.",
    scope: "browser",
    accessibility: "Aggregate outcomes are readable as text cells, not canvas-only artifacts.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: "Derived dashboards beyond the grid are host-owned product surface.",
  },
  {
    id: "data.sort-filter",
    title: "Sort & filter",
    area: "modeling",
    primary: "react",
    interaction: "Apply column sort keys and filters from controls; the view narrows live.",
    scope: "browser",
    accessibility: "Sort and filter controls are native form elements with labels.",
    testPath: REACT_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary: "Server-side query pushdown is host-owned; the engine filters its own store.",
  },
  {
    id: "scale.query-behavior",
    title: "Query behavior on paged data",
    area: "modeling",
    primary: "performance",
    interaction: "Run filtered scans against the paged million-row datasource and observe timing.",
    scope: "browser",
    accessibility: "Query results and timings render as accessible text, not canvas-only.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary:
      "Datasource backends (databases, APIs) are host-owned; paging contracts are engine-owned.",
  },

  // ── Governance & annotation workflow ─────────────────────────────────────
  {
    id: "data.validation-rules",
    title: "Data validation",
    area: "workflow",
    primary: "vue",
    interaction:
      "Enter an off-list status (rejected) and an out-of-bounds quantity (warned) at the mutation barrier.",
    scope: "browser",
    accessibility: "Validation outcomes surface as visible, readable text near the edit.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Rules are client UX policy — server-side enforcement is host-owned.",
  },
  {
    id: "data.protection",
    title: "Protected ranges",
    area: "workflow",
    primary: "vue",
    interaction: "Edit a computed total; the host protection resolver denies the local mutation.",
    scope: "browser",
    accessibility: "Denied edits produce visible feedback rather than silent failure.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Protection is client UX policy, never server authorization — that is host-owned.",
  },
  {
    id: "annotations.notes",
    title: "Cell notes",
    area: "workflow",
    primary: "vue",
    interaction: "Open, read, and edit plain-text notes anchored to cells.",
    scope: "browser",
    accessibility: "Notes render as text content reachable from the anchored cell.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Discussion threads and mentions live outside the document model (host-owned).",
  },
  {
    id: "annotations.metadata",
    title: "Row & column metadata",
    area: "workflow",
    primary: "vue",
    interaction: "Row height and visibility metadata applied through document operations persists.",
    scope: "browser",
    accessibility: "Metadata changes never remove content from the accessible document.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Arbitrary host metadata belongs in host storage keyed by document position.",
  },
  {
    id: "formatting.cell-styles",
    title: "Cell styles & number formats",
    area: "workflow",
    primary: "vue",
    interaction: "Bold, fills, currency number formats, and conditional formats paint live.",
    scope: "browser",
    accessibility: "Style never encodes the only copy of information; values stay readable.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Theming beyond the documented Theme contract is host-owned CSS.",
  },
  {
    id: "formatting.merges",
    title: "Merged cells",
    area: "workflow",
    primary: "vue",
    interaction:
      "The Suppliers banner renders one merged region; covered cells defer to the anchor.",
    scope: "browser",
    accessibility: "Merged content reads from its anchor cell through the name box.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Merges are rectangular regions; L-shaped or overlapping merges are unsupported.",
  },
  {
    id: "formatting.frozen-panes",
    title: "Frozen panes",
    area: "workflow",
    primary: "vue",
    interaction: "Leading columns/rows stay pinned while the body scrolls.",
    scope: "browser",
    accessibility: "Frozen regions remain part of the same keyboard navigation space.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary: "Only leading rows/columns freeze; arbitrary interior panes are unsupported.",
  },

  // ── Scale & rendering ────────────────────────────────────────────────────
  {
    id: "scale.dense-datasource",
    title: "Dense in-memory datasource",
    area: "scale",
    primary: "vanilla",
    interaction: "Scroll and edit a 100k-row dense columnar ingest with instant paint.",
    scope: "browser",
    accessibility: "Scroll position and selection stay recoverable via the name box.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: "Dense sheets obey documented snapshot resource limits before allocation.",
  },
  {
    id: "scale.paged-million-rows",
    title: "Million-row paged datasource",
    area: "scale",
    primary: "performance",
    secondary: [
      {
        owner: "vanilla",
        reason: "Engine-boundary paged datasource ownership stays demonstrable.",
      },
    ],
    interaction: "Scroll a 1,000,000-row paged datasource; pages stream in without blocking paint.",
    scope: "browser",
    accessibility: "Loading states are communicated in text, not spinner-only.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary:
      "The page provider (network, database) is host-owned; caching and eviction are engine-owned.",
  },
  {
    id: "scale.wide-pages",
    title: "Wide pages",
    area: "scale",
    primary: "performance",
    interaction: "Navigate a wide-column page layout; horizontal virtualization keeps paint flat.",
    scope: "browser",
    accessibility: "Column addressing stays stable and reachable through the name box.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary: "Column-count ceilings follow documented resource limits.",
  },
  {
    id: "scale.cache-churn",
    title: "Cache churn",
    area: "scale",
    primary: "performance",
    interaction:
      "Jump-scroll across distant regions to force page eviction and refetch; observe counters.",
    scope: "browser",
    accessibility: "Churn evidence renders as readable counters.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary: "Eviction policy is engine-owned and not host-configurable beyond documented limits.",
  },
  {
    id: "rendering.renderer-selection",
    title: "Renderer selection",
    area: "scale",
    primary: "vanilla",
    interaction: "Choose main-thread or Worker rendering at creation and observe the active mode.",
    scope: "browser+worker",
    accessibility: "The active renderer mode is reported as text in the host UI.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: "OffscreenCanvas availability is browser-owned; selection is honest about fallback.",
  },
  {
    id: "rendering.worker-fallback",
    title: "Worker failure & fallback",
    area: "scale",
    primary: "vanilla",
    interaction:
      "Force a Worker boot failure; rendering falls back to the main thread without data loss.",
    scope: "browser+worker",
    accessibility: "Fallback is announced in host UI text, never silent.",
    testPath: VANILLA_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: "Worker CSP and cross-origin isolation constraints are host-deployment-owned.",
  },
  {
    id: "rendering.worker-offscreen",
    title: "Worker rendering evidence",
    area: "scale",
    primary: "performance",
    interaction: "Compare main-thread vs Worker rendering under load with visible frame evidence.",
    scope: "browser+worker",
    accessibility: "Measurements are presented as text and tables, not color-only charts.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary: "Absolute numbers are hardware-dependent; the page shows measured, labeled captures.",
  },
  {
    id: "perf.wasm-crossings",
    title: "WASM boundary crossings",
    area: "scale",
    primary: "performance",
    interaction: "Inspect crossing counts per interaction — bulk windows, not per-cell chatter.",
    scope: "browser",
    accessibility: "Instrumentation renders as accessible text counters.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary: "Crossing budgets are engine internals; the proof shows behavior, not a host API.",
  },
  {
    id: "perf.benchmark-evidence",
    title: "Measured benchmark evidence",
    area: "scale",
    primary: "performance",
    interaction: "Read checked-in protocol results: median speedups, heap, capture metadata.",
    scope: "browser",
    accessibility: "Benchmark bars carry text equivalents; log-scale is explained in prose.",
    testPath: PERFORMANCE_SPEC,
    sharedModules: [SCALE_SCENARIO],
    boundary:
      "Numbers come from the checked-in benchmark protocol only — measured, never promised.",
  },

  // ── Spreadsheet interoperability ─────────────────────────────────────────
  {
    id: "io.xlsx-import",
    title: "XLSX import",
    area: "interop",
    primary: "interoperability",
    interaction: "Import independent .xlsx fixtures; supported features arrive intact.",
    scope: "browser",
    accessibility: "Import status and warnings render as readable text lists.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary: "Producer compatibility is claimed only where genuine producer bytes are tested.",
  },
  {
    id: "io.xlsx-export",
    title: "XLSX export",
    area: "interop",
    primary: "interoperability",
    secondary: [
      { owner: "react", reason: "The analytics workbench keeps an export workflow entry point." },
    ],
    interaction: "Export the working document to .xlsx and verify preserved features.",
    scope: "browser",
    accessibility: "Export triggers are labeled buttons; completion is announced in text.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary: "Table-format export intentionally reduces scope/fidelity and stays in-memory.",
  },
  {
    id: "io.csv-tsv",
    title: "CSV/TSV exchange",
    area: "interop",
    primary: "interoperability",
    interaction: "Round-trip delimited text with quoting, delimiters, and line-ending fidelity.",
    scope: "browser",
    accessibility: "Parsed previews are real tables, readable row by row.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary:
      "Delimited text carries values only — styles, formulas-as-formulas, and merges do not survive.",
  },
  {
    id: "io.fidelity-loss-warnings",
    title: "Fidelity boundaries & structured warnings",
    area: "interop",
    primary: "interoperability",
    interaction: "Trigger intentional-loss paths; each loss surfaces as a structured warning.",
    scope: "browser",
    accessibility: "Warnings are enumerable text items, not toast-only flashes.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary: "Unsupported OOXML features are named, warned about, and dropped deterministically.",
  },
  {
    id: "io.hostile-input-limits",
    title: "Hostile input & resource limits",
    area: "interop",
    primary: "interoperability",
    interaction: "Feed oversized/hostile archives; imports abort at documented resource limits.",
    scope: "browser",
    accessibility: "Rejections explain the violated limit in plain text.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary: "Limits reject before allocation; raising them is an explicit host decision.",
  },
  {
    id: "io.package-isolation",
    title: "Optional package boundary",
    area: "interop",
    primary: "interoperability",
    interaction: "Observe that XLSX support loads from @sheetwrite/xlsx only when registered.",
    scope: "browser",
    accessibility: "The boundary is documented on-page in readable prose.",
    testPath: INTEROP_SPEC,
    sharedModules: [INTEROP_SCENARIO],
    boundary: "Core never bundles the codec; hosts opt in per entry point.",
  },

  // ── Persistence & document lifecycle ─────────────────────────────────────
  {
    id: "persistence.snapshot-load",
    title: "Snapshot load",
    area: "persistence",
    primary: "database",
    interaction: "Boot the document from a validated IndexedDB snapshot instead of raw ingest.",
    scope: "browser",
    accessibility: "Load state is announced in text; the grid is usable after load completes.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.append-only-commits",
    title: "Append-only operation commits",
    area: "persistence",
    primary: "database",
    interaction:
      "Each committed transaction appends DocumentOp[] records atomically against its base version.",
    scope: "browser",
    accessibility: "Commit progression is visible through live text counters.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.idempotent-retry",
    title: "Idempotent duplicate retry",
    area: "persistence",
    primary: "database",
    interaction: "Replay a committed mutation; the adapter acknowledges without double-applying.",
    scope: "browser",
    accessibility: "Retry outcomes are shown as text, distinguishing ack from apply.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.conflict-tail-fallback",
    title: "Bounded conflict tails & snapshot fallback",
    area: "persistence",
    primary: "database",
    interaction:
      "Force a stale base version; recovery replays a bounded tail or falls back to snapshot.",
    scope: "browser",
    accessibility: "The recovery path taken is stated in text.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.compaction",
    title: "Count/byte-triggered compaction",
    area: "persistence",
    primary: "database",
    interaction: "Cross the record or byte bound; the tail folds into a new snapshot.",
    scope: "browser",
    accessibility: "Compaction events appear in the live counter text.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.reload-recovery",
    title: "Reload recovery",
    area: "persistence",
    primary: "database",
    interaction: "Reload the page; the document and pending work recover from IndexedDB.",
    scope: "browser",
    accessibility: "Recovery status is announced in text after reload.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.live-counters",
    title: "Live persistence counters",
    area: "persistence",
    primary: "database",
    interaction:
      "Watch record/byte/current-version/snapshot-version/tail/pending gauges move with each commit.",
    scope: "browser",
    accessibility: "Every gauge is a labeled text value, not a canvas drawing.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [DATABASE_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "persistence.host-state",
    title: "Host persistence state",
    area: "persistence",
    primary: "vue",
    interaction: "The host UI surfaces adapter pending/committed state as the user edits.",
    scope: "browser",
    accessibility: "Persistence state is mirrored into visible, labeled text.",
    testPath: VUE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary:
      "The durable browser-database proof lives on /showcases/database/; production storage is host-owned.",
  },

  // ── Offline, sync & collaboration ────────────────────────────────────────
  {
    id: "offline.durable-pending",
    title: "Durable pending work",
    area: "collaboration",
    primary: "svelte",
    secondary: [
      {
        owner: "collaboration",
        reason: "The protocol route proves pending durability at the protocol level.",
      },
    ],
    interaction: "Edit while offline; pending commits persist durably and survive remount.",
    scope: "browser",
    accessibility: "Pending counts render as labeled text that updates as work drains.",
    testPath: SVELTE_SPEC,
    sharedModules: [OFFLINE_SCENARIO, COLLABORATION_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "offline.connectivity-activity",
    title: "Connectivity & activity state",
    area: "collaboration",
    primary: "svelte",
    interaction: "Toggle offline/online; connection and activity states track the transition.",
    scope: "browser",
    accessibility: "Connectivity state is communicated in text, not color alone.",
    testPath: SVELTE_SPEC,
    sharedModules: [OFFLINE_SCENARIO, COLLABORATION_PROTOCOL],
    boundary: "Real network detection and transport reconnection policy are host-owned.",
  },
  {
    id: "sync.reconnect-drain",
    title: "Reconnect drain",
    area: "collaboration",
    primary: "svelte",
    interaction: "Come back online; queued local commits drain in order and converge.",
    scope: "browser",
    accessibility: "Drain progress is visible as text counts.",
    testPath: SVELTE_SPEC,
    sharedModules: [OFFLINE_SCENARIO, COLLABORATION_PROTOCOL],
    boundary: HOST_PERSISTENCE_BOUNDARY,
  },
  {
    id: "collab.two-client-convergence",
    title: "Two-client convergence",
    area: "collaboration",
    primary: "collaboration",
    interaction: "Edit from two live clients; both converge on identical document state.",
    scope: "browser",
    accessibility: "Both clients are operable grids with the standard keyboard contract.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary:
      "The in-page server is illustrative; auth, transport, durable server storage, and deployment are host-owned.",
  },
  {
    id: "collab.sequencing-acks",
    title: "Operation sequencing & duplicate acknowledgements",
    area: "collaboration",
    primary: "collaboration",
    interaction:
      "Commits sequence through version numbers; duplicate submissions acknowledge idempotently.",
    scope: "browser",
    accessibility: "Sequence numbers are visible text in the protocol log.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary:
      "The in-page server is illustrative; auth, transport, durable server storage, and deployment are host-owned.",
  },
  {
    id: "collab.version-gaps",
    title: "Version gap recovery",
    area: "collaboration",
    primary: "collaboration",
    interaction:
      "Drop operations to create a gap; the client requests and replays the missing range.",
    scope: "browser",
    accessibility: "Gap detection and recovery are narrated in the protocol log text.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary:
      "The in-page server is illustrative; auth, transport, durable server storage, and deployment are host-owned.",
  },
  {
    id: "collab.presence",
    title: "Presence",
    area: "collaboration",
    primary: "collaboration",
    secondary: [
      {
        owner: "svelte",
        reason: "The offline product shows collaborator presence in a real workbench.",
      },
    ],
    interaction:
      "Collaborator selections and identities overlay live without entering the document.",
    scope: "browser",
    accessibility: "Collaborator identity is available as text, not color-only cursors.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary: "Presence is ephemeral and never persisted into snapshots or history.",
  },
  {
    id: "collab.conflicts",
    title: "Conflicting edits",
    area: "collaboration",
    primary: "collaboration",
    secondary: [
      {
        owner: "svelte",
        reason: "The offline product rebases conflicting field edits on reconnect.",
      },
    ],
    interaction: "Commit conflicting edits from both clients; rebase resolves deterministically.",
    scope: "browser",
    accessibility: "Conflict outcomes are explained in the protocol log text.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary: "Semantic merge policy beyond deterministic rebase is host-owned product behavior.",
  },
  {
    id: "collab.recovery",
    title: "Collaboration recovery",
    area: "collaboration",
    primary: "collaboration",
    interaction: "Kill and restore a client mid-session; it recovers state and rejoins cleanly.",
    scope: "browser",
    accessibility: "Recovery steps are narrated as text in the protocol log.",
    testPath: DATABASE_COLLAB_SPEC,
    sharedModules: [COLLABORATION_PROTOCOL],
    boundary:
      "The in-page server is illustrative; auth, transport, durable server storage, and deployment are host-owned.",
  },

  {
    id: "lifecycle.engine-events",
    title: "Live engine events",
    area: "lifecycle",
    primary: "engine",
    interaction:
      "Jump, edit, undo, change the drawing path, and save; the working Grid changes before its bounded text record updates.",
    scope: "browser+worker",
    accessibility:
      "Every visual lane has matching text, and play, pause, step, reset, and speed controls work from the keyboard.",
    testPath: ENGINE_LIVE_SPEC,
    sharedModules: [ENGINE_LIVE_SCENARIO],
    boundary:
      "Sheetwrite reports Grid work; the host decides when to save and what an acknowledgement means.",
  },

  // ── Framework lifecycle ──────────────────────────────────────────────────
  {
    id: "lifecycle.vanilla",
    title: "Vanilla lifecycle",
    area: "lifecycle",
    primary: "vanilla",
    interaction:
      "Explicit create, live-option replacement, input-driven reset, readiness/error events, destroy.",
    scope: "browser",
    accessibility: "Lifecycle controls are labeled buttons; state changes render as text.",
    testPath: LIFECYCLE_SPEC,
    sharedModules: [ENGINE_SCENARIO],
    boundary: "Host code owns when lifecycle transitions happen; the adapter owns applying them.",
  },
  {
    id: "lifecycle.react",
    title: "React lifecycle",
    area: "lifecycle",
    primary: "react",
    interaction:
      "StrictMode double-mount, controlled state reconciliation, live option replacement, reset reasons, destroy.",
    scope: "browser",
    accessibility: "Reset state is observable through visible text, not console output.",
    testPath: LIFECYCLE_SPEC,
    sharedModules: [ANALYTICS_SCENARIO],
    boundary:
      "Only initial | input-reset | renderer-reset reasons exist; host renders around them.",
  },
  {
    id: "lifecycle.vue",
    title: "Vue lifecycle",
    area: "lifecycle",
    primary: "vue",
    interaction:
      "Reactive prop updates, explicit props/events contract, reset on reset-bound inputs, destroy on unmount.",
    scope: "browser",
    accessibility: "Emitted lifecycle events surface as visible text state.",
    testPath: LIFECYCLE_SPEC,
    sharedModules: [BUSINESS_SCENARIO],
    boundary:
      "Only initial | input-reset | renderer-reset reasons exist; host renders around them.",
  },
  {
    id: "lifecycle.svelte",
    title: "Svelte lifecycle",
    area: "lifecycle",
    primary: "svelte",
    interaction:
      "Rune-driven binding, remount with persisted state, live option replacement, destroy on unmount.",
    scope: "browser",
    accessibility: "Remount persistence is verifiable through visible document state.",
    testPath: LIFECYCLE_SPEC,
    sharedModules: [OFFLINE_SCENARIO],
    boundary:
      "Only initial | input-reset | renderer-reset reasons exist; host renders around them.",
  },
];
