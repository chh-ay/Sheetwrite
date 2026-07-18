import type { PagedStoreStats, Selection, WorkbookSnapshot } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // The URL owns the construction options, but /vanilla/ is prerendered
  // without a query string: the first client render must match that HTML.
  // Until hydration completes we render the default spec and mount nothing,
  // then the grid is created exactly once from the deep-linked options.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
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
      <header className="sw-vw-controlbar">
        <div className="sw-vw-identity">
          <p className="sw-vw-eyebrow">CORE API · NO ADAPTER</p>
          <h2>Engine workbench</h2>
          <span
            className="sw-vw-lifecycle"
            data-testid="lifecycle"
            data-phase={alive ? phase : "destroyed"}
            data-generation={generation}
          >
            {alive
              ? phase === "live"
                ? `Generation ${generation} · live`
                : phase === "failed"
                  ? "Boot failed"
                  : "Mounting…"
              : "Destroyed"}
          </span>
        </div>

        <div className="sw-vw-controls" role="toolbar" aria-label="Workbench controls">
          <DemoRenderingMode
            label="Rendering thread"
            mode={spec.renderer}
            onModeChange={changeRenderer}
          />
          <div className="sw-vw-field">
            <span className="sw-vw-field__label" aria-hidden="true">
              Data path
            </span>
            <DemoRadioGroup label="Data path" value={spec.data} onValueChange={changeData}>
              <DemoRadioItem value="columnar">Dense columnar</DemoRadioItem>
              <DemoRadioItem value="paged">Paged source</DemoRadioItem>
            </DemoRadioGroup>
          </div>
          <label className="sw-vw-toggle">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => toggleReadOnly(event.target.checked)}
            />
            Read-only
          </label>
        </div>

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
          <DemoButton type="button" onClick={resetWorkbench} disabled={!live}>
            Reset
          </DemoButton>
          {alive ? (
            <DemoButton
              type="button"
              variant="quiet"
              onClick={destroyWorkbench}
              disabled={phase === "booting"}
            >
              Destroy
            </DemoButton>
          ) : (
            <DemoButton type="button" variant="primary" onClick={() => setAlive(true)}>
              Create grid
            </DemoButton>
          )}
        </div>
      </header>

      <div className="sw-vw-stagewrap">
        <div ref={hostRef} className="sw-vanilla-shell sw-vw-stage" />
        {alive && phase === "booting" ? (
          <div className="sw-vw-veil" role="status">
            Initializing WASM and {WORKBENCH_ROWS.toLocaleString()} rows…
          </div>
        ) : null}
        {alive && phase === "failed" ? (
          <div className="sw-vw-veil sw-vw-veil--destroyed" role="alert" data-testid="boot-failed">
            <strong>Grid failed to boot.</strong>
            <p>The host keeps the failure visible instead of retrying silently.</p>
          </div>
        ) : null}
        {!alive ? (
          <div className="sw-vw-veil sw-vw-veil--destroyed" role="status" data-testid="destroyed">
            <strong>Grid destroyed.</strong>
            <p>
              `destroy()` removed the canvas, chrome, timers, and subscriptions. The host decides
              when — and whether — a new generation exists.
            </p>
          </div>
        ) : null}
      </div>

      <footer className="sw-vw-statusbar">
        <span data-testid="selection">{selection}</span>
        <output data-testid="renderer" data-fallback-count={fallbackCount}>
          Requested: {rendererLabel(requested)} · Active: {rendererLabel(active)}
          {rendererState?.fallback != null ? ` · Fallback: ${rendererState.fallback}` : ""}
        </output>
        {spec.data === "paged" && imported === null ? (
          <span
            className="sw-vw-paged"
            data-testid="paged-stats"
            data-chunks={pagedStats?.chunks ?? 0}
            data-fully-loaded={pagedStats?.fullyLoaded ?? false}
          >
            {pagedStats === null
              ? "Paged store warming up"
              : `Pages ${pagedStats.chunks.toLocaleString()} · ${pagedStats.loadedCells.toLocaleString()} cells · ${kilobytes.format(pagedStats.allocatedBytes / 1024)} KB${pagedStats.fullyLoaded ? " · complete" : ""}`}
          </span>
        ) : null}
        <span className="sw-vw-activity" role="log" aria-live="polite" data-testid="activity">
          {activity[0]?.message ?? "Waiting for the first host event"}
        </span>
      </footer>

      <nav className="sw-vw-proofs" aria-label="Dedicated capability proofs">
        <span>Deep proofs live on dedicated pages —</span>
        <a href="/showcases/performance/#million-rows">1M-row paging</a>
        <a href="/showcases/interoperability/#xlsx">XLSX fidelity</a>
        <a href="/showcases/database/">Persistence</a>
        <a href="/showcases/collaboration/">Collaboration</a>
      </nav>
    </section>
  );
}
