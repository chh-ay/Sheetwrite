import { describe, expect, it } from "bun:test";
import { formatNumber } from "../src/number-format";

describe("formatNumber", () => {
  it("applies fixed decimals and thousands grouping", () => {
    expect(formatNumber(1234.5, "#,##0.00")).toBe("1,234.50");
    expect(formatNumber(1234.5, "0.00")).toBe("1234.50");
    expect(formatNumber(1234.567, "#,##0")).toBe("1,235");
  });

  it("applies percent scaling and suffix", () => {
    expect(formatNumber(0.5, "0%")).toBe("50%");
    expect(formatNumber(0.123, "0.0%")).toBe("12.3%");
  });

  it("applies a literal currency prefix", () => {
    expect(formatNumber(1234.5, "$#,##0.00")).toBe("$1,234.50");
  });

  it("falls back to a locale default without a code, and blanks non-finite", () => {
    expect(formatNumber(1000)).toBe((1000).toLocaleString());
    expect(formatNumber(Number.NaN, "0.00")).toBe("");
  });
});
