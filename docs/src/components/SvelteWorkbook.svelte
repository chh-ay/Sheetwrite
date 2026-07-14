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
  Theme,
  Workbook,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  createToolbar,
} from "@sheetwrite/core/shell";
import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
import "@sheetwrite/core/shell.css";

const ROWS = 500;
const SIMPLE_ROWS = [
  { name: "Notebook", price: 12.5 },
  { name: "Pen", price: 2.25 },
];
const SIMPLE_COLUMNS = [
  { key: "name" as const, title: "Product" },
  { key: "price" as const, title: "Price", type: "currency" as const },
];

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
let changeLog = $state<ChangeEvent[]>([]);
let chromeHost = $state<HTMLDivElement>();

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: false } as const;
let toolbarHost = $state<HTMLDivElement>();
let gridWrap = $state<HTMLDivElement>();

const theme = $derived(dark ? DARK_THEME : LIGHT_THEME);

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

<main class="example-shell" data-theme={dark ? "dark" : undefined}>
  <div class="example-chrome example-toolbar-row" bind:this={toolbarHost}>
    <span class="example-section-label">MODEL / EDIT</span>
    <button
      type="button"
      class="example-theme"
      aria-pressed={dark}
      onclick={() => (dark = !dark)}
    >
      {dark ? "Light" : "Dark"} theme
    </button>
  </div>
  <div class="example-chrome example-formula-row" bind:this={chromeHost}></div>
  <div class="example-grid" bind:this={gridWrap}>
    <SheetwriteGrid
      bind:grid
      {workbook}
      {data}
      {theme}
      {renderers}
      onGridChange={logChange}
      config={GRID_CONFIG}
      onReady={seedSummary}
      fill
    />
  </div>
  <section class="example-log" aria-live="polite">
    <strong>Recent changes</strong>
    {#if changeLog.length === 0}
      <span>Edit a cell to see its commit reason.</span>
    {:else}
      <ol>
        {#each changeLog as event}
          <li><code>{event.commitReason}</code> — {event.changes.length} cell(s)</li>
        {/each}
      </ol>
    {/if}
  </section>
  <details class="example-simple" aria-label="Quick-start Sheetwrite example">
    <summary>Quick start: everything above is the advanced grid — a basic one is 6 lines</summary>
    <div class="example-simple-body">
      <pre class="example-simple-code">{`<script>
  import { Sheetwrite } from "@sheetwrite/svelte";
  import "@sheetwrite/svelte/styles.css";
</` + `script>

<Sheetwrite
  columns={[
    { key: "name", title: "Product" },
    { key: "price", title: "Price", type: "currency" },
  ]}
  defaultRows={[
    { name: "Notebook", price: 12.5 },
    { name: "Pen", price: 2.25 },
  ]}
  height={180}
/>`}</pre>
      <Sheetwrite columns={SIMPLE_COLUMNS} defaultRows={SIMPLE_ROWS} height={180} {theme} />
    </div>
  </details>
</main>

<style>
  .example-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }

  /* Chrome colors come from the shared --chrome-* tokens on .example-shell
     (src/styles/global.css); the island's dark toggle flips them via
     data-theme on the shell. */
  .example-chrome {
    /* The core/shell pieces read widget tokens from their ancestor. */
    --sheetwrite-widget-bg: var(--chrome-bg);
    --sheetwrite-widget-fg: var(--chrome-fg);
    --sheetwrite-widget-border: var(--chrome-border);
    --sheetwrite-widget-selection: var(--chrome-accent-soft);
    --sheetwrite-widget-accent: var(--chrome-accent);
    --sheetwrite-toolbar-bg: var(--chrome-raised);
    --sheetwrite-toolbar-fg: var(--chrome-fg);
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--chrome-border);
    background: var(--chrome-raised);
    color: var(--chrome-fg);
  }

  .example-section-label {
    padding: 0 9px 0 2px;
    border-right: 1px solid var(--chrome-border);
    color: var(--chrome-muted);
    font: 10.5px var(--font-mono);
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  .example-toolbar-row :global(.sheetwrite-shell-toolbar) {
    flex: 1;
  }

  .example-toolbar-row :global(.sheetwrite-tb-button svg) {
    width: 15px;
    height: 15px;
  }

  .example-theme {
    order: 2;
    height: 26px;
    margin-left: 8px;
    padding: 0 9px;
    border: 0;
    border-left: 1px solid var(--chrome-border);
    border-radius: 0;
    background: transparent;
    color: var(--chrome-muted);
    font: 500 11.5px var(--font-mono);
    cursor: pointer;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .example-theme:hover {
    color: var(--chrome-accent);
  }

  .example-formula-row {
    padding: 4px 8px;
    font: 12px/1.4 var(--font-sans);
  }

  .example-formula-row::before {
    color: var(--chrome-muted);
    font: 10.5px var(--font-mono);
    letter-spacing: 0.08em;
    content: "CELL";
  }

  .example-grid {
    flex: 1;
    min-height: 0;
  }

  .example-log {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
    padding: 5px 10px;
    overflow-x: auto;
    border-top: 1px solid var(--chrome-border);
    background: var(--chrome-raised);
    color: var(--chrome-muted);
    font: 12px/1.4 var(--font-sans);
    white-space: nowrap;
  }

  .example-log strong {
    color: var(--chrome-fg);
    font-weight: 600;
  }

  .example-log code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--chrome-accent);
  }

  .example-log ol {
    display: flex;
    gap: 14px;
    margin: 0;
    padding-left: 20px;
  }
</style>
