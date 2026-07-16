import type { Grid, GridConfig, Selection } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { createSpreadsheetShell, type SpreadsheetShell } from "@sheetwrite/core/shell";
import { useEffect, useRef, useState } from "react";
import {
  createRevenueWorkbook,
  REVENUE_AMOUNT_COLUMN,
  REVENUE_DATA,
  REVENUE_ROWS,
  SHOWCASE_THEME,
} from "./revenue.js";
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

function describeSelection(selection: Selection | null): string {
  if (selection === null) return "No active cell";
  if (selection.kind === "cell") return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

const VANILLA_GRID_CONFIG: GridConfig = {
  contextMenu: (context) => [
    { id: "copy", action: "copy", label: "Copy value", shortcut: "Ctrl+C" },
    { action: "separator" },
    {
      id: "highlight-cell",
      label:
        context.cell === null
          ? "Highlight cell"
          : `Highlight cell R${context.cell.row + 1} C${context.cell.col + 1}`,
      visible: context.cell !== null,
      onClick(instance, cell) {
        if (cell === null) return;
        instance.highlightCells([
          {
            sheet: cell.sheet,
            start: { row: cell.row, col: cell.col },
            end: { row: cell.row, col: cell.col },
          },
        ]);
      },
    },
  ],
};

export default function VanillaShowcase() {
  const host = useRef<HTMLDivElement>(null);
  const grid = useRef<Grid>(null);
  const shell = useRef<SpreadsheetShell>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("No active cell");
  const [activity, setActivity] = useState("Initializing WASM and 100,000 rows");
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    let disposed = false;
    void initSheetwrite().then(() => {
      const currentHost = host.current;
      if (disposed || currentHost === null) return;
      const mounted = createSpreadsheetShell(currentHost, {
        grid: {
          workbook: createRevenueWorkbook(),
          data: REVENUE_DATA,
          config: VANILLA_GRID_CONFIG,
          theme: SHOWCASE_THEME,
        },
        onReady: (instance) => {
          instance.setFrozen(0, 1);
          grid.current = instance;
          setReady(true);
          setActivity("Imperative shell ready");
        },
        onChange: ({ transaction }) => {
          setActivity(`${transaction.patches.length} patch transaction committed`);
        },
        onSelectionChange: (value) => setSelection(describeSelection(value)),
      });
      const nameBox = currentHost.querySelector<HTMLInputElement>(".sheetwrite-shell-namebox");
      const formulaBar = currentHost.querySelector<HTMLInputElement>(".sheetwrite-shell-formula");
      if (nameBox !== null) nameBox.id = "namebox";
      if (formulaBar !== null) formulaBar.id = "formula";
      shell.current = mounted;
    });

    return () => {
      disposed = true;
      shell.current?.destroy();
      shell.current = null;
      grid.current = null;
    };
  }, []);

  const search = () => {
    const instance = grid.current;
    if (instance === null) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      instance.clearSearch();
      setActivity("Search cleared");
      return;
    }
    const result = instance.search(trimmed);
    if (result.matches.length > 0) instance.findNext();
    setActivity(`${result.matches.length.toLocaleString()} matches for “${trimmed}”`);
  };

  return (
    <section className="sw-vanilla-app" data-framework="vanilla">
      <header className="sw-demo-controlbar">
        <div className="sw-demo-controlbar__identity">
          <span className="sw-demo-product__mark" aria-hidden="true">
            JS
          </span>
          <div>
            <h2>Revenue accounts</h2>
            <span>Imperative shell · {REVENUE_ROWS.toLocaleString()} rows</span>
          </div>
        </div>
        <div className="sw-demo-controlbar__controls" role="toolbar" aria-label="Workbook commands">
          <label className="sw-demo-controlbar__search">
            <span className="sw-visually-hidden">Search accounts</span>
            <input
              aria-label="Search accounts"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") search();
              }}
              placeholder="Account 004812"
              type="search"
              value={query}
            />
          </label>
          <button disabled={!ready} onClick={search} type="button">
            Find
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              grid.current?.sortBy(REVENUE_AMOUNT_COLUMN, false);
              setActivity("Sorted ARR high to low");
            }}
            type="button"
          >
            Rank ARR
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              grid.current?.exportCsv("sheetwrite-revenue.csv");
              setActivity("CSV export requested");
            }}
            type="button"
          >
            Export CSV
          </button>
          <button
            aria-pressed={readOnly}
            disabled={!ready}
            onClick={() => {
              const next = !readOnly;
              setReadOnly(next);
              shell.current?.setReadOnly(next);
              setActivity(next ? "Read-only policy enabled" : "Editing enabled");
            }}
            type="button"
          >
            {readOnly ? "Enable editing" : "Read only"}
          </button>
        </div>
        <span
          className="sw-demo-controlbar__state"
          data-state={ready ? "ready" : "loading"}
          role="status"
        >
          {ready ? "Grid ready" : "Initializing"}
        </span>
      </header>

      <div className="sw-vanilla-shell" ref={host} />
      <footer className="sw-demo-status sw-demo-status--metrics">
        <span>{REVENUE_ROWS.toLocaleString()} rows</span>
        <span>{selection}</span>
        <span aria-live="polite">{activity}</span>
      </footer>
    </section>
  );
}
