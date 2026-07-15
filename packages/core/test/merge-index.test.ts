import { describe, expect, it } from "bun:test";
import {
  getMergeIndexResourceStatsForTest,
  type MergeRect,
  prepareMergeIndex,
  resetMergeIndexResourceStatsForTest,
} from "../src/merge-index.js";

describe("PreparedMergeIndex", () => {
  it("reuses one index per merge-array revision and invalidates on replacement", () => {
    resetMergeIndexResourceStatsForTest();
    const initial: readonly MergeRect[] = [{ r0: 2, c0: 3, r1: 4, c1: 5 }];
    const first = prepareMergeIndex(initial);
    expect(prepareMergeIndex(initial)).toBe(first);
    expect(first.anchorAt(3, 4)).toEqual(initial[0]!);
    expect(first.anchorAt(0, 0)).toBeNull();
    expect(getMergeIndexResourceStatsForTest().indexConstructions).toBe(1);

    const replaced: readonly MergeRect[] = [{ r0: 7, c0: 8, r1: 9, c1: 10 }];
    const second = prepareMergeIndex(replaced);
    expect(second).not.toBe(first);
    expect(second.anchorAt(8, 9)).toEqual(replaced[0]!);
    expect(second.anchorAt(3, 4)).toBeNull();
    expect(getMergeIndexResourceStatsForTest().indexConstructions).toBe(2);

    const removed: readonly MergeRect[] = [];
    expect(prepareMergeIndex(removed).anchorAt(8, 9)).toBeNull();
  });

  it("returns window intersections and sorted gridline gaps", () => {
    const merges: readonly MergeRect[] = [
      { r0: 3, c0: 7, r1: 5, c1: 9 },
      { r0: 2, c0: 1, r1: 4, c1: 3 },
      { r0: 20, c0: 20, r1: 21, c1: 21 },
    ];
    const index = prepareMergeIndex(merges);
    expect(index.intersectingWindow(2, 6, [0, 1, 2, 3, 7, 8, 9])).toEqual([merges[1]!, merges[0]!]);
    expect(index.horizontalGaps(3, 0, 10)).toEqual([merges[1]!, merges[0]!]);
    expect(index.verticalGaps(8, 0, 10)).toEqual([merges[0]!]);
  });

  it("examines nearby candidates instead of thousands of offscreen merges", () => {
    const merges: MergeRect[] = Array.from({ length: 10_000 }, (_, index) => ({
      r0: 100_000 + index * 3,
      c0: 100_000 + index * 3,
      r1: 100_001 + index * 3,
      c1: 100_001 + index * 3,
    }));
    merges.push({ r0: 4, c0: 2, r1: 6, c1: 4 });
    resetMergeIndexResourceStatsForTest();
    const index = prepareMergeIndex(merges);

    expect(index.anchorAt(5, 3)).toEqual(merges.at(-1)!);
    expect(index.intersectingWindow(0, 10, [0, 1, 2, 3, 4, 5])).toEqual([merges.at(-1)!]);
    expect(index.horizontalGaps(4, 0, 5)).toEqual([merges.at(-1)!]);
    expect(index.verticalGaps(3, 0, 10)).toEqual([merges.at(-1)!]);

    const stats = getMergeIndexResourceStatsForTest();
    expect(stats.indexConstructions).toBe(1);
    expect(stats.candidatesExamined).toBeLessThanOrEqual(4);
  });
});
