import { describe, expect, it } from "bun:test";
import { sheetNameKey, validateSheetName } from "../src/sheet-name.js";

describe("worksheet name contract", () => {
  it("returns NFC display names and case-insensitive canonical keys", () => {
    expect(validateSheetName("Cafe\u0301")).toEqual({
      ok: true,
      name: "Café",
      key: "café",
    });
    expect(sheetNameKey("CAFE\u0301")).toBe(sheetNameKey("café"));
    expect(validateSheetName("résumé", ["RÉSUMÉ"])).toEqual({
      ok: false,
      code: "duplicate",
      name: "résumé",
      key: "résumé",
    });
  });

  it("reports stable SpreadsheetML lexical failure codes", () => {
    expect(validateSheetName("   ")).toMatchObject({ ok: false, code: "blank" });
    expect(validateSheetName("a".repeat(32))).toMatchObject({ ok: false, code: "too-long" });
    expect(validateSheetName("😀".repeat(16))).toMatchObject({ ok: false, code: "too-long" });
    expect(validateSheetName("'Sales")).toMatchObject({ ok: false, code: "edge-apostrophe" });
    expect(validateSheetName("Sales'")).toMatchObject({ ok: false, code: "edge-apostrophe" });
    for (const candidate of ["a/b", "a\\b", "a*b", "a?b", "a:b", "a[b", "a]b", "a\u0001b"]) {
      expect(validateSheetName(candidate)).toMatchObject({
        ok: false,
        code: "forbidden-character",
      });
    }
  });

  it("accepts the exact UTF-16 limit and internal apostrophes", () => {
    expect(validateSheetName("a".repeat(31)).ok).toBe(true);
    expect(validateSheetName("Owner's Sheet").ok).toBe(true);
  });
});
