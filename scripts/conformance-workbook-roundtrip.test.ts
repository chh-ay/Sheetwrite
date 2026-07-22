import { describe, expect, it } from "bun:test";
import { sheetwriteWorkbookBackend } from "../packages/xlsx/src/workbook.js";
import {
  runWorkbookRoundtrips,
  structuralDifferences,
  type WorkbookRoundtripResaver,
} from "./conformance/roundtrip.js";

const IDENTITY_RESAVER: WorkbookRoundtripResaver = {
  producer: "libreoffice",
  producerVersion: "test-identity",
  async resave(bytes) {
    return bytes;
  },
};

describe("workbook producer roundtrip evidence", () => {
  it("binds both required local chain directions and preserves exact normalized semantics", async () => {
    const artifact = await runWorkbookRoundtrips(IDENTITY_RESAVER, {
      capturedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(artifact).toMatchObject({
      protocol: 1,
      producer: "libreoffice",
      producerVersion: "test-identity",
      capturedAt: "2026-07-22T12:00:00.000Z",
      status: "pass",
    });
    expect(artifact.chains.map((chain) => [chain.id, chain.direction, chain.status])).toEqual([
      ["sheetwrite-libreoffice-sheetwrite", "sheetwrite-producer-sheetwrite", "pass"],
      [
        "libreoffice-sheetwrite-libreoffice-sheetwrite",
        "producer-sheetwrite-producer-sheetwrite",
        "pass",
      ],
    ]);
    for (const chain of artifact.chains) {
      expect(chain.inputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(chain.producerSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(chain.inputBytes).toBeGreaterThan(0);
      expect(chain.producerBytes).toBeGreaterThan(0);
      expect(chain.differences).toEqual([]);
    }
    expect(artifact.blockedChains).toHaveLength(3);
  });

  it("reports semantic feature loss instead of treating a valid XLSX resave as a pass", async () => {
    const destructive: WorkbookRoundtripResaver = {
      producer: "libreoffice",
      producerVersion: "test-destructive",
      async resave(bytes, id) {
        if (id !== "sheetwrite-libreoffice-sheetwrite") return bytes;
        const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
        snapshot.sheets[0]!.tables = [];
        snapshot.sheets[0]!.cells[0]!.cells[0]!.value = {
          kind: "literal",
          value: "lost-value",
        };
        return sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot);
      },
    };
    const artifact = await runWorkbookRoundtrips(destructive);
    expect(artifact.status).toBe("partial");
    expect(artifact.chains[0]!.status).toBe("divergent");
    expect(artifact.chains[0]!.differences.some((entry) => entry.includes(".tables"))).toBe(true);
    expect(
      artifact.chains[0]!.differences.some(
        (entry) => entry.includes(".cells[0].value.value") && entry.includes("lost-value"),
      ),
    ).toBe(true);
  });

  it("produces bounded path-specific structural differences", () => {
    expect(structuralDifferences({ a: [{ b: 1 }] }, { a: [{ b: 2 }, { b: 3 }] })).toEqual([
      "$workbook.a.length: 1 != 2",
      "$workbook.a[0].b: 1 != 2",
    ]);
  });
});
