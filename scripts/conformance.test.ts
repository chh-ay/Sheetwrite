import { describe, expect, it } from "bun:test";
import {
  type ConformanceCorpus,
  type ConformanceResult,
  canonicalJson,
  compareResults,
  loadCorpus,
  runOffline,
  sha256,
  validateCorpus,
  validateExcelCapture,
} from "./conformance.js";

function clone(corpus: ConformanceCorpus): ConformanceCorpus {
  return structuredClone(corpus);
}

function hasIssue(issues: readonly string[], text: string): boolean {
  return issues.some((issue) => issue.includes(text));
}

describe("neutral conformance corpus", () => {
  it("validates the checked-in schema contract and stable IDs", async () => {
    const corpus = await loadCorpus();
    expect(corpus.protocol).toBe(1);
    expect(corpus.cases.map((entry) => entry.id)).toEqual([
      "canary.arithmetic.1-plus-1",
      "canary.date.serial-60",
      "canary.if.lazy-error-branch",
      "canary.criteria.wildcard",
      "canary.lookup.not-found",
      "canary.spill.obstruction",
      "canary.workbook.roundtrip",
    ]);
    expect(validateCorpus(corpus)).toEqual([]);
  });

  it("rejects absent legal provenance and mutable unpinned sources", async () => {
    const corpus = await loadCorpus();
    const missingLicense = clone(corpus);
    missingLicense.cases[0]!.source.license = "";
    expect(hasIssue(validateCorpus(missingLicense), "source.license")).toBe(true);

    const mutableUrl = clone(corpus);
    mutableUrl.cases[0]!.source.url = "https://example.test/current-spec";
    expect(hasIssue(validateCorpus(mutableUrl), "source.sha256")).toBe(true);
  });

  it("rejects missing producer versions, artifact checksums, and secret-like content", async () => {
    const corpus = await loadCorpus();
    const observation = clone(corpus);
    observation.cases[0]!.observations.push({
      producer: "excel-web",
      producerVersion: "",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "reviewed",
      result: { type: "number", value: 2 },
    });
    const observationIssues = validateCorpus(observation);
    expect(hasIssue(observationIssues, "producerVersion")).toBe(true);
    expect(hasIssue(observationIssues, "artifactSha256")).toBe(true);

    const secret = clone(corpus) as ConformanceCorpus & { clientSecret?: string };
    secret.clientSecret = "not-committable";
    expect(hasIssue(validateCorpus(secret), "secret-like field name")).toBe(true);
  });

  it("rejects ambiguous result types and unsupported cases rendered as passing", async () => {
    const corpus = await loadCorpus();
    const ambiguous = clone(corpus);
    ambiguous.cases[0]!.expected = {} as ConformanceResult;
    expect(hasIssue(validateCorpus(ambiguous), "ambiguous or missing result type")).toBe(true);

    const unsupportedPass = clone(corpus);
    unsupportedPass.cases[0]!.unsupported = true;
    expect(
      hasIssue(validateCorpus(unsupportedPass), "unsupported case cannot render as pass"),
    ).toBe(true);
  });

  it("rejects unknown fields and unrecognized schema enums", async () => {
    const corpus = await loadCorpus();
    const invalid = clone(corpus) as ConformanceCorpus & { extra?: boolean };
    invalid.extra = true;
    Object.assign(invalid.cases[0]!, {
      area: "charts",
      dialect: "guess",
      extra: true,
    });
    Object.assign(invalid.cases[0]!.source, { authorship: "copied", extra: true });
    invalid.cases[0]!.observations.push({
      producer: "unknown" as "sheetwrite",
      producerVersion: "1",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "unavailable",
      notes: "No runner",
    });
    const issues = validateCorpus(invalid);
    for (const expected of [
      "corpus.extra: unknown field",
      ".area: invalid",
      ".dialect: invalid",
      ".source.authorship: invalid",
      ".producer: invalid",
    ]) {
      expect(hasIssue(issues, expected), expected).toBe(true);
    }
  });

  it("canonicalizes object keys and fixes the protocol checksum", async () => {
    expect(canonicalJson({ z: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"z":1}');
    const corpus = await loadCorpus();
    expect(sha256(corpus)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(corpus)).toBe(sha256(JSON.parse(canonicalJson(corpus))));
  });
});

describe("offline typed comparison", () => {
  it("reports type, error, tolerance, spill shape, formula, and displayed-text differences", () => {
    expect(compareResults({ type: "number", value: 2 }, { type: "string", value: "2" })).toEqual([
      "type: expected number, received string",
    ]);
    expect(
      compareResults({ type: "error", error: "#N/A" }, { type: "error", error: "#REF!" }),
    ).toEqual(["error: expected #N/A, received #REF!"]);
    expect(
      compareResults(
        { type: "number", value: 1, tolerance: { kind: "absolute", value: 0.01 } },
        { type: "number", value: 1.02 },
      ),
    ).toEqual(["value: expected 1, received 1.02"]);
    expect(
      compareResults(
        { type: "array", value: [[1, 2]], rows: 1, columns: 2, formula: "=A1:B1" },
        { type: "array", value: [[1], [2]], rows: 2, columns: 1, formula: "=A1:A2" },
      ),
    ).toEqual([
      "value: expected [[1,2]], received [[1],[2]]",
      "rows: expected 1, received 2",
      "columns: expected 2, received 1",
      "formula: expected =A1:B1, received =A1:A2",
    ]);
    expect(
      compareResults(
        { type: "string", value: "2", displayedText: "2.00" },
        { type: "string", value: "2", displayedText: "2" },
      ),
    ).toEqual(["displayedText: expected 2.00, received 2"]);
  });

  it("diffs normalized workbook state, warnings, and OOXML summaries structurally", () => {
    const expected: ConformanceResult = {
      type: "workbook",
      value: {
        activeSheet: "Data",
        sheets: [{ name: "Data", state: "visible" }],
        warnings: ["unsupported-chart"],
        ooxml: { tables: 1, relationships: 2 },
      },
    };
    const actual: ConformanceResult = {
      type: "workbook",
      value: {
        activeSheet: "Other",
        sheets: [{ name: "Data", state: "hidden" }],
        warnings: [],
        ooxml: { tables: 0, relationships: 1 },
      },
    };
    const differences = compareResults(expected, actual);
    expect(differences).toHaveLength(1);
    expect(differences[0]).toContain("activeSheet");
    expect(differences[0]).toContain("unsupported-chart");
    expect(differences[0]).toContain("relationships");
  });

  it("rejects incomplete or drifted Excel Office Script captures", async () => {
    const corpus = await loadCorpus();
    const capture = {
      protocol: 1,
      producer: "excel-web",
      producerVersion: "16.0.19029.20136",
      capturedAt: "2026-07-22T00:00:00.000Z",
      scriptSha256: "runner-sha",
      calculation: "fullRebuild",
      observations: corpus.cases
        .filter((entry) => entry.kind === "formula")
        .map((entry) => ({ caseId: entry.id, result: entry.expected })),
    };
    expect(validateExcelCapture(capture, corpus, capture.producerVersion, "runner-sha")).toEqual(
      [],
    );
    capture.scriptSha256 = "drifted";
    capture.observations.pop();
    const issues = validateExcelCapture(capture, corpus, capture.producerVersion, "runner-sha");
    expect(hasIssue(issues, "runner drift")).toBe(true);
    expect(hasIssue(issues, "missing, extra, or reordered")).toBe(true);
  });

  it("runs every pinned case through the local engine", async () => {
    const corpus = await loadCorpus();
    await expect(runOffline(corpus)).resolves.toEqual({
      checked: corpus.cases.length,
      deferred: corpus.cases.length,
    });
  });
});
