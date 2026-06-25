import type { CellRenderer, ColumnarData, Theme, Workbook } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
// Built WASM binary, bundled as a file asset so the browser can fetch it.
import wasmUrl from "../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm" with { type: "file" };
import "@sheetwrite/core/styles.css";

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
          headerStyle: { bold: true, color: "#1d4ed8" },
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

// ── Custom canvas cell renderer: a colored status pill ───────────────────────
const BADGE_PALETTE: Record<string, { bg: string; fg: string }> = {
  active: { bg: "#16a34a", fg: "#ffffff" },
  trial: { bg: "#d97706", fg: "#ffffff" },
  churned: { bg: "#9ca3af", fg: "#1f2937" },
};
const BADGE_FALLBACK = { bg: "#e5e7eb", fg: "#374151" };

const badge: CellRenderer = {
  canvas(ctx, c) {
    const label = c.value == null ? "" : String(c.value);
    if (label === "") return;

    const palette = BADGE_PALETTE[label] ?? BADGE_FALLBACK;
    const padX = 8;
    const pillH = Math.min(c.h - 8, 18);
    const pillX = c.x + padX;
    const pillY = c.y + (c.h - pillH) / 2;
    const radius = pillH / 2;

    ctx.font = c.theme.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const textW = ctx.measureText(label).width;
    const pillW = Math.max(radius * 2, Math.min(textW + padX * 2, c.w - padX * 2));

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, radius);
    ctx.fillStyle = palette.bg;
    ctx.fill();

    ctx.fillStyle = palette.fg;
    ctx.fillText(label, pillX + padX, pillY + pillH / 2, Math.max(1, pillW - padX * 2));
  },
};

// ── Theme palettes wired to the toolbar ──────────────────────────────────────
const LIGHT: Partial<Theme> = {
  bg: "#ffffff",
  fg: "#111111",
  gridLine: "#eeeeee",
  headerBg: "#f4ede1",
  headerFg: "#6b4a1f",
  selection: "#2563eb22",
  selectionBorder: "#2563eb",
};

const DARK: Partial<Theme> = {
  bg: "#0b0b0c",
  fg: "#e7e7e7",
  gridLine: "#26262a",
  headerBg: "#1a160f",
  headerFg: "#e8c98a",
  selection: "#e8c98a22",
  selectionBorder: "#e8c98a",
};

const BRAND: Partial<Theme> = {
  bg: "#fff8f0",
  fg: "#3b2410",
  gridLine: "#f0dcc4",
  headerBg: "#d2691e",
  headerFg: "#fff8f0",
  selection: "#d2691e22",
  selectionBorder: "#d2691e",
};

// ── Boot ─────────────────────────────────────────────────────────────────────
await initSheetwrite(wasmUrl);

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

function selectThemeButton(active: HTMLButtonElement | null): void {
  for (const btn of [lightBtn, darkBtn, brandBtn]) {
    if (btn) btn.setAttribute("aria-pressed", String(btn === active));
  }
}

lightBtn?.addEventListener("click", () => {
  grid.setTheme(LIGHT);
  stage?.removeAttribute("data-theme");
  selectThemeButton(lightBtn);
});
darkBtn?.addEventListener("click", () => {
  grid.setTheme(DARK);
  stage?.setAttribute("data-theme", "dark");
  selectThemeButton(darkBtn);
});
brandBtn?.addEventListener("click", () => {
  grid.setTheme(BRAND);
  stage?.removeAttribute("data-theme");
  selectThemeButton(brandBtn);
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
