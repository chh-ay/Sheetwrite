import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ConformanceCorpus,
  type ConformanceResult,
  canonicalJson,
  compareResults,
  compareReviewedObservation,
  loadCorpus,
  runOffline,
  sha256,
  sha256Bytes,
  validateCorpus,
  validateExcelCapture,
  verifyCaptureArtifacts,
} from "./conformance.js";
import { readBoundedResponse } from "./conformance/capture.js";

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

  it("binds reviewed observations to exact immutable capture bytes", async () => {
    const corpus = await loadCorpus();
    const capturedAt = "2026-07-22T00:00:00.000Z";
    const artifact = {
      protocol: 1,
      producer: "excel-web",
      producerVersion: "16.0.19029.20136",
      capturedAt,
      observations: [{ caseId: corpus.cases[0]!.id, result: corpus.cases[0]!.expected }],
    };
    const bytes = new TextEncoder().encode(`${canonicalJson(artifact)}\n`);
    const hash = sha256Bytes(bytes);
    corpus.cases[0]!.observations.push({
      producer: "excel-web",
      producerVersion: artifact.producerVersion,
      capturedAt,
      status: "reviewed",
      result: corpus.cases[0]!.expected,
      artifactSha256: hash,
    });
    expect(hasIssue(validateCorpus(corpus), "no verified immutable capture binding")).toBe(true);

    const directory = await mkdtemp(join(tmpdir(), "sheetwrite-capture-"));
    try {
      await writeFile(join(directory, `${hash}.json`), bytes);
      const verified = await verifyCaptureArtifacts(corpus, directory);
      expect(verified.issues).toEqual([]);
      expect(validateCorpus(corpus, verified.verified)).toEqual([]);

      corpus.cases[0]!.observations[0]!.result = { type: "number", value: 3 };
      const drifted = await verifyCaptureArtifacts(corpus, directory);
      expect(hasIssue(drifted.issues, "does not bind reviewed observation")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("bounds capture responses before and during streaming", async () => {
    const declared = new Response("oversized", { headers: { "content-length": "9" } });
    await expect(readBoundedResponse(declared, 8)).rejects.toThrow("Content-Length");
    await expect(readBoundedResponse(new Response("123456789"), 8)).rejects.toThrow(
      "response exceeds",
    );
  });

  it("rejects ambiguous result types and unsupported cases rendered as passing", async () => {
    const corpus = await loadCorpus();
    const ambiguous = clone(corpus);
    ambiguous.cases[0]!.expected = {} as ConformanceResult;
    expect(hasIssue(validateCorpus(ambiguous), "ambiguous or missing result type")).toBe(true);

    const nonFinite = clone(corpus);
    nonFinite.cases[0]!.expected = { type: "number", value: Number.POSITIVE_INFINITY };
    expect(hasIssue(validateCorpus(nonFinite), "expected finite number")).toBe(true);
    nonFinite.cases[0]!.expected = {
      type: "number",
      value: 2,
      tolerance: { kind: "absolute", value: Number.NaN },
    };
    expect(hasIssue(validateCorpus(nonFinite), "invalid numeric tolerance")).toBe(true);

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
    expect(canonicalJson(-0)).toBe("-0");
    expect(() => canonicalJson(Number.NaN)).toThrow("non-finite");
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

  it("accepts only the exact declared producer alternate", () => {
    const observation = {
      producer: "excel-web" as const,
      producerVersion: "16.0.19029.20136",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "reviewed" as const,
      artifactSha256: "0".repeat(64),
      result: { type: "number" as const, value: 60, displayedText: "1900-02-29" },
    };
    const divergence = {
      reason: "Excel synthetic leap day",
      producers: ["excel-web" as const],
      alternate: { type: "number" as const, value: 60, displayedText: "1900-02-29" },
    };
    expect(
      compareReviewedObservation(
        { type: "number", value: 60, displayedText: "1900-02-28" },
        observation,
        divergence,
      ),
    ).toEqual([]);
    observation.result.displayedText = "1900-03-01";
    expect(
      compareReviewedObservation(
        { type: "number", value: 60, displayedText: "1900-02-28" },
        observation,
        divergence,
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("declared alternate did not match")]),
    );
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

  it("reports all-unsupported corpora as blocked non-claims", async () => {
    const corpus = await loadCorpus();
    corpus.cases = [corpus.cases[0]!];
    corpus.cases[0]!.expected = { type: "unsupported" };
    corpus.cases[0]!.unsupported = true;
    await expect(runOffline(corpus)).resolves.toEqual({
      status: "blocked",
      checked: 1,
      reviewed: 0,
      deferred: 0,
      warnings: [`${corpus.cases[0]!.id}: explicitly unsupported; compatibility is not claimed`],
      unsupported: [corpus.cases[0]!.id],
    });
  });

  it("runs every pinned case through the local engine", async () => {
    const corpus = await loadCorpus();
    await expect(runOffline(corpus)).resolves.toEqual({
      status: "blocked",
      checked: corpus.cases.length,
      reviewed: 0,
      deferred: corpus.cases.length,
      warnings: corpus.cases.map(
        (entry) => `${entry.id}: no reviewed producer capture; compatibility is not claimed`,
      ),
      unsupported: [],
    });
  });
});
