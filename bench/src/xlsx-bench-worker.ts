import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkbookSnapshot, XlsxWorkbookBackend } from "@sheetwrite/core";
import { createXlsxCorpus, type XlsxCorpusMode, type XlsxCorpusScenario } from "./xlsx-corpus.js";

interface WorkerResult {
  readonly engine: "current" | "baseline";
  readonly operation: "import" | "export" | "reject";
  readonly scenario: string;
  readonly durationMs: number;
  readonly maxRssBytes: number;
  readonly rssBeforeBytes: number;
  readonly rssAfterBytes: number;
  readonly heapBeforeBytes: number;
  readonly heapAfterBytes: number;
  readonly arrayBuffersBeforeBytes: number;
  readonly arrayBuffersAfterBytes: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly checksum: string;
  readonly rejection?: string;
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}

function maximumRssBytes(): number {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(status);
    if (match) return Number(match[1]) * 1024;
  } catch {
    // Non-Linux toolchains fall back to the runtime's documented KiB value.
  }
  return process.resourceUsage().maxRSS * 1024;
}

function sha256(bytes: Uint8Array | string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

function snapshotSentinel(snapshot: WorkbookSnapshot): string {
  let populatedCells = 0;
  let styledCells = 0;
  let formulaCells = 0;
  let firstValue: unknown;
  let lastValue: unknown;
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        populatedCells++;
        if (cell.style) styledCells++;
        if (cell.value.kind === "formula") formulaCells++;
        const value =
          cell.value.kind === "literal"
            ? cell.value.value
            : cell.value.kind === "formula"
              ? cell.value.src
              : cell.value.target;
        if (firstValue === undefined) firstValue = value;
        lastValue = value;
      }
    }
  }
  return JSON.stringify({
    sheets: snapshot.sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rowCount,
      columns: sheet.columns.length,
      blocks: sheet.cells.length,
      merges: sheet.merges?.length ?? 0,
      notes: sheet.notes?.length ?? 0,
    })),
    populatedCells,
    styledCells,
    formulaCells,
    firstValue,
    lastValue,
  });
}

async function backend(engine: "current" | "baseline", root: string): Promise<XlsxWorkbookBackend> {
  const modulePath = resolve(root, "packages/xlsx/src/workbook.ts");
  // The root is selected at runtime so the same worker can load an independent detached baseline.
  const loaded = (await import(pathToFileURL(modulePath).href)) as {
    readonly sheetwriteWorkbookBackend?: XlsxWorkbookBackend;
    readonly excelJsWorkbookBackend?: XlsxWorkbookBackend;
  };
  const implementation =
    engine === "current" ? loaded.sheetwriteWorkbookBackend : loaded.excelJsWorkbookBackend;
  if (!implementation) throw new Error(`${engine} XLSX backend was not exported by ${modulePath}`);
  return implementation;
}

async function main(): Promise<WorkerResult> {
  const engine = argument("--engine") as "current" | "baseline";
  const operation = argument("--operation") as "import" | "export" | "reject";
  const scenario = argument("--scenario");
  const mode = argument("--mode") as XlsxCorpusMode;
  const root = argument("--root");
  const fixture = argument("--fixture");
  if (engine !== "current" && engine !== "baseline") throw new Error(`invalid engine ${engine}`);
  if (!(["import", "export", "reject"] as const).includes(operation)) {
    throw new Error(`invalid operation ${operation}`);
  }
  if (mode !== "smoke" && mode !== "full") throw new Error(`invalid mode ${mode}`);

  const implementation = await backend(engine, root);
  let inputBytes = 0;
  let input: Uint8Array | WorkbookSnapshot;
  if (operation === "export") {
    const corpus = createXlsxCorpus(mode);
    const snapshot = corpus.scenarios[scenario as XlsxCorpusScenario];
    if (!snapshot) throw new Error(`unknown export scenario ${scenario}`);
    input = snapshot;
    inputBytes = Buffer.byteLength(JSON.stringify(snapshot));
  } else {
    input = new Uint8Array(await Bun.file(fixture).arrayBuffer());
    inputBytes = input.byteLength;
  }

  Bun.gc(true);
  const before = process.memoryUsage();
  const started = performance.now();
  let ended = started;
  let outputBytes = 0;
  let checksum = "";
  let rejection: string | undefined;
  if (operation === "export") {
    const output = await implementation.toXlsxWorkbook(input as WorkbookSnapshot, {
      maxCells: 1_000_000,
    });
    ended = performance.now();
    outputBytes = output.byteLength;
    checksum = sha256(output);
  } else if (operation === "import") {
    const snapshot = await implementation.fromXlsxWorkbook(input as Uint8Array, {
      maxCells: 1_000_000,
    });
    ended = performance.now();
    const sentinel = snapshotSentinel(snapshot);
    outputBytes = Buffer.byteLength(sentinel);
    checksum = sha256(sentinel);
  } else {
    try {
      await implementation.fromXlsxWorkbook(input as Uint8Array, {
        maxCells: 1_000_000,
        resourceLimits: {
          maxCompressionRatio: scenario === "compression-ratio" ? 2 : 1_000,
          maxXmlDepth: scenario === "deep-xml" ? 8 : 256,
        },
      });
      throw new Error(`hostile fixture ${scenario} was accepted`);
    } catch (error) {
      ended = performance.now();
      const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
      rejection = message;
      if (message.includes("was accepted")) throw error;
      outputBytes = Buffer.byteLength(message);
      checksum = sha256(message);
    }
  }
  const durationMs = ended - started;
  const after = process.memoryUsage();
  return {
    engine,
    operation,
    scenario,
    durationMs,
    maxRssBytes: maximumRssBytes(),
    rssBeforeBytes: before.rss,
    rssAfterBytes: after.rss,
    heapBeforeBytes: before.heapUsed,
    heapAfterBytes: after.heapUsed,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterBytes: after.arrayBuffers,
    inputBytes,
    outputBytes,
    checksum,
    ...(rejection ? { rejection } : {}),
  };
}

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
}
