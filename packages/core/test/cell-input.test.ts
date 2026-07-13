import { describe, expect, it } from "bun:test";
import { cellScalarToText, parseCellInput } from "../src/cell-input.js";

describe("parseCellInput", () => {
  it("keeps cross-sheet links as formulas", () => {
    expect(parseCellInput("=Sales!E2", "text")).toEqual({
      kind: "formula",
      src: "=Sales!E2",
    });
  });

  it("keeps quoted sheet names as formulas", () => {
    expect(parseCellInput("='Sales 2026'!C2", "text")).toEqual({
      kind: "formula",
      src: "='Sales 2026'!C2",
    });
  });

  it("still parses plain number literals for numeric columns", () => {
    expect(parseCellInput("42.5", "number")).toEqual({
      kind: "literal",
      value: 42.5,
    });
  });

  it("parses and formats native boolean literals using spreadsheet casing", () => {
    expect(parseCellInput("true", "text")).toEqual({ kind: "literal", value: true });
    expect(parseCellInput("FALSE", "number")).toEqual({ kind: "literal", value: false });
    expect(cellScalarToText(true)).toBe("TRUE");
    expect(cellScalarToText(false)).toBe("FALSE");
  });
});
