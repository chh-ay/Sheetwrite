import type {
  Column,
  ColumnarData,
  Grid,
  Theme,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import {
  createGrid,
  createGridFromSnapshot,
  downloadBytes,
  initSheetwrite,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  type ShellPiece,
} from "@sheetwrite/core/shell";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import compatibilityData from "../generated/compatibility.json";
import compatibilityResultsData from "../generated/compatibility-results.json";
import compatibilityResultsUrl from "../generated/compatibility-results.json?url";
import { pageMeta } from "../lib/seo.js";
import { CapabilityHero } from "../showcases/CapabilityHero.js";
import type {
  CompatibilityResultStatus,
  CompatibilityResults,
} from "../showcases/compatibility-results.js";
import {
  ADVERSARIAL_FIXTURES,
  abortedImport,
  createInteropSnapshot,
  csvOfActiveSheet,
  delimitedCeilingDemo,
  expectRejection,
  exportWorkbook,
  fetchFixtureBytes,
  INTEROP_ANALYSIS_SHEET,
  INTEROP_ASSUMPTIONS_SHEET,
  INTEROP_EXPECTED,
  INTEROP_INJECTION_TEXT,
  type InteropFixture,
  importDelimitedText,
  importWorkbook,
  POSITIVE_FIXTURES,
  PRODUCER_MATRIX,
  probeXlsxRegistration,
  type RejectionReport,
  type RoundTripReport,
  roundTripWorkbook,
  sha256Hex,
  tsvOfSelection,
} from "../showcases/scenarios/interoperability.js";
import stylesheet from "../styles/showcase-interoperability.css?url";
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

declare global {
  interface Window {
    __sheetwriteInteropGrid?: Grid;
  }
}

const description =
  "Executable spreadsheet interoperability: XLSX round-trips, committed independent fixtures, CSV/TSV, structured fidelity warnings, resource limits, and the optional package boundary — all running the real published APIs in your browser.";

export const Route = createFileRoute("/showcases/interoperability")({
  head: () => ({
    meta: pageMeta("Spreadsheet interoperability — Sheetwrite showcases", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: InteroperabilityRoute,
});

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Canvas metrics only. Every color comes from the route stylesheet's
 * --sheetwrite-* seeds (adaptive --sw-* tokens), so the workbench canvas
 * follows the site light/dark theme instead of a hardcoded dark palette.
 */
const CANVAS_THEME: Partial<Theme> = { rowHeight: 36 };
const COMPATIBILITY_RESULTS = compatibilityResultsData as unknown as CompatibilityResults;

const RESULT_STATUS_LABELS: Record<CompatibilityResultStatus, string> = {
  "local-pass": "Local check passed",
  "result-unavailable": "Tested app result missing",
  "reviewed-pass": "Reviewed app result passed",
  "known-difference": "Known difference",
  unsupported: "Unsupported / not claimed",
  warning: "Warning behavior",
  regression: "Regression",
};

const BEHAVIOR_LABELS: Record<string, string> = {
  shared: "Shared spreadsheet behavior",
  excel: "Excel-specific behavior",
  "google-sheets": "Google Sheets-specific behavior",
  openformula: "OpenFormula-specific behavior",
};

const TESTED_APPS = [
  { id: "sheetwrite", label: "Sheetwrite captured result" },
  { id: "excel-desktop", label: "Microsoft Excel desktop" },
  { id: "google-sheets", label: "Google Sheets" },
  { id: "libreoffice", label: "LibreOffice" },
] as const;

type ResultFilter = "all" | CompatibilityResultStatus;

type CompatibilityRecord = (typeof compatibilityData.records)[number];
type CompatibilityFilter = "all" | CompatibilityRecord["status"];
const INVENTORY_STATUS_LABELS: Record<CompatibilityRecord["status"], string> = {
  supported: "Supported",
  partial: "Partially supported",
  "roundtrip-only": "Preserved on round-trip only",
  warning: "Supported with warning",
  unsupported: "Unsupported",
};
const RESULT_MODE_LABELS: Record<CompatibilityRecord["resultMode"], string> = {
  evaluated: "Evaluated",
  preserved: "Preserved",
  flattened: "Flattened for interchange",
  warning: "Warning reported",
  unsupported: "Unsupported",
};

function compatibilityStatusSummary(record: CompatibilityRecord): string {
  if (record.status === "unsupported" && record.resultMode === "unsupported") {
    return "Unsupported · not claimed";
  }
  if (record.status === "roundtrip-only" && record.resultMode === "preserved") {
    return "Preserved on round-trip only";
  }
  if (record.status === "warning" && record.resultMode === "warning") {
    return "Supported with warning";
  }
  return `${INVENTORY_STATUS_LABELS[record.status]} · ${RESULT_MODE_LABELS[record.resultMode]}`;
}

const COMPATIBILITY_AREAS = [...new Set(compatibilityData.records.map((record) => record.area))];
const COMPATIBILITY_DIALECTS = [
  ...new Set(compatibilityData.records.map((record) => record.dialect)),
];

const SECTIONS = [
  { id: "xlsx", label: "Live workbook" },
  { id: "contract", label: "Compatibility evidence" },
  { id: "fixtures", label: "Source workbooks" },
  { id: "warnings", label: "Warning log" },
  { id: "delimited", label: "CSV / TSV lab" },
  { id: "limits", label: "Hostile-input lab" },
  { id: "isolation", label: "Package boundary" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type WorkbenchSource =
  | { kind: "snapshot"; label: string; snapshot: WorkbookSnapshot }
  | { kind: "columnar"; label: string; columns: Column[]; data: ColumnarData };

interface WarningLog {
  operation: string;
  warnings: XlsxWorkbookWarning[];
}

interface DigestState {
  state: "pending" | "verified" | "mismatch";
  actual?: string;
}

interface IsolationProbe {
  registered: boolean;
  error: string | null;
}

interface FixtureLoad {
  id: string;
  state: "loading" | "loaded" | "failed";
  detail: string;
}

interface AnalyticalReadout {
  selectedRate: number | null;
  payment: number | null;
  statistical: number | null;
  letResult: number | null;
  npv: number | null;
  irr: number | null;
  scheduleEnd: number | null;
  spill: readonly (number | null)[];
}

interface AnalyticalChange {
  address: string;
  committedCells: number;
  changedResults: readonly string[];
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function modelNumber(grid: Grid, sheet: string, row: number, col: number): number | null {
  const resolved = grid.store.getCell({ sheet, row, col }).resolved;
  return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : null;
}

function readAnalyticalModel(grid: Grid): AnalyticalReadout | null {
  const sheets = new Set(grid.store.getWorkbook().sheets.map((sheet) => sheet.id));
  if (!sheets.has(INTEROP_ASSUMPTIONS_SHEET) || !sheets.has(INTEROP_ANALYSIS_SHEET)) {
    return null;
  }
  const spillAnchor = { sheet: INTEROP_ANALYSIS_SHEET, row: 0, col: 4 };
  const spill = Array.from({ length: 6 }, (_, row) => {
    const address = { ...spillAnchor, row };
    const owner = grid.store.getSpillAnchor(address);
    return owner?.sheet === spillAnchor.sheet &&
      owner.row === spillAnchor.row &&
      owner.col === spillAnchor.col
      ? modelNumber(grid, address.sheet, address.row, address.col)
      : null;
  });
  return {
    selectedRate: modelNumber(grid, INTEROP_ASSUMPTIONS_SHEET, 1, 1),
    payment: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 0, 3),
    statistical: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 1, 3),
    letResult: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 2, 3),
    npv: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 3, 3),
    irr: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 4, 3),
    scheduleEnd: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 4, 0),
    spill,
  };
}

function changedAnalyticalResults(
  previous: AnalyticalReadout,
  next: AnalyticalReadout,
): readonly string[] {
  const changed = [
    ["Payment", previous.payment, next.payment],
    ["NPV", previous.npv, next.npv],
    ["IRR", previous.irr, next.irr],
    ["STDEV.S", previous.statistical, next.statistical],
    ["LET", previous.letResult, next.letResult],
    ["Date schedule", previous.scheduleEnd, next.scheduleEnd],
  ] as const;
  const labels: string[] = changed
    .filter(([, before, after]) => !Object.is(before, after))
    .map(([label]) => label);
  if (previous.spill.some((value, index) => !Object.is(value, next.spill[index]))) {
    labels.push("Spill");
  }
  return labels;
}

function formatCurrency(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value);
}

function formatSerialDate(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface ChoiceOption {
  value: string;
  label: string;
}

function ChoiceMenu({
  label,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  testId: string;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0]!;
  return (
    <div className="sw-si-choice">
      <span>{label}</span>
      <details ref={detailsRef}>
        <summary aria-label={`${label}: ${selected.label}`} data-testid={testId}>
          {selected.label}
        </summary>
        <fieldset className="sw-si-choice__menu">
          <legend className="sw-visually-hidden">{label}</legend>
          {options.map((option) => (
            <button
              aria-pressed={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                detailsRef.current?.removeAttribute("open");
                detailsRef.current?.querySelector("summary")?.focus();
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </details>
    </div>
  );
}

function InteroperabilityRoute() {
  const hostRef = useRef<HTMLDivElement>(null);
  const formulaRowRef = useRef<HTMLDivElement>(null);
  const statusRowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const probedRef = useRef(false);

  const [source, setSource] = useState<WorkbenchSource>(() => ({
    kind: "snapshot",
    label: "Canonical invoice workbook",
    snapshot: createInteropSnapshot(),
  }));
  const [gridReady, setGridReady] = useState(false);
  const [status, setStatus] = useState("Booting the WASM engine…");
  const [probe, setProbe] = useState<IsolationProbe | null>(null);
  const [warningLog, setWarningLog] = useState<WarningLog | null>(null);
  const [roundTrip, setRoundTrip] = useState<RoundTripReport | null>(null);
  const [digests, setDigests] = useState<Record<string, DigestState>>({});
  const [rejections, setRejections] = useState<Record<string, RejectionReport>>({});
  const [abortReport, setAbortReport] = useState<RejectionReport | null>(null);
  const [cellCapReport, setCellCapReport] = useState<RejectionReport | null>(null);
  const [csvCapReport, setCsvCapReport] = useState<RejectionReport | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [tsvPreview, setTsvPreview] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>(SECTIONS[0].id);
  const [fixtureLoad, setFixtureLoad] = useState<FixtureLoad | null>(null);
  const [modelReadout, setModelReadout] = useState<AnalyticalReadout | null>(null);
  const [modelChange, setModelChange] = useState<AnalyticalChange | null>(null);
  const [resultStatus, setResultStatus] = useState<ResultFilter>("all");
  const [resultFeature, setResultFeature] = useState("all");
  const [resultBehavior, setResultBehavior] = useState("all");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [compatibilityStatus, setCompatibilityStatus] = useState<CompatibilityFilter>("all");
  const [compatibilityArea, setCompatibilityArea] = useState("all");
  const [compatibilityDialect, setCompatibilityDialect] = useState("all");
  const [selectedCompatibilityId, setSelectedCompatibilityId] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("compatibility");
    if (compatibilityData.records.some((record) => record.id === requested)) {
      setSelectedCompatibilityId(requested);
      document.getElementById("contract")?.scrollIntoView();
    }
  }, []);

  const fixtureBytes = useCallback(async (fixture: InteropFixture): Promise<Uint8Array> => {
    const cached = bytesCache.current.get(fixture.file);
    if (cached) return cached;
    const bytes = await fetchFixtureBytes(fixture);
    bytesCache.current.set(fixture.file, bytes);
    return bytes;
  }, []);

  // Mount one grid generation per workbench source.
  useEffect(() => {
    const host = hostRef.current;
    const formulaRow = formulaRowRef.current;
    const statusRow = statusRowRef.current;
    if (!host || !formulaRow || !statusRow) return;

    let disposed = false;
    let grid: Grid | null = null;
    const pieces: ShellPiece[] = [];
    let unsubscribeChange: (() => void) | null = null;
    let previousModel: AnalyticalReadout | null = null;

    void initSheetwrite().then(async () => {
      if (disposed) return;
      // The registration probe must observe the page BEFORE this route ever
      // touches the optional XLSX package, so it runs exactly once, here.
      if (!probedRef.current) {
        probedRef.current = true;
        setProbe(await probeXlsxRegistration());
        if (disposed) return;
      }
      const base = { theme: CANVAS_THEME, config: { toolbar: false } };
      grid =
        source.kind === "snapshot"
          ? createGridFromSnapshot(host, source.snapshot, base)
          : createGrid(host, {
              workbook: {
                activeSheet: "imported",
                sheets: [
                  {
                    id: "imported",
                    name: "Imported",
                    rowCount: source.data.rowCount,
                    columns: source.columns,
                  },
                ],
              },
              data: source.data,
              ...base,
            });
      pieces.push(
        createNameBox(formulaRow, grid, { focusGrid: () => host.focus() }),
        createFormulaBar(formulaRow, grid, { focusGrid: () => host.focus() }),
        createSelectionStatus(statusRow, grid),
      );
      gridRef.current = grid;
      window.__sheetwriteInteropGrid = grid;
      previousModel = readAnalyticalModel(grid);
      setModelReadout(previousModel);
      setModelChange(null);
      unsubscribeChange = grid.on("change", (event) => {
        if (!grid) return;
        const nextModel = readAnalyticalModel(grid);
        setModelReadout(nextModel);
        if (previousModel && nextModel) {
          setModelChange({
            address: event.changes
              .map(({ addr }) => `${String(addr.sheet)}!R${addr.row + 1}C${addr.col + 1}`)
              .join(", "),
            committedCells: event.changes.length,
            changedResults: changedAnalyticalResults(previousModel, nextModel),
          });
        }
        previousModel = nextModel;
      });
      setGridReady(true);
      setStatus(`Loaded: ${source.label}. Edit any cell, then export below.`);
    });

    return () => {
      unsubscribeChange?.();
      disposed = true;
      setGridReady(false);
      for (const piece of pieces) piece.destroy();
      if (gridRef.current === grid) {
        gridRef.current = null;
        delete window.__sheetwriteInteropGrid;
      }
      grid?.destroy();
    };
  }, [source]);

  // Verify fixture provenance in-browser: hash committed bytes, compare to the manifest.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const fixture of [...POSITIVE_FIXTURES, ...ADVERSARIAL_FIXTURES]) {
        try {
          const actual = await sha256Hex(await fixtureBytes(fixture));
          if (cancelled) return;
          setDigests((previous) => ({
            ...previous,
            [fixture.id]: {
              state: actual === fixture.sha256 ? "verified" : "mismatch",
              actual,
            },
          }));
        } catch (error) {
          if (cancelled) return;
          setDigests((previous) => ({
            ...previous,
            [fixture.id]: { state: "mismatch", actual: describeError(error) },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixtureBytes]);

  // Scroll-spy for the persistent section rail: the section crossing the
  // reading band (upper third of the viewport) is the current one.
  useEffect(() => {
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        }
        for (const section of SECTIONS) {
          if (intersecting.has(section.id)) {
            setActiveSection(section.id);
            return;
          }
        }
      },
      { rootMargin: "-30% 0px -55% 0px" },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  // The engine resolves --sheetwrite-* custom properties once per grid mount.
  // When the site theme flips, re-run that resolution (DEFAULT < CSS < metrics)
  // so the canvas repaints with the new palette instead of going stale.
  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(CANVAS_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const handleDownload = async () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const outcome = await exportWorkbook(grid);
      setWarningLog({ operation: "XLSX export", warnings: outcome.warnings });
      downloadBytes(outcome.bytes, "sheetwrite-interoperability.xlsx", XLSX_MIME);
      setStatus(`Downloaded ${outcome.bytes.byteLength.toLocaleString()} bytes of .xlsx.`);
    } catch (error) {
      setStatus(`Export failed — ${describeError(error)}`);
    }
  };

  const handleRoundTrip = async () => {
    const grid = gridRef.current;
    if (!grid) return;
    setStatus("Exporting and re-importing the live document…");
    try {
      const report = await roundTripWorkbook(grid);
      setRoundTrip(report);
      setWarningLog({
        operation: "XLSX export → re-import round-trip",
        warnings: [...report.exportWarnings, ...report.importWarnings],
      });
      setStatus("Round-trip complete. Every claim below was just measured.");
    } catch (error) {
      setStatus(`Round-trip failed — ${describeError(error)}`);
    }
  };

  const handleModelInput = (row: number, col: number, value: number, label: string) => {
    const grid = gridRef.current;
    if (!grid || !modelReadout) return;
    const outcome = grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: INTEROP_ASSUMPTIONS_SHEET, row, col },
          value: { kind: "literal", value },
        },
      ],
    });
    setStatus(
      outcome.status === "applied"
        ? `${label} changed through Grid.applyTransaction; live dependents recalculated.`
        : `${label} was not changed — transaction status: ${outcome.status}.`,
    );
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setStatus(`Importing ${file.name}…`);
    try {
      const outcome = await importWorkbook(await file.arrayBuffer());
      setWarningLog({ operation: `Import of ${file.name}`, warnings: outcome.warnings });
      setRoundTrip(null);
      setFixtureLoad(null);
      setSource({ kind: "snapshot", label: file.name, snapshot: outcome.snapshot });
    } catch (error) {
      setStatus(`Import rejected — ${describeError(error)}`);
    }
  };

  const handleFixtureLoad = async (fixture: InteropFixture) => {
    setStatus(`Importing committed fixture ${fixture.file}…`);
    setFixtureLoad({ id: fixture.id, state: "loading", detail: "Importing committed bytes…" });
    try {
      const outcome = await importWorkbook(await fixtureBytes(fixture));
      setWarningLog({
        operation: `Import of ${fixture.file} (${fixture.producer})`,
        warnings: outcome.warnings,
      });
      setRoundTrip(null);
      setSource({
        kind: "snapshot",
        label: `${fixture.file} — produced by ${fixture.producer}`,
        snapshot: outcome.snapshot,
      });
      const sheets = outcome.snapshot.sheets.length;
      let cells = 0;
      for (const sheet of outcome.snapshot.sheets) {
        for (const block of sheet.cells) cells += block.cells.length;
      }
      setFixtureLoad({
        id: fixture.id,
        state: "loaded",
        detail: `In the workbench now — ${sheets} sheet${sheets === 1 ? "" : "s"}, ${cells.toLocaleString()} cells, ${outcome.warnings.length} warning${outcome.warnings.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setFixtureLoad({
        id: fixture.id,
        state: "failed",
        detail: `Import failed — ${describeError(error)}`,
      });
      setStatus(`Fixture import failed — ${describeError(error)}`);
    }
  };

  const handleHostileRun = async () => {
    setStatus("Feeding hostile packages to the import path…");
    for (const fixture of ADVERSARIAL_FIXTURES) {
      try {
        const report = await expectRejection(await fixtureBytes(fixture));
        setRejections((previous) => ({ ...previous, [fixture.id]: report }));
      } catch (error) {
        setRejections((previous) => ({
          ...previous,
          [fixture.id]: { rejected: false, errorName: null, message: describeError(error) },
        }));
      }
    }
    setStatus("Hostile-input run finished — every package must show a typed rejection.");
  };

  const handleAbortDemo = async () => {
    const rich = POSITIVE_FIXTURES.find((fixture) => fixture.file === "libreoffice-rich.xlsx");
    if (!rich) return;
    setAbortReport(await abortedImport(await fixtureBytes(rich)));
  };

  const handleCellCapDemo = async () => {
    const rich = POSITIVE_FIXTURES.find((fixture) => fixture.file === "libreoffice-rich.xlsx");
    if (!rich) return;
    setCellCapReport(await expectRejection(await fixtureBytes(rich), { maxCells: 8 }));
  };

  const handleCsvExport = () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      setCsvPreview(csvOfActiveSheet(grid));
      setStatus("Active sheet exported to CSV through the hardened text path.");
    } catch (error) {
      setStatus(`CSV export failed — ${describeError(error)}`);
    }
  };

  const handleCsvDownload = () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      downloadBytes(csvOfActiveSheet(grid), "sheetwrite-interoperability.csv", "text/csv");
    } catch (error) {
      setStatus(`CSV download failed — ${describeError(error)}`);
    }
  };

  const handleTsvExport = () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const tsv = tsvOfSelection(grid);
      setTsvPreview(tsv);
      setStatus(
        tsv === null
          ? "Select a cell or range in the grid first, then export the selection."
          : "Selection exported as clipboard-format TSV.",
      );
    } catch (error) {
      setStatus(`TSV export failed — ${describeError(error)}`);
    }
  };

  const handlePasteImport = () => {
    setPasteError(null);
    try {
      const imported = importDelimitedText(pasteText);
      setRoundTrip(null);
      setWarningLog(null);
      setFixtureLoad(null);
      setSource({
        kind: "columnar",
        label: `Pasted ${imported.delimiter === "\t" ? "TSV" : "CSV"} (${imported.rows} rows)`,
        columns: imported.columns,
        data: imported.data,
      });
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : String(error));
    }
  };

  const injectionCsvLine = csvPreview?.split(/\r?\n/).find((line) => line.includes("OP-1045"));
  const visibleResults = COMPATIBILITY_RESULTS.cases.filter(
    (entry) =>
      (resultStatus === "all" || entry.statusTags.includes(resultStatus)) &&
      (resultFeature === "all" || entry.featureValue === resultFeature) &&
      (resultBehavior === "all" || entry.behavior === resultBehavior),
  );
  const selectedResult =
    visibleResults.find((entry) => entry.id === selectedResultId) ?? visibleResults[0];
  const selectedResultSource = selectedResult
    ? COMPATIBILITY_RESULTS.sources[selectedResult.sourceIndex]
    : undefined;
  const selectedResultEvidence = selectedResult
    ? COMPATIBILITY_RESULTS.evidence[selectedResult.evidenceIndex]
    : undefined;

  const visibleCompatibility = compatibilityData.records.filter(
    (record) =>
      (compatibilityStatus === "all" || record.status === compatibilityStatus) &&
      (compatibilityArea === "all" || record.area === compatibilityArea) &&
      (compatibilityDialect === "all" || record.dialect === compatibilityDialect),
  );
  const selectedCompatibility =
    visibleCompatibility.find((record) => record.id === selectedCompatibilityId) ??
    visibleCompatibility[0];
  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((section) => section.id === activeSection),
  );

  return (
    <div className="sw-si-frame">
      <SiteTopbar active="interoperability" />
      <main className="sw-si-page" id="main-content">
        <CapabilityHero
          description={
            <>
              A real editable Grid sits in the exchange path: load source bytes, make a change, then
              export, re-import, and inspect the fidelity result beside the workbook.{" "}
              <a href="/docs/guides/xlsx-export/">XLSX interchange guide →</a>
            </>
          }
          eyebrow="CAPABILITY / SPREADSHEET INTEROPERABILITY"
          facts={[
            { label: "Formats", value: "XLSX · CSV · TSV" },
            { label: "Editing", value: "Real Grid" },
            { label: "Round trip", value: "Export · re-import" },
            { label: "Evidence", value: "Checked fixtures" },
          ]}
          title="Open the workbook. Change it. Bring it back intact."
        />

        <nav aria-label="Page sections" className="sw-si-sectionnav">
          <span aria-hidden="true" className="sw-si-sectionnav__progress">
            {String(activeIndex + 1).padStart(2, "0")}/{String(SECTIONS.length).padStart(2, "0")}
          </span>
          {SECTIONS.map((section, index) => (
            <a
              aria-current={activeSection === section.id ? "true" : undefined}
              href={`#${section.id}`}
              key={section.id}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {section.label}
            </a>
          ))}
        </nav>

        <p aria-live="polite" className="sw-si-status" data-testid="interop-status" role="status">
          {status}
        </p>

        <section aria-label="Workbook exchange workbench" className="sw-si-section" id="xlsx">
          <div className="sw-si-workbench" data-ready={gridReady || undefined}>
            <p className="sw-si-workbench__label" data-testid="interop-source">
              <span>Source workbook</span>
              <strong>{source.label}</strong>
              <span data-state={gridReady ? "ready" : "loading"}>
                {gridReady ? "Editable Grid ready" : "Loading editable Grid"}
              </span>
            </p>
            <aside
              aria-labelledby="fidelity-ledger-title"
              className="sw-si-ledger"
              data-testid="interop-fidelity-ledger"
            >
              <header>
                <p>One exchange path</p>
                <h3 id="fidelity-ledger-title">Load → edit → compare</h3>
              </header>
              <ol className="sw-si-journey">
                <li data-state="complete">
                  <strong>Source loaded</strong>
                  <span>{source.label}</span>
                </li>
                <li data-state={modelChange ? "complete" : "active"}>
                  <strong>Edit the live Grid</strong>
                  <span>
                    {modelChange
                      ? `${modelChange.committedCells} cell change recorded`
                      : "Try B2 or a model input"}
                  </span>
                </li>
                <li data-state={roundTrip ? "complete" : "pending"}>
                  <strong>Export, re-import, diff</strong>
                  <span>{roundTrip ? "Comparison complete" : "Run the primary action below"}</span>
                </li>
              </ol>
              <button
                className="sw-si-btn sw-si-btn--primary sw-si-ledger__action"
                data-testid="interop-roundtrip"
                onClick={handleRoundTrip}
                type="button"
              >
                Export, re-import &amp; compare
              </button>
              <dl aria-label="Current fidelity ledger" className="sw-si-ledger__states">
                <div data-state="evaluated">
                  <dt>Evaluated</dt>
                  <dd>{INTEROP_EXPECTED.formulaCount} formula sources live in Grid</dd>
                </div>
                <div data-state="preserved">
                  <dt>Preserved</dt>
                  <dd>
                    {roundTrip
                      ? `${roundTrip.formulasPreserved}/${roundTrip.formulasBefore} formulas · ${
                          roundTrip.sheetsPreserved &&
                          roundTrip.mergePreserved &&
                          roundTrip.frozenRowsPreserved
                            ? "sheet structure matched"
                            : "differences found"
                        }`
                      : "Measured after export and re-import"}
                  </dd>
                </div>
                <div data-state="warning">
                  <dt>Warnings</dt>
                  <dd>
                    {warningLog
                      ? `${warningLog.warnings.length} reported by ${warningLog.operation}`
                      : "Structured and never hidden"}
                  </dd>
                </div>
                <div data-state="unsupported">
                  <dt>Unsupported boundary</dt>
                  <dd>No unreviewed Excel or Google Sheets result is claimed</dd>
                </div>
              </dl>
            </aside>
            <section aria-labelledby="analytical-model-title" className="sw-si-model">
              <div className="sw-si-model__heading">
                <div>
                  <p className="sw-si-model__eyebrow">LIVE FORMULA MODEL</p>
                  <h3 id="analytical-model-title">Portable analytical workbench</h3>
                </div>
                <p className="sw-si-model__evidence" data-testid="interop-model-evidence">
                  Local engine: evaluated now. No new Excel or Google Sheets result is added; the
                  on-demand evidence vault remains the source of truth.
                </p>
              </div>
              <fieldset className="sw-si-model__controls">
                <legend>Analytical model inputs</legend>
                <fieldset
                  className="sw-si-model__choice"
                  data-testid="interop-rate-input"
                  disabled={!modelReadout}
                >
                  <legend>Base annual rate</legend>
                  <div className="sw-si-model__segments">
                    {[
                      { label: "6.0%", value: 0.06 },
                      { label: "9.0%", value: 0.09 },
                    ].map((option) => (
                      <label key={option.value}>
                        <input
                          checked={modelReadout?.selectedRate === option.value}
                          name="interop-base-rate"
                          onChange={(event) =>
                            handleModelInput(
                              1,
                              3,
                              Number(event.currentTarget.value),
                              "Base annual rate",
                            )
                          }
                          type="radio"
                          value={option.value}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset
                  className="sw-si-model__choice"
                  data-testid="interop-spill-input"
                  disabled={!modelReadout}
                >
                  <legend>Projection rows</legend>
                  <div className="sw-si-model__segments">
                    {[3, 4, 6].map((periods) => (
                      <label key={periods}>
                        <input
                          checked={
                            modelReadout?.spill.filter((value) => value !== null).length === periods
                          }
                          name="interop-spill-periods"
                          onChange={(event) =>
                            handleModelInput(
                              4,
                              1,
                              Number(event.currentTarget.value),
                              "Projection rows",
                            )
                          }
                          type="radio"
                          value={periods}
                        />
                        <span>
                          {periods}
                          <span className="sw-visually-hidden"> rows</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </fieldset>
              <dl className="sw-si-model__results" data-testid="interop-model-readout">
                <div>
                  <dt>XLOOKUP rate</dt>
                  <dd data-testid="interop-model-rate">
                    {formatPercent(modelReadout?.selectedRate ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>PMT / month</dt>
                  <dd data-testid="interop-model-payment">
                    {formatCurrency(modelReadout?.payment ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>NPV</dt>
                  <dd data-testid="interop-model-npv">
                    {formatCurrency(modelReadout?.npv ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>IRR</dt>
                  <dd data-testid="interop-model-irr">
                    {formatPercent(modelReadout?.irr ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>STDEV.S</dt>
                  <dd data-testid="interop-model-statistical">
                    {formatCurrency(modelReadout?.statistical ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>LET remaining payments</dt>
                  <dd data-testid="interop-model-let">
                    {formatCurrency(modelReadout?.letResult ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>Schedule end</dt>
                  <dd data-testid="interop-model-date">
                    {formatSerialDate(modelReadout?.scheduleEnd ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>SEQUENCE output</dt>
                  <dd data-testid="interop-model-spill">
                    {modelReadout
                      ? modelReadout.spill.filter((value) => value !== null).join(", ")
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>
              <p
                aria-live="polite"
                className="sw-si-model__scope"
                data-change-count={modelChange?.committedCells ?? 0}
                data-changed-results={modelChange?.changedResults.join(",") ?? ""}
                data-testid="interop-model-change-scope"
              >
                {modelChange
                  ? `Public change event: ${modelChange.committedCells} input cell at ${modelChange.address}. Changed dependent results: ${
                      modelChange.changedResults.join(", ") || "none"
                    }.`
                  : "Public change event: awaiting an analytical input edit."}
              </p>
            </section>
            {/* shell.css sizes .sheetwrite-shell at height:100% (unlayered),
                so the definite height lives on this owned wrapper. */}
            <div className="sw-si-stage">
              <div className="sheetwrite-shell">
                <div
                  className="sheetwrite-shell-row sheetwrite-shell-formula-row"
                  ref={formulaRowRef}
                />
                {/* biome-ignore lint/a11y/useSemanticElements: Sheetwrite upgrades this canvas host into a virtualized ARIA grid; a table cannot host the runtime. */}
                <div
                  aria-label="Interoperability workbench grid"
                  role="grid"
                  className="sheetwrite-shell-grid sw-si-grid"
                  ref={hostRef}
                />
                <div
                  className="sheetwrite-shell-row sheetwrite-shell-bottom-row"
                  ref={statusRowRef}
                />
              </div>
            </div>
            <div aria-label="Workbook interchange actions" className="sw-si-actions" role="toolbar">
              <button
                className="sw-si-btn sw-si-btn--secondary"
                data-testid="interop-download"
                onClick={handleDownload}
                type="button"
              >
                Download .xlsx
              </button>
              <label className="sw-si-btn sw-si-btn--secondary sw-si-file">
                Import your .xlsx
                <input
                  accept=".xlsx"
                  data-testid="interop-file-input"
                  onChange={(event) => void handleFile(event.currentTarget.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <span aria-hidden="true" className="sw-si-actions__spacer" />
              <button
                className="sw-si-btn sw-si-btn--quiet"
                data-testid="interop-reset"
                onClick={() => {
                  setRoundTrip(null);
                  setWarningLog(null);
                  setFixtureLoad(null);
                  setSource({
                    kind: "snapshot",
                    label: "Canonical invoice workbook",
                    snapshot: createInteropSnapshot(),
                  });
                }}
                type="button"
              >
                Reset workbench
              </button>
            </div>
          </div>
          {roundTrip && (
            <dl
              className="sw-si-report"
              data-state={
                roundTrip.formulasPreserved === roundTrip.formulasBefore &&
                roundTrip.sheetsPreserved &&
                roundTrip.mergePreserved &&
                roundTrip.frozenRowsPreserved
                  ? "pass"
                  : "partial"
              }
              data-testid="interop-roundtrip-report"
            >
              <div>
                <dt>Exported bytes</dt>
                <dd>{roundTrip.exportedBytes.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Formulas preserved</dt>
                <dd data-testid="interop-roundtrip-formulas">
                  {roundTrip.formulasPreserved}/{roundTrip.formulasBefore}
                </dd>
              </div>
              <div>
                <dt>Sheets preserved</dt>
                <dd>{roundTrip.sheetsPreserved ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>Merge preserved</dt>
                <dd>{roundTrip.mergePreserved ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>Frozen rows preserved</dt>
                <dd>{roundTrip.frozenRowsPreserved ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>Warnings</dt>
                <dd>{roundTrip.exportWarnings.length + roundTrip.importWarnings.length}</dd>
              </div>
            </dl>
          )}
        </section>

        <section aria-labelledby="contract-summary" className="sw-si-section" id="contract">
          <details
            className="sw-si-disclosure"
            data-testid="interop-compatibility-disclosure"
            open={selectedCompatibilityId !== null}
          >
            <summary id="contract-summary">
              <span>Evidence vault</span>
              <strong>Compatibility corpus and raw tested-app results</strong>
              <small>Filters, expected values, checksums, and explicit nonclaims</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="contract-title">Compatibility results you can inspect</h2>
              <p>
                This page publishes a fixed, checked test set and the product&apos;s declared
                feature boundaries. It does not claim blanket Excel, Google Sheets, LibreOffice, or
                OpenFormula compatibility.{" "}
                <a href="/docs/reference/compatibility-matrix/">
                  Read the detailed checked results →
                </a>
              </p>

              <section
                aria-label="Checked compatibility test set summary"
                className="sw-si-results__summary"
                data-testid="compatibility-results-summary"
              >
                <p>
                  <strong>Local result</strong>
                  <span>
                    {(
                      (COMPATIBILITY_RESULTS.testSet.localPassed /
                        (COMPATIBILITY_RESULTS.testSet.totalTests -
                          COMPATIBILITY_RESULTS.testSet.unsupported)) *
                      100
                    ).toFixed(0)}
                    % — {COMPATIBILITY_RESULTS.testSet.localPassed.toLocaleString()} of{" "}
                    {(
                      COMPATIBILITY_RESULTS.testSet.totalTests -
                      COMPATIBILITY_RESULTS.testSet.unsupported
                    ).toLocaleString()}{" "}
                    supported tests passed locally
                  </span>
                </p>
                <dl>
                  <div>
                    <dt>Test set version</dt>
                    <dd>{COMPATIBILITY_RESULTS.testSet.version}</dd>
                  </div>
                  <div>
                    <dt>Total tests</dt>
                    <dd>{COMPATIBILITY_RESULTS.testSet.totalTests.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Formula tests</dt>
                    <dd>{COMPATIBILITY_RESULTS.testSet.formulaTests.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Edit sequences</dt>
                    <dd>{COMPATIBILITY_RESULTS.testSet.editSequenceTests.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Workbook tests</dt>
                    <dd>{COMPATIBILITY_RESULTS.testSet.workbookTests.toLocaleString()}</dd>
                  </div>
                </dl>
                <p className="sw-si-results__gate" data-state="blocked">
                  <strong>External app evidence is incomplete.</strong>
                  <span>
                    {COMPATIBILITY_RESULTS.testSet.reviewedResults.toLocaleString()} reviewed
                    results; {COMPATIBILITY_RESULTS.testSet.missingReviewedResults.toLocaleString()}{" "}
                    supported tests still lack a reviewed tested-app result.{" "}
                    {COMPATIBILITY_RESULTS.testSet.unsupported.toLocaleString()} unsupported tests
                    are explicit nonclaims and are excluded from the local percentage.
                  </span>
                </p>
                <p>
                  <strong>Explicit result categories</strong>
                  <span>
                    {COMPATIBILITY_RESULTS.testSet.warningChecks.toLocaleString()} warning-behavior
                    checks · {COMPATIBILITY_RESULTS.testSet.knownDifferences.toLocaleString()} known
                    difference · {COMPATIBILITY_RESULTS.testSet.regressions.toLocaleString()}{" "}
                    reviewed regressions
                  </span>
                </p>
                <p className="sw-si-results__checksum">
                  <span>Checked test set SHA-256</span>
                  <code data-testid="compatibility-test-set-checksum">
                    {COMPATIBILITY_RESULTS.testSet.checksum}
                  </code>
                </p>
              </section>

              <h3>Inspect representative checked tests</h3>
              <p>
                The compact page includes the first checked example for every function or feature,
                plus every available result state. Counts above always refer to the full{" "}
                {COMPATIBILITY_RESULTS.testSet.totalTests.toLocaleString()}-test set; the browser
                below contains {COMPATIBILITY_RESULTS.testSet.publishedExamples.toLocaleString()}{" "}
                inspectable examples.
              </p>
              <fieldset className="sw-si-compat__filters">
                <legend>Filter checked tests</legend>
                <ChoiceMenu
                  label="Function or feature"
                  onChange={(value) => {
                    setResultFeature(value);
                    setSelectedResultId(null);
                  }}
                  options={[
                    { value: "all", label: "All functions and features" },
                    ...COMPATIBILITY_RESULTS.filterOptions.features,
                  ]}
                  testId="compatibility-feature-filter"
                  value={resultFeature}
                />
                <ChoiceMenu
                  label="Behavior"
                  onChange={(value) => {
                    setResultBehavior(value);
                    setSelectedResultId(null);
                  }}
                  options={[
                    { value: "all", label: "All behavior scopes" },
                    ...COMPATIBILITY_RESULTS.filterOptions.behaviors.map((behavior) => ({
                      value: behavior,
                      label: BEHAVIOR_LABELS[behavior] ?? behavior,
                    })),
                  ]}
                  testId="compatibility-behavior-filter"
                  value={resultBehavior}
                />
                <ChoiceMenu
                  label="Result status"
                  onChange={(value) => {
                    setResultStatus(value as ResultFilter);
                    setSelectedResultId(null);
                  }}
                  options={[
                    { value: "all", label: "All result states" },
                    ...COMPATIBILITY_RESULTS.filterOptions.statuses.map((entryStatus) => ({
                      value: entryStatus,
                      label: RESULT_STATUS_LABELS[entryStatus],
                    })),
                  ]}
                  testId="compatibility-status-filter"
                  value={resultStatus}
                />
                <span aria-live="polite" className="sw-si-compat__count">
                  {visibleResults.length}/{COMPATIBILITY_RESULTS.testSet.publishedExamples} examples
                </span>
              </fieldset>

              <div className="sw-si-compat sw-si-results">
                <ul aria-label="Checked compatibility tests" className="sw-si-compat__records">
                  {visibleResults.map((entry) => (
                    <li key={entry.id}>
                      <button
                        aria-pressed={selectedResult?.id === entry.id}
                        data-behavior={entry.behavior}
                        data-status={entry.statusTags.join(" ")}
                        data-testid={`compatibility-result-${entry.position}`}
                        data-tolerance={entry.tolerance.kind}
                        onClick={() => setSelectedResultId(entry.id)}
                        type="button"
                      >
                        <span>
                          {entry.featureLabel} / {BEHAVIOR_LABELS[entry.behavior]}
                        </span>
                        <strong>{entry.label}</strong>
                        <small>
                          {entry.statusTags.map((tag) => RESULT_STATUS_LABELS[tag]).join(" · ")}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedResult && selectedResultSource && selectedResultEvidence ? (
                  <article
                    className="sw-si-compat__detail sw-si-results__detail"
                    data-behavior={selectedResult.behavior}
                    data-status={selectedResult.statusTags.join(" ")}
                    data-testid="compatibility-result-detail"
                  >
                    <p className="sw-si-compat__mode">
                      {selectedResult.statusTags.map((tag) => (
                        <span data-state={tag} key={tag}>
                          {RESULT_STATUS_LABELS[tag]}
                        </span>
                      ))}
                    </p>
                    <p className="sw-si-results__position">
                      Test {selectedResult.position.toLocaleString()} of{" "}
                      {COMPATIBILITY_RESULTS.testSet.totalTests.toLocaleString()} ·{" "}
                      {BEHAVIOR_LABELS[selectedResult.behavior]}
                    </p>
                    <h3>{selectedResult.label}</h3>
                    <p>{selectedResultEvidence.description}</p>

                    {selectedResult.unsupported && (
                      <p className="sw-si-results__notice" data-state="unsupported">
                        <strong>Unsupported and excluded from the pass percentage.</strong> This is
                        a checked nonclaim, not a failed supported feature.
                      </p>
                    )}
                    {selectedResult.statusTags.includes("warning") && (
                      <p className="sw-si-results__notice" data-state="warning">
                        <strong>Warning behavior check.</strong> This test exercises the warning
                        path; it does not claim that an external app emitted a warning.
                      </p>
                    )}
                    {selectedResult.knownDifference && (
                      <aside className="sw-si-results__difference" data-testid="known-difference">
                        <h4>Known difference</h4>
                        <p>{selectedResult.knownDifference.reason}</p>
                        <p>
                          Recorded for{" "}
                          {selectedResult.knownDifference.producers
                            .filter((producer) => producer !== "excel-web")
                            .map(
                              (producer) =>
                                TESTED_APPS.find((app) => app.id === producer)?.label ?? producer,
                            )
                            .join(", ")}
                          .
                        </p>
                        <pre>
                          {JSON.stringify(selectedResult.knownDifference.alternate, null, 2)}
                        </pre>
                      </aside>
                    )}

                    <section
                      aria-labelledby="selected-test-preview"
                      className="sw-si-results__preview"
                    >
                      <h4 id="selected-test-preview">
                        {selectedResult.kind === "formula"
                          ? "Input and expected result"
                          : "Workbook preview"}
                      </h4>
                      {selectedResult.formula && (
                        <p>
                          Formula <code>{selectedResult.formula}</code>
                          {selectedResult.target ? (
                            <>
                              {" "}
                              at <code>{selectedResult.target}</code>
                            </>
                          ) : null}
                        </p>
                      )}
                      {selectedResult.inputs && selectedResult.inputs.length > 0 ? (
                        <dl className="sw-si-results__inputs">
                          {selectedResult.inputs.map((input) => (
                            <div key={input.cell}>
                              <dt>{input.cell}</dt>
                              <dd>
                                <code>{JSON.stringify(input.value)}</code>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : selectedResult.formula ? (
                        <p>No input cells are required.</p>
                      ) : null}
                      {selectedResult.operations && (
                        <pre data-testid="compatibility-workbook-preview">
                          {JSON.stringify(selectedResult.operations, null, 2)}
                        </pre>
                      )}
                      <dl>
                        <div>
                          <dt>Expected checked result</dt>
                          <dd>
                            <pre>{JSON.stringify(selectedResult.expected, null, 2)}</pre>
                          </dd>
                        </div>
                        <div>
                          <dt>Comparison tolerance</dt>
                          <dd data-testid="compatibility-tolerance">
                            {selectedResult.tolerance.kind === "exact"
                              ? "Exact type and value"
                              : `${selectedResult.tolerance.kind} · ${selectedResult.tolerance.value}`}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section aria-labelledby="tested-app-results" className="sw-si-results__apps">
                      <h4 id="tested-app-results">Tested app results and differences</h4>
                      <p>
                        Missing results stay unavailable. A source description or expected value
                        never substitutes for a reviewed app result.
                      </p>
                      <ul>
                        {TESTED_APPS.map((app) => {
                          const isSheetwrite = app.id === "sheetwrite";
                          const localPassed = selectedResult.statusTags.includes("local-pass");
                          const observation = isSheetwrite
                            ? undefined
                            : selectedResult.observations.find(
                                (entry) => entry.testedApp === app.id,
                              );
                          const reviewed = observation?.reviewStatus === "reviewed";
                          const state = isSheetwrite
                            ? localPassed
                              ? "local-pass"
                              : selectedResult.unsupported
                                ? "unsupported"
                                : "unavailable"
                            : (observation?.reviewStatus ?? "unavailable");
                          return (
                            <li
                              data-state={state}
                              data-testid={`app-result-${app.id}`}
                              key={app.id}
                            >
                              <div>
                                <strong>{app.label}</strong>
                                <span>
                                  {isSheetwrite
                                    ? localPassed
                                      ? "Local check passed"
                                      : selectedResult.unsupported
                                        ? "Unsupported · not claimed"
                                        : "Local result unavailable"
                                    : reviewed
                                      ? "Reviewed result"
                                      : "Result unavailable"}
                                </span>
                              </div>
                              <dl>
                                {isSheetwrite ? (
                                  <>
                                    <div>
                                      <dt>Library version</dt>
                                      <dd>{COMPATIBILITY_RESULTS.testSet.libraryVersion}</dd>
                                    </div>
                                    <div>
                                      <dt>Checked evidence</dt>
                                      <dd>
                                        Test {selectedResult.position.toLocaleString()} in checked
                                        set v{COMPATIBILITY_RESULTS.testSet.version}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Result comparison</dt>
                                      <dd>
                                        {localPassed
                                          ? "The local result matched the checked expected value under the published tolerance."
                                          : selectedResult.unsupported
                                            ? "No supported local behavior is claimed for this checked case."
                                            : "No local checked result is attached to this case."}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Test record SHA-256</dt>
                                      <dd>{selectedResult.testChecksum}</dd>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <dt>Version</dt>
                                      <dd>{observation?.version ?? "Unavailable"}</dd>
                                    </div>
                                    <div>
                                      <dt>Captured</dt>
                                      <dd>{observation?.capturedAt ?? "Unavailable"}</dd>
                                    </div>
                                    <div>
                                      <dt>Result differences</dt>
                                      <dd>
                                        {!reviewed
                                          ? "Unavailable — no reviewed result file is attached to this test."
                                          : observation.differences.length === 0
                                            ? "No differences after type-aware comparison."
                                            : observation.differences.join("; ")}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Evidence file checksum</dt>
                                      <dd>{observation?.evidenceFileChecksum ?? "Unavailable"}</dd>
                                    </div>
                                  </>
                                )}
                              </dl>
                              {isSheetwrite ? (
                                <div className="sw-si-results__local">
                                  <strong>
                                    {localPassed
                                      ? "Local checked result"
                                      : selectedResult.unsupported
                                        ? "Checked nonclaim result"
                                        : "Expected checked result"}
                                  </strong>
                                  <pre data-testid="app-result-sheetwrite-capture">
                                    {JSON.stringify(selectedResult.expected, null, 2)}
                                  </pre>
                                </div>
                              ) : (
                                observation?.result && (
                                  <details>
                                    <summary>Technical captured result</summary>
                                    <pre>{JSON.stringify(observation.result, null, 2)}</pre>
                                  </details>
                                )
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    <details className="sw-si-results__technical">
                      <summary>Technical test details</summary>
                      <dl>
                        <div>
                          <dt>Machine ID</dt>
                          <dd>
                            <code>{selectedResult.id}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Test record SHA-256</dt>
                          <dd>
                            <code>{selectedResult.testChecksum}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Exact source</dt>
                          <dd>
                            <a href={selectedResultSource.url}>
                              {selectedResultSource.title}, {selectedResultSource.section}
                            </a>
                          </dd>
                        </div>
                        <div>
                          <dt>Source record SHA-256</dt>
                          <dd>
                            <code>{selectedResultSource.sha256}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Source rights</dt>
                          <dd>
                            {selectedResultSource.authorship} · {selectedResultSource.license}
                          </dd>
                        </div>
                        <div>
                          <dt>Generated checked data</dt>
                          <dd>
                            <a href={compatibilityResultsUrl}>Open exact generated JSON</a>
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </article>
                ) : (
                  <p className="sw-si-empty" data-testid="compatibility-results-empty">
                    {resultStatus === "regression"
                      ? "No reviewed regressions are recorded. Tested-app results are currently unavailable rather than assumed."
                      : "No published example matches these filters. Choose a broader function, behavior, or status."}
                  </p>
                )}
              </div>

              <h3>Declared feature boundaries</h3>
              <p>
                These product-level records cover import, export, preservation, warnings, and
                explicit unsupported behavior. They come from the existing checked inventory and
                link to exact sources; they do not turn missing Excel or Google Sheets results into
                claims.
              </p>
              <fieldset className="sw-si-compat__filters sw-si-compat__filters--inventory">
                <legend>Filter feature boundary records</legend>
                <ChoiceMenu
                  label="Status"
                  onChange={(value) => setCompatibilityStatus(value as CompatibilityFilter)}
                  options={[
                    { value: "all", label: "All statuses" },
                    ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                  testId="inventory-status-filter"
                  value={compatibilityStatus}
                />
                <ChoiceMenu
                  label="Feature area"
                  onChange={setCompatibilityArea}
                  options={[
                    { value: "all", label: "All feature areas" },
                    ...COMPATIBILITY_AREAS.map((area) => ({
                      value: area,
                      label: area.replaceAll("-", " "),
                    })),
                  ]}
                  testId="inventory-area-filter"
                  value={compatibilityArea}
                />
                <ChoiceMenu
                  label="Behavior"
                  onChange={setCompatibilityDialect}
                  options={[
                    { value: "all", label: "All behavior scopes" },
                    ...COMPATIBILITY_DIALECTS.map((behavior) => ({
                      value: behavior,
                      label: BEHAVIOR_LABELS[behavior] ?? behavior,
                    })),
                  ]}
                  testId="inventory-behavior-filter"
                  value={compatibilityDialect}
                />
                <span aria-live="polite" className="sw-si-compat__count">
                  {visibleCompatibility.length}/{compatibilityData.records.length} records
                </span>
              </fieldset>
              <div className="sw-si-compat sw-si-inventory">
                <ul
                  aria-label="Declared feature boundary records"
                  className="sw-si-compat__records"
                >
                  {visibleCompatibility.map((record) => (
                    <li key={record.id}>
                      <button
                        aria-label={`${record.label}; ${record.area.replaceAll("-", " ")}; ${BEHAVIOR_LABELS[record.dialect]}; ${compatibilityStatusSummary(record)}`}
                        aria-pressed={selectedCompatibility?.id === record.id}
                        data-result={record.resultMode}
                        data-status={record.status}
                        data-testid={`compatibility-${record.id}`}
                        onClick={() => setSelectedCompatibilityId(record.id)}
                        type="button"
                      >
                        <span>
                          {record.area.replaceAll("-", " ")} / {BEHAVIOR_LABELS[record.dialect]}
                        </span>
                        <strong>{record.label}</strong>
                        <small className="sw-si-compat__record-status">
                          {compatibilityStatusSummary(record)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedCompatibility ? (
                  <article
                    className="sw-si-compat__detail"
                    data-result={selectedCompatibility.resultMode}
                    data-status={selectedCompatibility.status}
                    data-testid="compatibility-detail"
                  >
                    <p className="sw-si-compat__mode">
                      <span
                        data-mode={selectedCompatibility.resultMode}
                        data-state={selectedCompatibility.status}
                      >
                        {compatibilityStatusSummary(selectedCompatibility)}
                      </span>
                    </p>
                    <h3>{selectedCompatibility.label}</h3>
                    <p>{selectedCompatibility.semantics}</p>
                    <dl>
                      <div>
                        <dt>Import</dt>
                        <dd>{selectedCompatibility.importBehavior}</dd>
                      </div>
                      <div>
                        <dt>Export</dt>
                        <dd>{selectedCompatibility.exportBehavior}</dd>
                      </div>
                      <div>
                        <dt>Known boundary</dt>
                        <dd>{selectedCompatibility.divergence}</dd>
                      </div>
                      <div>
                        <dt>Exact source</dt>
                        <dd>
                          <a href={selectedCompatibility.source}>Open the checked source</a>
                        </dd>
                      </div>
                      {selectedCompatibility.warningCode && (
                        <div>
                          <dt>Warning code</dt>
                          <dd>
                            <code>{selectedCompatibility.warningCode}</code>
                          </dd>
                        </div>
                      )}
                    </dl>
                    <details className="sw-si-results__technical">
                      <summary>Technical evidence record IDs</summary>
                      <code>{selectedCompatibility.fixtureIds.join(", ")}</code>
                    </details>
                  </article>
                ) : (
                  <p className="sw-si-empty">No feature boundary record matches these filters.</p>
                )}
              </div>
            </div>
          </details>
        </section>

        <section aria-labelledby="fixtures-summary" className="sw-si-section" id="fixtures">
          <details className="sw-si-disclosure" data-testid="interop-fixtures-disclosure">
            <summary id="fixtures-summary">
              <span>Source library</span>
              <strong>Independent workbooks and verified checksums</strong>
              <small>Load committed LibreOffice fixtures into the live Grid</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="fixtures-title">Committed independent fixtures</h2>
              <p>
                Bytes produced by other software, committed with full provenance, and hashed in your
                browser before use — load any of them into the workbench above.
              </p>
              <div className="sw-si-provenance">
                <strong>Checked provenance manifest</strong>
                <code>packages/xlsx/test/fixtures/manifest.json</code>
                <span>Full SHA-256 digests are verified in this browser before loading.</span>
              </div>
              <ul className="sw-si-fixtures">
                {POSITIVE_FIXTURES.map((fixture) => (
                  <li className="sw-si-fixture" key={fixture.id}>
                    <div className="sw-si-fixture__source">
                      <div className="sw-si-fixture__head">
                        <span className="sw-si-fixture__producer">{fixture.producer}</span>
                        <span
                          className="sw-si-digest"
                          data-state={digests[fixture.id]?.state ?? "pending"}
                          data-testid={`fixture-${fixture.id}-digest`}
                        >
                          {digests[fixture.id]?.state === "verified"
                            ? "sha-256 verified"
                            : digests[fixture.id]?.state === "mismatch"
                              ? "sha-256 MISMATCH"
                              : "hashing…"}
                        </span>
                      </div>
                      <p className="sw-si-fixture__file">
                        <strong>{fixture.file}</strong>
                        <code>{fixture.sha256.slice(0, 16)}…</code>
                      </p>
                    </div>
                    <div className="sw-si-fixture__proof">
                      <span className="sw-si-fixture__label">Manifest evidence</span>
                      <ul
                        aria-label={`Features covered by ${fixture.file}`}
                        className="sw-si-chips"
                      >
                        {fixture.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                      {fixture.expectedWarnings.length > 0 && (
                        <p className="sw-si-fixture__warn">
                          Manifest-documented warning: {fixture.expectedWarnings.join("; ")}
                        </p>
                      )}
                    </div>
                    <div className="sw-si-fixture__action">
                      <button
                        aria-label={`Load ${fixture.file} in workbench`}
                        className="sw-si-btn sw-si-btn--secondary"
                        data-testid={`fixture-${fixture.id}-load`}
                        disabled={
                          digests[fixture.id]?.state !== "verified" ||
                          (fixtureLoad?.id === fixture.id && fixtureLoad.state === "loading")
                        }
                        onClick={() => void handleFixtureLoad(fixture)}
                        type="button"
                      >
                        Load in workbench
                      </button>
                      {fixtureLoad?.id === fixture.id && (
                        <p
                          className="sw-si-fixture__load"
                          data-state={fixtureLoad.state}
                          data-testid={`fixture-${fixture.id}-load-state`}
                          role="status"
                        >
                          {fixtureLoad.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <h3>Results by producing application</h3>
              <ul className="sw-si-producers" data-testid="interop-producer-matrix">
                {PRODUCER_MATRIX.map((entry) => (
                  <li data-producer={entry.producer} data-state={entry.status} key={entry.producer}>
                    <div className="sw-si-producers__identity">
                      <strong>{entry.producer}</strong>
                      <span className="sw-si-producers__status" data-state={entry.status}>
                        {entry.status === "verified-live" ? "Verified here" : "Result unavailable"}
                      </span>
                    </div>
                    <details>
                      <summary>Scope, limitations, and technical evidence</summary>
                      <p>{entry.detail}</p>
                      {entry.evidence.startsWith("packages/") ? (
                        <a
                          href={`https://github.com/chh-ay/sheetwrite/blob/main/${entry.evidence}`}
                        >
                          Open checked evidence file
                        </a>
                      ) : (
                        <code>{entry.evidence}</code>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </section>

        <section aria-labelledby="warnings-summary" className="sw-si-section" id="warnings">
          <details className="sw-si-disclosure" data-testid="interop-warnings-disclosure">
            <summary id="warnings-summary">
              <span>Operation evidence</span>
              <strong>Structured fidelity warning log</strong>
              <small>The latest import or round-trip, with public warning codes</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="warnings-title">Fidelity warnings, not silent loss</h2>
              <p>
                Every import and export reports what it could not preserve as structured{" "}
                <code>XlsxWorkbookWarning</code> records — coded, per sheet, per cell.{" "}
                <a href="/docs/api/core/xlsx-workbook-warning/">Warning codes →</a>
              </p>
              <div className="sw-si-panel sw-si-warnings" data-testid="interop-warnings">
                {warningLog === null ? (
                  <p className="sw-si-empty">
                    No interchange operation has run yet. Run the round-trip or import a fixture —
                    warnings from that operation land here with their codes.
                  </p>
                ) : warningLog.warnings.length === 0 ? (
                  <p className="sw-si-empty" data-testid="interop-warnings-none">
                    {warningLog.operation}: no fidelity loss reported.
                  </p>
                ) : (
                  <>
                    <p className="sw-si-warnings__op">
                      {warningLog.operation}
                      <span className="sw-si-count">{warningLog.warnings.length}</span>
                    </p>
                    <ul>
                      {warningLog.warnings.map((warning) => (
                        <li
                          key={[
                            warning.code,
                            warning.message,
                            warning.sheet,
                            warning.cell,
                            warning.part,
                          ].join("-")}
                        >
                          <code className="sw-si-warncode">{warning.code}</code>
                          <span>
                            {warning.message}
                            {warning.sheet
                              ? ` (sheet ${warning.sheet}${warning.cell ? `!${warning.cell}` : ""})`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </details>
        </section>

        <section aria-labelledby="delimited-summary" className="sw-si-section" id="delimited">
          <details className="sw-si-disclosure" data-testid="interop-delimited-disclosure">
            <summary id="delimited-summary">
              <span>Delimited-text lab</span>
              <strong>CSV / TSV export, injection proof, and paste import</strong>
              <small>Lossy interchange is explicit and isolated from the workbook path</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="delimited-title">CSV and TSV, hardened</h2>
              <p>
                Delimited exports neutralize formula-injection payloads before a cell ever reaches a
                spreadsheet that would execute them.
              </p>
              <div className="sw-si-panel">
                <div className="sw-si-panel__head">
                  <h3>Export the live document</h3>
                  <p>
                    Row OP-1045 stores <code>{INTEROP_INJECTION_TEXT}</code> as text — export the
                    sheet and inspect what the CSV emits.
                  </p>
                </div>
                <div aria-label="Delimited text actions" className="sw-si-actions" role="toolbar">
                  <button
                    className="sw-si-btn sw-si-btn--primary"
                    data-testid="interop-csv-export"
                    onClick={handleCsvExport}
                    type="button"
                  >
                    Export active sheet as CSV
                  </button>
                  <button
                    className="sw-si-btn sw-si-btn--secondary"
                    data-testid="interop-csv-download"
                    onClick={handleCsvDownload}
                    type="button"
                  >
                    Download .csv
                  </button>
                  <button
                    className="sw-si-btn sw-si-btn--secondary"
                    data-testid="interop-tsv-export"
                    onClick={handleTsvExport}
                    type="button"
                  >
                    Export selection as TSV
                  </button>
                </div>
                {csvPreview !== null && (
                  <>
                    {injectionCsvLine && (
                      <p className="sw-si-injection" data-testid="interop-injection-proof">
                        Injection cell as exported: <code>{injectionCsvLine}</code>
                      </p>
                    )}
                    <label className="sw-si-preview">
                      CSV output (first 2,000 characters)
                      <textarea
                        data-testid="interop-csv-output"
                        readOnly
                        rows={7}
                        value={csvPreview.slice(0, 2000)}
                      />
                    </label>
                  </>
                )}
                {tsvPreview !== null && (
                  <label className="sw-si-preview">
                    Selection as TSV
                    <textarea
                      data-testid="interop-tsv-output"
                      readOnly
                      rows={4}
                      value={tsvPreview}
                    />
                  </label>
                )}
                <p className="sw-si-note">
                  Delimited text is intentionally lossier: formulas leave as their computed values,
                  and styles and merges do not exist in CSV/TSV at all.
                </p>
              </div>
              <div className="sw-si-panel">
                <div className="sw-si-panel__head">
                  <h3>Import pasted CSV</h3>
                </div>
                <label className="sw-si-preview">
                  Paste CSV (header row first)
                  <textarea
                    data-testid="interop-csv-input"
                    onChange={(event) => setPasteText(event.currentTarget.value)}
                    placeholder={"region,units,revenue\neu-west,12,3400\nus-east,7,2050"}
                    rows={5}
                    value={pasteText}
                  />
                </label>
                <div className="sw-si-actions">
                  <button
                    className="sw-si-btn sw-si-btn--primary"
                    data-testid="interop-csv-import"
                    onClick={handlePasteImport}
                    type="button"
                  >
                    Import CSV into workbench
                  </button>
                </div>
                {pasteError && (
                  <p className="sw-si-error" data-testid="interop-csv-error" role="alert">
                    {pasteError}
                  </p>
                )}
              </div>
            </div>
          </details>
        </section>

        <section aria-labelledby="limits-summary" className="sw-si-section" id="limits">
          <details className="sw-si-disclosure" data-testid="interop-limits-disclosure">
            <summary id="limits-summary">
              <span>Security lab</span>
              <strong>Hostile packages, aborts, and resource ceilings</strong>
              <small>Five hand-authored attack packages with typed rejection evidence</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="limits-title">Resource limits and hostile input</h2>
              <p>
                Ceilings are enforced before anything allocates, and hand-authored hostile
                OPC/SpreadsheetML packages are rejected with typed errors.{" "}
                <a href="/docs/api/core/xlsx-resource-limits/">Resource limits →</a>
              </p>
              <ul aria-label="Enforced import ceilings" className="sw-si-facts">
                <li>byte ceiling</li>
                <li>entry ceiling</li>
                <li>dimension ceiling</li>
                <li>compression-ratio ceiling</li>
                <li>cell ceiling</li>
                <li>AbortSignal honored</li>
              </ul>
              <div className="sw-si-panel">
                <div className="sw-si-actions">
                  <button
                    className="sw-si-btn sw-si-btn--danger"
                    data-testid="interop-hostile-run"
                    onClick={handleHostileRun}
                    type="button"
                  >
                    Run all 5 hostile packages
                  </button>
                  <button
                    className="sw-si-btn sw-si-btn--secondary"
                    data-testid="interop-abort-demo"
                    onClick={handleAbortDemo}
                    type="button"
                  >
                    Import with aborted signal
                  </button>
                  <button
                    className="sw-si-btn sw-si-btn--secondary"
                    data-testid="interop-cellcap-demo"
                    onClick={handleCellCapDemo}
                    type="button"
                  >
                    Import with maxCells: 8
                  </button>
                  <button
                    className="sw-si-btn sw-si-btn--secondary"
                    data-testid="interop-csvcap-demo"
                    onClick={() => setCsvCapReport(delimitedCeilingDemo())}
                    type="button"
                  >
                    Parse CSV over the cell ceiling
                  </button>
                </div>
                <div className="sw-si-tablewrap">
                  <table className="sw-si-matrix sw-si-hostile" data-testid="interop-hostile-table">
                    <caption>
                      Hand-authored attack packages with recorded file hashes and the live verdict.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Package</th>
                        <th scope="col">Attack</th>
                        <th scope="col">Live verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ADVERSARIAL_FIXTURES.map((fixture) => {
                        const report = rejections[fixture.id];
                        return (
                          <tr
                            data-state={
                              report ? (report.rejected ? "rejected" : "accepted") : "pending"
                            }
                            data-testid={`hostile-${fixture.id}`}
                            key={fixture.id}
                          >
                            <th scope="row">
                              <code>{fixture.file}</code>
                            </th>
                            <td>{fixture.details.join("; ")}</td>
                            <td>
                              {report === undefined ? (
                                "not run yet"
                              ) : report.rejected ? (
                                <>
                                  <span className="sw-si-verdict" data-state="rejected">
                                    rejected — {report.errorName}
                                  </span>
                                  <p className="sw-si-errdetail">{report.message}</p>
                                </>
                              ) : (
                                <span className="sw-si-verdict" data-state="accepted">
                                  NOT REJECTED — this is a bug
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <dl className="sw-si-report">
                  {abortReport && (
                    <div
                      data-state={abortReport.rejected ? "pass" : "fail"}
                      data-testid="interop-abort-report"
                    >
                      <dt>Aborted signal</dt>
                      <dd>
                        {abortReport.rejected
                          ? `${abortReport.errorName}: ${abortReport.message}`
                          : "import unexpectedly completed"}
                      </dd>
                    </div>
                  )}
                  {cellCapReport && (
                    <div
                      data-state={cellCapReport.rejected ? "pass" : "fail"}
                      data-testid="interop-cellcap-report"
                    >
                      <dt>maxCells: 8</dt>
                      <dd>
                        {cellCapReport.rejected
                          ? `${cellCapReport.errorName}: ${cellCapReport.message}`
                          : "import unexpectedly completed"}
                      </dd>
                    </div>
                  )}
                  {csvCapReport && (
                    <div
                      data-state={csvCapReport.rejected ? "pass" : "fail"}
                      data-testid="interop-csvcap-report"
                    >
                      <dt>Delimited-text cell ceiling</dt>
                      <dd>
                        {csvCapReport.rejected
                          ? `${csvCapReport.errorName}: ${csvCapReport.message}`
                          : "parse unexpectedly completed"}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </details>
        </section>

        <section aria-labelledby="isolation-summary" className="sw-si-section" id="isolation">
          <details className="sw-si-disclosure" data-testid="interop-isolation-disclosure">
            <summary id="isolation-summary">
              <span>Runtime boundary</span>
              <strong>Optional XLSX package registration</strong>
              <small>The pre-registration typed error and lazy codec handoff</small>
            </summary>
            <div className="sw-si-disclosure__body">
              <h2 id="isolation-title">The XLSX codec is an optional package</h2>
              <p>
                <code>@sheetwrite/core</code> ships no XLSX implementation — workbook interchange
                throws a typed error until a host registers a backend. This page loads{" "}
                <code>@sheetwrite/xlsx/register</code> lazily on the first XLSX action; CSV/TSV
                interchange needs no optional package at all.
              </p>
              <div
                className="sw-si-panel sw-si-isolation"
                data-state={
                  probe === null ? "pending" : probe.registered ? "registered" : "isolated"
                }
                data-testid="interop-isolation"
              >
                {probe === null ? (
                  <p className="sw-si-empty">Probing registration state…</p>
                ) : probe.registered ? (
                  <>
                    <div className="sw-si-isolation__status">
                      <span className="sw-si-verdict" data-state="verified-suite">
                        backend already registered
                      </span>
                      <strong>Registration probe</strong>
                    </div>
                    <div
                      className="sw-si-isolation__result"
                      data-testid="interop-isolation-registered"
                    >
                      <p>
                        A workbook backend was already registered when this page probed. This can
                        happen after another page loads the codec in the same session.
                      </p>
                      <p>Reload this URL directly to observe the unregistered typed error.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sw-si-isolation__status">
                      <span className="sw-si-verdict" data-state="rejected">
                        unregistered at probe
                      </span>
                      <strong>Registration probe</strong>
                    </div>
                    <div className="sw-si-isolation__result" data-testid="interop-isolation-error">
                      <p>
                        Core correctly refused workbook interchange before an XLSX backend was
                        registered. The first XLSX action will load the optional package lazily.
                      </p>
                      <div className="sw-si-isolation__exact">
                        <span>Exact core error</span>
                        <code>{probe.error}</code>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
