import { describe, expect, it } from "bun:test";
import {
  getMergeIndexResourceStatsForTest,
  horizontalMergeGaps,
  intersectingMerges,
  type MergeRect,
  mergeAnchorAt,
  prepareMergeIndex,
  resetMergeIndexResourceStatsForTest,
  verticalMergeGaps,
} from "../src/canvas-paint.js";

describe("PreparedMergeIndex", () => {
  it("returns stable answers across repeated queries and updated merge sets", () => {
    const initial: readonly MergeRect[] = [{ r0: 2, c0: 3, r1: 4, c1: 5 }];
    for (let query = 0; query < 2; query++) {
      const index = prepareMergeIndex(initial);
      expect(mergeAnchorAt(index, 3, 4)).toEqual(initial[0]!);
      expect(mergeAnchorAt(index, 0, 0)).toBeNull();
    }

    const replaced: readonly MergeRect[] = [{ r0: 7, c0: 8, r1: 9, c1: 10 }];
    const replacementIndex = prepareMergeIndex(replaced);
    expect(mergeAnchorAt(replacementIndex, 8, 9)).toEqual(replaced[0]!);
    expect(mergeAnchorAt(replacementIndex, 3, 4)).toBeNull();

    expect(mergeAnchorAt(prepareMergeIndex([]), 8, 9)).toBeNull();
  });

  it("returns window intersections and sorted gridline gaps", () => {
    const merges: readonly MergeRect[] = [
      { r0: 3, c0: 7, r1: 5, c1: 9 },
      { r0: 2, c0: 1, r1: 4, c1: 3 },
      { r0: 20, c0: 20, r1: 21, c1: 21 },
    ];
    const index = prepareMergeIndex(merges);
    expect(intersectingMerges(index, 2, 6, [0, 1, 2, 3, 7, 8, 9])).toEqual([
      merges[1]!,
      merges[0]!,
    ]);
    expect(horizontalMergeGaps(index, 3, 0, 10)).toEqual([merges[1]!, merges[0]!]);
    expect(verticalMergeGaps(index, 8, 0, 10)).toEqual([merges[0]!]);
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

    expect(mergeAnchorAt(index, 5, 3)).toEqual(merges.at(-1)!);
    expect(intersectingMerges(index, 0, 10, [0, 1, 2, 3, 4, 5])).toEqual([merges.at(-1)!]);
    expect(horizontalMergeGaps(index, 4, 0, 5)).toEqual([merges.at(-1)!]);
    expect(verticalMergeGaps(index, 3, 0, 10)).toEqual([merges.at(-1)!]);

    const stats = getMergeIndexResourceStatsForTest();
    expect(stats.indexConstructions).toBe(1);
    expect(stats.candidatesExamined).toBeLessThanOrEqual(4);
  });
});
