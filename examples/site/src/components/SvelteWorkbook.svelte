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
let dark = $state(false);
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
        { action: "undo" },
        { action: "redo" },
        { action: "separator" },
        { action: "bold" },
        { action: "italic" },
        { action: "separator" },
        {
          icon: "＋ Row",
          title: "Insert a row above the selection — every =SUM below shifts",
          onClick: (g) => {
            const selection = g.getSelection();
            const at = selection?.kind === "cell" ? selection.addr.row : 0;
            g.insertRows(at, 1);
          },
        },
        {
          icon: "− Row",
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

  return () => {
    for (const piece of pieces) piece.destroy();
  };
});
</script>

<main class="example-shell" data-theme={dark ? "dark" : undefined}>
  <div class="example-chrome" bind:this={toolbarHost}>
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
  <section aria-label="Data-first Sheetwrite example">
    <Sheetwrite columns={SIMPLE_COLUMNS} defaultRows={SIMPLE_ROWS} height={180} />
  </section>
</main>

<style>
  .example-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }

  .example-chrome {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid #d6d3d1;
    background: #fafaf9;
  }

  [data-theme="dark"] .example-chrome {
    border-color: #44403c;
    background: #292524;
    color: #e7e5e4;
  }

  .example-theme {
    margin-left: auto;
    font: 13px/1.4 system-ui, sans-serif;
    padding: 0.25rem 0.55rem;
  }

  .example-formula-row {
    /* The shell pieces read the widget tokens; seed them from the page here. */
    font: 13px/1.4 system-ui, sans-serif;
  }

  .example-grid {
    flex: 1;
    min-height: 0;
  }
  .example-log {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 28px;
    padding: 4px 8px;
    overflow-x: auto;
    border-top: 1px solid #d6d3d1;
    background: #fafaf9;
    font: 12px/1.4 system-ui, sans-serif;
    white-space: nowrap;
  }

  .example-log ol {
    display: flex;
    gap: 12px;
    margin: 0;
    padding-left: 20px;
  }

  [data-theme="dark"] .example-log {
    border-color: #44403c;
    background: #292524;
    color: #e7e5e4;
  }

</style>
