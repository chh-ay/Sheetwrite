import type { CellRenderer, ColumnarData, Theme, Workbook } from "@sheetwrite/core";
import { createGrid } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { ensureSheetwrite } from "./sheetwrite";

// ── In-memory data ───────────────────────────────────────────────────────────
// A small in-memory sheet so per-cell styling and live edits are visible.
const ROWS = 200;
const STATUSES = ["active", "trial", "churned"] as const;

const ids: number[] = [];
const names: string[] = [];
const statuses: string[] = [];
const amounts: number[] = [];
const scores: number[] = [];

for (let r = 0; r < ROWS; r++) {
  ids.push(r + 1);
  names.push(`Account ${String(r + 1).padStart(3, "0")}`);
  statuses.push(STATUSES[r % STATUSES.length] ?? "active");
  amounts.push(Math.round((Math.sin(r) * 0.5 + 0.5) * 50_000) / 100);
  scores.push((r * 37) % 100);
}

const workbook: Workbook = {
  activeSheet: "accounts",
  sheets: [
    {
      id: "accounts",
      name: "Accounts",
      rowCount: ROWS,
      columns: [
        { key: "id", header: "ID", width: 80, type: "number" },
        {
          key: "name",
          header: "Account",
          width: 200,
          type: "text",
        },
        { key: "status", header: "Status", width: 140, type: "text", renderer: "badge" },
        {
          key: "amount",
          header: "Amount",
          width: 140,
          type: "number",
          numberFormat: "#,##0.00",
          cellStyle: { align: "right" },
        },
        {
          key: "score",
          header: "Score",
          width: 100,
          type: "number",
          cellStyle: { align: "right" },
        },
      ],
    },
  ],
};

const data: ColumnarData = {
  rowCount: ROWS,
  columns: { id: ids, name: names, status: statuses, amount: amounts, score: scores },
};

// ── Custom canvas cell renderer: compact status tags ─────────────────────────
interface TagPalette {
  fill: string;
  fg: string;
  edge: string;
}

const LIGHT_TAGS: Record<string, TagPalette> = {
  active: { fill: "#dcfce7", fg: "#166534", edge: "#22c55e" },
  trial: { fill: "#ffedd5", fg: "#9a3412", edge: "#f97316" },
  churned: { fill: "#e2e8f0", fg: "#475569", edge: "#94a3b8" },
};
const DARK_TAGS: Record<string, TagPalette> = {
  active: { fill: "#12372a", fg: "#86efac", edge: "#34d399" },
  trial: { fill: "#422a16", fg: "#fdba74", edge: "#fb923c" },
  churned: { fill: "#273244", fg: "#cbd5e1", edge: "#64748b" },
};
const TAG_FALLBACK: TagPalette = { fill: "#e2e8f0", fg: "#475569", edge: "#94a3b8" };

const badge: CellRenderer = {
  canvas(ctx, c) {
    const label = c.value == null ? "" : String(c.value);
    if (label === "") return;

    const palettes = c.theme.bg === "#0b1020" ? DARK_TAGS : LIGHT_TAGS;
    const palette = palettes[label] ?? TAG_FALLBACK;
    const padX = 8;
    const tagH = Math.min(c.h - 8, 18);
    const tagX = c.x + 7;
    const tagY = c.y + (c.h - tagH) / 2;

    ctx.font = c.theme.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const textW = ctx.measureText(label).width;
    const tagW = Math.min(textW + padX * 2 + 3, c.w - 14);
    ctx.fillStyle = palette.fill;
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.fillStyle = palette.edge;
    ctx.fillRect(tagX, tagY, 3, tagH);
    ctx.fillStyle = palette.fg;
    ctx.fillText(label, tagX + padX + 3, tagY + tagH / 2);
  },
};

// ── Theme palettes wired to the toolbar ──────────────────────────────────────
const LIGHT: Partial<Theme> = {
  bg: "#f7f8fb",
  fg: "#1e293b",
  gridLine: "#d9e0ea",
  headerBg: "#111827",
  headerFg: "#e5e7eb",
  selection: "#10b98124",
  selectionBorder: "#059669",
};

const DARK: Partial<Theme> = {
  bg: "#0b1020",
  fg: "#dce3f0",
  gridLine: "#202a40",
  headerBg: "#12192a",
  headerFg: "#93c5fd",
  selection: "#38bdf824",
  selectionBorder: "#38bdf8",
};

const BRAND: Partial<Theme> = {
  bg: "#fffafc",
  fg: "#392f3a",
  gridLine: "#eadde6",
  headerBg: "#5b214e",
  headerFg: "#fff5fb",
  selection: "#d946ef1f",
  selectionBorder: "#c026d3",
};

// ── Boot ─────────────────────────────────────────────────────────────────────
await ensureSheetwrite();

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const grid = createGrid(host, {
  workbook,
  data,
  renderer: "canvas",
  theme: LIGHT,
  renderers: { badge },
});

grid.on("change", (e) => {
  console.log("change:", e.changes.length, "cell(s)");
});

// ── Toolbar: live theme switching ────────────────────────────────────────────
// `data-theme` keeps the surrounding `.sheetwrite` CSS-var chrome in sync; the
// canvas grid itself repaints from the Theme object passed to `setTheme`.
const stage = document.getElementById("stage");
const lightBtn = document.getElementById("theme-light") as HTMLButtonElement | null;
const darkBtn = document.getElementById("theme-dark") as HTMLButtonElement | null;
const brandBtn = document.getElementById("theme-brand") as HTMLButtonElement | null;

const themeJson = document.getElementById("theme-json");

function showTheme(theme: Partial<Theme>): void {
  if (!themeJson) return;
  const body = Object.entries(theme)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`)
    .join("\n");
  themeJson.textContent = `grid.setTheme({\n${body}\n})`;
}

showTheme(LIGHT);

function selectThemeButton(active: HTMLButtonElement | null): void {
  for (const btn of [lightBtn, darkBtn, brandBtn]) {
    if (btn) btn.setAttribute("aria-pressed", String(btn === active));
  }
}

lightBtn?.addEventListener("click", () => {
  grid.setTheme(LIGHT);
  stage?.removeAttribute("data-theme");
  selectThemeButton(lightBtn);
  showTheme(LIGHT);
});
darkBtn?.addEventListener("click", () => {
  grid.setTheme(DARK);
  stage?.setAttribute("data-theme", "dark");
  selectThemeButton(darkBtn);
  showTheme(DARK);
});
brandBtn?.addEventListener("click", () => {
  grid.setTheme(BRAND);
  stage?.removeAttribute("data-theme");
  selectThemeButton(brandBtn);
  showTheme(BRAND);
});

// ── Toolbar: per-cell fill on the selected cell ──────────────────────────────
const picker = document.getElementById("cell-fill") as HTMLInputElement | null;

picker?.addEventListener("input", () => {
  const sel = grid.getSelection();
  if (sel?.kind !== "cell") return; // no-op without a single-cell selection

  const addr = sel.addr;
  // `set` replaces value + style, so preserve the current value while restyling.
  const current = grid.store.getCell(addr).resolved;
  grid.store.applyTransaction({
    patches: [
      {
        op: "set",
        addr,
        value: { kind: "literal", value: current },
        style: { backgroundColor: picker.value },
      },
    ],
  });
});
