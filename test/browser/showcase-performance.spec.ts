import { expect, type Page, test } from "@playwright/test";
import type { Grid, PagedStoreStats } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/performance/");
const CACHE_BUDGET_BYTES = 8 * 1024 * 1024;

interface BootErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

async function pagedStats(page: Page, sheet: string): Promise<PagedStoreStats | null> {
  return page.evaluate((target) => {
    const store = window.__sheetwriteScaleGrid?.store;
    if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
      return null;
    }
    return store.getPagedStats(target) as PagedStoreStats;
  }, sheet);
}

async function bootScale(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector(".sw-sp-grid canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(async () => (await pagedStats(page, "feed"))?.loadedCells ?? 0, {
      timeout: 15_000,
      message: "million-row feed never hydrated its first page",
    })
    .toBeGreaterThan(0);
}

test("performance page mounts one million paged rows allocation-lazy", async ({ page }) => {
  const errors = collectErrors(page);
  await bootScale(page);

  await expect(page.locator('[data-testid="scale-status"]')).toContainText("1,000,000");

  const stats = await pagedStats(page, "feed");
  expect(stats).not.toBeNull();
  expect(stats!.fullyLoaded).toBe(false);
  expect(stats!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);

  // Deterministic dataset: first feed cell is its 1-based row id.
  expect(
    await page.evaluate(
      () => window.__sheetwriteScaleGrid?.store.getCell({ sheet: "feed", row: 0, col: 0 }).resolved,
    ),
  ).toBe(1);

  // The live panel mirrors the same public stats handle.
  await expect
    .poll(() => page.locator('[data-testid="scale-loaded-cells"]').textContent(), {
      timeout: 15_000,
    })
    .not.toBe("0");
  await expect(page.locator('[data-testid="scale-query-state"]')).toContainText("incomplete");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("jumping deep into the feed pages on demand; scans and exports refuse to fabricate", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);

  await page.fill('[data-testid="scale-jump-input"]', "742000");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "feed", row: 741_999, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(742_000);
  expect((await pagedStats(page, "feed"))!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);

  // Full-dataset CSV export must throw a typed IncompleteDataError, surfaced in the UI.
  await page.click('[data-testid="scale-export-attempt"]');
  const exportReport = page.locator('[data-testid="scale-export-report"]');
  await expect(exportReport).toBeVisible();
  await expect(exportReport).toHaveAttribute("data-state", "incomplete");
  await expect(exportReport).toContainText("IncompleteDataError");
  await expect(exportReport).toContainText("6,000,000");

  // A timed filtered scan over the same paged sheet reports the identical
  // typed refusal with loaded/total counts — and real timing either way.
  await page.click('[data-testid="scale-scan-attempt"]');
  const scanReport = page.locator('[data-testid="scale-scan-report"]');
  await expect(scanReport).toBeVisible();
  await expect(scanReport).toHaveAttribute("data-state", "incomplete");
  await expect(scanReport).toContainText("SUM(column 3)");
  await expect(scanReport).toContainText("IncompleteDataError");
  await expect(scanReport).toContainText("ms");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("wide sheet pages hydrate 121-column rows while staying under budget", async ({ page }) => {
  const errors = collectErrors(page);
  await bootScale(page);

  await page.click('[data-testid="scale-sheet-wide"]');
  await expect(page.locator('[data-testid="scale-sheet-wide"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () => (await pagedStats(page, "wide"))?.loadedCells ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0);

  // Deterministic wide row: id column is 1-based row index.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 0, col: 0 }).resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);
  const wide = await pagedStats(page, "wide");
  expect(wide!.fullyLoaded).toBe(false);
  expect(wide!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("row jump remains sheet-relative across click, Enter, clamp, and invalid input", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);
  const input = page.locator('[data-testid="scale-jump-input"]');
  const status = page.locator('[data-testid="scale-status"]');

  await page.click('[data-testid="scale-sheet-wide"]');
  await expect(input).toHaveAttribute("min", "1");
  await expect(input).toHaveAttribute("max", "250000");
  await expect(input).toHaveAttribute("aria-describedby", /scale-jump-help/);

  await input.fill("1");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 0, col: 0 }).resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);
  await expect(status).toContainText("Wide metrics row 1");

  await input.fill("250000");
  await input.press("Enter");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 249_999, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(250_000);
  await expect(status).toContainText("Wide metrics row 250,000");
  await expect(input).toBeFocused();

  await input.fill("120000");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 119_999, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(120_000);
  await expect(status).toContainText("Wide metrics row 120,000");
  expect(await page.evaluate(() => window.__sheetwriteScaleGrid?.getActiveSheet())).toBe("wide");

  await input.fill("120001");
  await input.press("Enter");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 120_000, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(120_001);
  await expect(input).toBeFocused();

  await input.fill("742000");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "wide", row: 249_999, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(250_000);
  await expect(status).toContainText("Requested Wide metrics row 742,000");
  await expect(status).toContainText("clamped to row 250,000");
  expect(await page.evaluate(() => window.__sheetwriteScaleGrid?.getActiveSheet())).toBe("wide");

  const scrollTop = await page.locator(".sheetwrite-scroller").evaluate((node) => node.scrollTop);
  for (const invalid of ["", "0", "-1", "1.5"]) {
    await input.fill(invalid);
    await page.click('[data-testid="scale-jump"]');
    await expect(status).toContainText("Enter a whole row from 1 to 250,000 for Wide metrics");
    expect(await page.locator(".sheetwrite-scroller").evaluate((node) => node.scrollTop)).toBe(
      scrollTop,
    );
  }

  await page.click('[data-testid="scale-sheet-feed"]');
  await expect(input).toHaveAttribute("max", "1000000");
  await input.fill("500");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "feed", row: 499, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(500);
  await expect(status).toContainText("Telemetry feed row 500");
  expect(await page.evaluate(() => window.__sheetwriteScaleGrid?.getActiveSheet())).toBe("feed");

  await page.click('[data-testid="scale-sheet-wide"]');
  await input.fill("100");
  await input.press("Enter");
  await expect(status).toContainText("Wide metrics row 100");
  expect(await page.evaluate(() => window.__sheetwriteScaleGrid?.getActiveSheet())).toBe("wide");
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("cache churn sweep keeps the clean cache inside its byte budget", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await bootScale(page);

  await page.click('[data-testid="scale-churn-run"]');
  const report = page.locator('[data-testid="scale-churn-report"]');
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(report).toHaveAttribute("data-state", "pass");
  await expect(page.locator('[data-testid="scale-churn-verdict"]')).toHaveText("yes");

  // Independent check through the store handle, not just the UI.
  const stats = await pagedStats(page, "feed");
  expect(stats!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("bulk commits cross the WASM boundary a bounded number of times", async ({ page }) => {
  const errors = collectErrors(page);
  await bootScale(page);

  await page.click('[data-testid="scale-crossings-values"]');
  const ffi = page.locator('[data-testid="scale-crossings-ffi"]');
  await expect(ffi).toBeVisible({ timeout: 15_000 });
  const valueCrossings = Number.parseInt((await ffi.textContent()) ?? "NaN", 10);
  expect(valueCrossings).toBeGreaterThan(0);
  // 20,000 cells must NOT mean ~20,000 crossings; bulk ops batch the boundary.
  expect(valueCrossings).toBeLessThan(100);
  await expect(page.locator('[data-testid="scale-crossings-latest"]')).toContainText("20,000");
  await expect(page.locator('[data-testid="scale-resource-delta"]')).toContainText(
    "Latest measured bulk-edit delta",
  );
  await expect(page.locator('[data-testid="scale-resource-delta"]')).toContainText(
    "before → settled",
  );

  await page.click('[data-testid="scale-crossings-styles"]');
  await expect
    .poll(async () => {
      const text = await page.locator('[data-testid="scale-crossings-ffi"]').textContent();
      return Number.parseInt(text ?? "NaN", 10);
    })
    .toBeLessThan(100);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("worker renderer reports what actually constructed, with honest fallback", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);

  await page.click('[data-testid="scale-renderer-worker"]');
  await page.waitForSelector(".sw-sp-grid canvas", { state: "attached", timeout: 15_000 });
  const state = page.locator('[data-testid="scale-renderer-state"]');
  await expect(state).toContainText("Requested worker", { timeout: 15_000 });

  // Either the worker constructed, or the page states the fallback reason —
  // rendererKind() truth, never the requested option echoed back.
  await expect
    .poll(
      async () => {
        const active = await page.locator('[data-testid="scale-renderer-active"]').textContent();
        const line = (await state.textContent()) ?? "";
        return active === "worker" || line.includes("fell back");
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const reportedActive = await page.locator('[data-testid="scale-renderer-active"]').textContent();
  const actualKind = await page.evaluate(() => window.__sheetwriteScaleGrid?.rendererKind());
  expect(reportedActive).toBe(actualKind);

  // The rebuilt worker-rendered grid still pages data.
  await expect
    .poll(async () => (await pagedStats(page, "feed"))?.loadedCells ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("benchmark evidence is committed, attributed, and separated from live numbers", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);

  const pagedProvenance = page.locator('[data-testid="scale-evidence-paged-provenance"]');
  await expect(pagedProvenance).toContainText("bench/results/paged-results.json");
  await expect(pagedProvenance).toContainText("paged-full-v1");
  await expect(page.locator('[data-testid="scale-evidence-paged"]')).toContainText("Startup");

  const compareProvenance = page.locator('[data-testid="scale-evidence-compare-provenance"]');
  await expect(compareProvenance).toContainText("docs/src/generated/landing-bench.json");
  await expect(compareProvenance).toContainText("Chromium");
  await expect(compareProvenance).toContainText("commit");

  // The page explicitly refuses to mix live and committed measurements.
  await expect(page.locator("#evidence")).toContainText("never mixed");
  await expect(page.locator('[data-testid="scale-resource-schema"]')).toHaveText("2");
  await expect(page.locator('[data-testid="scale-resource-summary"]')).toContainText(
    "Logical live payload",
  );
  await expect(page.locator('[data-testid="scale-resource-summary"]')).toContainText(
    "Allocated owner capacity",
  );
  await expect(page.locator('[data-testid="scale-resource-summary"]')).toContainText(
    "WASM committed pages",
  );
  await expect(page.locator('[data-testid="scale-resource-owners"] tbody tr')).not.toHaveCount(0);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("performance page stays operable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await bootScale(page);

  await expect(page.getByRole("navigation", { name: "Page sections" })).toBeVisible();
  for (const anchor of [
    "million-rows",
    "wide-page",
    "cache-churn",
    "worker",
    "wasm-crossings",
    "resource-ownership",
    "evidence",
  ]) {
    await expect(page.locator(`#${anchor}`)).toHaveCount(1);
  }
  await expect(page.getByLabel("Million-row telemetry grid")).toBeVisible();

  const jump = page.locator('[data-testid="scale-jump-input"]');
  await jump.scrollIntoViewIfNeeded();
  await jump.fill("250000");
  await page.click('[data-testid="scale-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteScaleGrid?.store.getCell({ sheet: "feed", row: 249_999, col: 0 })
              .resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(250_000);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("topbar leaves benchmark navigation to the documentation sidebar", async ({ page }) => {
  await page.goto(ROUTE);
  const navigation = page.getByRole("navigation", { name: "Site" });

  await expect(navigation.getByRole("link")).toHaveText(["Docs", "Showcases"]);
  await expect(navigation.getByRole("link", { name: "Benchmarks" })).toHaveCount(0);
});
