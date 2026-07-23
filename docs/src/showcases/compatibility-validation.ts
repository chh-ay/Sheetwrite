import type { CompatibilityFixture, CompatibilityRecord } from "./compatibility.js";

const AREAS = new Set([
  "formula",
  "reference",
  "worksheet",
  "view",
  "style",
  "validation",
  "clipboard",
  "xlsx-import",
  "xlsx-export",
]);
const DIALECTS = new Set([
  "shared",
  "excel",
  "google-sheets",
  "openformula",
  "sheetwrite-extension",
]);
const STATUSES = new Set(["supported", "partial", "roundtrip-only", "warning", "unsupported"]);
const RESULT_MODES = new Set(["evaluated", "preserved", "flattened", "warning", "unsupported"]);
const REQUIRED_RESULT_MODE = {
  supported: "evaluated",
  "roundtrip-only": "preserved",
  warning: "warning",
  unsupported: "unsupported",
} as const;
const FIXTURE_KINDS = new Set(["original-test", "independent-xlsx", "spec-xlsx", "manifest"]);
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function usableText(value: string): boolean {
  return value.trim().length > 0;
}

function repoPath(path: string): boolean {
  return usableText(path) && !path.startsWith("/") && !path.includes("..") && !path.includes("\\");
}

export function collectCompatibilityIssues(
  records: readonly CompatibilityRecord[],
  fixtures: readonly CompatibilityFixture[],
): string[] {
  const issues: string[] = [];
  if (records.length === 0) issues.push("compatibility inventory is empty");
  if (fixtures.length === 0) issues.push("compatibility fixture inventory is empty");

  const fixtureIds = new Set<string>();
  for (const fixture of fixtures) {
    if (!ID.test(fixture.id)) issues.push(`invalid compatibility fixture id: ${fixture.id}`);
    if (fixtureIds.has(fixture.id))
      issues.push(`duplicate compatibility fixture id: ${fixture.id}`);
    fixtureIds.add(fixture.id);
    if (!FIXTURE_KINDS.has(fixture.kind)) {
      issues.push(`invalid compatibility fixture kind: ${fixture.id}=${fixture.kind}`);
    }
    if (!repoPath(fixture.path)) issues.push(`invalid compatibility fixture path: ${fixture.id}`);
    if (
      !usableText(fixture.producer) ||
      !usableText(fixture.producerVersion) ||
      !usableText(fixture.license) ||
      !usableText(fixture.provenance)
    ) {
      issues.push(`incomplete compatibility fixture provenance: ${fixture.id}`);
    }
    if (fixture.expected.length === 0 || fixture.expected.some((entry) => !usableText(entry))) {
      issues.push(`compatibility fixture has no expected normalized state: ${fixture.id}`);
    }
    if (
      (fixture.kind === "independent-xlsx" || fixture.kind === "spec-xlsx") &&
      (!fixture.sha256 || !SHA256.test(fixture.sha256))
    ) {
      issues.push(`compatibility fixture has invalid sha256: ${fixture.id}`);
    }
  }

  const recordIds = new Set<string>();
  const usedFixtures = new Set<string>();
  for (const record of records) {
    if (!ID.test(record.id)) issues.push(`invalid compatibility record id: ${record.id}`);
    if (recordIds.has(record.id)) issues.push(`duplicate compatibility record id: ${record.id}`);
    recordIds.add(record.id);
    if (!AREAS.has(record.area))
      issues.push(`invalid compatibility area: ${record.id}=${record.area}`);
    if (!DIALECTS.has(record.dialect)) {
      issues.push(`invalid compatibility dialect: ${record.id}=${record.dialect}`);
    }
    if (!STATUSES.has(record.status)) {
      issues.push(`invalid compatibility status: ${record.id}=${record.status}`);
    }
    if (!RESULT_MODES.has(record.resultMode)) {
      issues.push(`invalid compatibility result mode: ${record.id}=${record.resultMode}`);
    }
    if (record.status !== "partial") {
      const required = REQUIRED_RESULT_MODE[record.status];
      if (record.resultMode !== required) {
        issues.push(
          `inconsistent compatibility status/result mode: ${record.id}=${record.status}/${record.resultMode}`,
        );
      }
    }
    if (
      !usableText(record.label) ||
      !usableText(record.semantics) ||
      !usableText(record.divergence) ||
      !usableText(record.source) ||
      !usableText(record.importBehavior) ||
      !usableText(record.exportBehavior)
    ) {
      issues.push(`incomplete compatibility record boundary: ${record.id}`);
    }
    if (record.evidence.length === 0) {
      issues.push(`compatibility record has no executable evidence: ${record.id}`);
    }
    for (const path of record.evidence) {
      if (!repoPath(path)) issues.push(`invalid compatibility evidence path: ${record.id}=${path}`);
    }
    if (record.fixtureIds.length === 0) {
      issues.push(`compatibility record has no fixture ids: ${record.id}`);
    }
    for (const fixtureId of record.fixtureIds) {
      usedFixtures.add(fixtureId);
      if (!fixtureIds.has(fixtureId)) {
        issues.push(`unknown compatibility fixture: ${record.id}=${fixtureId}`);
      }
    }
    if (record.resultMode === "warning" && !record.warningCode) {
      issues.push(`warning compatibility result has no warning code: ${record.id}`);
    }
    if (record.lastVerifiedProtocolVersion !== 3) {
      issues.push(`stale compatibility protocol version: ${record.id}`);
    }
  }

  for (const fixture of fixtures) {
    if (!usedFixtures.has(fixture.id))
      issues.push(`unreferenced compatibility fixture: ${fixture.id}`);
  }
  return issues;
}

export function collectMissingCompatibilityFiles(
  records: readonly CompatibilityRecord[],
  fixtures: readonly CompatibilityFixture[],
  exists: (repoRelativePath: string) => boolean,
): string[] {
  const paths = new Set(fixtures.map((fixture) => fixture.path));
  for (const record of records) for (const path of record.evidence) paths.add(path);
  return [...paths]
    .sort()
    .filter((path) => !exists(path))
    .map((path) => `missing compatibility evidence file: ${path}`);
}

export function assertCompatibilityInventory(
  records: readonly CompatibilityRecord[],
  fixtures: readonly CompatibilityFixture[],
): void {
  const issues = collectCompatibilityIssues(records, fixtures);
  if (issues.length > 0) throw new Error(issues.join("\n"));
}
