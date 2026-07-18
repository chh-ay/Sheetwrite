import type {
  Column,
  ColumnarData,
  Grid,
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
import { pageMeta } from "../lib/seo.js";
import { SHOWCASE_THEME } from "../showcases/revenue.js";
import {
  ADVERSARIAL_FIXTURES,
  abortedImport,
  createInteropSnapshot,
  csvOfActiveSheet,
  delimitedCeilingDemo,
  expectRejection,
  exportWorkbook,
  fetchFixtureBytes,
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
  "Executable spreadsheet interoperability proof: XLSX round-trips, committed independent fixtures, CSV/TSV, structured fidelity warnings, resource limits, and the optional package boundary — all running the real published APIs in your browser.";

export const Route = createFileRoute("/showcases/interoperability")({
  head: () => ({
    meta: pageMeta("Spreadsheet interoperability — Sheetwrite showcases", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: InteroperabilityRoute,
});

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SECTIONS = [
  { id: "xlsx", label: "XLSX round-trip" },
  { id: "fixtures", label: "Independent fixtures" },
  { id: "warnings", label: "Fidelity warnings" },
  { id: "delimited", label: "CSV / TSV" },
  { id: "limits", label: "Limits & hostile input" },
  { id: "isolation", label: "Package boundary" },
] as const;

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

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
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

    void initSheetwrite().then(() => {
      if (disposed) return;
      // The registration probe must observe the page BEFORE this route ever
      // touches the optional XLSX package, so it runs exactly once, here.
      if (!probedRef.current) {
        probedRef.current = true;
        setProbe(probeXlsxRegistration());
      }
      const base = { theme: SHOWCASE_THEME, config: { toolbar: false } };
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
      setGridReady(true);
      setStatus(`Loaded: ${source.label}. Edit any cell, then export below.`);
    });

    return () => {
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

  // Prove fixture provenance in-browser: hash committed bytes, compare to the manifest.
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

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setStatus(`Importing ${file.name}…`);
    try {
      const outcome = await importWorkbook(await file.arrayBuffer());
      setWarningLog({ operation: `Import of ${file.name}`, warnings: outcome.warnings });
      setRoundTrip(null);
      setSource({ kind: "snapshot", label: file.name, snapshot: outcome.snapshot });
    } catch (error) {
      setStatus(`Import rejected — ${describeError(error)}`);
    }
  };

  const handleFixtureLoad = async (fixture: InteropFixture) => {
    setStatus(`Importing committed fixture ${fixture.file}…`);
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
    } catch (error) {
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
          : "Selection exported as clipboard-dialect TSV.",
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

  return (
    <div className="sw-si-frame">
      <SiteTopbar />
      <main className="sw-si-page">
        <header className="sw-si-hero">
          <p className="sw-si-eyebrow">SHOWCASE / SPREADSHEET INTEROPERABILITY</p>
          <h1>Interchange you can execute, not marketing you must trust.</h1>
          <p className="sw-si-lede">
            Everything on this page runs the published <code>@sheetwrite/core</code> interchange API
            and the optional <code>@sheetwrite/xlsx</code> codec against committed, independently
            produced fixture bytes — checksums verified in your browser. Where a producer has no
            genuine bytes in the corpus, this page says “unverified” instead of guessing.
          </p>
          <nav aria-label="Page sections" className="sw-si-sectionnav">
            {SECTIONS.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.label}
              </a>
            ))}
          </nav>
        </header>

        <p aria-live="polite" className="sw-si-status" data-testid="interop-status" role="status">
          {status}
        </p>

        <section aria-labelledby="xlsx-title" className="sw-si-section" id="xlsx">
          <h2 id="xlsx-title">XLSX round-trip workbench</h2>
          <p>
            A live multi-sheet document: per-row and cross-sheet formulas, currency formats, a
            merged footer, and a frozen header row. Edit any cell (formula bar included), then
            download it, re-import it, or prove the round-trip in place.
          </p>
          <div className="sw-si-workbench" data-ready={gridReady || undefined}>
            <p className="sw-si-workbench__label" data-testid="interop-source">
              Document: {source.label}
            </p>
            {/* shell.css sizes .sheetwrite-shell at height:100% (unlayered),
                so the definite height lives on this owned wrapper. */}
            <div className="sw-si-stage">
              <div className="sheetwrite-shell">
                <div
                  className="sheetwrite-shell-row sheetwrite-shell-formula-row"
                  ref={formulaRowRef}
                />
                <div className="sheetwrite-shell-grid sw-si-grid" ref={hostRef} />
                <div
                  className="sheetwrite-shell-row sheetwrite-shell-bottom-row"
                  ref={statusRowRef}
                />
              </div>
            </div>
            <div className="sw-si-actions" role="toolbar" aria-label="Workbook interchange actions">
              <button data-testid="interop-download" onClick={handleDownload} type="button">
                Download .xlsx
              </button>
              <button data-testid="interop-roundtrip" onClick={handleRoundTrip} type="button">
                Export → re-import proof
              </button>
              <label className="sw-si-file">
                Import your .xlsx
                <input
                  accept=".xlsx"
                  data-testid="interop-file-input"
                  onChange={(event) => void handleFile(event.currentTarget.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <button
                data-testid="interop-reset"
                onClick={() => {
                  setRoundTrip(null);
                  setWarningLog(null);
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

        <section aria-labelledby="fixtures-title" className="sw-si-section" id="fixtures">
          <h2 id="fixtures-title">Committed independent fixtures</h2>
          <p>
            These bytes were produced by other software, committed to the repository with full
            provenance (<code>packages/xlsx/test/fixtures/manifest.json</code>), and are hashed in
            your browser before use. Load any of them into the workbench above.
          </p>
          <ul className="sw-si-fixtures">
            {POSITIVE_FIXTURES.map((fixture) => (
              <li className="sw-si-fixture" key={fixture.id}>
                <div className="sw-si-fixture__head">
                  <strong>{fixture.file}</strong>
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
                <p className="sw-si-fixture__producer">Produced by {fixture.producer}</p>
                <p className="sw-si-fixture__sha">
                  <code>{fixture.sha256.slice(0, 16)}…</code>
                </p>
                <ul className="sw-si-chips" aria-label={`Features covered by ${fixture.file}`}>
                  {fixture.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                {fixture.expectedWarnings.length > 0 && (
                  <p className="sw-si-fixture__warn">
                    Manifest-documented warning: {fixture.expectedWarnings.join("; ")}
                  </p>
                )}
                <button
                  data-testid={`fixture-${fixture.id}-load`}
                  disabled={digests[fixture.id]?.state !== "verified"}
                  onClick={() => void handleFixtureLoad(fixture)}
                  type="button"
                >
                  Load in workbench
                </button>
              </li>
            ))}
          </ul>
          <h3>Producer verification status</h3>
          <table className="sw-si-matrix" data-testid="interop-producer-matrix">
            <caption>
              Compatibility claims and the evidence behind each one. No bytes, no claim.
            </caption>
            <thead>
              <tr>
                <th scope="col">Producer</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCER_MATRIX.map((entry) => (
                <tr data-state={entry.status} key={entry.producer}>
                  <th scope="row">{entry.producer}</th>
                  <td>
                    <span className="sw-si-verdict" data-state={entry.status}>
                      {entry.status === "verified-live"
                        ? "Verified live on this page"
                        : entry.status === "verified-suite"
                          ? "Verified in the conformance suite"
                          : "Unverified"}
                    </span>
                    <p>{entry.detail}</p>
                  </td>
                  <td>
                    <code>{entry.evidence}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="warnings-title" className="sw-si-section" id="warnings">
          <h2 id="warnings-title">Fidelity warnings, not silent loss</h2>
          <p>
            Every import and export reports exactly what it could not preserve through structured
            <code> XlsxWorkbookWarning </code> records — coded, per sheet, per cell. The CSV/TSV
            path is intentionally lossier: formulas leave as their computed values, and styles and
            merges do not exist in delimited text at all.
          </p>
          <div className="sw-si-warnings" data-testid="interop-warnings">
            {warningLog === null ? (
              <p className="sw-si-empty">
                No interchange operation has run yet. Run the round-trip proof or import a fixture —
                warnings from that operation land here with their codes.
              </p>
            ) : warningLog.warnings.length === 0 ? (
              <p className="sw-si-empty" data-testid="interop-warnings-none">
                {warningLog.operation}: no fidelity loss reported.
              </p>
            ) : (
              <>
                <p>{warningLog.operation} reported:</p>
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
                      <code className="sw-si-warncode">{warning.code}</code> {warning.message}
                      {warning.sheet
                        ? ` (sheet ${warning.sheet}${warning.cell ? `!${warning.cell}` : ""})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="delimited-title" className="sw-si-section" id="delimited">
          <h2 id="delimited-title">CSV and TSV, hardened</h2>
          <p>
            Delimited exports neutralize formula-injection payloads before a cell ever reaches a
            spreadsheet that would execute it. Row OP-1045 of the canonical document literally
            contains <code>{INTEROP_INJECTION_TEXT}</code> as text — watch what the CSV emits.
          </p>
          <div className="sw-si-actions" role="toolbar" aria-label="Delimited text actions">
            <button data-testid="interop-csv-export" onClick={handleCsvExport} type="button">
              Export active sheet as CSV
            </button>
            <button data-testid="interop-csv-download" onClick={handleCsvDownload} type="button">
              Download .csv
            </button>
            <button data-testid="interop-tsv-export" onClick={handleTsvExport} type="button">
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
              <textarea data-testid="interop-tsv-output" readOnly rows={4} value={tsvPreview} />
            </label>
          )}
          <h3>Import pasted CSV</h3>
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
            <button data-testid="interop-csv-import" onClick={handlePasteImport} type="button">
              Import CSV into workbench
            </button>
          </div>
          {pasteError && (
            <p className="sw-si-error" data-testid="interop-csv-error" role="alert">
              {pasteError}
            </p>
          )}
        </section>

        <section aria-labelledby="limits-title" className="sw-si-section" id="limits">
          <h2 id="limits-title">Resource limits and hostile input</h2>
          <p>
            The codec enforces byte, entry, dimension, compression-ratio, and cell ceilings before
            allocating, honors <code>AbortSignal</code>, and rejects hand-authored hostile
            OPC/SpreadsheetML packages with typed errors. Run all of it here.
          </p>
          <div className="sw-si-actions">
            <button data-testid="interop-hostile-run" onClick={handleHostileRun} type="button">
              Run all 5 hostile packages
            </button>
            <button data-testid="interop-abort-demo" onClick={handleAbortDemo} type="button">
              Import with aborted signal
            </button>
            <button data-testid="interop-cellcap-demo" onClick={handleCellCapDemo} type="button">
              Import with maxCells: 8
            </button>
            <button
              data-testid="interop-csvcap-demo"
              onClick={() => setCsvCapReport(delimitedCeilingDemo())}
              type="button"
            >
              Parse CSV over the cell ceiling
            </button>
          </div>
          <table className="sw-si-matrix sw-si-hostile" data-testid="interop-hostile-table">
            <caption>
              Hand-authored attack packages (committed, checksum-pinned) and the live verdict.
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
                    data-state={report ? (report.rejected ? "rejected" : "accepted") : "pending"}
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
          <dl className="sw-si-report">
            {abortReport && (
              <div
                data-testid="interop-abort-report"
                data-state={abortReport.rejected ? "pass" : "fail"}
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
                data-testid="interop-cellcap-report"
                data-state={cellCapReport.rejected ? "pass" : "fail"}
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
                data-testid="interop-csvcap-report"
                data-state={csvCapReport.rejected ? "pass" : "fail"}
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
        </section>

        <section aria-labelledby="isolation-title" className="sw-si-section" id="isolation">
          <h2 id="isolation-title">The XLSX codec is an optional package</h2>
          <p>
            <code>@sheetwrite/core</code> ships no XLSX implementation. Workbook interchange
            functions throw a typed error until a host registers a backend — this page loads
            <code> @sheetwrite/xlsx/register </code> lazily, the first time you run an XLSX action.
            CSV/TSV interchange above needs no optional package at all.
          </p>
          <div className="sw-si-isolation" data-testid="interop-isolation">
            {probe === null ? (
              <p className="sw-si-empty">Probing registration state…</p>
            ) : probe.registered ? (
              <p data-testid="interop-isolation-registered">
                A workbook backend was already registered when this page probed — you navigated here
                after another page loaded the codec in this session. Reload this URL directly to
                observe the unregistered error.
              </p>
            ) : (
              <p data-testid="interop-isolation-error">
                Probed before registration, core threw:{" "}
                <code className="sw-si-errdetail">{probe.error}</code>
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
