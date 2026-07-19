/**
 * React controlled-analytics workbench. Consumes the shared analytics scenario
 * through `useAnalyticsWorkbench`: query/filter controls, formula entry with
 * live recalculation, KPI summaries derived from real engine formulas,
 * search/replace, undo/redo, CSV/XLSX workflow entry points, renderer state,
 * and the adapter's reset/reconciliation lifecycle — all as React state.
 */

import workerUrl from "@sheetwrite/core/worker?worker&url";
import { SheetwriteGrid } from "@sheetwrite/react";
import { FileSpreadsheet, Monitor } from "lucide-react";
import type { KeyboardEvent, ChangeEvent as ReactChangeEvent } from "react";
import { money, useAnalyticsWorkbench } from "./react-analytics.js";
import { ANALYTICS_MARKETS, ANALYTICS_SEGMENTS, ANALYTICS_THEME } from "./scenarios/analytics.js";
import { DemoButton } from "./ui/DemoButton.js";
import { DemoRenderingMode } from "./ui/DemoRenderingMode.js";
import { DemoSelect } from "./ui/DemoSelect.js";
import "@sheetwrite/react/styles.css";

const GRID_CONFIG = { toolbar: true } as const;
const MARKET_OPTIONS = [
  { label: "All markets", value: "all" },
  ...ANALYTICS_MARKETS.map((value) => ({ label: value, value })),
];
const SEGMENT_OPTIONS = [
  { label: "All segments", value: "all" },
  ...ANALYTICS_SEGMENTS.map((value) => ({ label: value, value })),
];

function kpiText(value: number | null): string {
  return value === null ? "—" : money.format(value);
}

export default function ReactWorkbench() {
  const bench = useAnalyticsWorkbench();
  const hasMatches = (bench.matches?.matches.length ?? 0) > 0;

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") bench.runSearch(bench.query);
  }

  function onFormulaKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") bench.commitFormulaDraft();
  }

  function onImportChange(event: ReactChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void bench.importCsv(file);
  }

  return (
    <section className="sw-demo-app sw-rwb" data-framework="react">
      <main className="sw-demo-main sw-rwb__main" id="workbench">
        <header className="sw-demo-controlbar">
          <div className="sw-demo-controlbar__identity">
            <span className="sw-demo-product__mark" aria-hidden="true">
              <FileSpreadsheet size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2>Sales pipeline</h2>
              <span>{bench.visibleRows.toLocaleString()} visible rows</span>
            </div>
          </div>
          <div className="sw-demo-controlbar__controls" role="toolbar" aria-label="Query controls">
            <fieldset className="sw-rwb-cluster" aria-label="Filters">
              <DemoSelect
                label="Market"
                value={bench.market}
                options={MARKET_OPTIONS}
                onValueChange={bench.chooseMarket}
              />
              <DemoSelect
                label="Segment"
                value={bench.segment}
                options={SEGMENT_OPTIONS}
                onValueChange={bench.chooseSegment}
              />
            </fieldset>
            <fieldset className="sw-rwb-cluster" aria-label="Account search">
              <label className="sw-demo-controlbar__search">
                <span className="sw-visually-hidden">Search accounts</span>
                <input
                  aria-label="Search accounts"
                  type="search"
                  value={bench.query}
                  placeholder="Account 004812"
                  onChange={(event) => bench.setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
              </label>
              <DemoButton type="button" onClick={() => bench.runSearch(bench.query)}>
                Find
              </DemoButton>
              <DemoButton type="button" onClick={bench.findPrev} disabled={!hasMatches}>
                Previous
              </DemoButton>
              <DemoButton type="button" onClick={bench.findNext} disabled={!hasMatches}>
                Next
              </DemoButton>
            </fieldset>
            <fieldset className="sw-rwb-cluster" aria-label="View">
              <DemoButton type="button" onClick={bench.rankByArr}>
                Rank ARR
              </DemoButton>
              <DemoButton type="button" onClick={bench.resetView}>
                Reset view
              </DemoButton>
            </fieldset>
          </div>
          <span className="sw-demo-controlbar__state" role="status">
            <Monitor aria-hidden="true" size={14} />
            {bench.activeRenderer === "worker" ? "Worker" : "Canvas"}
          </span>
        </header>

        <div className="sw-rwb-editrow" role="toolbar" aria-label="Editing controls">
          <fieldset className="sw-rwb-cluster sw-rwb-cluster--formula" aria-label="Formula">
            <span className="sw-rwb-editrow__address" data-testid="selection-address">
              {bench.formulaAddress
                ? `R${bench.formulaAddress.row + 1} C${bench.formulaAddress.col + 1}`
                : "No cell"}
            </span>
            <label className="sw-rwb-editrow__field sw-rwb-editrow__field--formula">
              <span className="sw-visually-hidden">Formula or value</span>
              <input
                aria-label="Formula or value"
                data-testid="formula-input"
                type="text"
                value={bench.formulaDraft}
                placeholder="=SUM(ANNUAL_ARR)"
                disabled={bench.readOnly || bench.formulaAddress === null}
                onChange={(event) => bench.editFormulaDraft(event.target.value)}
                onKeyDown={onFormulaKeyDown}
              />
            </label>
            <DemoButton
              type="button"
              onClick={bench.commitFormulaDraft}
              disabled={bench.readOnly || bench.formulaAddress === null}
            >
              Apply
            </DemoButton>
          </fieldset>
          <fieldset className="sw-rwb-cluster" aria-label="Replace">
            <label className="sw-rwb-editrow__field">
              <span className="sw-visually-hidden">Replacement text</span>
              <input
                aria-label="Replacement text"
                data-testid="replace-input"
                type="text"
                value={bench.replacement}
                placeholder="Replace with…"
                disabled={bench.readOnly}
                onChange={(event) => bench.setReplacement(event.target.value)}
              />
            </label>
            <DemoButton
              type="button"
              onClick={bench.replaceCurrent}
              disabled={bench.readOnly || !hasMatches}
            >
              Replace
            </DemoButton>
            <DemoButton
              type="button"
              onClick={bench.replaceAll}
              disabled={bench.readOnly || !hasMatches}
            >
              Replace all
            </DemoButton>
          </fieldset>
          <fieldset className="sw-rwb-cluster" aria-label="History">
            <DemoButton type="button" onClick={bench.undo}>
              Undo
            </DemoButton>
            <DemoButton type="button" onClick={bench.redo}>
              Redo
            </DemoButton>
          </fieldset>
        </div>

        <div className="sw-demo-grid">
          <SheetwriteGrid
            ref={bench.gridRef}
            workbook={bench.workbook}
            data={bench.dataset}
            theme={ANALYTICS_THEME}
            readOnly={bench.readOnly}
            renderer={bench.renderer}
            workerUrl={bench.renderer === "worker" ? workerUrl : undefined}
            config={GRID_CONFIG}
            style={{ height: "100%" }}
            onReady={bench.onReady}
            onGridChange={bench.onGridChange}
            onSelectionChange={bench.onSelectionChange}
          />
        </div>

        <div className="sw-rwb-deck">
          <dl className="sw-rwb-kpis" aria-label="Derived summaries">
            <div className="sw-rwb-kpi">
              <dt>Total ARR</dt>
              <dd data-testid="kpi-total" data-raw={bench.kpis.total ?? ""}>
                {kpiText(bench.kpis.total)}
              </dd>
            </div>
            <div className="sw-rwb-kpi">
              <dt>Average deal</dt>
              <dd data-testid="kpi-average" data-raw={bench.kpis.average ?? ""}>
                {kpiText(bench.kpis.average)}
              </dd>
            </div>
            <div className="sw-rwb-kpi">
              <dt>Largest deal</dt>
              <dd data-testid="kpi-largest" data-raw={bench.kpis.largest ?? ""}>
                {kpiText(bench.kpis.largest)}
              </dd>
            </div>
            <div className="sw-rwb-kpi" data-focused={bench.market !== "all"}>
              <dt>{bench.market === "all" ? "All-market ARR" : `${bench.market} ARR`}</dt>
              <dd data-testid="kpi-market" data-raw={bench.kpis.market ?? ""}>
                {kpiText(bench.kpis.market)}
              </dd>
            </div>
          </dl>
          <div className="sw-rwb-workflow" role="toolbar" aria-label="Data workflow">
            <fieldset className="sw-rwb-cluster" aria-label="Data exchange">
              <DemoButton type="button" onClick={bench.exportCsv}>
                Export CSV
              </DemoButton>
              <DemoButton type="button" onClick={() => void bench.exportXlsx()}>
                Export XLSX
              </DemoButton>
              <label className="sw-rwb-workflow__import">
                Import CSV
                <input
                  aria-label="Import CSV file"
                  data-testid="import-csv"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={bench.readOnly}
                  onChange={onImportChange}
                />
              </label>
              <a
                className="sw-rwb-workflow__link"
                data-testid="interop-link"
                href="/showcases/interoperability/"
              >
                Fidelity proofs
              </a>
            </fieldset>
            <fieldset className="sw-rwb-cluster" aria-label="Grid lifecycle">
              <DemoButton type="button" onClick={bench.reloadDataset}>
                Reload dataset
              </DemoButton>
              <DemoButton
                type="button"
                aria-pressed={bench.readOnly}
                onClick={bench.toggleReadOnly}
              >
                Read-only
              </DemoButton>
              <DemoRenderingMode
                label="Rendering thread"
                mode={bench.renderer}
                onModeChange={bench.chooseRenderer}
              />
            </fieldset>
            <span className="sw-rwb-lifecycle" data-testid="lifecycle">
              Gen <span data-testid="generation">{bench.generation}</span> ·{" "}
              <span data-testid="ready-reason">{bench.readyReason}</span>
            </span>
          </div>
        </div>

        <footer className="sw-demo-status sw-demo-status--metrics">
          <span>
            Rows · <span data-testid="rows-visible">{bench.visibleRows.toLocaleString()}</span>
          </span>
          <span>
            Matches ·{" "}
            <span data-testid="matches">
              {bench.matches ? bench.matches.matches.length.toLocaleString() : "—"}
            </span>
          </span>
          <output data-testid="renderer" data-fallback-count={bench.rendererFallback?.count ?? 0}>
            Requested: {bench.renderer === "worker" ? "Web Worker" : "Main thread"} · Active:{" "}
            {bench.activeRenderer === "worker" ? "Web Worker" : "Main thread"}
            {bench.rendererFallback ? ` · Fallback: ${bench.rendererFallback.reason}` : ""}
          </output>
          <span>{bench.selection}</span>
          <span aria-live="polite" data-react-activity data-testid="activity">
            {bench.activity[0]?.message}
          </span>
        </footer>
      </main>
    </section>
  );
}
