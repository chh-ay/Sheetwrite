import type { Grid } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { Link } from "@tanstack/react-router";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import {
  bindEngineEvents,
  createEngineHostSaver,
  createEngineLiveDataSource,
  createEngineLiveWorkbook,
  createEngineTrace,
  type EngineAction,
  type EngineEvent,
  type EngineEventInput,
  type EngineEventBindings,
  type EngineTrace,
  ENGINE_LIVE_ROWS,
  ENGINE_LIVE_SHEET,
  ENGINE_LIVE_STORAGE,
  ENGINE_LIVE_THEME,
  ENGINE_SCRIPT,
  ENGINE_TRACE_LIMIT,
  formatEngineEvent,
  type EngineHostSaver,
  type EngineRenderer,
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

const SCRIPT_DELAY_BY_SPEED = {
  "0.5": 1_600,
  "1": 900,
  "2": 500,
} as const;

type ScriptSpeed = keyof typeof SCRIPT_DELAY_BY_SPEED;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function isFormControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement
  );
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

export default function EngineShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const bindingsRef = useRef<EngineEventBindings | null>(null);
  const traceRef = useRef<EngineTrace | null>(null);
  const saverRef = useRef<EngineHostSaver | null>(null);
  const currentRowRef = useRef(0);
  const jumpInputRef = useRef("24001");
  const requestedRendererRef = useRef<EngineRenderer>("canvas");
  const scriptStepRef = useRef(0);
  const scriptCycleRef = useRef(0);
  const activeTimerRef = useRef<number | null>(null);
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
  const [currentRow, setCurrentRow] = useState(0);
  const [status, setStatus] = useState("Starting the calculation engine…");
  const [playing, setPlaying] = useState(false);
  const [scriptStep, setScriptStep] = useState(0);
  const [speed, setSpeed] = useState<ScriptSpeed>("1");
  const reducedMotion = useReducedMotion();

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
        grid = createGrid(host, {
          workbook: createEngineLiveWorkbook(),
          datasource: createEngineLiveDataSource(emit, () => {
            if (!disposed) bindings?.sampleResource("load", "ingest");
          }),
          datasourceStorage: ENGINE_LIVE_STORAGE,
          theme: ENGINE_LIVE_THEME,
          config: { toolbar: true, tabs: false },
          renderer,
          ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
        });
        grid.setFrozen(1, 2);
        grid.setSelection({
          kind: "cell",
          addr: { sheet: ENGINE_LIVE_SHEET, row: currentRowRef.current, col: 3 },
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
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(ENGINE_LIVE_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

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
        grid.scrollToCell({ sheet: ENGINE_LIVE_SHEET, row, col: 3 });
        grid.setSelection({
          kind: "cell",
          addr: { sheet: ENGINE_LIVE_SHEET, row, col: 3 },
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
        const address = { sheet: ENGINE_LIVE_SHEET, row: currentRowRef.current, col: 3 };
        const current = grid.store.getCell(address).resolved;
        if (typeof current !== "number") {
          bindings.announceResult("edit", "noop");
          setStatus("That row is still loading. Try the edit again when its values appear.");
          return;
        }
        const result = grid.applyTransaction({
          patches: [
            {
              op: "set",
              addr: address,
              value: { kind: "literal", value: current + 25 },
            },
          ],
        });
        if (result.status !== "applied") bindings.announceResult("edit", result.status);
        setStatus(
          result.status === "applied"
            ? `Actual at D${currentRowRef.current + 1} increased by 25; the formula in E${currentRowRef.current + 1} recalculated.`
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
        grid.undo();
        setStatus(`The Grid undid the last edit at row ${currentRowRef.current + 1}.`);
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

  const runNextStep = useCallback(async () => {
    const index = scriptStepRef.current % ENGINE_SCRIPT.length;
    const action = ENGINE_SCRIPT[index]!;
    if (action === "jump") {
      const row = 12_000 + ((scriptCycleRef.current * 7_919) % 28_000);
      await runAction(action, row);
    } else {
      await runAction(action);
    }
    const next = (index + 1) % ENGINE_SCRIPT.length;
    if (next === 0) scriptCycleRef.current += 1;
    scriptStepRef.current = next;
    setScriptStep(next);
  }, [runAction]);

  const reset = useCallback(() => {
    setPlaying(false);
    if (activeTimerRef.current !== null) {
      window.clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    traceRef.current!.clear();
    saverRef.current!.reset();
    currentRowRef.current = 0;
    jumpInputRef.current = "24001";
    requestedRendererRef.current = "canvas";
    scriptStepRef.current = 0;
    scriptCycleRef.current = 0;
    setEvents([]);
    setPendingOperations(0);
    setCurrentRow(0);
    setJumpInput("24001");
    setScriptStep(0);
    setRequestedRenderer("canvas");
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!playing || !ready || reducedMotion) return;
    activeTimerRef.current = window.setTimeout(() => {
      activeTimerRef.current = null;
      void runNextStep();
    }, SCRIPT_DELAY_BY_SPEED[speed]);
    return () => {
      if (activeTimerRef.current !== null) {
        window.clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    };
  }, [playing, ready, reducedMotion, runNextStep, scriptStep, speed]);

  useEffect(() => {
    const handle: EngineShowcaseHandle = {
      grid: () => gridRef.current,
      run: (action) => runAction(action),
      reset,
      traceLength: () => traceRef.current!.size,
      timerCount: () => (activeTimerRef.current === null ? 0 : 1),
    };
    window.__sheetwriteEngineShowcase = handle;
    return () => {
      if (window.__sheetwriteEngineShowcase === handle) {
        delete window.__sheetwriteEngineShowcase;
      }
    };
  }, [reset, runAction]);

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (isFormControl(event.target)) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!reducedMotion) setPlaying((value) => !value);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      void runNextStep();
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      reset();
    }
  };

  const latestRequest = eventOfType(events, "datasource-request");
  const latestResult = eventOfType(events, "datasource-result");
  const latestTransaction = eventOfType(events, "transaction-result");
  const latestFormula = eventOfType(events, "formula-update");
  const latestResource = eventOfType(events, "page-resource");
  const latestSave = eventOfType(events, "host-save");

  return (
    <div className="sw-engine-frame">
      <SiteTopbar active="engine" />
      <main
        className="sw-engine"
        data-reduced-motion={reducedMotion ? "true" : "false"}
        id="main-content"
        onKeyDown={handleKeyboard}
      >
        <header className="sw-engine__hero">
          <p className="sw-engine__eyebrow">Behind one live edit</p>
          <h1>The Grid moves first. The explanation follows.</h1>
          <p>
            Use the real paged formula sheet below. Every line beside it comes from a public Grid
            event, a datasource result, a measured resource sample, or the host’s save response.
          </p>
          <Link to="/showcases/">Browse every live feature →</Link>
        </header>

        <section aria-labelledby="engine-stage-title" className="sw-engine-stage">
          <header className="sw-engine-stage__head">
            <div>
              <p className="sw-engine__eyebrow">Live working view</p>
              <h2 id="engine-stage-title">
                Weekly forecast · {ENGINE_LIVE_ROWS.toLocaleString()} rows
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
                <dt>Host changes</dt>
                <dd data-testid="engine-pending-operations">{pendingOperations}</dd>
              </div>
            </dl>
          </header>

          <div className="sw-engine-stage__workspace">
            <section aria-label="Live Sheetwrite Grid" className="sw-engine-grid-panel">
              <div className="sw-engine-grid-panel__status">
                <span data-state={ready ? "ready" : error ? "error" : "loading"}>
                  {ready ? "Grid ready" : error ? "Grid error" : "Loading Grid"}
                </span>
                <span>Row {currentRow + 1}</span>
                <span>{activeRenderer} active</span>
              </div>
              <div className="sw-engine-grid" data-testid="engine-grid" ref={hostRef} />
            </section>

            <aside aria-label="Explanation of current Grid work" className="sw-engine-cutaway">
              <svg aria-hidden="true" className="sw-engine-cutaway__map" viewBox="0 0 520 150">
                <path d="M24 36H194C224 36 224 76 254 76H496" pathLength="1" />
                <path d="M24 76H164C204 76 214 116 254 116H496" pathLength="1" />
                <circle cx="24" cy="36" r="6" />
                <circle cx="254" cy="76" r="6" />
                <circle cx="496" cy="116" r="6" />
              </svg>
              <ol className="sw-engine-lanes">
                <li data-lane="rows">
                  <span>01 · Rows</span>
                  <strong>
                    {latestRequest
                      ? `${latestRequest.start + 1}–${latestRequest.end} requested`
                      : "Waiting for a row request"}
                  </strong>
                  <p>
                    {latestResult
                      ? `${latestResult.rows.toLocaleString()} rows ready in ${latestResult.durationMs.toFixed(1)} ms`
                      : "The datasource has not returned a page yet."}
                  </p>
                </li>
                <li data-lane="engine">
                  <span>02 · Calculation engine</span>
                  <strong>
                    {latestTransaction
                      ? `${latestTransaction.action} ${latestTransaction.status}`
                      : "Waiting for a Grid change"}
                  </strong>
                  <p>
                    {latestFormula
                      ? `E${latestFormula.row + 1} is now ${String(latestFormula.resolved)}`
                      : "Formula results will appear here after an edit."}
                  </p>
                  <p>
                    After an edit, work is sent to the calculation engine to update the formula.
                  </p>
                </li>
                <li data-lane="host">
                  <span>03 · Host</span>
                  <strong>
                    {latestSave
                      ? `${latestSave.status} · version ${latestSave.version}`
                      : "Waiting for Save to host"}
                  </strong>
                  <p>
                    {rendererFallback
                      ? `The ${requestedRenderer} drawing path fell back to ${activeRenderer}: ${rendererFallback}`
                      : `${activeRenderer} is the drawing path actually in use.`}
                  </p>
                </li>
              </ol>
            </aside>
          </div>

          <div className="sw-engine-controls">
            <form
              className="sw-engine-controls__jump"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction("jump");
              }}
            >
              <label htmlFor="engine-jump">Jump to row</label>
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
            <div className="sw-engine-controls__actions">
              <button
                data-testid="engine-edit"
                disabled={!ready}
                onClick={() => void runAction("edit")}
                type="button"
              >
                Increase actual
              </button>
              <button
                data-testid="engine-undo"
                disabled={!ready}
                onClick={() => void runAction("undo")}
                type="button"
              >
                Undo Grid edit
              </button>
              <label htmlFor="engine-renderer">Drawing path</label>
              <select
                data-testid="engine-renderer"
                disabled={!ready}
                id="engine-renderer"
                onChange={(event) => {
                  const renderer = event.target.value as EngineRenderer;
                  requestedRendererRef.current = renderer;
                  setRequestedRenderer(renderer);
                }}
                value={requestedRenderer}
              >
                <option value="canvas">Main canvas</option>
                <option value="worker">Worker canvas</option>
              </select>
              <button
                data-testid="engine-save"
                disabled={!ready || pendingOperations === 0}
                onClick={() => void runAction("save")}
                type="button"
              >
                Save to host
              </button>
              <button data-testid="engine-reset" onClick={reset} type="button">
                Reset sheet
              </button>
            </div>
          </div>

          <p aria-live="polite" className="sw-engine-status" data-testid="engine-status">
            {status}
          </p>
        </section>

        <section
          aria-labelledby="engine-script-title"
          className="sw-engine-story"
          data-testid="engine-keyboard-surface"
          tabIndex={0}
        >
          <header>
            <div>
              <p className="sw-engine__eyebrow">One repeatable path</p>
              <h2 id="engine-script-title">Play the same actions you can perform by hand.</h2>
            </div>
            <p>
              The player calls the same jump, edit, undo, drawing, and host-save handlers as the
              controls above. Focus this section: Space plays or pauses, Right Arrow steps, R
              resets.
            </p>
          </header>
          <div className="sw-engine-player">
            <button
              aria-pressed={playing}
              data-testid="engine-play"
              disabled={!ready || reducedMotion}
              onClick={() => setPlaying((value) => !value)}
              type="button"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              data-testid="engine-step"
              disabled={!ready}
              onClick={() => void runNextStep()}
              type="button"
            >
              Step
            </button>
            <button onClick={reset} type="button">
              Reset
            </button>
            <label htmlFor="engine-speed">Speed</label>
            <select
              id="engine-speed"
              onChange={(event) => setSpeed(event.target.value as ScriptSpeed)}
              value={speed}
            >
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
            <span data-testid="engine-script-step">
              Next: {ENGINE_SCRIPT[scriptStep]} · {scriptStep + 1}/{ENGINE_SCRIPT.length}
            </span>
          </div>
          {reducedMotion ? (
            <p className="sw-engine-motion-note" data-testid="engine-reduced-note">
              Motion is reduced. The player stays paused; use Step to move through each action.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="engine-log-title" className="sw-engine-log">
          <header>
            <div>
              <p className="sw-engine__eyebrow">Text record</p>
              <h2 id="engine-log-title">Latest measured events</h2>
            </div>
            <p>
              At most {ENGINE_TRACE_LIMIT} lines stay in the page. New lines replace the oldest;
              Grid and datasource listeners are removed when you leave.
            </p>
          </header>
          {events.length === 0 ? (
            <p className="sw-engine-log__empty">
              Make an edit or step the player to add the first checked result.
            </p>
          ) : (
            <ol aria-live="polite" data-testid="engine-event-log">
              {[...events].reverse().map((event) => (
                <li data-event={event.type} key={event.sequence}>
                  <span>{String(event.sequence).padStart(3, "0")}</span>
                  <strong>{event.type.replaceAll("-", " ")}</strong>
                  <p>{formatEngineEvent(event)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
