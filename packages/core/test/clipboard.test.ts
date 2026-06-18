import { describe, expect, it } from "bun:test";
import { neutralizeInjection, parseTsv, toTsv } from "../src/clipboard";

describe("clipboard TSV", () => {
  it("neutralizes formula-injection prefixes", () => {
    for (const p of ["=cmd", "+1", "-1", "@x", "\tx", "\rx"]) {
      expect(neutralizeInjection(p)).toBe(`'${p}`);
    }
    expect(neutralizeInjection("safe")).toBe("safe");
    expect(neutralizeInjection("12.5")).toBe("12.5");
  });

  it("serializes a block, quoting fields with tabs/newlines/quotes", () => {
    expect(toTsv([["a", 1, null]])).toBe("a\t1\t");
    expect(toTsv([['q"x', "b\tc", "d\ne"]])).toBe('"q""x"\t"b\tc"\t"d\ne"');
  });

  it("round-trips quoted TSV including embedded tabs/newlines", () => {
    expect(parseTsv("a\t1\r\nb\t2")).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(parseTsv('"b\tc"\t"d\ne"')).toEqual([["b\tc", "d\ne"]]);
    expect(parseTsv('"q""x"')).toEqual([['q"x']]);
  });
});
