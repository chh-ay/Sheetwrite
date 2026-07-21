import { expect, test } from "@playwright/test";
import type { RendererPrefetchReport } from "../../docs/src/routes/test.prefetch.js";

declare global {
  interface Window {
    __sheetwriteRunPrefetchTrace?: () => Promise<RendererPrefetchReport>;
  }
}

test("logical-clock directional prefetch stays resident and bounded", async ({ page }) => {
  await page.goto("/test/prefetch");
  await expect(page.getByTestId("prefetch-fixture")).toHaveAttribute("data-ready", "true");

  const report = await page.evaluate(async () => {
    const run = window.__sheetwriteRunPrefetchTrace;
    if (!run) throw new Error("Prefetch trace fixture is unavailable");
    return run();
  });
  console.log(`PREFETCH_BROWSER_TRACE ${JSON.stringify(report)}`);

  expect(report.repetitions).toHaveLength(5);
  expect(report.policy.devicePixelRatio).toBe(1);
  expect(report.policy.viewportRows).toBe(20);
  expect(report.policy.velocityWindowsPerFrame).toBe(0.25);
  expect(report.medianResidencyRatio).toBeGreaterThanOrEqual(0.95);
  expect(report.medianP95VisibleWaitMs).toBeLessThan(16.7);
  for (const repetition of report.repetitions) {
    expect(repetition.measuredFrames).toBe(49);
    expect(repetition.residencyRatio).toBeGreaterThanOrEqual(0.95);
    expect(repetition.p95VisibleWaitMs).toBeLessThan(16.7);
    expect(repetition.requests).toBeGreaterThan(0);
    expect(repetition.requestedRows).toBeGreaterThan(0);
    expect(repetition.bytesServed).toBeGreaterThan(0);
    expect(repetition.requestedRowMultiplier).toBeLessThanOrEqual(
      report.policy.requestMultiplierLimit,
    );
    expect(repetition.servedByteMultiplier).toBeLessThanOrEqual(
      report.policy.requestMultiplierLimit,
    );
    expect(repetition.reversalAborts).toBeGreaterThan(0);
    expect(repetition.jumpAborts).toBeGreaterThan(0);
    expect(repetition.cacheAllocatedBytes).toBeLessThanOrEqual(report.policy.cacheBytes);
    expect(repetition.jumpVisibleResidentBeforeResponse).toBe(false);
    expect(repetition.jumpVisibleResidentAfterResponse).toBe(true);
  }
});

test("native wheel scrolling drives the real 90 ms scale datasource", async ({ page }) => {
  await page.goto("/showcases/performance");
  const grid = page.getByLabel("Million-row telemetry grid");
  await expect(grid).toBeVisible();
  await expect(page.getByTestId("scale-requests")).not.toHaveText("0");
  const before = Number(
    (await page.getByTestId("scale-requests").textContent())?.replaceAll(",", ""),
  );

  await grid.hover();
  await page.mouse.wheel(0, 2_400);
  await expect
    .poll(async () =>
      Number((await page.getByTestId("scale-requests").textContent())?.replaceAll(",", "")),
    )
    .toBeGreaterThan(before);
});
