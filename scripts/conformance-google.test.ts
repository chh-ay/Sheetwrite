import { describe, expect, it } from "bun:test";
import {
  type CaptureArtifact,
  type ConformanceCorpus,
  type GoogleCaptureDependencies,
  MAX_GOOGLE_CASES_PER_WORKBOOK,
  captureGoogleWithDependencies,
  loadCorpus,
  validateGoogleCaptureArtifact,
} from "./conformance.js";

interface MockGoogle {
  dependencies: GoogleCaptureDependencies;
  calls: string[];
  artifact: () => CaptureArtifact;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockGoogle(
  options: { reorderBatch?: number; failReadBatch?: number; gridValues?: unknown[][] } = {},
): MockGoogle {
  const calls: string[] = [];
  const batchSizes = new Map<string, number>();
  let createIndex = 0;
  let captured: CaptureArtifact | undefined;
  const dependencies: GoogleCaptureDependencies = {
    producerVersion: "sheets-api-v4-2026-07-22",
    now: () => new Date("2026-07-22T12:00:00.000Z"),
    persist: async (artifact) => {
      captured = structuredClone(artifact);
      calls.push("persist");
      return "memory://google-capture";
    },
    request: async (url, init = {}) => {
      if (url === "https://sheets.googleapis.com/v4/spreadsheets") {
        const id = `batch-${createIndex}`;
        const body = JSON.parse(String(init.body)) as { sheets: unknown[] };
        batchSizes.set(id, body.sheets.length);
        calls.push(`create:${createIndex}:${body.sheets.length}`);
        createIndex += 1;
        return jsonResponse({
          spreadsheetId: id,
          properties: { locale: "en_US", timeZone: "UTC" },
        });
      }
      const match = /spreadsheets\/(batch-(\d+))/.exec(url);
      if (match && url.includes("values:batchUpdate")) {
        calls.push(`update:${match[2]}`);
        return jsonResponse({});
      }
      if (match && url.includes("includeGridData=true")) {
        const batchIndex = Number(match[2]);
        calls.push(`read:${batchIndex}`);
        if (options.failReadBatch === batchIndex) throw new Error(`read failure ${batchIndex}`);
        const size = batchSizes.get(match[1]!)!;
        const values = options.gridValues ?? [[true]];
        const rowData = values.map((row) => ({
          values: row.map((value) => ({
            effectiveValue:
              typeof value === "number"
                ? { numberValue: value }
                : typeof value === "boolean"
                  ? { boolValue: value }
                  : { stringValue: String(value) },
            formattedValue: String(value),
          })),
        }));
        const sheets = Array.from({ length: size }, (_, index) => ({
          properties: { title: `Case${String(index + 1).padStart(4, "0")}` },
          data: [{ rowData }],
        }));
        if (options.reorderBatch === batchIndex) sheets.reverse();
        return jsonResponse({ sheets });
      }
      const driveMatch = /files\/(batch-(\d+))/.exec(url);
      if (driveMatch && url.includes("/export?")) {
        calls.push(`export:${driveMatch[2]}`);
        return new Response(new Uint8Array([80, 75, Number(driveMatch[2])]), { status: 200 });
      }
      if (driveMatch && init.method === "DELETE") {
        calls.push(`delete:${driveMatch[2]}`);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected Google request: ${init.method ?? "GET"} ${url}`);
    },
  };
  return {
    dependencies,
    calls,
    artifact: () => {
      if (!captured) throw new Error("capture was not persisted");
      return captured;
    },
  };
}

async function formulaCorpus(count: number): Promise<ConformanceCorpus> {
  const corpus = await loadCorpus();
  return {
    ...corpus,
    cases: corpus.cases
      .filter((entry) => entry.kind === "formula" && entry.expected.type === "boolean")
      .slice(0, count),
  };
}

async function arrayCorpus(): Promise<ConformanceCorpus> {
  const corpus = await formulaCorpus(1);
  const entry = structuredClone(corpus.cases[0]!);
  entry.id = "google.array-envelope";
  entry.formula = "=SEQUENCE(2,1)";
  entry.target = "A1";
  entry.inputs = [];
  entry.expected = { type: "array", value: [[1], [2]], rows: 2, columns: 1 };
  return { ...corpus, cases: [entry] };
}

describe("bounded Google Sheets capture", () => {
  it("partitions quota-bounded workbooks and preserves request and case ordering", async () => {
    const corpus = await formulaCorpus(MAX_GOOGLE_CASES_PER_WORKBOOK + 1);
    const mock = mockGoogle();
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).resolves.toBe(
      "memory://google-capture",
    );
    expect(mock.calls).toEqual([
      "create:0:50",
      "update:0",
      "read:0",
      "export:0",
      "delete:0",
      "create:1:1",
      "update:1",
      "read:1",
      "export:1",
      "delete:1",
      "persist",
    ]);
    const artifact = mock.artifact();
    expect(artifact.observations.map((entry) => entry.caseId)).toEqual(
      corpus.cases.map((entry) => entry.id),
    );
    expect(
      (artifact.workbooks as Array<{ caseCount: number }>).map((entry) => entry.caseCount),
    ).toEqual([50, 1]);
    expect(
      validateGoogleCaptureArtifact(artifact, corpus, mock.dependencies.producerVersion),
    ).toEqual([]);
  });

  it("deletes a temporary workbook when a batch read fails", async () => {
    const corpus = await formulaCorpus(2);
    const mock = mockGoogle({ failReadBatch: 0 });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "read failure 0",
    );
    expect(mock.calls).toEqual(["create:0:2", "update:0", "read:0", "delete:0"]);
  });

  it("rejects reordered producer sheets before persistence", async () => {
    const corpus = await formulaCorpus(2);
    const mock = mockGoogle({ reorderBatch: 0 });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "reordered result sheets",
    );
    expect(mock.calls.at(-1)).toBe("delete:0");
    expect(mock.calls).not.toContain("persist");
  });

  it("fails closed on observation, producer-version, quota, and workbook binding tamper", async () => {
    const corpus = await formulaCorpus(3);
    const mock = mockGoogle();
    await captureGoogleWithDependencies(corpus, mock.dependencies);
    const artifact = mock.artifact();

    const reordered = structuredClone(artifact);
    [reordered.observations[0], reordered.observations[1]] = [
      reordered.observations[1]!,
      reordered.observations[0]!,
    ];
    expect(
      validateGoogleCaptureArtifact(reordered, corpus, mock.dependencies.producerVersion).some(
        (issue) => issue.includes("reordered"),
      ),
    ).toBe(true);

    const tampered = structuredClone(artifact) as CaptureArtifact & {
      batchSize: number;
      workbooks: Array<{ workbookSha256: string }>;
    };
    tampered.batchSize += 1;
    tampered.workbooks[0]!.workbookSha256 = "0".repeat(64);
    expect(
      validateGoogleCaptureArtifact(tampered, corpus, "different-version").join("\n"),
    ).toContain("quota drift");
    expect(
      validateGoogleCaptureArtifact(tampered, corpus, "different-version").join("\n"),
    ).toContain("tampered workbook binding");
    expect(
      validateGoogleCaptureArtifact(tampered, corpus, "different-version").join("\n"),
    ).toContain("exact producer version");
  });
  it("rejects a spill larger than the expected envelope", async () => {
    const corpus = await arrayCorpus();
    const mock = mockGoogle({ gridValues: [[1], [2], [3]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "array result exceeds expected shape",
    );
    expect(mock.calls.at(-1)).toBe("delete:0");
  });

  it("rejects an occupied sentinel column at the array boundary", async () => {
    const corpus = await arrayCorpus();
    const mock = mockGoogle({ gridValues: [[1, "block"], [2]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "array result exceeds expected shape",
    );
    expect(mock.calls.at(-1)).toBe("delete:0");
  });

  it("rejects a result missing an expected nonblank boundary value", async () => {
    const corpus = await arrayCorpus();
    const mock = mockGoogle({ gridValues: [[1]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "array result is smaller than expected",
    );
    expect(mock.calls.at(-1)).toBe("delete:0");
  });

  it("accepts an omitted trailing blank inside the declared array shape", async () => {
    const corpus = await arrayCorpus();
    corpus.cases[0]!.expected = {
      type: "array",
      value: [[1], [null]],
      rows: 2,
      columns: 1,
    };
    const mock = mockGoogle({ gridValues: [[1]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).resolves.toBe(
      "memory://google-capture",
    );
    expect(mock.calls.at(-2)).toBe("delete:0");
    expect(mock.calls.at(-1)).toBe("persist");
  });
});
