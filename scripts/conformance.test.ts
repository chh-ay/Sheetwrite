import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBoundedResponse } from "./conformance/capture.js";
import {
  type ConformanceCorpus,
  type ConformanceManifest,
  type ConformanceResult,
  canonicalJson,
  compareResults,
  compareReviewedObservation,
  type FormulaInventory,
  generateConformanceEvidence,
  loadCorpus,
  readConformanceManifest,
  readFormulaInventory,
  runOffline,
  runSheetwriteCase,
  type SemanticCategory,
  sha256,
  sha256Bytes,
  validateCorpus,
  validateExcelCapture,
  verifyCaptureArtifacts,
} from "./conformance.js";

const [CHECKED_MANIFEST, CHECKED_INVENTORY] = await Promise.all([
  readConformanceManifest(),
  readFormulaInventory(),
]);
const NO_ARTIFACTS = new Set<string>();

function clone(corpus: ConformanceCorpus): ConformanceCorpus {
  return structuredClone(corpus);
}

function hasIssue(issues: readonly string[], text: string): boolean {
  return issues.some((issue) => issue.includes(text));
}

function validateCorpusChecked(
  corpus: ConformanceCorpus,
  verifiedArtifacts: ReadonlySet<string> = NO_ARTIFACTS,
  manifest: ConformanceManifest = CHECKED_MANIFEST,
  inventory: FormulaInventory = CHECKED_INVENTORY,
): string[] {
  return validateCorpus(corpus, manifest, inventory, verifiedArtifacts);
}

describe("neutral conformance corpus", () => {
  it("validates the checked-in schema contract and stable IDs", async () => {
    const corpus = await loadCorpus();
    expect(corpus.protocol).toBe(1);
    const canaryIds = corpus.cases
      .filter((entry) => entry.localCanary === true)
      .map((entry) => entry.id);
    expect(canaryIds).toEqual([
      "canary.arithmetic.1-plus-1",
      "canary.date.serial-60",
      "canary.if.lazy-error-branch",
      "canary.criteria.wildcard",
      "canary.lookup.not-found",
      "canary.spill.obstruction",
      "canary.workbook.roundtrip",
    ]);
    expect(validateCorpusChecked(corpus)).toEqual([]);
  });

  it("matches deterministic inventory-derived counts and complete subject/category coverage", async () => {
    const corpus = await loadCorpus();
    const generated = generateConformanceEvidence(CHECKED_INVENTORY);
    expect(canonicalJson(corpus)).toBe(canonicalJson(generated.corpus));
    expect(await readFile("test/conformance/corpus.json", "utf8")).toBe(
      `${canonicalJson(generated.corpus)}\n`,
    );
    expect(CHECKED_MANIFEST).toEqual(generated.manifest);
    expect(CHECKED_MANIFEST.counts).toEqual({
      formula: 2000,
      mutation: 250,
      workbook: 100,
      localCanary: 7,
      supportedFunctions: 154,
      supportedOperators: 15,
    });
    const requiredCategories: SemanticCategory[] = [
      "normal",
      "empty",
      "mixed",
      "error",
      "boundary",
      "range-array",
    ];
    for (const subject of [
      ...CHECKED_INVENTORY.functions.map((entry) => ({
        kind: "function" as const,
        name: entry.canonical,
      })),
      ...CHECKED_INVENTORY.operators.map((entry) => ({
        kind: "operator" as const,
        name: entry.canonical,
      })),
    ]) {
      const categories = new Set(
        corpus.cases
          .filter(
            (entry) => entry.subject?.kind === subject.kind && entry.subject.name === subject.name,
          )
          .map((entry) => entry.category),
      );
      expect([...categories].sort(), `${subject.kind}:${subject.name}`).toEqual(
        [...requiredCategories].sort(),
      );
    }
  });

  it("rejects formula padding and proves the direct category result path", async () => {
    const corpus = await loadCorpus();
    const direct = corpus.cases.find(
      (entry) =>
        entry.id === "formula.function.abs.empty.1" && entry.formula?.includes("ABS(C1)=0"),
    );
    const alternate = corpus.cases.find((entry) => entry.id === "formula.function.abs.empty.2");
    expect(direct).toBeDefined();
    expect(alternate).toBeDefined();

    const missingConsumption = clone(corpus);
    const missing = missingConsumption.cases.find((entry) => entry.id === direct!.id)!;
    missing.formula = missing.formula!.replace("ABS(C1)=0", "ABS(0)=0");
    expect(
      hasIssue(validateCorpusChecked(missingConsumption), "category input is not consumed"),
    ).toBe(true);

    const duplicate = clone(corpus);
    const duplicateAlternate = duplicate.cases.find((entry) => entry.id === alternate!.id)!;
    duplicateAlternate.formula = direct!.formula;
    expect(
      hasIssue(validateCorpusChecked(duplicate), "duplicate canonical subject/category formula"),
    ).toBe(true);

    expect(compareResults(direct!.expected, await runSheetwriteCase(direct!))).toEqual([]);
    const wrongResultPath = structuredClone(direct!);
    wrongResultPath.formula = wrongResultPath.formula!.replace("ABS(C1)=0", "ABS(C1)=1");
    expect(
      compareResults(wrongResultPath.expected, await runSheetwriteCase(wrongResultPath)),
    ).not.toEqual([]);
    const representativeSubjects = new Map<string, (typeof corpus.cases)[number]>();
    for (const entry of corpus.cases) {
      if (
        entry.category === "normal" &&
        entry.localCanary !== true &&
        entry.subject &&
        !representativeSubjects.has(`${entry.subject.kind}:${entry.subject.name}`)
      ) {
        representativeSubjects.set(`${entry.subject.kind}:${entry.subject.name}`, entry);
      }
    }
    expect(representativeSubjects.size).toBe(
      CHECKED_INVENTORY.functions.length + CHECKED_INVENTORY.operators.length,
    );
    const falsePasses: string[] = [];
    for (const entry of representativeSubjects.values()) {
      const altered = structuredClone(entry);
      altered.formula =
        entry.subject!.kind === "function"
          ? altered.formula!.replace(
              `${entry.subject!.name}(`,
              entry.subject!.name === "NA" ? "TRUE(" : "NA(",
            )
          : "=NA()";
      if (compareResults(altered.expected, await runSheetwriteCase(altered)).length === 0) {
        falsePasses.push(entry.id);
      }
    }
    expect(falsePasses).toEqual([]);
  });

  it("rejects padded, duplicated, and unknown mutation operation shapes", async () => {
    const corpus = await loadCorpus();
    const mutation = corpus.cases.find(
      (entry) => entry.feature === "mutation-matrix" && (entry.operations?.length ?? 0) >= 2,
    )!;

    const duplicated = clone(corpus);
    const duplicateCase = duplicated.cases.find((entry) => entry.id === mutation.id)!;
    duplicateCase.operations![1] = structuredClone(duplicateCase.operations![0]!);
    expect(hasIssue(validateCorpusChecked(duplicated), "duplicate operation in shape")).toBe(true);

    const unknown = clone(corpus);
    const unknownCase = unknown.cases.find((entry) => entry.id === mutation.id)!;
    unknownCase.operations![0] = { op: "claimed-but-not-executed" };
    expect(hasIssue(validateCorpusChecked(unknown), "unsupported concrete operation")).toBe(true);
  });

  it("rejects absent legal provenance and mutable unpinned sources", async () => {
    const corpus = await loadCorpus();
    const missingLicense = clone(corpus);
    missingLicense.cases[0]!.source.license = "";
    expect(hasIssue(validateCorpusChecked(missingLicense), "source.license")).toBe(true);

    const mutableUrl = clone(corpus);
    mutableUrl.cases[0]!.source.url = "https://example.test/current-spec";
    expect(hasIssue(validateCorpusChecked(mutableUrl), "source.sha256")).toBe(true);
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
    const observationIssues = validateCorpusChecked(observation);
    expect(hasIssue(observationIssues, "producerVersion")).toBe(true);
    expect(hasIssue(observationIssues, "artifactSha256")).toBe(true);

    const secret = clone(corpus) as ConformanceCorpus & { clientSecret?: string };
    secret.clientSecret = "not-committable";
    expect(hasIssue(validateCorpusChecked(secret), "secret-like field name")).toBe(true);
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
    expect(hasIssue(validateCorpusChecked(corpus), "no verified immutable capture binding")).toBe(
      true,
    );

    const directory = await mkdtemp(join(tmpdir(), "sheetwrite-capture-"));
    try {
      await writeFile(join(directory, `${hash}.json`), bytes);
      const verified = await verifyCaptureArtifacts(corpus, directory);
      expect(verified.issues).toEqual([]);
      const verifiedIssues = validateCorpusChecked(corpus, verified.verified);
      expect(hasIssue(verifiedIssues, "no verified immutable capture binding")).toBe(false);
      expect(hasIssue(verifiedIssues, "deterministic generator output drift")).toBe(true);

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
    expect(hasIssue(validateCorpusChecked(ambiguous), "ambiguous or missing result type")).toBe(
      true,
    );

    const nonFinite = clone(corpus);
    nonFinite.cases[0]!.expected = { type: "number", value: Number.POSITIVE_INFINITY };
    expect(hasIssue(validateCorpusChecked(nonFinite), "expected finite number")).toBe(true);
    nonFinite.cases[0]!.expected = {
      type: "number",
      value: 2,
      tolerance: { kind: "absolute", value: Number.NaN },
    };
    expect(hasIssue(validateCorpusChecked(nonFinite), "invalid numeric tolerance")).toBe(true);

    const unsupportedPass = clone(corpus);
    unsupportedPass.cases[0]!.unsupported = true;
    expect(
      hasIssue(validateCorpusChecked(unsupportedPass), "unsupported case cannot render as pass"),
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
    const issues = validateCorpusChecked(invalid);
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

  it("fails closed on missing metadata, duplicate IDs, and unsupported-only coverage", async () => {
    const corpus = await loadCorpus();
    const invalid = clone(corpus);
    invalid.cases[0]!.family = "";
    delete (invalid.cases[0] as Partial<(typeof invalid.cases)[number]>).category;
    invalid.cases[0]!.source.url = "";
    invalid.cases[1]!.id = invalid.cases[0]!.id;
    for (const entry of invalid.cases) {
      if (entry.subject?.kind === "function" && entry.subject.name === "SUM") {
        entry.expected = { type: "unsupported" };
        entry.unsupported = true;
      }
    }
    const issues = validateCorpusChecked(invalid);
    for (const expected of [
      ".family: required",
      ".category: missing",
      ".source.url: required",
      ".id: duplicate",
      "coverage.function: missing supported SUM",
    ]) {
      expect(hasIssue(issues, expected), expected).toBe(true);
    }
  });

  it("rejects altered expectations even when corpus and record checksums are forged", async () => {
    const corpus = await loadCorpus();
    const altered = clone(corpus);
    altered.cases[0]!.expected = { type: "number", value: 3 };
    const forgedManifest = structuredClone(CHECKED_MANIFEST);
    forgedManifest.corpusSha256 = sha256(altered);
    forgedManifest.caseSha256[0] = sha256(altered.cases[0]!);
    const alteredIssues = validateCorpusChecked(
      altered,
      NO_ARTIFACTS,
      forgedManifest,
      CHECKED_INVENTORY,
    );
    expect(hasIssue(alteredIssues, "deterministic generator output drift")).toBe(true);
    expect(hasIssue(alteredIssues, "deterministic generator binding drift")).toBe(true);

    const checksumDrift = structuredClone(CHECKED_MANIFEST);
    checksumDrift.caseSha256[0] = "0".repeat(64);
    expect(
      hasIssue(
        validateCorpusChecked(corpus, NO_ARTIFACTS, checksumDrift),
        "altered record or unstable checksum",
      ),
    ).toBe(true);
  });

  it("rejects fake producer observations and denominator drift", async () => {
    const corpus = await loadCorpus();
    const fake = clone(corpus);
    const fakeHash = "a".repeat(64);
    fake.cases[0]!.source.authorship = "producer-observation";
    fake.cases[0]!.evidence = {
      kind: "pinned-observation",
      basis: "producer-observation",
      oracle: "Unverified local claim",
    };
    fake.cases[0]!.observations.push({
      producer: "sheetwrite",
      producerVersion: "local",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "reviewed",
      result: fake.cases[0]!.expected,
      artifactSha256: fakeHash,
    });
    expect(
      hasIssue(
        validateCorpusChecked(fake, new Set([fakeHash])),
        "requires a verified reviewed external capture",
      ),
    ).toBe(true);

    const denominatorDrift = structuredClone(CHECKED_MANIFEST);
    Object.assign(denominatorDrift.minimums, { formula: 1999 });
    Object.assign(denominatorDrift.counts, { mutation: 249 });
    const denominatorIssues = validateCorpusChecked(corpus, NO_ARTIFACTS, denominatorDrift);
    expect(hasIssue(denominatorIssues, "required denominator is 2000")).toBe(true);
    expect(hasIssue(denominatorIssues, "counts.mutation: denominator drift")).toBe(true);
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

  it("rejects tampered all-unsupported corpora before local execution", async () => {
    const corpus = await loadCorpus();
    corpus.cases = [corpus.cases[0]!];
    corpus.cases[0]!.expected = { type: "unsupported" };
    corpus.cases[0]!.unsupported = true;
    await expect(runOffline(corpus)).rejects.toThrow("coverage.formula");
  });

  it("runs every supported case and preserves the seven-canary metric", async () => {
    const corpus = await loadCorpus();
    const result = await runOffline(corpus);
    const unsupported = corpus.cases.filter((entry) => entry.unsupported === true);
    expect(result.checked).toBe(corpus.cases.length);
    expect(result.localCanaries).toBe(7);
    expect(result.unsupported).toEqual(unsupported.map((entry) => entry.id));
    expect(result.deferred).toBe(corpus.cases.length - unsupported.length);
    expect(result.status).toBe("blocked");
  });
});
