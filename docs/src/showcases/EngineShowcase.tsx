import type { Grid } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import {
  bindEngineEvents,
  createEngineHostSaver,
  createEngineLiveDataSource,
  createEngineLiveWorkbook,
  createEngineTrace,
  ENGINE_LIVE_ROWS,
  ENGINE_LIVE_SHEET,
  ENGINE_LIVE_STORAGE,
  ENGINE_TRACE_LIMIT,
  type EngineAction,
  type EngineEvent,
  type EngineEventBindings,
  type EngineEventInput,
  type EngineHostSaver,
  type EngineRenderer,
  type EngineTrace,
  engineLiveTheme,
  formatEngineEvent,
} from "./scenarios/engine-live.js";
import "@sheetwrite/core/styles.css";

interface EngineShowcaseHandle {
  grid(): Grid | null;
  run(action: EngineAction): Promise<void>;
  reset(): void;
  traceLength(): number;
  timerCount(): number;
}

declare global {
  interface Window {
    __sheetwriteEngineShowcase?: EngineShowcaseHandle;
  }
}

function eventOfType<Type extends EngineEvent["type"]>(
  events: readonly EngineEvent[],
  type: Type,
): Extract<EngineEvent, { type: Type }> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === type) return event as Extract<EngineEvent, { type: Type }>;
  }
  return undefined;
}

function currentEngineTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyEngineTheme(grid: Grid, host: HTMLElement): void {
  const mode = currentEngineTheme();
  const theme = engineLiveTheme(mode);
  grid.replaceTheme(theme);
  host.dataset.gridTheme = mode;
  host.style.backgroundColor = theme.bg ?? "";
}

export default function EngineShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const bindingsRef = useRef<EngineEventBindings | null>(null);
  const traceRef = useRef<EngineTrace | null>(null);
  const saverRef = useRef<EngineHostSaver | null>(null);
  const currentRowRef = useRef(1);
  const jumpInputRef = useRef("24001");
  const requestedRendererRef = useRef<EngineRenderer>("canvas");
  const mountedRef = useRef(true);

  if (traceRef.current === null) traceRef.current = createEngineTrace();
  if (saverRef.current === null) saverRef.current = createEngineHostSaver();

  const [events, setEvents] = useState<readonly EngineEvent[]>([]);
  const [requestedRenderer, setRequestedRenderer] = useState<EngineRenderer>("canvas");
  const [activeRenderer, setActiveRenderer] = useState<EngineRenderer>("canvas");
  const [rendererFallback, setRendererFallback] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [jumpInput, setJumpInput] = useState("24001");
  const [currentRow, setCurrentRow] = useState(1);
  const [status, setStatus] = useState("Starting the calculation engine…");

  const emit = useCallback((input: EngineEventInput) => {
    const event = traceRef.current!.push(input);
    if (event.type === "renderer") {
      setActiveRenderer(event.active);
      setRendererFallback(event.fallback);
    }
    setEvents(traceRef.current!.snapshot());
  }, []);

  useEffect(() => {
    requestedRendererRef.current = requestedRenderer;
  }, [requestedRenderer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.generation = String(generation);
    let disposed = false;
    let grid: Grid | null = null;
    let bindings: EngineEventBindings | null = null;
    setReady(false);
    setError(null);
    setRendererFallback(null);
    setStatus("Starting the calculation engine…");

    void initSheetwrite()
      .then(() => {
        if (disposed) return;
        const renderer = requestedRenderer;
        const theme = engineLiveTheme(currentEngineTheme());
        host.dataset.gridTheme = currentEngineTheme();
        host.style.backgroundColor = theme.bg ?? "";
        grid = createGrid(host, {
          workbook: createEngineLiveWorkbook(),
          datasource: createEngineLiveDataSource(emit, () => {
            if (!disposed) bindings?.sampleResource("load", "ingest");
          }),
          datasourceStorage: ENGINE_LIVE_STORAGE,
          theme,
          config: { toolbar: true, tabs: false },
          renderer,
          ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
        });
        grid.setFrozen(1, 2);
        grid.setSelection({
          kind: "cell",
          addr: { sheet: ENGINE_LIVE_SHEET, row: currentRowRef.current, col: 2 },
        });
        bindings = bindEngineEvents(grid, emit, setPendingOperations);
        gridRef.current = grid;
        bindingsRef.current = bindings;
        bindings.announceRenderer(
          renderer,
          renderer === "worker" && grid.rendererKind() !== "worker"
            ? "Worker drawing was unavailable during startup."
            : null,
        );
        setReady(true);
        setStatus(
          `Live sheet ready. ${ENGINE_LIVE_ROWS.toLocaleString()} rows stay paged; only requested rows are loaded.`,
        );
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setStatus(`The calculation engine could not start: ${message}`);
      });

    return () => {
      disposed = true;
      setReady(false);
      bindings?.dispose();
      if (bindingsRef.current === bindings) bindingsRef.current = null;
      if (gridRef.current === grid) gridRef.current = null;
      grid?.destroy();
    };
  }, [emit, generation, requestedRenderer]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const grid = gridRef.current;
      const host = hostRef.current;
      if (grid && host) applyEngineTheme(grid, host);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const runAction = useCallback(async (action: EngineAction, rowOverride?: number) => {
    const grid = gridRef.current;
    const bindings = bindingsRef.current;
    if (!grid || !bindings) return;

    switch (action) {
      case "jump": {
        const raw =
          rowOverride === undefined ? jumpInputRef.current.trim() : String(rowOverride + 1);
        if (!/^\d+$/.test(raw)) {
          setStatus(`Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
          return;
        }
        const requested = Number(raw);
        if (!Number.isSafeInteger(requested) || requested < 1 || requested > ENGINE_LIVE_ROWS) {
          setStatus(`Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
          return;
        }
        const row = requested - 1;
        grid.scrollToCell({ sheet: ENGINE_LIVE_SHEET, row, col: 2 });
        grid.setSelection({
          kind: "cell",
          addr: { sheet: ENGINE_LIVE_SHEET, row, col: 2 },
        });
        currentRowRef.current = row;
        jumpInputRef.current = String(requested);
        setCurrentRow(row);
        setJumpInput(String(requested));
        bindings.sampleResource("jump", "scroll");
        setStatus(
          `Grid moved to row ${requested.toLocaleString()}; its page is loading if needed.`,
        );
        return;
      }
      case "edit": {
        const row = currentRowRef.current;
        const address = { sheet: ENGINE_LIVE_SHEET, row, col: 2 };
        const current = grid.store.getCell(address).resolved;
        if (typeof current !== "number") {
          bindings.announceResult("edit", "noop");
          setStatus("Select a loaded financial data row before editing Actual.");
          return;
        }
        const before = bindings.dependencySnapshot(row);
        const result = grid.applyTransaction({
          patches: [
            {
              op: "set",
              addr: address,
              value: { kind: "literal", value: current + 25 },
            },
          ],
        });
        if (result.status === "applied") {
          bindings.announceDependencies("edit", row, before);
          grid.setSelection({
            kind: "range",
            range: {
              sheet: ENGINE_LIVE_SHEET,
              start: { row, col: 4 },
              end: { row, col: 5 },
            },
          });
        } else {
          bindings.announceResult("edit", result.status);
        }
        setStatus(
          result.status === "applied"
            ? `Actual C${row + 1} increased by 25; Variance E${row + 1} and Attainment F${row + 1} recalculated and are selected.`
            : `The edit returned ${result.status}.`,
        );
        return;
      }
      case "undo": {
        if (grid.getCommandState("undo").disabled) {
          bindings.announceResult("undo", "noop");
          setStatus("There is no Grid edit to undo.");
          return;
        }
        const row = currentRowRef.current;
        const before = bindings.dependencySnapshot(row);
        grid.undo();
        bindings.announceDependencies("undo", row, before);
        grid.setSelection({
          kind: "range",
          range: {
            sheet: ENGINE_LIVE_SHEET,
            start: { row, col: 4 },
            end: { row, col: 5 },
          },
        });
        setStatus(`The Grid undid the edit; E${row + 1}:F${row + 1} show restored results.`);
        return;
      }
      case "save": {
        const operations = bindings.pendingOperations();
        if (operations.length === 0) {
          setStatus("The host has no new Grid changes to save.");
          return;
        }
        const response = await saverRef.current!.commit(operations);
        if (!mountedRef.current || bindingsRef.current !== bindings) return;
        bindings.acknowledgeHost(response, operations);
        const version = response.status === "conflict" ? response.currentVersion : response.version;
        setStatus(
          `The host acknowledged ${operations.length} change${operations.length === 1 ? "" : "s"} at version ${version}.`,
        );
        return;
      }
      case "renderer": {
        const next = grid.rendererKind() === "canvas" ? "worker" : "canvas";
        requestedRendererRef.current = next;
        setRequestedRenderer(next);
        return;
      }
    }
  }, []);

  const reset = useCallback(() => {
    traceRef.current!.clear();
    saverRef.current!.reset();
    currentRowRef.current = 1;
    jumpInputRef.current = "24001";
    requestedRendererRef.current = "canvas";
    setEvents([]);
    setPendingOperations(0);
    setCurrentRow(1);
    setJumpInput("24001");
    setRequestedRenderer("canvas");
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const handle: EngineShowcaseHandle = {
      grid: () => gridRef.current,
      run: (action) => runAction(action),
      reset,
      traceLength: () => traceRef.current!.size,
      timerCount: () => 0,
    };
    window.__sheetwriteEngineShowcase = handle;
    return () => {
      if (window.__sheetwriteEngineShowcase === handle) {
        delete window.__sheetwriteEngineShowcase;
      }
    };
  }, [reset, runAction]);

  const latestRequest = eventOfType(events, "datasource-request");
  const latestResult = eventOfType(events, "datasource-result");
  const latestTransaction = eventOfType(events, "transaction-result");
  const latestFormula = eventOfType(events, "formula-update");
  const latestResource = eventOfType(events, "page-resource");
  const latestSave = eventOfType(events, "host-save");
  const latestEvent = events.at(-1);

  return (
    <div className="sw-engine-frame">
      <SiteTopbar active="engine" />
      <main className="sw-engine" id="main-content">
        <header className="sw-engine__hero">
          <div className="sw-engine__hero-title">
            <p className="sw-engine__eyebrow">Live calculation workbench</p>
            <h1>A financial Grid with its public evidence beside it.</h1>
          </div>
          <div className="sw-engine__hero-copy">
            <p>
              Jump through a real 50,000-row regional forecast, change an actual, and save it to the
              host. The adjacent trace reports only public Grid events, datasource results, measured
              resources, and host acknowledgements.
            </p>
            <Link to="/showcases/">Browse every live feature →</Link>
          </div>
        </header>

        <section aria-labelledby="engine-stage-title" className="sw-engine-stage">
          <header className="sw-engine-stage__head">
            <div>
              <p className="sw-engine__eyebrow">Regional forecast · live</p>
              <h2 id="engine-stage-title">
                {ENGINE_LIVE_ROWS.toLocaleString()} rows, paged on demand
              </h2>
            </div>
            <dl aria-label="Current runtime facts" className="sw-engine-facts">
              <div>
                <dt>Drawing</dt>
                <dd data-testid="engine-active-renderer">{activeRenderer}</dd>
              </div>
              <div>
                <dt>Loaded cells</dt>
                <dd data-testid="engine-loaded-cells">
                  {(latestResource?.loadedCells ?? 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Unsaved</dt>
                <dd data-testid="engine-pending-operations">{pendingOperations}</dd>
              </div>
            </dl>
          </header>

          <div className="sw-engine-stage__workspace" data-testid="engine-workbench">
            <section aria-label="Live Sheetwrite Grid" className="sw-engine-grid-panel">
              <div className="sw-engine-grid-panel__status">
                <span data-state={ready ? "ready" : error ? "error" : "loading"}>
                  {ready ? "Grid ready" : error ? "Grid error" : "Loading Grid"}
                </span>
                <span>Selected row {currentRow + 1}</span>
                <span>{activeRenderer} drawing</span>
              </div>
              <div className="sw-engine-grid" data-testid="engine-grid" ref={hostRef} />
            </section>

            <aside
              aria-label="Public evidence for current Grid work"
              className="sw-engine-cutaway"
              data-testid="engine-public-trace"
            >
              <header className="sw-engine-cutaway__head">
                <div>
                  <p className="sw-engine__eyebrow">Public trace</p>
                  <h3>What the workbench reported</h3>
                </div>
                <span aria-live="polite">
                  {events.length} / {ENGINE_TRACE_LIMIT}
                </span>
              </header>
              <ol className="sw-engine-lanes">
                <li data-lane="rows">
                  <span>Datasource</span>
                  <strong>
                    {latestRequest
                      ? `Rows ${latestRequest.start + 1}–${latestRequest.end}`
                      : "Waiting for a request"}
                  </strong>
                  <p>
                    {latestResult
                      ? `${latestResult.rows.toLocaleString()} rows returned in ${latestResult.durationMs.toFixed(1)} ms`
                      : "Requested column bands and timings will appear here."}
                  </p>
                </li>
                <li data-lane="engine">
                  <span>Dependency path</span>
                  <strong>
                    {latestTransaction
                      ? `${latestTransaction.action} · ${latestTransaction.status}`
                      : "Actual → Variance + Attainment"}
                  </strong>
                  {latestFormula ? (
                    <ol
                      aria-label="Recalculated formula dependencies"
                      className="sw-engine-dependency"
                      data-action={latestFormula.action}
                      data-testid="engine-dependency-readout"
                    >
                      {latestFormula.dependencies.map((dependency) => (
                        <li data-address={dependency.address} key={dependency.address}>
                          <span>{dependency.address}</span>
                          <strong>
                            {String(dependency.before)} → {String(dependency.after)}
                          </strong>
                          <code>{dependency.formula}</code>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Edit Actual to show the exact before/after formula results here.</p>
                  )}
                </li>
                <li data-lane="host">
                  <span>Host + drawing</span>
                  <strong>
                    {latestSave
                      ? `${latestSave.status} · version ${latestSave.version}`
                      : "No host save yet"}
                  </strong>
                  <p>
                    {rendererFallback
                      ? `${requestedRenderer} fell back to ${activeRenderer}: ${rendererFallback}`
                      : `${activeRenderer} is the drawing path actually in use.`}
                  </p>
                </li>
              </ol>
              <p className="sw-engine-cutaway__resource">
                {latestResource
                  ? `${latestResource.loadedCells.toLocaleString()} loaded · ${latestResource.dirtyCells.toLocaleString()} dirty cells`
                  : "Resource accounting appears after the first page settles."}
              </p>
            </aside>
          </div>

          <section aria-label="Workbook controls" className="sw-engine-controls">
            <fieldset>
              <legend>Navigate</legend>
              <form
                className="sw-engine-controls__jump"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("jump");
                }}
              >
                <label htmlFor="engine-jump">Row</label>
                <input
                  data-testid="engine-jump-input"
                  id="engine-jump"
                  inputMode="numeric"
                  max={ENGINE_LIVE_ROWS}
                  min="1"
                  onChange={(event) => {
                    jumpInputRef.current = event.target.value;
                    setJumpInput(event.target.value);
                  }}
                  value={jumpInput}
                />
                <button data-testid="engine-jump" disabled={!ready} type="submit">
                  Jump
                </button>
              </form>
            </fieldset>
            <fieldset>
              <legend>Edit forecast</legend>
              <div className="sw-engine-controls__actions">
                <button
                  data-testid="engine-edit"
                  disabled={!ready}
                  onClick={() => void runAction("edit")}
                  type="button"
                >
                  Actual +25
                </button>
                <button
                  data-testid="engine-undo"
                  disabled={!ready}
                  onClick={() => void runAction("undo")}
                  type="button"
                >
                  Undo
                </button>
              </div>
            </fieldset>
            <fieldset>
              <legend>Draw + persist</legend>
              <div className="sw-engine-controls__actions">
                <div
                  aria-label="Drawing path"
                  className="sw-engine-renderer"
                  data-testid="engine-renderer"
                  role="radiogroup"
                >
                  {(["canvas", "worker"] as const).map((renderer) => (
                    <label key={renderer}>
                      <input
                        checked={requestedRenderer === renderer}
                        data-testid={`engine-renderer-${renderer}`}
                        disabled={!ready}
                        name="engine-renderer"
                        onChange={() => {
                          requestedRendererRef.current = renderer;
                          setRequestedRenderer(renderer);
                        }}
                        type="radio"
                        value={renderer}
                      />
                      <span>{renderer === "canvas" ? "Main canvas" : "Worker canvas"}</span>
                    </label>
                  ))}
                </div>
                <button
                  data-testid="engine-save"
                  disabled={!ready || pendingOperations === 0}
                  onClick={() => void runAction("save")}
                  type="button"
                >
                  Save to host
                </button>
                <button data-testid="engine-reset" onClick={reset} type="button">
                  Reset
                </button>
              </div>
            </fieldset>
          </section>

          <p aria-live="polite" className="sw-engine-status" data-testid="engine-status">
            {status}
          </p>
        </section>

        <section aria-labelledby="engine-log-title" className="sw-engine-log">
          <header>
            <div>
              <p className="sw-engine__eyebrow">Bounded evidence</p>
              <h2 id="engine-log-title">Latest measured events</h2>
            </div>
            <p>
              The newest {ENGINE_TRACE_LIMIT} source events are retained. The list and latest-event
              detail scroll inside this fixed-height viewer.
            </p>
          </header>
          {events.length === 0 ? (
            <p className="sw-engine-log__empty">
              Use the Grid or workbook controls to record the first public event.
            </p>
          ) : (
            <div className="sw-engine-log__viewer" data-testid="engine-evidence-viewer">
              <ol aria-live="polite" data-testid="engine-event-log">
                {[...events].reverse().map((event) => (
                  <li data-event={event.type} key={event.sequence}>
                    <span>{String(event.sequence).padStart(3, "0")}</span>
                    <strong>{event.type.replaceAll("-", " ")}</strong>
                    <p>{formatEngineEvent(event)}</p>
                  </li>
                ))}
              </ol>
              <article aria-live="polite" className="sw-engine-log__detail">
                <span>Latest public event</span>
                <strong>{latestEvent?.type.replaceAll("-", " ")}</strong>
                <p>{latestEvent ? formatEngineEvent(latestEvent) : ""}</p>
              </article>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
