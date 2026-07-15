<script lang="ts">
// Svelte 5 runes showcase: the framework adapter renders the grid, while the
// framework-neutral pieces from @sheetwrite/core/shell (formula bar, name box,
// selection status, toolbar) attach to the SAME Grid instance through
// `bind:grid` + `$effect` — chrome composition without a wrapper component.
import type {
  CellRenderer,
  CellValue,
  ChangeEvent,
  ColumnarData,
  Grid,
  GridEvents,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  createToolbar,
} from "@sheetwrite/core/shell";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import { Calculator, FileSpreadsheet, ListChecks, Moon, Sun } from "lucide-svelte";
import "@sheetwrite/svelte/styles.css";
import "@sheetwrite/core/shell.css";
import "../styles/showcase.css";

const ROWS = 500;

const LIGHT_THEME: Partial<Theme> = {
  bg: "#fffdf7",
  fg: "#292524",
  gridLine: "#e7e5e4",
  headerBg: "#1c1917",
  headerFg: "#fbbf24",
  selection: "#f59e0b22",
  selectionBorder: "#f59e0b",
};
const DARK_THEME: Partial<Theme> = {
  bg: "#1c1917",
  fg: "#e7e5e4",
  gridLine: "#44403c",
  headerBg: "#0c0a09",
  headerFg: "#fbbf24",
  selection: "#f59e0b33",
  selectionBorder: "#fbbf24",
};

function strokeIcon(paths: readonly string[]): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  };
}

const UNDO_ICON = strokeIcon(["M9 7 4 12l5 5", "M4 12h9a7 7 0 0 1 7 7"]);
const REDO_ICON = strokeIcon(["m15 7 5 5-5 5", "M20 12h-9a7 7 0 0 0-7 7"]);
const ROW_ADD_ICON = strokeIcon(["M3 6h18M3 12h10M3 18h18", "M18 9v6M15 12h6"]);
const ROW_REMOVE_ICON = strokeIcon(["M3 6h18M3 12h10M3 18h18", "M15 12h6"]);

const workbook: Workbook = {
  activeSheet: "model",
  sheets: [
    {
      id: "model",
      name: "Model",
      rowCount: ROWS,
      columns: [
        { key: "item", header: "Line item", width: 190, type: "text" },
        {
          key: "q1",
          header: "Q1 progress",
          width: 140,
          type: "currency",
          numberFormat: "$#,##0",
          renderer: "revenue-progress",
        },
        { key: "q2", header: "Q2", width: 110, type: "currency", numberFormat: "$#,##0" },
        { key: "q3", header: "Q3", width: 110, type: "currency", numberFormat: "$#,##0" },
        { key: "q4", header: "Q4", width: 110, type: "currency", numberFormat: "$#,##0" },
        { key: "total", header: "Total (=SUM)", width: 130, type: "currency", numberFormat: "$#,##0" },
      ],
    },
    {
      id: "summary",
      name: "Summary",
      rowCount: 6,
      columns: [
        { key: "metric", header: "Metric", width: 240, type: "text" },
        { key: "value", header: "Value", width: 160, type: "currency", numberFormat: "$#,##0" },
      ],
    },
  ],
};

// Eager columnar load: every Total cell is a real `=SUM(B?:E?)` formula, parsed
// and evaluated by the Rust calc engine in one bulk ingest.
function buildModelData(): ColumnarData {
  const item: string[] = new Array(ROWS);
  const quarters: Float64Array[] = [0, 1, 2, 3].map(() => new Float64Array(ROWS));
  const total: CellValue[] = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    item[r] = `Product line ${String(r + 1).padStart(3, "0")}`;
    for (let q = 0; q < 4; q++) {
      quarters[q]![r] = Math.round((Math.sin(r * 13 + q * 7) * 0.5 + 0.6) * 90_000);
    }
    total[r] = { kind: "formula", src: `=SUM(B${r + 1}:E${r + 1})` };
  }
  return {
    rowCount: ROWS,
    columns: { item, q1: quarters[0]!, q2: quarters[1]!, q3: quarters[2]!, q4: quarters[3]!, total },
  };
}

/** Cross-sheet summary formulas — watch them update live as you edit Model. */
function seedSummary({ grid }: { grid: Grid }): void {
  const label = (text: string): CellValue => ({ kind: "literal", value: text });
  const formula = (src: string): CellValue => ({ kind: "formula", src });
  const rows: Array<[string, string]> = [
    ["Company total", "=SUM(Model!F1:F500)"],
    ["Average line total", "=AVG(Model!F1:F500)"],
    ["Best line", "=MAX(Model!F1:F500)"],
    ["Worst line", "=MIN(Model!F1:F500)"],
    ["Q1 across all lines", "=SUM(Model!B1:B500)"],
  ];
  grid.store.applyTransaction({
    patches: rows.flatMap(([text, src], row) => [
      { op: "set" as const, addr: { sheet: "summary", row, col: 0 }, value: label(text) },
      { op: "set" as const, addr: { sheet: "summary", row, col: 1 }, value: formula(src) },
    ]),
  });
}

const renderers: Record<string, CellRenderer> = {
  "revenue-progress": {
    canvas(ctx, c) {
      const value = typeof c.value === "number" ? c.value : 0;
      const progress = Math.max(0, Math.min(1, value / 100_000));
      const inset = 6;
      const barX = c.x + inset;
      const barY = c.y + c.h - 7;
      const barWidth = Math.max(0, c.w - inset * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      ctx.fillStyle = c.theme.gridLine;
      ctx.fillRect(barX, barY, barWidth, 3);
      ctx.fillStyle = c.theme.selectionBorder;
      ctx.fillRect(barX, barY, barWidth * progress, 3);
      ctx.font = c.theme.font;
      ctx.fillStyle = c.theme.fg;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`$${Math.round(value).toLocaleString()}`, c.x + c.w - inset, c.y + c.h / 2 - 2);
      ctx.restore();
    },
  },
};

const data = buildModelData();

let grid = $state<Grid>();
let dark = $state(true);
let activeSheet = $state<"model" | "summary">("model");
let changeLog = $state<ChangeEvent[]>([]);
let chromeHost = $state<HTMLDivElement>();

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: false } as const;
let toolbarHost = $state<HTMLDivElement>();
let gridWrap = $state<HTMLDivElement>();

const theme = $derived(dark ? DARK_THEME : LIGHT_THEME);

function openSheet(sheet: "model" | "summary"): void {
  grid?.setActiveSheet(sheet);
  activeSheet = sheet;
}

function logChange(event: ChangeEvent): void {
  changeLog = [...changeLog, event].slice(-5);
}

// Attach the shell pieces to whatever Grid the adapter currently exposes; the
// cleanup runs when the grid is replaced or the component unmounts.
$effect(() => {
  const active = grid;
  const chrome = chromeHost;
  const bar = toolbarHost;
  if (!active || !chrome || !bar) return;

  const focusGrid = (): void => {
    gridWrap?.querySelector<HTMLElement>(".sheetwrite")?.focus();
  };

  const pieces = [
    createToolbar(bar, active, {
      items: [
        { action: "undo", icon: UNDO_ICON },
        { action: "redo", icon: REDO_ICON },
        { action: "separator" },
        { action: "bold" },
        { action: "italic" },
        { action: "separator" },
        {
          icon: ROW_ADD_ICON,
          title: "Insert a row above the selection — every =SUM below shifts",
          onClick: (g) => {
            const selection = g.getSelection();
            const at = selection?.kind === "cell" ? selection.addr.row : 0;
            g.insertRows(at, 1);
          },
        },
        {
          icon: ROW_REMOVE_ICON,
          title: "Delete the selected row — refs to it become #REF!",
          onClick: (g) => {
            const selection = g.getSelection();
            if (selection?.kind === "cell") g.removeRows(selection.addr.row, 1);
          },
        },
      ],
    }),
    createNameBox(chrome, active, { focusGrid }),
    createFormulaBar(chrome, active, { focusGrid }),
    createSelectionStatus(chrome, active),
  ];
  chrome.querySelector<HTMLInputElement>(".sheetwrite-shell-namebox")?.setAttribute("placeholder", "A1");
  chrome
    .querySelector<HTMLInputElement>(".sheetwrite-shell-formula")
    ?.setAttribute("placeholder", "Select a cell or enter a formula");

  return () => {
    for (const piece of pieces) piece.destroy();
  };
});
</script>

<section class="sw-demo-app sw-svelte-demo" data-framework="svelte" data-theme={dark ? "dark" : undefined}>
  <header class="sw-demo-topbar">
    <div class="sw-demo-product">
      <span class="sw-demo-product__mark">
        <FileSpreadsheet size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <strong>Planning model</strong>
        <span>Formula operations</span>
      </div>
    </div>
    <nav aria-label="Workbook quick actions">
      <button type="button" data-active={activeSheet === "model"} onclick={() => openSheet("model")}>
        <FileSpreadsheet size={15} aria-hidden="true" /> Model
      </button>
      <button type="button" data-active={activeSheet === "summary"} onclick={() => openSheet("summary")}>
        <ListChecks size={15} aria-hidden="true" /> Summary
      </button>
      <button type="button" onclick={() => (dark = !dark)}>
        {#if dark}<Sun size={15} aria-hidden="true" /> Light{:else}<Moon size={15} aria-hidden="true" /> Dark{/if}
      </button>
    </nav>
    <div class="sw-demo-presence" role="status" data-state="ready">
      <Calculator size={16} aria-hidden="true" /> 500 formulas ready
    </div>
  </header>

  <div class="sw-demo-layout sw-demo-layout--single">

    <main class="sw-demo-main" id="model">
      <div class="sw-demo-heading">
        <div>
          <p>PLANNING MODEL / FY26</p>
          <h2>Annual revenue plan</h2>
        </div>
      </div>

      <div class="sw-demo-kpis" aria-label="Formula workbook metrics">
        <article><span>MODEL ROWS</span><strong>{ROWS.toLocaleString()}</strong><small>Bulk columnar ingest</small></article>
        <article><span>LIVE FORMULAS</span><strong>{ROWS.toLocaleString()}</strong><small>=SUM(B:E) per line</small></article>
        <article><span>COMMITTED</span><strong>{changeLog.length}</strong><small>Recent transactions</small></article>
        <article><span>SHEETS</span><strong>2</strong><small>Cross-sheet references</small></article>
      </div>

      <div class="sw-svelte-chrome" id="formulas">
        <div class="sw-svelte-toolbar" bind:this={toolbarHost}>
          <span>EDIT</span>
        </div>
        <div class="sw-svelte-formula" bind:this={chromeHost}></div>
      </div>

      <div class="sw-demo-workspace">
        <div class="sw-demo-grid" bind:this={gridWrap}>
          <SheetwriteGrid
            bind:grid
            {workbook}
            {data}
            {theme}
            {renderers}
            onGridChange={logChange}
            onActiveSheetChange={(event: GridEvents["active-sheet"]) => {
              activeSheet = event.sheet === "summary" ? "summary" : "model";
            }}
            config={GRID_CONFIG}
            onReady={seedSummary}
            fill
          />
        </div>
        <aside class="sw-demo-activity" id="activity" aria-label="Recent transactions" aria-live="polite">
          <div>
            <p>TRANSACTION LOG</p>
            <strong>Committed operations</strong>
          </div>
          {#if changeLog.length === 0}
            <p class="sw-demo-activity__empty">Edit a value or formula to inspect its commit reason.</p>
          {:else}
            <ol>
              {#each [...changeLog].reverse() as event}
                <li>
                  <code>{event.commitReason}</code>
                  <span>{event.changes.length} changed cell(s)</span>
                </li>
              {/each}
            </ol>
          {/if}
          <div class="sw-demo-activity__help">
            <span>TRY THIS</span>
            <p>Edit a quarter value, then open Summary. The cross-sheet total recalculates immediately.</p>
          </div>
        </aside>
      </div>

      <footer class="sw-demo-status">
        <span>Svelte 5 runes · bound Grid handle</span>
        <span>Custom Canvas renderer · composed shell controls</span>
      </footer>
    </main>
  </div>
</section>

<style>
  .sw-svelte-chrome {
    --sheetwrite-widget-bg: var(--demo-surface);
    --sheetwrite-widget-fg: var(--demo-fg);
    --sheetwrite-widget-border: var(--demo-border);
    --sheetwrite-widget-selection: color-mix(in srgb, var(--demo-accent) 14%, transparent);
    --sheetwrite-widget-accent: var(--demo-accent);
    --sheetwrite-toolbar-bg: var(--demo-raised);
    --sheetwrite-toolbar-fg: var(--demo-fg);
    display: grid;
    overflow: hidden;
    border: 1px solid var(--demo-border);
    border-radius: 0.5rem;
    background: var(--demo-raised);
  }

  .sw-svelte-toolbar {
    display: flex;
    min-height: 2.4rem;
    gap: 0.55rem;
    align-items: center;
    padding-inline: 0.55rem;
    border-bottom: 1px solid var(--demo-border);
  }

  .sw-svelte-toolbar > span {
    color: #60708b;
    font: 600 var(--sw-type-xs) var(--font-mono);
    letter-spacing: 0.1em;
  }

  .sw-svelte-toolbar > button {
    min-height: 1.75rem;
    margin-left: auto;
    border: 1px solid var(--demo-border);
    border-radius: 0.3rem;
    background: var(--demo-surface);
    color: var(--demo-muted);
    font: 500 var(--sw-type-xs) var(--font-mono);
  }

  .sw-svelte-toolbar :global(.sheetwrite-shell-toolbar) {
    flex: 1;
  }

  .sw-svelte-formula {
    display: flex;
    min-height: 2.4rem;
    gap: 0.4rem;
    align-items: center;
    padding: 0.35rem 0.55rem;
  }

  .sw-svelte-formula::before {
    color: #60708b;
    font: 600 var(--sw-type-xs) var(--font-mono);
    letter-spacing: 0.1em;
    content: "CELL";
  }
</style>
