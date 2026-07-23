import { describe, expect, it } from "bun:test";
import type { SourceSnapshot } from "@sheetwrite/wasm";
import {
  consumeSourceSnapshot,
  RangeSourceProjection,
  REF_CYCLE,
  referenceTargetFromPacked,
} from "../src/reference.js";

describe("Rust-owned reference source projections", () => {
  it("performs sorted compact formula/reference lookups without a document graph replica", () => {
    const projection = new RangeSourceProjection(
      Uint32Array.of(1, 8),
      ["=A1", "=B2"],
      Uint32Array.of(3, 9),
      Uint32Array.of(0, 4, 5, 1, 6, 7),
      ["left", "right"],
    );

    expect(projection.formulaAt(1)).toBe("=A1");
    expect(projection.formulaAt(2)).toBeNull();
    expect(projection.referenceAt(3)).toEqual({ sheet: "left", row: 4, col: 5 });
    expect(projection.referenceAt(9)).toEqual({ sheet: "right", row: 6, col: 7 });
    expect([...projection.formulas()]).toEqual([
      [1, "=A1"],
      [8, "=B2"],
    ]);
    expect([...projection.references()]).toEqual([
      [3, { sheet: "left", row: 4, col: 5 }],
      [9, { sheet: "right", row: 6, col: 7 }],
    ]);
  });

  it("copies and frees opaque WASM source snapshots exactly once", () => {
    let frees = 0;
    const snapshot = {
      formulaOffsets: () => Uint32Array.of(2),
      formulaSources: () => ["=C3"],
      referenceOffsets: () => Uint32Array.of(4),
      referenceTargets: () => Uint32Array.of(0, 1, 2),
      free: () => {
        frees += 1;
      },
    } as unknown as SourceSnapshot;

    const projection = consumeSourceSnapshot(snapshot, ["s1"]);
    expect(projection.formulaAt(2)).toBe("=C3");
    expect(projection.referenceAt(4)).toEqual({ sheet: "s1", row: 1, col: 2 });
    expect(frees).toBe(1);
  });

  it("rejects unknown handles and retains the public cycle sentinel", () => {
    expect(referenceTargetFromPacked(Uint32Array.of(8, 1, 2), ["s1"])).toBeNull();
    expect(() =>
      new RangeSourceProjection(new Uint32Array(), [], Uint32Array.of(0), Uint32Array.of(8, 1, 2), [
        "s1",
      ]).referenceAt(0),
    ).toThrow("unknown sheet");
    expect(REF_CYCLE).toBe("#CYCLE!");
  });
});
