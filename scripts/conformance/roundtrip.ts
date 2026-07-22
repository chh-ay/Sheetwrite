import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { XlsxWorkbookWarning } from "../../packages/core/src/export.js";
import type { WorkbookSnapshot } from "../../packages/core/src/types/document.js";
import { sheetwriteWorkbookBackend } from "../../packages/xlsx/src/workbook.js";
import { canonicalJson } from "./normalize.js";

const MAX_ROUNDTRIP_BYTES = 16 * 1024 * 1024;
const ROUNDTRIP_OUTPUT = "test-results/conformance/libreoffice-workbook-roundtrips.json";
const LIBREOFFICE_FIXTURE = "packages/xlsx/test/fixtures/libreoffice-rich.xlsx";

export interface WorkbookRoundtripResaver {
  readonly producer: "libreoffice";
  readonly producerVersion: string;
  resave(bytes: Uint8Array, id: string): Promise<Uint8Array>;
}

export interface WorkbookRoundtripChain {
  readonly id: string;
  readonly direction: "sheetwrite-producer-sheetwrite" | "producer-sheetwrite-producer-sheetwrite";
  readonly inputSha256: string;
  readonly inputBytes: number;
  readonly producerSha256: string;
  readonly producerBytes: number;
  readonly importWarnings: readonly XlsxWorkbookWarning[];
  readonly differences: readonly string[];
  readonly status: "pass" | "divergent";
}

export interface WorkbookRoundtripArtifact {
  readonly protocol: 1;
  readonly producer: "libreoffice";
  readonly producerVersion: string;
  readonly capturedAt: string;
  readonly chains: readonly WorkbookRoundtripChain[];
  readonly blockedChains: readonly string[];
  readonly status: "pass" | "partial";
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bounded(bytes: Uint8Array, label: string): Uint8Array {
  if (bytes.byteLength > MAX_ROUNDTRIP_BYTES) {
    throw new Error(`${label} exceeds ${MAX_ROUNDTRIP_BYTES} bytes`);
  }
  return bytes;
}
function rangeKey(entry: {
  range: { sheet: string; start: { row: number; col: number }; end: { row: number; col: number } };
}): string {
  const { sheet, start, end } = entry.range;
  return `${sheet}:${start.row}:${start.col}:${end.row}:${end.col}:${JSON.stringify(entry)}`;
}

function sortedRanges<T extends Parameters<typeof rangeKey>[0]>(
  entries: readonly T[] | undefined,
): T[] | undefined {
  return entries
    ? [...entries].sort((left, right) => rangeKey(left).localeCompare(rangeKey(right)))
    : undefined;
}

/** Normalized semantic state compared independently from ZIP/XML byte identity. */
export function workbookFeatureState(snapshot: WorkbookSnapshot): unknown {
  return {
    schemaVersion: snapshot.schemaVersion,
    documentId: snapshot.documentId,
    version: snapshot.version,
    workbook: snapshot.workbook,
    sheets: [...snapshot.sheets]
      .sort((left, right) => left.order - right.order)
      .map((sheet) => {
        const { cells, ...metadata } = sheet;
        const columns = sheet.columns.map(({ visible, ...column }) =>
          visible === true ? column : { ...column, visible },
        );
        return {
          ...metadata,
          visibility: sheet.visibility ?? "visible",
          columns,
          tables: sortedRanges(sheet.tables),
          hyperlinks: sortedRanges(sheet.hyperlinks),
          conditionalFormats: sortedRanges(sheet.conditionalFormats),
          cells: cells
            .flatMap((block) =>
              block.cells.map((cell) => ({
                row: block.startRow + cell.rowOffset,
                col: block.startCol + cell.colOffset,
                value: cell.value,
                ...(cell.style === undefined ? {} : { style: cell.style }),
              })),
            )
            .sort((left, right) => left.row - right.row || left.col - right.col),
        };
      }),
  };
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = normalized(entry);
    }
    return result;
  }
  return value;
}

export function structuralDifferences(expected: unknown, actual: unknown): string[] {
  const differences: string[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (differences.length >= 256) return;
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length)
        differences.push(`${path}.length: ${left.length} != ${right.length}`);
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        visit(left[index], right[index], `${path}[${index}]`);
      }
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
      for (const key of keys) visit(leftRecord[key], rightRecord[key], `${path}.${key}`);
      return;
    }
    differences.push(`${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
  };
  visit(normalized(expected), normalized(actual), "$workbook");
  return differences;
}

function sheetwriteWorkbook(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "amount", header: "Amount", width: 100, type: "number" },
          { key: "result", header: "Result", width: 140, type: "text" },
        ],
        tables: [
          {
            id: "sales-table",
            name: "Sales",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } },
            columns: [{ id: "amount-column", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
        hyperlinks: [
          {
            id: "report-link",
            range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
            target: { kind: "external", url: "https://example.com/report" },
            display: "Report",
            style: { color: "#123456", underline: true },
          },
          {
            id: "summary-link",
            range: { sheet: "data", start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
            target: {
              kind: "internal",
              range: {
                sheet: "summary",
                start: { row: 0, col: 0 },
                end: { row: 0, col: 0 },
              },
            },
            display: "Summary",
          },
        ],
        conditionalFormats: [
          {
            range: { sheet: "data", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
            when: { kind: "formula", source: '=A1<>""' },
            style: { backgroundColor: "#ABCDEF", bold: true },
            stopIfTrue: true,
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Amount" } },
              {
                rowOffset: 0,
                colOffset: 1,
                value: { kind: "formula", src: "=SUM(Sales[Amount])" },
              },
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 10 } },
              { rowOffset: 1, colOffset: 1, value: { kind: "literal", value: "Summary" } },
              { rowOffset: 2, colOffset: 0, value: { kind: "literal", value: 20 } },
              { rowOffset: 3, colOffset: 0, value: { kind: "literal", value: "Total" } },
            ],
          },
        ],
      },
      {
        id: "summary",
        name: "Summary",
        order: 1,
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 120, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "formula", src: "=SUM(Sales[Amount])" },
              },
            ],
          },
        ],
      },
    ],
  };
}

async function importWorkbook(bytes: Uint8Array): Promise<{
  snapshot: WorkbookSnapshot;
  warnings: XlsxWorkbookWarning[];
}> {
  const warnings: XlsxWorkbookWarning[] = [];
  const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
    onWarning: (warning) => warnings.push(warning),
  });
  return { snapshot, warnings };
}

async function chain(
  id: string,
  direction: WorkbookRoundtripChain["direction"],
  input: Uint8Array,
  expected: WorkbookSnapshot,
  resaver: WorkbookRoundtripResaver,
  initialWarnings: readonly XlsxWorkbookWarning[] = [],
): Promise<WorkbookRoundtripChain> {
  const producerBytes = bounded(await resaver.resave(input, id), `${id} producer output`);
  const imported = await importWorkbook(producerBytes);
  const differences = structuralDifferences(
    workbookFeatureState(expected),
    workbookFeatureState(imported.snapshot),
  );
  return {
    id,
    direction,
    inputSha256: sha256(input),
    inputBytes: input.byteLength,
    producerSha256: sha256(producerBytes),
    producerBytes: producerBytes.byteLength,
    importWarnings: [...initialWarnings, ...imported.warnings],
    differences,
    status: differences.length === 0 ? "pass" : "divergent",
  };
}

export async function runWorkbookRoundtrips(
  resaver: WorkbookRoundtripResaver,
  options: { capturedAt?: Date; libreOfficeFixture?: Uint8Array } = {},
): Promise<WorkbookRoundtripArtifact> {
  const source = sheetwriteWorkbook();
  const sourceBytes = bounded(
    await sheetwriteWorkbookBackend.toXlsxWorkbook(source),
    "Sheetwrite workbook",
  );
  const sourceImport = await importWorkbook(sourceBytes);
  const first = await chain(
    "sheetwrite-libreoffice-sheetwrite",
    "sheetwrite-producer-sheetwrite",
    sourceBytes,
    sourceImport.snapshot,
    resaver,
    sourceImport.warnings,
  );

  const fixtureBytes = bounded(
    options.libreOfficeFixture ?? new Uint8Array(await readFile(LIBREOFFICE_FIXTURE)),
    "LibreOffice fixture",
  );
  const fixtureImport = await importWorkbook(fixtureBytes);
  const sheetwriteBytes = bounded(
    await sheetwriteWorkbookBackend.toXlsxWorkbook(fixtureImport.snapshot),
    "Sheetwrite re-export",
  );
  const second = await chain(
    "libreoffice-sheetwrite-libreoffice-sheetwrite",
    "producer-sheetwrite-producer-sheetwrite",
    sheetwriteBytes,
    fixtureImport.snapshot,
    resaver,
    fixtureImport.warnings,
  );
  const chains = [first, second];
  return {
    protocol: 1,
    producer: "libreoffice",
    producerVersion: resaver.producerVersion,
    capturedAt: (options.capturedAt ?? new Date()).toISOString(),
    chains,
    blockedChains: [
      "Excel producer chains require an authenticated current Excel runner",
      "Google Sheets workbook chains require authenticated Drive/Sheets access",
      "Excel-to-Google and Google-to-Excel chains require both authenticated producers",
    ],
    status: chains.every((entry) => entry.status === "pass") ? "pass" : "partial",
  };
}

async function runProcess(command: readonly string[]): Promise<string> {
  const process = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => process.kill(), 120_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => clearTimeout(timer));
  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited ${exitCode}: ${(stderr || stdout).trim()}`);
  }
  return stdout.trim();
}

export async function createLibreOfficeResaver(): Promise<
  WorkbookRoundtripResaver & { dispose(): Promise<void> }
> {
  const version = await runProcess(["libreoffice", "--version"]);
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-libreoffice-roundtrip-"));
  const profile = join(root, "profile");
  await mkdir(profile, { recursive: true });
  return {
    producer: "libreoffice",
    producerVersion: version.replace(/^LibreOffice\s+/i, ""),
    async resave(bytes, id) {
      bounded(bytes, `${id} input`);
      const inputDirectory = join(root, `${id}-input`);
      const outputDirectory = join(root, `${id}-output`);
      await Promise.all([
        mkdir(inputDirectory, { recursive: true }),
        mkdir(outputDirectory, { recursive: true }),
      ]);
      const inputPath = join(inputDirectory, `${id}.xlsx`);
      await writeFile(inputPath, bytes);
      await runProcess([
        "libreoffice",
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--convert-to",
        "xlsx",
        "--outdir",
        outputDirectory,
        inputPath,
      ]);
      const outputPath = join(outputDirectory, basename(inputPath));
      const metadata = await stat(outputPath);
      if (metadata.size > MAX_ROUNDTRIP_BYTES) {
        throw new Error(`${id} producer output exceeds ${MAX_ROUNDTRIP_BYTES} bytes`);
      }
      return new Uint8Array(await readFile(outputPath));
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function captureLibreOfficeWorkbookRoundtrips(
  outputPath = ROUNDTRIP_OUTPUT,
): Promise<WorkbookRoundtripArtifact> {
  const resaver = await createLibreOfficeResaver();
  try {
    const artifact = await runWorkbookRoundtrips(resaver);
    const destination = resolve(outputPath);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, `${canonicalJson(artifact)}\n`);
    return artifact;
  } finally {
    await resaver.dispose();
  }
}
