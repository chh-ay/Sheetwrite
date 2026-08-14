import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityFixture,
  type CompatibilityRecord,
} from "../src/showcases/compatibility.ts";
import {
  assertCompatibilityInventory,
  collectCompatibilityIssues,
  collectMissingCompatibilityFiles,
} from "../src/showcases/compatibility-validation.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
type MutableFixture = {
  -readonly [Key in keyof CompatibilityFixture]: CompatibilityFixture[Key];
};
const REQUIRED_RECORD_IDS = [
  "formula.portable-operators",
  "formula.dynamic-arrays",
  "formula.let",
  "formula.let-lambda",
  "reference.cross-sheet-stable-id",
  "worksheet.lifecycle",
  "worksheet.very-hidden",
  "xlsx.basic-values",
  "xlsx.rich-workbook",
  "xlsx.shared-formulas",
  "validation.native-subset",
  "table.native-subset",
  "hyperlink.safe-subset",
  "conditional-format.native-subset",
  "xlsx.advanced-unsupported",
  "clipboard.delimited",
  "producer.microsoft-excel",
  "producer.google-sheets",
] as const;

function records(): CompatibilityRecord[] {
  return structuredClone(COMPATIBILITY_INVENTORY) as CompatibilityRecord[];
}

function fixtures(): MutableFixture[] {
  return structuredClone(COMPATIBILITY_FIXTURES) as MutableFixture[];
}

describe("compatibility inventory contract", () => {
  it("is complete, structurally valid, and backed by existing files", () => {
    expect(COMPATIBILITY_INVENTORY.map(({ id }) => id)).toEqual([...REQUIRED_RECORD_IDS]);
    expect(() =>
      assertCompatibilityInventory(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES),
    ).not.toThrow();
    expect(
      collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
        existsSync(join(REPO_ROOT, path)),
      ),
    ).toEqual([]);
    expect(new Set(COMPATIBILITY_INVENTORY.map(({ status }) => status))).toEqual(
      new Set(["supported", "partial", "roundtrip-only", "warning", "unsupported"]),
    );
    expect(new Set(COMPATIBILITY_INVENTORY.map(({ resultMode }) => resultMode))).toEqual(
      new Set(["evaluated", "preserved", "flattened", "warning", "unsupported"]),
    );
  });

  it("splits supported LET from unsupported LAMBDA without broadening dialect claims", () => {
    const letRecord = COMPATIBILITY_INVENTORY.find(({ id }) => id === "formula.let");
    expect(letRecord).toMatchObject({
      status: "supported",
      resultMode: "evaluated",
      dialect: "excel",
    });
    expect(letRecord?.semantics).toContain("lazily");
    expect(letRecord?.divergence).toContain("126 bindings");
    expect(letRecord?.divergence).toContain("16,384 expanded AST nodes");

    const lambdaRecord = COMPATIBILITY_INVENTORY.find(({ id }) => id === "formula.let-lambda");
    expect(lambdaRecord).toMatchObject({
      status: "unsupported",
      resultMode: "unsupported",
      dialect: "excel",
    });
    expect(lambdaRecord?.semantics).not.toContain("LET and");
    expect(lambdaRecord?.divergence).toContain("LET is supported separately");
  });

  it("locks every redistributed XLSX fixture to its checked-in digest", async () => {
    for (const fixture of COMPATIBILITY_FIXTURES) {
      if (!fixture.sha256) continue;
      const bytes = await Bun.file(join(REPO_ROOT, fixture.path)).arrayBuffer();
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), fixture.id).toBe(
        fixture.sha256,
      );
    }
  });
});

describe("compatibility inventory fails closed", () => {
  it("rejects duplicate records and fixtures", () => {
    const duplicateRecords = records();
    duplicateRecords.push(structuredClone(duplicateRecords[0]!));
    expect(collectCompatibilityIssues(duplicateRecords, COMPATIBILITY_FIXTURES)).toContain(
      `duplicate compatibility record id: ${duplicateRecords[0]!.id}`,
    );

    const duplicateFixtures = fixtures();
    duplicateFixtures.push(structuredClone(duplicateFixtures[0]!));
    expect(collectCompatibilityIssues(COMPATIBILITY_INVENTORY, duplicateFixtures)).toContain(
      `duplicate compatibility fixture id: ${duplicateFixtures[0]!.id}`,
    );
  });

  it("rejects missing evidence, unknown fixtures, invalid paths, and invalid digests", () => {
    const noEvidence = records();
    noEvidence[0] = { ...noEvidence[0]!, evidence: [] };
    expect(collectCompatibilityIssues(noEvidence, COMPATIBILITY_FIXTURES)).toContain(
      `compatibility record has no executable evidence: ${noEvidence[0]!.id}`,
    );

    const unknownFixture = records();
    unknownFixture[0] = { ...unknownFixture[0]!, fixtureIds: ["missing-fixture"] };
    expect(collectCompatibilityIssues(unknownFixture, COMPATIBILITY_FIXTURES)).toContain(
      `unknown compatibility fixture: ${unknownFixture[0]!.id}=missing-fixture`,
    );

    const invalidPath = records();
    invalidPath[0] = { ...invalidPath[0]!, evidence: ["../outside.test.ts"] };
    expect(collectCompatibilityIssues(invalidPath, COMPATIBILITY_FIXTURES)).toContain(
      `invalid compatibility evidence path: ${invalidPath[0]!.id}=../outside.test.ts`,
    );

    const invalidDigest = fixtures();
    const binary = invalidDigest.find(({ sha256 }) => sha256 !== undefined)!;
    binary.sha256 = "not-a-digest";
    expect(collectCompatibilityIssues(COMPATIBILITY_INVENTORY, invalidDigest)).toContain(
      `compatibility fixture has invalid sha256: ${binary.id}`,
    );
  });

  it("rejects an unsupported record relabeled as supported", () => {
    const inventory = records();
    const index = inventory.findIndex(({ status }) => status === "unsupported");
    inventory[index] = { ...inventory[index]!, status: "supported" };
    expect(collectCompatibilityIssues(inventory, COMPATIBILITY_FIXTURES)).toContain(
      `inconsistent compatibility status/result mode: ${inventory[index]!.id}=supported/unsupported`,
    );
  });

  it("reports deleted evidence and fixtures", () => {
    const missingPath = COMPATIBILITY_INVENTORY[0]!.evidence[0]!;
    expect(
      collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
        path === missingPath ? false : existsSync(join(REPO_ROOT, path)),
      ),
    ).toContain(`missing compatibility evidence file: ${missingPath}`);
  });
});
