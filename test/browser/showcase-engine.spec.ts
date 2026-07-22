import { expect, type Page, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/engine/");
const ENGINE_TRACE_LIMIT = 40;
const ENGINE_ROUTE_TRANSFER_LIMIT = 350 * 1024;
const ENGINE_BOOT_TRANSFER_LIMIT = 2 * 1024 * 1024;

declare global {
  interface Window {
    __sheetwriteEngineShowcase?: {
      grid(): {
        store: {
          getCell(address: { sheet: string; row: number; col: number }): { resolved: unknown };
        };
      } | null;
      run(action: "jump" | "edit" | "undo" | "save" | "renderer"): Promise<void>;
      reset(): void;
      traceLength(): number;
      timerCount(): number;
    };
    __sheetwriteEngineLongTasks?: Array<{ startTime: number; duration: number }>;
  }
}

async function bootEngine(page: Page) {
  await page.goto(ROUTE);
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-status"]')).toContainText("Live sheet ready", {
    timeout: 20_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteEngineShowcase
              ?.grid()
              ?.store.getCell({ sheet: "forecast", row: 0, col: 0 }).resolved,
        ),
      { timeout: 20_000 },
    )
    .toBe(1);
}

test("direct route jumps, edits a live formula, and undoes in the same Grid", async ({ page }) => {
  await bootEngine(page);
  await page.fill('[data-testid="engine-jump-input"]', "24001");
  await page.click('[data-testid="engine-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteEngineShowcase
              ?.grid()
              ?.store.getCell({ sheet: "forecast", row: 24_000, col: 0 }).resolved,
        ),
      { timeout: 20_000 },
    )
    .toBe(24_001);

  const before = await page.evaluate(() => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: store.getCell({ sheet: "forecast", row: 24_000, col: 3 }).resolved,
      difference: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
    };
  });
  await page.click('[data-testid="engine-edit"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteEngineShowcase!.grid()!.store;
        return {
          actual: store.getCell({ sheet: "forecast", row: 24_000, col: 3 }).resolved,
          difference: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
        };
      }),
    )
    .toEqual({
      actual: Number(before.actual) + 25,
      difference: Number(before.difference) + 25,
    });
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="formula-update"]'),
  ).toHaveCount(1);

  await page.click('[data-testid="engine-undo"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteEngineShowcase!.grid()!.store;
        return {
          actual: store.getCell({ sheet: "forecast", row: 24_000, col: 3 }).resolved,
          difference: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
        };
      }),
    )
    .toEqual(before);
});

test("drawing choice reports the actual path and the host acknowledges a real Grid change", async ({
  page,
}) => {
  await bootEngine(page);
  await page.click('[data-testid="engine-edit"]');
  await expect(page.locator('[data-testid="engine-save"]')).toBeEnabled();
  await page.click('[data-testid="engine-save"]');
  await expect(page.locator('[data-testid="engine-status"]')).toContainText(
    "host acknowledged 1 change at version 1",
  );
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="host-save"]'),
  ).toContainText("applied at version 1");

  await page.selectOption('[data-testid="engine-renderer"]', "worker");
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="renderer"]').first(),
  ).toContainText(/worker active|worker requested, canvas active/, { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-active-renderer"]')).toHaveText(/worker|canvas/);
});

test("normal, reduced-motion, theme, and mobile states stay operable as text", async ({ page }) => {
  await bootEngine(page);
  await expect(page.locator('[data-testid="engine-play"]')).toBeEnabled();
  const keyboard = page.locator('[data-testid="engine-keyboard-surface"]');
  await keyboard.focus();
  await keyboard.press("ArrowRight");
  await expect(page.locator('[data-testid="engine-script-step"]')).toContainText("2/6");
  await keyboard.press("r");
  await expect(page.locator('[data-testid="engine-script-step"]')).toContainText("1/6");
  await keyboard.press("Space");
  await expect(page.locator('[data-testid="engine-play"]')).toHaveAttribute("aria-pressed", "true");
  await keyboard.press("Space");
  await expect(page.locator('[data-testid="engine-play"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const startingTheme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Use (light|dark) theme/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", startingTheme ?? "dark");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sw-engine-stage__workspace")).toHaveCSS(
    "grid-template-columns",
    /390|382|1fr|px/,
  );
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    })),
  ).toMatchObject({ viewport: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-reduced-note"]')).toContainText(
    "player stays paused",
  );
  await expect(page.locator('[data-testid="engine-play"]')).toBeDisabled();
  await page.click('[data-testid="engine-step"]');
  await expect(page.locator('[data-testid="engine-script-step"]')).toContainText("2/6");
  expect(
    await page
      .locator(".sw-engine-cutaway__map path")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});

test("one hundred actions keep timers, trace, and DOM bounded, then lifecycle cleanup runs", async ({
  page,
}) => {
  await bootEngine(page);
  const beforeNodes = await page.locator("*").count();
  await page.evaluate(async () => {
    const handle = window.__sheetwriteEngineShowcase!;
    for (let loop = 0; loop < 50; loop += 1) {
      await handle.run("edit");
      await handle.run("undo");
    }
  });
  const bounds = {
    trace: await page.evaluate(() => window.__sheetwriteEngineShowcase!.traceLength()),
    logNodes: await page.locator('[data-testid="engine-event-log"] > li').count(),
    timers: await page.evaluate(() => window.__sheetwriteEngineShowcase!.timerCount()),
    beforeNodes,
    afterNodes: await page.locator("*").count(),
  };
  console.log(`ENGINE_BOUND_EVIDENCE ${JSON.stringify(bounds)}`);
  expect(bounds.trace).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  expect(bounds.logNodes).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  expect(bounds.timers).toBe(0);
  expect(bounds.afterNodes).toBeLessThanOrEqual(beforeNodes + ENGINE_TRACE_LIMIT * 4);

  await page.getByRole("link", { name: "Browse every live feature" }).click();
  await expect(page).toHaveURL(/\/showcases\/$/);
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteEngineShowcase === undefined))
    .toBe(true);
});

test("landing keeps engine code idle until scroll intent, then loads only the teaser", async ({
  page,
}) => {
  const assets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script" || request.resourceType() === "fetch")
      assets.push(request.url());
  });
  await page.goto(siteUrl("/"));
  await page.waitForLoadState("networkidle");
  const engineAsset =
    /EngineShowcase|EngineLandingTeaser|sheetwrite_bg|\.wasm(?:\?|$)|\/core-[^/]+\.js/;
  expect(assets.filter((url) => engineAsset.test(url))).toEqual([]);

  await page.locator(".sw-landing-engine-slot").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", {
      name: "Watch the Grid, the calculation engine, and your host agree.",
    }),
  ).toBeVisible();
  await expect
    .poll(() => assets.some((url) => /EngineLandingTeaser/.test(url)), { timeout: 10_000 })
    .toBe(true);
  expect(assets.some((url) => /EngineShowcase|sheetwrite_bg|\.wasm(?:\?|$)/.test(url))).toBe(false);
});

test("measures the lazy route transfer and post-ready long tasks", async ({ page }) => {
  await page.addInitScript(() => {
    window.__sheetwriteEngineLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__sheetwriteEngineLongTasks!.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  });
  await bootEngine(page);
  const usableAt = await page.evaluate(() => {
    window.__sheetwriteEngineLongTasks = [];
    return performance.now();
  });
  await page.click('[data-testid="engine-edit"]');
  await page.click('[data-testid="engine-undo"]');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const measurement = await page.evaluate((start) => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const routeEntries = entries
      .filter((entry) => /EngineShowcase|showcases\.engine|showcase-engine/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split("/").at(-1) ?? entry.name,
        bytes: entry.encodedBodySize || entry.transferSize,
      }));
    const bootEntries = entries
      .filter((entry) => /\.(?:js|css|wasm)(?:\?|$)/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split("/").at(-1) ?? entry.name,
        bytes: entry.encodedBodySize || entry.transferSize,
      }));
    return {
      routeEntries,
      routeBytes: routeEntries.reduce((sum, entry) => sum + entry.bytes, 0),
      bootBytes: bootEntries.reduce((sum, entry) => sum + entry.bytes, 0),
      longTasks: (window.__sheetwriteEngineLongTasks ?? []).filter(
        (entry) => entry.startTime >= start,
      ),
    };
  }, usableAt);
  console.log(`ENGINE_ROUTE_EVIDENCE ${JSON.stringify(measurement)}`);
  expect(measurement.routeEntries.length).toBeGreaterThan(0);
  expect(measurement.routeBytes).toBeGreaterThan(0);
  expect(measurement.routeBytes).toBeLessThanOrEqual(ENGINE_ROUTE_TRANSFER_LIMIT);
  expect(measurement.bootBytes).toBeLessThanOrEqual(ENGINE_BOOT_TRANSFER_LIMIT);
  expect(measurement.longTasks.filter((entry) => entry.duration > 50)).toEqual([]);
});
