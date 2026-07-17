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
  Workbook,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  createToolbar,
} from "@sheetwrite/core/shell";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import { Calculator, FileSpreadsheet, ListChecks } from "lucide-svelte";
import { SVELTE_SHOWCASE_THEME } from "./revenue.js";
import "@sheetwrite/svelte/styles.css";
import "@sheetwrite/core/shell.css";

const ROWS = 500;


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
let activeSheet = $state<"model" | "summary">("model");
let changeLog = $state<ChangeEvent[]>([]);
let chromeHost = $state<HTMLDivElement>();

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: false } as const;
let toolbarHost = $state<HTMLDivElement>();
let gridWrap = $state<HTMLDivElement>();

const theme = SVELTE_SHOWCASE_THEME;

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

<section class="sw-demo-app sw-svelte-demo" data-framework="svelte">
  <main class="sw-demo-main" id="model">
    <header class="sw-svelte-chrome sw-demo-controlbar" id="formulas">
      <div class="sw-demo-controlbar__identity">
        <span class="sw-demo-product__mark" aria-hidden="true">
          <FileSpreadsheet size={16} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Annual revenue plan</h2>
          <span>{ROWS.toLocaleString()} live formulas</span>
        </div>
      </div>
      <nav class="sw-demo-controlbar__sheet-actions" aria-label="Workbook quick actions">
        <button type="button" data-active={activeSheet === "model"} onclick={() => openSheet("model")}>
          <FileSpreadsheet size={15} aria-hidden="true" /> Model
        </button>
        <button type="button" data-active={activeSheet === "summary"} onclick={() => openSheet("summary")}>
          <ListChecks size={15} aria-hidden="true" /> Summary
        </button>
      </nav>
      <div class="sw-svelte-toolbar" bind:this={toolbarHost}>
        <span>EDIT</span>
      </div>
      <div class="sw-svelte-formula" bind:this={chromeHost}></div>
    </header>

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

    <footer class="sw-demo-status sw-demo-status--metrics">
      <span>{ROWS.toLocaleString()} model rows</span>
      <span>{ROWS.toLocaleString()} formulas</span>
      <span>{changeLog.length} recent commits</span>
      <span>2 linked sheets</span>
      <span class="sw-demo-status__binding"><Calculator size={13} aria-hidden="true" /> Svelte 5 bound Grid</span>
    </footer>
  </main>
</section>

<style>
  .sw-svelte-chrome {
    --sheetwrite-widget-bg: var(--demo-surface);
    --sheetwrite-widget-fg: var(--demo-fg);
    --sheetwrite-widget-border: var(--demo-border);
    --sheetwrite-widget-selection: color-mix(in srgb, var(--demo-accent) 14%, transparent);
    --sheetwrite-widget-accent: var(--sw-demo-accent-strong);
    --sheetwrite-toolbar-bg: transparent;
    --sheetwrite-toolbar-fg: var(--demo-fg);
    display: flex;
    min-width: 0;
    min-height: 3.25rem;
    gap: var(--sw-demo-space-2);
    align-items: center;
    padding: var(--sw-demo-space-2) var(--sw-demo-space-3);
    overflow-x: auto;
    border-bottom: 1px solid var(--demo-border);
    background: var(--demo-raised);
    scrollbar-width: thin;
  }

  .sw-svelte-toolbar {
    display: flex;
    flex: none;
    min-width: max-content;
    gap: var(--sw-demo-space-1);
    align-items: center;
  }

  .sw-svelte-toolbar > span,
  .sw-svelte-formula::before {
    color: var(--sw-demo-dim);
    font: 600 var(--sw-type-xs) var(--font-mono);
    letter-spacing: 0.1em;
  }

  .sw-svelte-toolbar :global(.sheetwrite-shell-toolbar) {
    flex: none;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .sw-svelte-formula {
    display: flex;
    flex: 1 0 22rem;
    min-width: 18rem;
    gap: var(--sw-demo-space-1);
    align-items: center;
  }

  .sw-svelte-formula::before {
    content: "CELL";
  }

  .sw-svelte-formula :global(.sheetwrite-shell-formula) {
    min-width: 12rem;
  }

  .sw-svelte-chrome :global(.sheetwrite-shell-status) {
    flex: none;
    padding-inline: var(--sw-demo-space-1);
    color: var(--demo-muted);
    font: 500 var(--sw-type-xs) var(--font-mono);
  }
</style>
