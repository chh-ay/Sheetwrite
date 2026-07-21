import { describe, expect, it } from "bun:test";
import { runDatasourcePrefetchBenchmark } from "../src/datasource-prefetch-bench.js";

describe("directional datasource prefetch gate", () => {
  it("keeps every logical-clock repetition resident, bounded, and cancellable", async () => {
    const report = await runDatasourcePrefetchBenchmark();

    expect(report.repetitions).toHaveLength(5);
    expect(report.medianResidencyRatio).toBeGreaterThanOrEqual(0.95);
    expect(report.medianP95VisibleWaitMs).toBeLessThan(report.policy.frameMs);
    expect(report.sparseBookkeeping).toEqual({
      logicalRows: 1_000_000_000,
      visibleRows: 20,
      loadedBands: 0,
      ownedBands: 0,
      visibleWaitingBands: 1,
      visibleWaitingRows: 20,
      modeledNumericPayloadBytes: 32,
    });
    for (const repetition of report.repetitions) {
      expect(repetition.residencyRatio).toBeGreaterThanOrEqual(0.95);
      expect(repetition.p95VisibleWaitMs).toBeLessThan(report.policy.frameMs);
      expect(repetition.requestedRowMultiplier).toBeLessThanOrEqual(
        report.policy.requestMultiplierLimit,
      );
      expect(repetition.servedByteMultiplier).toBeLessThanOrEqual(
        report.policy.requestMultiplierLimit,
      );
      expect(repetition.peakActiveRequests).toBeLessThanOrEqual(report.policy.activeRequestLimit);
      expect(repetition.peakActiveSpeculativeRows).toBeLessThanOrEqual(
        report.policy.lookaheadRowsLimit,
      );
      expect(repetition.reversalAborts).toBeGreaterThan(0);
      expect(repetition.jumpAborts).toBeGreaterThan(0);
      expect(repetition.cacheAllocatedBytes).toBeLessThanOrEqual(report.policy.cacheBytes);
      expect(repetition.jumpVisibleResidentBeforeResponse).toBe(false);
      expect(repetition.jumpVisibleResidentAfterResponse).toBe(true);
    }
  });
});
