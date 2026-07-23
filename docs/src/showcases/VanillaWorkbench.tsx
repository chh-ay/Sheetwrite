import type { PagedStoreStats, Selection, WorkbookSnapshot } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ENGINE_THEME } from "./scenarios/engine.js";
import { DemoButton } from "./ui/DemoButton.js";
import { DemoRadioGroup, DemoRadioItem } from "./ui/DemoRadioGroup.js";
import { DemoRenderingMode } from "./ui/DemoRenderingMode.js";
import {
  addSummarySheet,
  createWorkbench,
  describeActionError,
  exportWorkbookXlsx,
  importWorkbookXlsx,
  totalRevenue,
  WORKBENCH_ROWS,
  type Workbench,
  type WorkbenchDataMode,
  type WorkbenchRendererState,
} from "./vanilla-workbench.js";
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

export type WorkbenchRenderer = "canvas" | "worker";

export interface VanillaWorkbenchProps {
  /** Deep-linked construction options; the URL is the source of truth. */
  renderer: WorkbenchRenderer;
  data: WorkbenchDataMode;
  /** Reflect construction-bound choices back into the route search params. */
  onSpecChange: (spec: { renderer: WorkbenchRenderer; data: WorkbenchDataMode }) => void;
}

type Phase = "booting" | "live" | "failed" | "destroyed";

interface ImportedDocument {
  snapshot: WorkbookSnapshot;
  label: string;
}

interface ActivityLine {
  id: number;
  message: string;
}

type WorkbenchScenario = "lifecycle" | "paged" | "xlsx";

const WORKBENCH_SCENARIOS: ReadonlyArray<{
  id: WorkbenchScenario;
  label: string;
  kicker: string;
}> = [
  { id: "lifecycle", label: "Main / Worker", kicker: "Renderer ownership" },
  { id: "paged", label: "Paged source", kicker: "Datasource ownership" },
  { id: "xlsx", label: "XLSX", kicker: "Workbook ownership" },
];

const ACTIVITY_LINES = 4;

function describeSelection(selection: Selection | null): string {
  if (selection === null) return "No active cell";
  if (selection.kind === "cell") return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

function rendererLabel(kind: WorkbenchRenderer): string {
  return kind === "worker" ? "Web Worker" : "Main thread";
}

const kilobytes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * React here is docs-site chrome only: every spreadsheet behavior flows
 * through the framework-free host module in `vanilla-workbench.ts`. This
 * component's whole job is to hold the current WorkbenchSpec, mount/destroy
 * generations explicitly, and echo public grid events into visible state.
 */
export default function VanillaWorkbench({ renderer, data, onSpecChange }: VanillaWorkbenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workbenchRef = useRef<Workbench | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activityId = useRef(0);
  const readOnlyRef = useRef(false);

  const [alive, setAlive] = useState(true);
  const [phase, setPhase] = useState<Phase>("booting");
  const [generation, setGeneration] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [imported, setImported] = useState<ImportedDocument | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [selection, setSelection] = useState("No active cell");
  const [rendererState, setRendererState] = useState<WorkbenchRendererState | null>(null);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [pagedStats, setPagedStats] = useState<PagedStoreStats | null>(null);
  const [activity, setActivity] = useState<readonly ActivityLine[]>([]);
  const [scenario, setScenario] = useState<WorkbenchScenario>("lifecycle");
  const scenarioTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The URL owns the construction options, but /vanilla/ is prerendered
  // without a query string: the first client render must match that HTML.
  // Until hydration completes we render the default spec and mount nothing,
  // then the grid is created exactly once from the deep-linked options.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!hydrated) return;
    setScenario((current) => {
      if (data === "paged") return "paged";
      return current === "paged" ? "lifecycle" : current;
    });
  }, [data, hydrated]);
  const spec: { renderer: WorkbenchRenderer; data: WorkbenchDataMode } = hydrated
    ? { renderer, data }
    : { renderer: "canvas", data: "columnar" };

  const record = useCallback((message: string): void => {
    activityId.current += 1;
    const line = { id: activityId.current, message };
    setActivity((lines) => [line, ...lines].slice(0, ACTIVITY_LINES));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetCount is an explicit remount token whose value is intentionally opaque.
  useEffect(() => {
    if (!alive || !hydrated) return;
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let workbench: Workbench | null = null;
    setPhase("booting");
    setFallbackCount(0);
    setSelection("No active cell");

    void initSheetwrite()
      .then(() => {
        if (cancelled) return;
        workbench = createWorkbench(
          host,
          {
            renderer: spec.renderer,
            data: spec.data,
            ...(imported === null ? {} : { snapshot: imported.snapshot }),
          },
          {
            onActivity: record,
            onSelectionChange: (next) => setSelection(describeSelection(next)),
            onRendererChange: (state) => {
              setRendererState(state);
              if (state.fallback !== null) setFallbackCount((count) => count + 1);
            },
            onPagedStats: setPagedStats,
          },
        );
        workbench.setReadOnly(readOnlyRef.current);
        workbenchRef.current = workbench;
        setPhase("live");
        setGeneration((count) => count + 1);
        record(
          imported === null
            ? `Grid created — ${WORKBENCH_ROWS.toLocaleString()} rows, ${spec.data === "paged" ? "paged host source" : "dense columnar data"}`
            : `Grid created from ${imported.label}`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPhase("failed");
        record(`Grid failed to boot: ${describeActionError(error)}`);
      });

    return () => {
      cancelled = true;
      workbench?.destroy();
      workbenchRef.current = null;
      setPagedStats(null);
    };
    // `resetCount` intentionally re-runs this effect with an unchanged spec:
    // reset is destroy + create of a fresh generation, not a state patch.
  }, [alive, hydrated, spec.renderer, spec.data, imported, resetCount, record]);

  useEffect(() => {
    const observer = new MutationObserver(() =>
      workbenchRef.current?.grid.replaceTheme(ENGINE_THEME),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  function changeRenderer(next: WorkbenchRenderer): void {
    if (next === spec.renderer) return;
    record(
      `Renderer is construction-bound — rebuilding on the ${rendererLabel(next).toLowerCase()}`,
    );
    onSpecChange({ renderer: next, data: spec.data });
  }

  function changeData(next: WorkbenchDataMode): void {
    if (next === spec.data && imported === null) return;
    setImported(null);
    onSpecChange({ renderer: spec.renderer, data: next });
  }

  function selectScenario(next: WorkbenchScenario): void {
    setScenario(next);
    if (next === "paged" && spec.data !== "paged") {
      changeData("paged");
    } else if (next !== "paged" && spec.data === "paged") {
      changeData("columnar");
    }
  }

  function onScenarioKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % WORKBENCH_SCENARIOS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + WORKBENCH_SCENARIOS.length) % WORKBENCH_SCENARIOS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = WORKBENCH_SCENARIOS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = WORKBENCH_SCENARIOS[nextIndex]!;
    selectScenario(next.id);
    scenarioTabRefs.current[nextIndex]?.focus();
  }

  function resetWorkbench(): void {
    setImported(null);
    setResetCount((count) => count + 1);
  }

  function destroyWorkbench(): void {
    setAlive(false);
    setPhase("destroyed");
    record("Grid destroyed — no listeners, chrome, or canvas survive teardown");
  }

  function toggleReadOnly(next: boolean): void {
    readOnlyRef.current = next;
    setReadOnly(next);
    workbenchRef.current?.setReadOnly(next);
    record(next ? "Editing locked — a live option, no rebuild needed" : "Editing unlocked");
  }

  function withGrid(action: (workbench: Workbench) => void): void {
    const workbench = workbenchRef.current;
    if (workbench === null) return;
    try {
      action(workbench);
    } catch (error) {
      record(describeActionError(error));
    }
  }

  function addSummary(): void {
    withGrid(({ grid }) => {
      addSummarySheet(grid);
      record("Summary sheet active — live cross-sheet formulas over the fixture");
    });
  }

  function total(): void {
    withGrid(({ grid }) => {
      const sum = totalRevenue(grid);
      record(`Pipeline total ${money.format(sum)} across ${WORKBENCH_ROWS.toLocaleString()} rows`);
    });
  }

  async function exportWorkbook(): Promise<void> {
    const workbench = workbenchRef.current;
    if (workbench === null) return;
    try {
      const bytes = await exportWorkbookXlsx(workbench.grid, "sheetwrite-workbench.xlsx");
      record(`Exported workbook — ${kilobytes.format(bytes / 1024)} KB of XLSX`);
    } catch (error) {
      record(describeActionError(error));
    }
  }

  async function importWorkbook(file: File): Promise<void> {
    try {
      const { snapshot, warnings } = await importWorkbookXlsx(await file.arrayBuffer());
      setImported({ snapshot, label: file.name });
      setAlive(true);
      if (warnings.length > 0) {
        record(
          `${file.name}: ${warnings.length} fidelity warning${warnings.length === 1 ? "" : "s"}`,
        );
      }
    } catch (error) {
      record(describeActionError(error));
    }
  }

  const live = alive && phase === "live";
  const requested = rendererState?.requested ?? spec.renderer;
  const active = rendererState?.active ?? spec.renderer;

  return (
    <section className="sw-vanilla-app sw-vw" data-framework="vanilla">
      <header className="sw-vw-scenarios">
        <div className="sw-vw-scenarios__intro">
          <span>Imperative Grid laboratory</span>
          <strong>Choose the ownership boundary to inspect.</strong>
        </div>
        <div className="sw-vw-tabs" role="tablist" aria-label="Vanilla Grid scenarios">
          {WORKBENCH_SCENARIOS.map((item, index) => {
            const selected = scenario === item.id;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  scenarioTabRefs.current[index] = node;
                }}
                id={`sw-vw-tab-${item.id}`}
                className="sw-vw-tab"
                type="button"
                role="tab"
                aria-controls={`sw-vw-panel-${item.id}`}
                aria-selected={selected}
                data-selected={selected ? "" : undefined}
                data-pending={selected && phase === "booting" ? "" : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectScenario(item.id)}
                onKeyDown={(event) => onScenarioKeyDown(event, index)}
              >
                <span>{item.kicker}</span>
                <strong>{item.label}</strong>
              </button>
            );
          })}
        </div>
      </header>

      <div className="sw-vw-workspace">
        <section className="sw-vw-gridstage" aria-label="Live imperative Grid">
          <header className="sw-vw-gridstage__header">
            <div>
              <span className="sw-vw-eyebrow">REAL GRID · EDITABLE</span>
              <h2>Revenue pipeline</h2>
            </div>
            <span className="sw-vw-gridstage__selection" data-testid="selection">
              {selection}
            </span>
          </header>

          <div className="sw-vw-stagewrap">
            <div ref={hostRef} className="sw-vanilla-shell sw-vw-stage" />
            {alive && phase === "booting" ? (
              <div className="sw-vw-veil" role="status">
                Initializing WASM and {WORKBENCH_ROWS.toLocaleString()} rows…
              </div>
            ) : null}
            {alive && phase === "failed" ? (
              <div
                className="sw-vw-veil sw-vw-veil--destroyed"
                role="alert"
                data-testid="boot-failed"
              >
                <strong>Grid failed to boot.</strong>
                <p>The host keeps the failure visible instead of retrying silently.</p>
              </div>
            ) : null}
            {!alive ? (
              <div
                className="sw-vw-veil sw-vw-veil--destroyed"
                role="status"
                data-testid="destroyed"
              >
                <strong>Grid destroyed.</strong>
                <ul className="sw-vw-teardown" aria-label="Removed by destroy()">
                  <li>canvas</li>
                  <li>chrome</li>
                  <li>timers</li>
                  <li>subscriptions</li>
                </ul>
                <p>Create grid starts the next generation.</p>
              </div>
            ) : null}
          </div>

          <footer className="sw-vw-statusbar">
            <span className="sw-vw-statusbar__label">Latest host event</span>
            <span className="sw-vw-activity" role="log" aria-live="polite" data-testid="activity">
              {activity[0]?.message ?? "Waiting for the first host event"}
            </span>
          </footer>
        </section>

        <aside className="sw-vw-instrument" aria-label="Lifecycle ownership">
          <header className="sw-vw-identity">
            <p className="sw-vw-eyebrow">HOST-OWNED LIFECYCLE</p>
            <div>
              <h2>Generation instrument</h2>
              <span
                className="sw-vw-lifecycle"
                data-testid="lifecycle"
                data-phase={alive ? phase : "destroyed"}
                data-generation={generation}
              >
                {alive
                  ? phase === "live"
                    ? `Generation ${generation} · ready`
                    : phase === "failed"
                      ? "Boot failed"
                      : `Generation ${generation + 1} · creating`
                  : `Generation ${generation} · destroyed`}
              </span>
            </div>
          </header>

          <dl className="sw-vw-ownership" aria-label="Owned resources">
            <div>
              <dt>Renderer</dt>
              <dd>
                <output data-testid="renderer" data-fallback-count={fallbackCount}>
                  Requested: {rendererLabel(requested)} · Active: {rendererLabel(active)}
                  {rendererState?.fallback != null ? ` · Fallback: ${rendererState.fallback}` : ""}
                </output>
              </dd>
            </div>
            <div>
              <dt>Datasource</dt>
              <dd>
                {spec.data === "paged" && imported === null ? (
                  <span
                    className="sw-vw-paged"
                    data-testid="paged-stats"
                    data-chunks={pagedStats?.chunks ?? 0}
                    data-fully-loaded={pagedStats?.fullyLoaded ?? false}
                  >
                    {pagedStats === null
                      ? "Host pages · warming"
                      : `${pagedStats.chunks.toLocaleString()} pages · ${kilobytes.format(pagedStats.allocatedBytes / 1024)} KB`}
                  </span>
                ) : (
                  "Dense columnar · host memory"
                )}
              </dd>
            </div>
            <div>
              <dt>Workbook</dt>
              <dd>{imported?.label ?? "Revenue pipeline"}</dd>
            </div>
          </dl>

          <section
            id="sw-vw-panel-lifecycle"
            className="sw-vw-panel sw-vw-challenge"
            role="tabpanel"
            aria-labelledby="sw-vw-tab-lifecycle"
            hidden={scenario !== "lifecycle"}
          >
            <header>
              <span>3-action challenge</span>
              <strong>Prove the host owns the Grid.</strong>
            </header>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Edit one value</strong>
                  <p>Select B2, type a value in the formula bar, and commit it.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Switch its construction option</strong>
                  <DemoRenderingMode
                    label="Rendering thread"
                    mode={spec.renderer}
                    onModeChange={changeRenderer}
                  />
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Destroy, then create</strong>
                  <div
                    className="sw-vw-lifecycle-actions"
                    role="toolbar"
                    aria-label="Grid lifecycle"
                  >
                    {alive ? (
                      <DemoButton
                        className="sw-vw-destroy"
                        type="button"
                        onClick={destroyWorkbench}
                        disabled={phase === "booting"}
                      >
                        Destroy grid
                      </DemoButton>
                    ) : (
                      <DemoButton
                        className="sw-vw-create"
                        type="button"
                        variant="primary"
                        onClick={() => setAlive(true)}
                      >
                        Create grid
                      </DemoButton>
                    )}
                  </div>
                </div>
              </li>
            </ol>
          </section>

          <section
            id="sw-vw-panel-paged"
            className="sw-vw-panel sw-vw-scenario-panel"
            role="tabpanel"
            aria-labelledby="sw-vw-tab-paged"
            hidden={scenario !== "paged"}
          >
            <span>HOST DATASOURCE</span>
            <h3>Scroll to request only the pages the viewport needs.</h3>
            <p>
              Allocation above comes from the live store. A full-column total refuses partial data
              instead of inventing a result.
            </p>
            <div
              className="sw-vw-scenario-actions"
              role="toolbar"
              aria-label="Paged source actions"
            >
              <DemoButton type="button" disabled>
                Summary sheet
              </DemoButton>
              <DemoButton type="button" onClick={total} disabled={!live}>
                Total ARR
              </DemoButton>
              <DemoButton type="button" variant="quiet" onClick={() => changeData("columnar")}>
                Restore dense source
              </DemoButton>
            </div>
          </section>

          <section
            id="sw-vw-panel-xlsx"
            className="sw-vw-panel sw-vw-scenario-panel"
            role="tabpanel"
            aria-labelledby="sw-vw-tab-xlsx"
            hidden={scenario !== "xlsx"}
          >
            <span>HOST WORKBOOK I/O</span>
            <h3>Round-trip the live workbook, not a copied table.</h3>
            <p>Summary formulas, active sheet, and cell values cross the public core API.</p>
            <div className="sw-vw-actions" role="toolbar" aria-label="Workbook operations">
              <DemoButton
                type="button"
                onClick={addSummary}
                disabled={!live || (spec.data === "paged" && imported === null)}
              >
                Summary sheet
              </DemoButton>
              <DemoButton type="button" onClick={total} disabled={!live}>
                Total ARR
              </DemoButton>
              <DemoButton type="button" onClick={() => void exportWorkbook()} disabled={!live}>
                Export XLSX
              </DemoButton>
              <DemoButton
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={phase === "booting"}
              >
                Import XLSX
              </DemoButton>
              <input
                ref={fileRef}
                className="sw-visually-hidden"
                type="file"
                accept=".xlsx"
                aria-label="Import an XLSX workbook"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file !== undefined) void importWorkbook(file);
                }}
              />
            </div>
          </section>

          <details className="sw-vw-details">
            <summary>Construction &amp; debug controls</summary>
            <div className="sw-vw-controls" role="toolbar" aria-label="Workbench controls">
              <div className="sw-vw-field">
                <span className="sw-vw-field__label" aria-hidden="true">
                  Data path
                </span>
                <DemoRadioGroup label="Data path" value={spec.data} onValueChange={changeData}>
                  <DemoRadioItem value="columnar">Dense</DemoRadioItem>
                  <DemoRadioItem value="paged">Paged</DemoRadioItem>
                </DemoRadioGroup>
              </div>
              <div className="sw-vw-field sw-vw-field--toggle">
                <span className="sw-vw-field__label" aria-hidden="true">
                  Live option
                </span>
                <label className="sw-vw-toggle">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(event) => toggleReadOnly(event.target.checked)}
                  />
                  Read-only
                </label>
              </div>
              <DemoButton type="button" onClick={resetWorkbench} disabled={!live}>
                Reset generation
              </DemoButton>
            </div>
            <nav className="sw-vw-proofs" aria-label="Dedicated capability proofs">
              <a href="/showcases/performance/#million-rows">Paging proof</a>
              <a href="/showcases/interoperability/#xlsx">XLSX fidelity</a>
              <a href="/showcases/database/">Persistence</a>
              <a href="/showcases/collaboration/">Collaboration</a>
            </nav>
          </details>
        </aside>
      </div>
    </section>
  );
}
