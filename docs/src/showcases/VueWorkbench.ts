import type {
  CellAddress,
  ChangeEvent,
  DataValidationRule,
  Grid,
  GridEvents,
  ProtectedRange,
  ProtectionResolver,
  Range,
  Selection,
} from "@sheetwrite/core";
import { cellA1, MemoryPersistenceAdapter, SyncCoordinator } from "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import type { GridReadyEvent } from "@sheetwrite/vue";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { FileSpreadsheet, ShieldCheck } from "lucide-vue-next";
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  BUSINESS_DOCUMENT_ID,
  BUSINESS_ROWS,
  BUSINESS_THEME,
  businessSuppliersSeedOps,
  createBusinessData,
  createBusinessWorkbook,
} from "./scenarios/business.js";
import "@sheetwrite/vue/styles.css";

// ── Showcase: composed business workflow over one Vue component ──────────────
// The scenario module owns the governed workbook (validation rules, protected
// totals, notes, merges, frozen panes). This component owns what Vue is for:
// reactive configuration bound to adapter props, structured rejection state,
// notes/metadata and workbook operations through the public Grid API, and a
// host persistence pipeline mirrored into plain refs. The in-memory reference
// adapter demonstrates host state only — the durable IndexedDB protocol proof
// lives at /showcases/database/.

interface VueGridHandle {
  grid: Grid | null;
}

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
  }
}

type HostRole = "reviewer" | "finance-lead";
type FeedKind = "event" | "rejected" | "lifecycle" | "sync";
type TaskId =
  | "validation"
  | "protection"
  | "change"
  | "notes"
  | "formatting"
  | "sheets"
  | "persistence"
  | "renderer";
type ChallengeState = "ready" | "rejected" | "authorized" | "accepted";

interface FeedEntry {
  key: number;
  kind: FeedKind;
  code: string;
  detail: string;
}

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: true } as const;
const FEED_LIMIT = 9;
const ARCHIVE_SHEET_ID = "archive";
const CHALLENGE_CELL: CellAddress = { sheet: "orders", row: 0, col: 6 };
const CHALLENGE_VALUE = 999;
const TASKS: ReadonlyArray<{ id: TaskId; label: string }> = [
  { id: "validation", label: "Validation" },
  { id: "protection", label: "Protection" },
  { id: "change", label: "Change" },
  { id: "notes", label: "Notes" },
  { id: "formatting", label: "Formatting" },
  { id: "sheets", label: "Sheets" },
  { id: "persistence", label: "Persistence" },
  { id: "renderer", label: "Renderer" },
];

const integer = new Intl.NumberFormat("en-US");

function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  if (typeof value === "number") return integer.format(value);
  return String(value);
}

const App = defineComponent({
  setup() {
    const gridComponent = shallowRef<VueGridHandle | null>(null);

    // Reset-bound adapter inputs. Replacing any of them rebuilds the Grid, so
    // they are regenerated together and only while nothing is pending.
    const workbook = shallowRef(createBusinessWorkbook());
    const data = shallowRef(createBusinessData());
    const mutationPolicy = ref<"atomic" | "partial">("atomic");
    const rendererMode = ref<"canvas" | "worker">("canvas");

    // Live adapter inputs — plain reactive state, no Grid replacement.
    const readOnly = ref(false);
    const role = ref<HostRole>("reviewer");

    // Adapter lifecycle state published by @ready.
    const ready = ref(false);
    const generation = ref(0);
    const readyReason = ref("—");

    // Inspector state for the focused cell.
    const selected = shallowRef<CellAddress | null>(null);
    const selectedValue = ref("(blank)");
    const selectedRule = shallowRef<DataValidationRule | null>(null);
    const selectedProtection = shallowRef<ProtectedRange | null>(null);
    const noteDraft = ref("");
    const noteStored = ref<string | null>(null);

    // Workbook state mirrored from the document model.
    const sheets = ref<ReadonlyArray<{ id: string; name: string }>>([]);
    const activeSheet = ref("");
    const renameDraft = ref("");

    // Host persistence state mirrored from the sync pipeline.
    const pendingCount = ref(0);
    const serverVersion = ref(0);
    const lastAck = ref("—");
    const syncBusy = ref(false);

    const feed = ref<FeedEntry[]>([]);
    const activeTask = ref<TaskId>("protection");
    const challengeState = ref<ChallengeState>("ready");
    const challengeIssue = ref("Protected totals require the finance-lead role.");

    const gridOf = () => gridComponent.value?.grid ?? null;
    let sync: SyncCoordinator | null = null;
    let offSync: (() => void) | null = null;
    let offRejected: (() => void) | null = null;
    let mutationSequence = 0;
    let feedSequence = 0;

    /**
     * Host permission policy: stable identity, reactive decision. The barrier
     * consults it for every operation intersecting a protected range. Workbook
     * chrome remains available to reviewers, while protected cell content
     * requires the finance-lead role.
     */
    const protectionResolver: ProtectionResolver = (request) => {
      switch (request.operation.op) {
        case "addSheet":
        case "renameSheet":
        case "moveSheet":
        case "setSheetVisibility":
          return "allow";
        default:
          if (request.protectedRange.permissionKey !== "orders:totals") return "deny";
          return role.value === "finance-lead" ? "allow" : "deny";
      }
    };

    function pushFeed(kind: FeedKind, code: string, detail: string): void {
      feed.value = [{ key: ++feedSequence, kind, code, detail }, ...feed.value].slice(
        0,
        FEED_LIMIT,
      );
    }

    function refreshSync(): void {
      pendingCount.value = sync?.pendingCount ?? 0;
      serverVersion.value = sync?.serverVersion ?? 0;
    }

    function refreshWorkbook(): void {
      const grid = gridOf();
      if (!grid) return;
      const model = grid.store.getWorkbook();
      sheets.value = model.sheets.map((sheet) => ({ id: String(sheet.id), name: sheet.name }));
      activeSheet.value = String(grid.getActiveSheet());
      const active = model.sheets.find((sheet) => String(sheet.id) === activeSheet.value);
      renameDraft.value = active?.name ?? "";
    }

    function refreshInspector(): void {
      const grid = gridOf();
      const addr = selected.value;
      if (!grid || !addr) {
        selectedValue.value = "(blank)";
        selectedRule.value = null;
        selectedProtection.value = null;
        noteStored.value = null;
        noteDraft.value = "";
        return;
      }
      selectedValue.value = describeValue(grid.store.getCell(addr).resolved);
      const sheet = grid.store.getWorkbook().sheets.find((entry) => entry.id === addr.sheet);
      const covers = (range: Range) =>
        range.sheet === addr.sheet &&
        addr.row >= Math.min(range.start.row, range.end.row) &&
        addr.row <= Math.max(range.start.row, range.end.row) &&
        addr.col >= Math.min(range.start.col, range.end.col) &&
        addr.col <= Math.max(range.start.col, range.end.col);
      selectedRule.value = sheet?.validationRules?.find((rule) => covers(rule.range)) ?? null;
      selectedProtection.value =
        sheet?.protectedRanges?.find((range) => covers(range.range)) ?? null;
      noteStored.value = grid.getNote(addr);
      noteDraft.value = noteStored.value ?? "";
    }

    const selectedLabel = computed(() =>
      selected.value === null
        ? "none"
        : `${String(selected.value.sheet)}!${cellA1(selected.value.row, selected.value.col)}`,
    );

    const accessLabel = computed(() => {
      if (selected.value === null) return { text: "—", tone: "allow" as const };
      if (readOnly.value) return { text: "read-only grid", tone: "deny" as const };
      if (selectedProtection.value === null) return { text: "editable", tone: "allow" as const };
      return role.value === "finance-lead"
        ? { text: "override allowed (finance lead)", tone: "allow" as const }
        : {
            text: `locked · ${selectedProtection.value.label ?? "protected"}`,
            tone: "deny" as const,
          };
    });

    const persistState = computed(() => {
      if (syncBusy.value) {
        return { text: `Committing to host · v${serverVersion.value}`, state: "pending" as const };
      }
      return pendingCount.value === 0
        ? { text: `All changes on host · v${serverVersion.value}`, state: "synced" as const }
        : {
            text: `${pendingCount.value} pending commit(s) · host v${serverVersion.value}`,
            state: "pending" as const,
          };
    });

    function bindHostPersistence(grid: Grid): void {
      offSync?.();
      sync?.destroy();
      // The suppliers directory and row metadata are part of the seed, not
      // local work: apply them as remote input, then hand the identical
      // snapshot to the reference adapter so client and host start at v0.
      grid.applyRemoteOperations(businessSuppliersSeedOps());
      const adapter = new MemoryPersistenceAdapter({
        ...grid.exportSnapshot(),
        documentId: BUSINESS_DOCUMENT_ID,
        version: 0,
      });
      sync = new SyncCoordinator(grid, adapter, {
        documentId: BUSINESS_DOCUMENT_ID,
        serverVersion: 0,
        createMutationId: () => `vue-biz-${++mutationSequence}`,
      });
      offSync = sync.on((event) => {
        refreshSync();
        if (event.type === "pending") {
          pushFeed(
            "sync",
            "sync",
            `queued ${event.mutation.clientMutationId} at v${event.mutation.baseVersion}`,
          );
        } else if (event.type === "acknowledged") {
          lastAck.value = `${event.clientMutationId} → v${event.version}${event.duplicate ? " (duplicate)" : ""}`;
          pushFeed("sync", "sync", `acknowledged ${lastAck.value}`);
        } else if (event.type === "conflict") {
          pushFeed("rejected", "sync", `conflict · host v${event.response.currentVersion}`);
        }
      });
      lastAck.value = "—";
      refreshSync();
    }

    function onReady(event: GridReadyEvent): void {
      const grid = event.grid;
      generation.value = event.generation;
      readyReason.value = event.reason;
      ready.value = true;
      window.__sheetwriteVueWorkbench = { grid };
      offRejected?.();
      offRejected = grid.on("mutation-rejected", ({ issues }) => {
        for (const issue of issues) {
          const detail =
            issue.kind === "validation"
              ? `${issue.ruleId} · ${issue.message}`
              : issue.kind === "protection"
                ? `${issue.protectedRangeId} · ${issue.message}`
                : issue.message;
          pushFeed("rejected", "grid.on(mutation-rejected)", detail);
          challengeIssue.value = detail;
        }
        challengeState.value = "rejected";
        activeTask.value = "protection";
        refreshInspector();
      });
      bindHostPersistence(grid);
      refreshWorkbook();
      grid.setSelection({ kind: "cell", addr: CHALLENGE_CELL });
      refreshInspector();
      pushFeed("lifecycle", "@ready", `generation ${event.generation} (${event.reason})`);
    }

    function onGridChange(event: ChangeEvent): void {
      pushFeed(
        "event",
        "@grid-change",
        `${event.source} · ${event.commitReason} · ${event.transaction.patches.length} op(s)`,
      );
      refreshSync();
      refreshWorkbook();
      refreshInspector();
      const committedChallenge = event.transaction.patches.some(
        (patch) =>
          patch.op === "set" &&
          patch.addr.sheet === CHALLENGE_CELL.sheet &&
          patch.addr.row === CHALLENGE_CELL.row &&
          patch.addr.col === CHALLENGE_CELL.col &&
          patch.value.kind === "literal" &&
          patch.value.value === CHALLENGE_VALUE,
      );
      if (role.value === "finance-lead" && committedChallenge) {
        challengeState.value = "accepted";
        challengeIssue.value = `orders!G1 changed from 8 to ${CHALLENGE_VALUE}; host commit queued.`;
        activeTask.value = "protection";
      }
    }

    function onSelectionChange(value: Selection | null): void {
      selected.value = value?.kind === "cell" ? value.addr : null;
      refreshInspector();
    }

    function setRole(next: HostRole): void {
      role.value = next;
      if (next === "finance-lead" && challengeState.value === "rejected") {
        challengeState.value = "authorized";
        challengeIssue.value =
          "Finance lead authorized. Commit the same G1 override to prove the policy changed.";
      }
      refreshInspector();
    }

    function commitChallenge(): void {
      const grid = gridOf();
      if (!grid || !ready.value) return;
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr: CHALLENGE_CELL });
      grid.scrollToCell(CHALLENGE_CELL);
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: CHALLENGE_CELL,
            value: { kind: "literal", value: CHALLENGE_VALUE },
          },
        ],
      });
    }

    async function syncToHost(): Promise<void> {
      if (!sync || syncBusy.value) return;
      syncBusy.value = true;
      try {
        for (let guard = 0; guard < 64; guard++) {
          const head = sync.pendingCommits().find((record) => record.status === "pending");
          if (!head) break;
          await sync.send(head.clientMutationId);
        }
      } catch (error) {
        pushFeed("rejected", "sync", `send failed: ${String(error)}`);
      } finally {
        syncBusy.value = false;
        refreshSync();
      }
    }

    function saveNote(clear: boolean): void {
      const grid = gridOf();
      const addr = selected.value;
      if (!grid || !addr) return;
      const text = clear ? null : noteDraft.value.trim() === "" ? null : noteDraft.value.trim();
      grid.setNote(addr, text);
    }

    function renameActiveSheet(): void {
      const grid = gridOf();
      const name = renameDraft.value.trim();
      if (!grid || name === "") return;
      grid.renameSheet(grid.getActiveSheet(), name);
    }

    function addArchiveSheet(): void {
      const grid = gridOf();
      if (!grid || sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID)) return;
      const result = grid.addSheet({
        id: ARCHIVE_SHEET_ID,
        name: "Archive FY25",
        rowCount: 20,
        columns: [
          { key: "po", header: "PO", width: 120, type: "text" },
          { key: "closed", header: "Closed", width: 140, type: "text" },
        ],
      });
      if (result.status === "applied") grid.setActiveSheet(result.sheet);
    }

    function openSuppliers(): void {
      gridOf()?.setActiveSheet("suppliers");
    }

    function resetGridInput(code: string, detail: string): void {
      ready.value = false;
      challengeState.value = "ready";
      challengeIssue.value = "Protected totals require the finance-lead role.";
      workbook.value = createBusinessWorkbook();
      data.value = createBusinessData();
      pushFeed("lifecycle", code, detail);
    }

    function togglePolicy(): void {
      if (!ready.value || pendingCount.value > 0) return;
      mutationPolicy.value = mutationPolicy.value === "atomic" ? "partial" : "atomic";
      resetGridInput(
        ":mutation-policy",
        `${mutationPolicy.value} — reset-bound input, grid rebuilds`,
      );
    }

    function setRenderer(next: "canvas" | "worker"): void {
      if (!ready.value || pendingCount.value > 0 || rendererMode.value === next) return;
      rendererMode.value = next;
      resetGridInput(":renderer", `${next} — reset-bound input, grid rebuilds`);
    }

    let themeObserver: MutationObserver | null = null;
    onMounted(() => {
      themeObserver = new MutationObserver(() =>
        window.__sheetwriteVueWorkbench?.grid.replaceTheme(BUSINESS_THEME),
      );
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    });

    onBeforeUnmount(() => {
      themeObserver?.disconnect();
      offSync?.();
      offRejected?.();
      sync?.destroy();
      sync = null;
      delete window.__sheetwriteVueWorkbench;
    });

    const inspectorRows = () => [
      h("div", [h("dt", "Cell"), h("dd", selectedLabel.value)]),
      h("div", [h("dt", "Value"), h("dd", selectedValue.value)]),
      h("div", [
        h("dt", "Rule"),
        h(
          "dd",
          selectedRule.value ? `${selectedRule.value.id} · ${selectedRule.value.policy}` : "none",
        ),
      ]),
      h("div", [
        h("dt", "Access"),
        h("dd", { "data-tone": accessLabel.value.tone }, accessLabel.value.text),
      ]),
    ];

    function taskTab(task: (typeof TASKS)[number], index: number) {
      const active = activeTask.value === task.id;
      return h(
        "button",
        {
          id: `vue-task-${task.id}`,
          type: "button",
          role: "tab",
          tabindex: active ? 0 : -1,
          "aria-selected": active,
          "aria-controls": `vue-panel-${task.id}`,
          onClick: () => {
            activeTask.value = task.id;
          },
          onKeydown: (event: KeyboardEvent) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? TASKS.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + TASKS.length) % TASKS.length;
            activeTask.value = TASKS[next]!.id;
            requestAnimationFrame(() =>
              document.getElementById(`vue-task-${TASKS[next]!.id}`)?.focus(),
            );
          },
        },
        task.label,
      );
    }

    function panelAttrs(id: TaskId) {
      return {
        id: `vue-panel-${id}`,
        class: "sw-vuewb-taskpanel",
        role: "tabpanel",
        "aria-labelledby": `vue-task-${id}`,
        hidden: activeTask.value !== id,
      };
    }

    const eventFeed = () =>
      h(
        "ol",
        { class: "sw-vuewb-feed", "data-testid": "feed", "aria-label": "Adapter events" },
        feed.value.length > 0
          ? feed.value.map((entry) =>
              h("li", { key: entry.key, "data-kind": entry.kind }, [
                h("code", entry.code),
                h("span", entry.detail),
              ]),
            )
          : [
              h("li", { "data-kind": "event" }, [
                h("code", "feed"),
                h("span", "Interact with the workbook to populate this feed."),
              ]),
            ],
      );

    return () =>
      h("section", { class: "sw-demo-app sw-vuewb-app", "data-framework": "vue" }, [
        h("main", { class: "sw-demo-main sw-vuewb-main" }, [
          h("header", { class: "sw-demo-controlbar sw-vuewb-controlbar" }, [
            h("div", { class: "sw-demo-controlbar__identity" }, [
              h("span", { class: "sw-demo-product__mark", "aria-hidden": "true" }, [
                h(FileSpreadsheet, { size: 16 }),
              ]),
              h("div", [
                h("h2", "Governed purchase orders"),
                h("span", `${integer.format(BUSINESS_ROWS)} live rows · challenge G1`),
              ]),
            ]),
            h(
              "div",
              {
                class: "sw-demo-controlbar__controls",
                role: "toolbar",
                "aria-label": "Workbench configuration",
              },
              [
                h("label", { class: "sw-vuewb-role" }, [
                  h("span", "Acting as"),
                  h(
                    "select",
                    {
                      "data-testid": "role",
                      "aria-label": "Host role",
                      value: role.value,
                      onChange: (event: Event) =>
                        setRole((event.target as HTMLSelectElement).value as HostRole),
                    },
                    [
                      h("option", { value: "reviewer" }, "Reviewer"),
                      h("option", { value: "finance-lead" }, "Finance lead"),
                    ],
                  ),
                ]),
              ],
            ),
            h(
              "span",
              {
                class: "sw-demo-controlbar__state",
                role: "status",
                "data-state": challengeState.value === "accepted" ? "accepted" : "ready",
              },
              [
                h(ShieldCheck, { size: 14, "aria-hidden": "true" }),
                challengeState.value === "accepted" ? " Override committed" : " Policy enforced",
              ],
            ),
          ]),
          h("div", { class: "sw-vuewb-workspace" }, [
            h("div", { class: "sw-demo-grid sw-vuewb-grid" }, [
              h(SheetwriteGrid, {
                ref: gridComponent,
                workbook: workbook.value,
                data: data.value,
                theme: BUSINESS_THEME,
                readOnly: readOnly.value,
                mutationPolicy: mutationPolicy.value,
                protectionResolver,
                renderer: rendererMode.value,
                workerUrl: rendererMode.value === "worker" ? workerUrl : undefined,
                config: GRID_CONFIG,
                style: "height: 100%",
                onReady,
                onGridChange,
                onSelectionChange,
                onEditBegin: (event: GridEvents["edit-begin"]) => {
                  pushFeed("event", "@edit-begin", cellA1(event.addr.row, event.addr.col));
                },
                onEditCommit: (event: GridEvents["edit-commit"]) => {
                  pushFeed("event", "@edit-commit", cellA1(event.addr.row, event.addr.col));
                },
                onActiveSheetChange: (event: GridEvents["active-sheet"]) => {
                  pushFeed("event", "@active-sheet-change", String(event.sheet));
                  refreshWorkbook();
                },
                onInitializationError: (error: unknown) => {
                  pushFeed("rejected", "@initialization-error", String(error));
                },
              }),
            ]),
            h("aside", { class: "sw-vuewb-panel", "aria-label": "Policy and workbook tasks" }, [
              h(
                "nav",
                { class: "sw-vuewb-tasktabs", role: "tablist", "aria-label": "Workbook tasks" },
                [...TASKS.map(taskTab)],
              ),
              h("section", panelAttrs("validation"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Validation"),
                    h("p", "The selected cell resolves its workbook rule before any commit."),
                  ]),
                ]),
                h("dl", { class: "sw-vuewb-inspector" }, inspectorRows()),
                h(
                  "div",
                  {
                    class: "sw-vuewb-task-summary",
                    "data-state": selectedRule.value ? "active" : "idle",
                  },
                  [
                    h(
                      "strong",
                      selectedRule.value ? selectedRule.value.id : "No rule on this cell",
                    ),
                    h(
                      "span",
                      selectedRule.value
                        ? `${selectedRule.value.policy} validation is enforced at the mutation barrier.`
                        : "Select a Status or Quantity cell to inspect its validation contract.",
                    ),
                  ],
                ),
              ]),
              h("section", panelAttrs("protection"), [
                h("div", { class: "sw-vuewb-challenge__head" }, [
                  h("span", "ONE LIVE CHALLENGE"),
                  h("strong", "Override the protected G1 total"),
                  h(
                    "p",
                    "Attempt as Reviewer, authorize Finance lead, then commit the same mutation.",
                  ),
                ]),
                h(
                  "dl",
                  { class: "sw-vuewb-inspector", "data-testid": "inspector" },
                  inspectorRows(),
                ),
                h(
                  "output",
                  {
                    class: "sw-vuewb-policy-result",
                    "data-testid": "policy-result",
                    "data-state": challengeState.value,
                    role: challengeState.value === "rejected" ? "alert" : "status",
                    "aria-live": "polite",
                  },
                  [
                    h(
                      "strong",
                      challengeState.value === "accepted"
                        ? "Accepted"
                        : challengeState.value === "rejected"
                          ? "Rejected"
                          : challengeState.value === "authorized"
                            ? "Role changed"
                            : "Protected",
                    ),
                    h("span", challengeIssue.value),
                  ],
                ),
                h("ol", { class: "sw-vuewb-steps", "aria-label": "Protected edit workflow" }, [
                  h("li", { "data-state": challengeState.value === "ready" ? "current" : "done" }, [
                    h("span", "1"),
                    h("div", [h("strong", "Attempt"), h("small", "Write 999 to G1")]),
                  ]),
                  h(
                    "li",
                    {
                      "data-state":
                        challengeState.value === "rejected"
                          ? "current"
                          : challengeState.value === "authorized" ||
                              challengeState.value === "accepted"
                            ? "done"
                            : "waiting",
                    },
                    [
                      h("span", "2"),
                      h("div", [h("strong", "Authorize"), h("small", "Finance lead")]),
                    ],
                  ),
                  h(
                    "li",
                    { "data-state": challengeState.value === "accepted" ? "done" : "waiting" },
                    [
                      h("span", "3"),
                      h("div", [h("strong", "Commit"), h("small", "Queue mutation")]),
                    ],
                  ),
                ]),
                h("div", { class: "sw-vuewb-challenge__actions" }, [
                  h(
                    "button",
                    {
                      type: "button",
                      "data-testid": "challenge-attempt",
                      disabled:
                        !ready.value || readOnly.value || challengeState.value === "accepted",
                      onClick: commitChallenge,
                    },
                    role.value === "reviewer" ? "Attempt 999 as reviewer" : "Commit 999 override",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      "data-testid": "challenge-authorize",
                      "data-variant": "primary",
                      disabled:
                        role.value === "finance-lead" || challengeState.value === "accepted",
                      onClick: () => setRole("finance-lead"),
                    },
                    "Authorize finance lead",
                  ),
                ]),
              ]),
              h("section", panelAttrs("change"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Change"),
                    h("p", "Policy outcome and host work stay causally adjacent."),
                  ]),
                ]),
                h("div", { class: "sw-vuewb-task-summary", "data-state": challengeState.value }, [
                  h(
                    "strong",
                    challengeState.value === "accepted"
                      ? "Mutation queued"
                      : challengeState.value === "rejected"
                        ? "Mutation rejected"
                        : "Awaiting governed edit",
                  ),
                  h("span", challengeIssue.value),
                ]),
                h("dl", { class: "sw-vuewb-change-meters" }, [
                  h("div", [h("dt", "Cell"), h("dd", selectedLabel.value)]),
                  h("div", [h("dt", "Pending"), h("dd", String(pendingCount.value))]),
                  h("div", [h("dt", "Host"), h("dd", `v${serverVersion.value}`)]),
                ]),
              ]),
              h("section", panelAttrs("notes"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Notes"),
                    h("p", `Selected ${selectedLabel.value} · ${accessLabel.value.text}`),
                  ]),
                ]),
                h(
                  "dl",
                  { class: "sw-vuewb-inspector sw-vuewb-inspector--compact" },
                  inspectorRows(),
                ),
                h("div", { class: "sw-vuewb-note" }, [
                  h("label", { for: "vue-cell-note" }, "Selected-cell note"),
                  h("textarea", {
                    id: "vue-cell-note",
                    "data-testid": "note-input",
                    "aria-label": "Cell note",
                    placeholder:
                      selected.value === null ? "Select a cell to annotate" : "Add a note…",
                    disabled: selected.value === null || readOnly.value,
                    value: noteDraft.value,
                    onInput: (event: Event) => {
                      noteDraft.value = (event.target as HTMLTextAreaElement).value;
                    },
                  }),
                  h("div", { class: "sw-vuewb-note__actions" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "note-save",
                        "data-variant": "primary",
                        disabled: selected.value === null || readOnly.value,
                        onClick: () => saveNote(false),
                      },
                      "Save note",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "note-clear",
                        disabled:
                          selected.value === null || readOnly.value || noteStored.value === null,
                        onClick: () => saveNote(true),
                      },
                      "Clear",
                    ),
                  ]),
                ]),
              ]),
              h("section", panelAttrs("formatting"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Format the live selection"),
                    h(
                      "p",
                      "Use the Grid toolbar above the rows; style commits enter the same host queue.",
                    ),
                  ]),
                ]),
                h("dl", { class: "sw-vuewb-inspector" }, inspectorRows()),
                h("p", { class: "sw-vuewb-taskhint" }, [
                  h("strong", "Try this: "),
                  "select Supplier, press Bold, then inspect Pending in the Persistence task.",
                ]),
              ]),
              h("section", panelAttrs("sheets"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Sheet operations"),
                    h("p", "Rename, add, or open through the public Grid API."),
                  ]),
                ]),
                h("div", { class: "sw-vuewb-workbook" }, [
                  h(
                    "p",
                    { class: "sw-vuewb-workbook__state", "data-testid": "workbook-state" },
                    `${sheets.value.length} sheet(s) · active ${activeSheet.value || "—"}`,
                  ),
                  h("div", { class: "sw-vuewb-workbook__rename" }, [
                    h("input", {
                      type: "text",
                      "data-testid": "rename-input",
                      "aria-label": "Active sheet name",
                      disabled: !ready.value || readOnly.value,
                      value: renameDraft.value,
                      onInput: (event: Event) => {
                        renameDraft.value = (event.target as HTMLInputElement).value;
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        if (event.key === "Enter") renameActiveSheet();
                      },
                    }),
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "rename-apply",
                        disabled: !ready.value || readOnly.value,
                        onClick: renameActiveSheet,
                      },
                      "Rename",
                    ),
                  ]),
                  h("div", { class: "sw-vuewb-workbook__row" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "add-sheet",
                        disabled:
                          !ready.value ||
                          readOnly.value ||
                          sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID),
                        onClick: addArchiveSheet,
                      },
                      sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID)
                        ? "Archive added"
                        : "Add archive sheet",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "open-suppliers",
                        disabled: !ready.value,
                        onClick: openSuppliers,
                      },
                      "Open suppliers",
                    ),
                  ]),
                ]),
              ]),
              h("section", panelAttrs("persistence"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Host persistence"),
                    h("p", "Local document changes stay pending until acknowledged."),
                  ]),
                  h("a", { href: "/showcases/database/" }, "Durable proof →"),
                ]),
                h("div", { class: "sw-vuewb-persist" }, [
                  h(
                    "output",
                    {
                      "data-testid": "persistence",
                      "data-state": persistState.value.state,
                      "aria-live": "polite",
                    },
                    persistState.value.text,
                  ),
                  h("dl", { class: "sw-vuewb-persist__meters" }, [
                    h("div", [
                      h("dt", "Pending"),
                      h("dd", { "data-testid": "pending-count" }, String(pendingCount.value)),
                    ]),
                    h("div", [
                      h("dt", "Host version"),
                      h("dd", { "data-testid": "server-version" }, `v${serverVersion.value}`),
                    ]),
                    h("div", [
                      h("dt", "Generation"),
                      h(
                        "dd",
                        { "data-testid": "generation" },
                        `${generation.value} · ${readyReason.value}`,
                      ),
                    ]),
                  ]),
                  h(
                    "p",
                    { class: "sw-vuewb-persist__ack", "data-testid": "last-ack" },
                    `Last acknowledgement: ${lastAck.value}`,
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      "data-testid": "sync",
                      "data-variant": "primary",
                      disabled: pendingCount.value === 0 || syncBusy.value,
                      onClick: () => void syncToHost(),
                    },
                    syncBusy.value ? "Committing…" : "Sync to host",
                  ),
                ]),
              ]),
              h("section", panelAttrs("renderer"), [
                h("div", { class: "sw-vuewb-section__head" }, [
                  h("div", [
                    h("h3", "Renderer and adapter"),
                    h("p", "Renderer changes rebuild the Vue-owned Grid; live props do not."),
                  ]),
                ]),
                h(
                  "div",
                  { class: "sw-vuewb-renderers", role: "group", "aria-label": "Renderer mode" },
                  [
                    h(
                      "button",
                      {
                        type: "button",
                        "aria-pressed": rendererMode.value === "canvas",
                        disabled: !ready.value || pendingCount.value > 0,
                        onClick: () => setRenderer("canvas"),
                      },
                      "Canvas · main thread",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        "aria-pressed": rendererMode.value === "worker",
                        disabled: !ready.value || pendingCount.value > 0,
                        onClick: () => setRenderer("worker"),
                      },
                      "Worker · off thread",
                    ),
                  ],
                ),
                h("details", { class: "sw-vuewb-disclosure" }, [
                  h("summary", "Adapter settings"),
                  h("div", { class: "sw-vuewb-settings" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "readonly",
                        "aria-pressed": readOnly.value,
                        onClick: () => {
                          readOnly.value = !readOnly.value;
                          pushFeed("event", ":read-only", String(readOnly.value));
                        },
                      },
                      "Read only",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        "data-testid": "mutation-policy",
                        disabled: !ready.value || pendingCount.value > 0,
                        title:
                          pendingCount.value > 0
                            ? "Sync pending commits first — this input rebuilds the Grid."
                            : "Reset-bound adapter input: toggling replaces the Grid.",
                        onClick: togglePolicy,
                      },
                      `Policy: ${mutationPolicy.value}`,
                    ),
                  ]),
                ]),
                h("details", { class: "sw-vuewb-disclosure" }, [
                  h("summary", "Vue bindings"),
                  h("dl", { class: "sw-vuewb-props", "data-testid": "props" }, [
                    h("div", [h("dt", ":read-only"), h("dd", String(readOnly.value))]),
                    h("div", [h("dt", ":mutation-policy"), h("dd", mutationPolicy.value)]),
                    h("div", [h("dt", ":protection-resolver"), h("dd", role.value)]),
                    h("div", [h("dt", ":renderer"), h("dd", rendererMode.value)]),
                    h("div", [h("dt", ":workbook"), h("dd", `generation ${generation.value}`)]),
                  ]),
                ]),
              ]),
              h("section", { class: "sw-vuewb-eventrail", "data-testid": "event-panel" }, [
                h("header", [
                  h("strong", "Adapter events"),
                  h("span", `${feed.value.length} recent · Vue + Grid`),
                ]),
                eventFeed(),
              ]),
            ]),
          ]),
          h("footer", { class: "sw-demo-status sw-demo-status--metrics" }, [
            h("span", `Selection · ${selectedLabel.value}`),
            h("span", `Role · ${role.value}`),
            h("span", `Pending · ${pendingCount.value}`),
            h("span", `Host · v${serverVersion.value}`),
            h("span", `${rendererMode.value} · gen ${generation.value}`),
          ]),
        ]),
      ]);
  },
});

export default App;
