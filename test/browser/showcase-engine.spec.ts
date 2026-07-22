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
          getPagedStats(sheet: string): { allocatedBytes: number; loadedCells: number } | null;
        };
        getSelection(): unknown;
        getRuntimeResourceSnapshot(
          operation: "scroll",
          phase: "settled",
        ): { wasm: { allocatedCapacityBytes: number } };
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
    .toBe("Period");
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
    .toBe("FY26 W28");

  const before = await page.evaluate(() => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
      variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
      attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
    };
  });
  await page.click('[data-testid="engine-edit"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const grid = window.__sheetwriteEngineShowcase!.grid()!;
        return {
          actual: grid.store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
          variance: grid.store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
          selection: grid.getSelection(),
        };
      }),
    )
    .toMatchObject({
      actual: Number(before.actual) + 25,
      variance: Number(before.variance) + 25,
      selection: {
        kind: "range",
        range: {
          sheet: "forecast",
          start: { row: 24_000, col: 4 },
          end: { row: 24_000, col: 5 },
        },
      },
    });
  const after = await page.evaluate(() => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
      variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
      attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
    };
  });
  const dependency = page.locator('[data-testid="engine-dependency-readout"]');
  await expect(dependency).toHaveAttribute("data-action", "edit");
  const varianceDependency = dependency.locator('[data-address="E24001"]');
  await expect(varianceDependency).toContainText("E24001");
  await expect(varianceDependency).toContainText(
    `${String(before.variance)} → ${String(after.variance)}`,
  );
  await expect(varianceDependency).toContainText("=C24001-D24001");
  const attainmentDependency = dependency.locator('[data-address="F24001"]');
  await expect(attainmentDependency).toContainText("F24001");
  await expect(attainmentDependency).toContainText(
    `${String(before.attainment)} → ${String(after.attainment)}`,
  );
  await expect(attainmentDependency).toContainText("=IF(D24001=0,0,C24001/D24001)");

  await page.click('[data-testid="engine-undo"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteEngineShowcase!.grid()!.store;
        return {
          actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
          variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
          attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
        };
      }),
    )
    .toEqual(before);
  await expect(dependency).toHaveAttribute("data-action", "undo");
  await expect(dependency.locator('[data-address="E24001"]')).toContainText(
    `${String(after.variance)} → ${String(before.variance)}`,
  );
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

  const workerRenderer = page.locator('[data-testid="engine-renderer-worker"]');
  await workerRenderer.focus();
  await page.keyboard.press("Space");
  await expect(workerRenderer).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-testid="engine-renderer-canvas"]')).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(workerRenderer).toBeChecked();
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="renderer"]').first(),
  ).toContainText(/worker active|worker requested, canvas active/, { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-active-renderer"]')).toHaveText(/worker|canvas/);
});

test("keeps the Grid in the first viewport and bounds the supporting evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await bootEngine(page);

  const desktop = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const grid = rect('[data-testid="engine-grid"]');
    return {
      hero: rect(".sw-engine__hero"),
      grid,
      gridPanel: rect(".sw-engine-grid-panel"),
      trace: rect('[data-testid="engine-public-trace"]'),
      evidence: rect('[data-testid="engine-evidence-viewer"]'),
      visibleGrid: Math.min(grid.bottom, innerHeight) - Math.max(grid.top, 0),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(desktop.hero.height).toBeGreaterThanOrEqual(120);
  expect(desktop.hero.height).toBeLessThanOrEqual(260);
  expect(desktop.grid.top).toBeLessThan(650);
  expect(desktop.visibleGrid).toBeGreaterThan(250);
  expect(Math.abs(desktop.gridPanel.top - desktop.trace.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(desktop.gridPanel.bottom - desktop.trace.bottom)).toBeLessThanOrEqual(2);
  expect(desktop.gridPanel.width).toBeGreaterThan(desktop.trace.width * 2);
  expect(desktop.evidence.top).toBeGreaterThan(desktop.gridPanel.bottom);
  expect(desktop.evidence.height).toBeLessThanOrEqual(320);
  expect(desktop.overflow).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  const mobile = await page.evaluate(() => {
    const grid = document
      .querySelector<HTMLElement>('[data-testid="engine-grid"]')!
      .getBoundingClientRect();
    return {
      gridTop: grid.top,
      visibleGrid: Math.min(grid.bottom, innerHeight) - Math.max(grid.top, 0),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(mobile.gridTop).toBeLessThan(844);
  expect(mobile.visibleGrid).toBeGreaterThan(150);
  expect(mobile.overflow).toBeLessThanOrEqual(0);
});

test("site theme changes the actual Grid palette and mobile remains operable", async ({ page }) => {
  await bootEngine(page);
  const before = await page.locator('[data-testid="engine-grid"]').evaluate((host) => {
    const canvas = host.querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    return {
      mode: host.dataset.gridTheme,
      background: getComputedStyle(host).backgroundColor,
      pixel: Array.from(context.getImageData(300, 140, 1, 1).data),
    };
  });
  await page.getByRole("button", { name: /Use (light|dark) theme/ }).click();
  await expect(page.locator('[data-testid="engine-grid"]')).not.toHaveAttribute(
    "data-grid-theme",
    before.mode ?? "light",
  );
  const after = await page.locator('[data-testid="engine-grid"]').evaluate((host) => {
    const canvas = host.querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    return {
      mode: host.dataset.gridTheme,
      background: getComputedStyle(host).backgroundColor,
      pixel: Array.from(context.getImageData(300, 140, 1, 1).data),
    };
  });
  expect(after.mode).not.toBe(before.mode);
  expect(after.background).not.toBe(before.background);
  expect(after.pixel).not.toEqual(before.pixel);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTracks = await page
    .locator(".sw-engine-stage__workspace")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(mobileTracks.trim().split(/\s+/)).toHaveLength(1);
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    })),
  ).toMatchObject({ width: 390, viewport: 390 });
});

test("sustained Grid scrolling stays immediate, bounded, and free of long tasks", async ({
  page,
}) => {
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
  await page.evaluate(() => {
    window.__sheetwriteEngineLongTasks = [];
  });
  const grid = page.locator('[data-testid="engine-grid"]');
  const bounds = await grid.boundingBox();
  if (!bounds) throw new Error("The live Grid has no visible bounds");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  for (let index = 0; index < 16; index += 1) {
    await page.mouse.wheel(0, 720);
    await page.keyboard.press("PageDown");
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const evidence = await page.evaluate(() => {
    const gridInstance = window.__sheetwriteEngineShowcase!.grid()!;
    const pages = gridInstance.store.getPagedStats("forecast");
    const runtime = gridInstance.getRuntimeResourceSnapshot("scroll", "settled");
    return {
      loadedCells: pages?.loadedCells ?? 0,
      pageBytes: pages?.allocatedBytes ?? 0,
      engineBytes: runtime.wasm.allocatedCapacityBytes,
      longTasks: window.__sheetwriteEngineLongTasks ?? [],
    };
  });
  expect(evidence.loadedCells).toBeGreaterThan(0);
  expect(evidence.loadedCells).toBeLessThanOrEqual(8_192);
  expect(evidence.pageBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(evidence.engineBytes).toBeGreaterThanOrEqual(0);
  expect(evidence.longTasks.filter((entry) => entry.duration > 50)).toEqual([]);
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
        name: entry.name.split("/").slice(-1)[0] ?? entry.name,
        bytes: entry.encodedBodySize || entry.transferSize,
      }));
    const bootEntries = entries
      .filter((entry) => /\.(?:js|css|wasm)(?:\?|$)/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split("/").slice(-1)[0] ?? entry.name,
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
