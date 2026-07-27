import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

// Focused contracts for the /vanilla/ engine workbench: explicit lifecycle,
// construction-bound renderer/data options behind deep links, Worker
// failure fallback, host-owned paging, and workbook operations — all through
// the framework-free host module. Shared boot/nav coverage stays in
// examples.spec.ts.

const VANILLA_URL = siteUrl("/vanilla/");
const GRID = ".sw-vw-stage .sheetwrite";
const CANVAS = `${GRID} .sheetwrite-canvas`;
const FIRST_ACCOUNT = "Account 000001";
const WORKER_ASSET = /\/assets\/worker-[A-Za-z0-9_-]+\.js$/;

interface BrowserErrors {
  console: string[];
  page: string[];
  worker: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [], worker: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.context().on("weberror", (error) => errors.worker.push(error.error().message));
  return errors;
}

async function gridCellTexts(page: Page): Promise<string[]> {
  return page.locator(`${GRID} [role="gridcell"]`).allTextContents();
}

/**
 * Compositor-level paint check that works for both the main-thread canvas and
 * the transferred Worker OffscreenCanvas (whose 2D context is unreachable).
 */
async function canvasBodyPainted(page: Page): Promise<boolean> {
  const canvas = page.locator(CANVAS);
  // The workbench sits below the showcase hero; the clip must be on-screen.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box || box.width <= 80 || box.height <= 56) return false;

  const image = await page.screenshot({
    clip: {
      x: box.x + 64,
      y: box.y + 40,
      width: Math.min(320, box.width - 64),
      height: Math.min(180, box.height - 40),
    },
  });
  const rgba = await page.evaluate(async (encoded) => {
    const source = new Image();
    source.src = `data:image/png;base64,${encoded}`;
    await source.decode();
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return [];
    context.drawImage(source, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  }, image.toString("base64"));

  return hasOpaqueForeground(rgba);
}

async function waitForLive(page: Page): Promise<void> {
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect
    .poll(() => gridCellTexts(page), { timeout: 15_000, message: "grid never exposed cells" })
    .toContain(FIRST_ACCOUNT);
}

/** Commit `value` into B2 through the shell name box and formula bar. */
async function commitB2(page: Page, value: string): Promise<void> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await page.fill("#formula", value);
  await page.press("#formula", "Enter");
}

async function readB2(page: Page): Promise<string> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  return page.locator("#formula").inputValue();
}

/** Host action buttons, excluding the Grid's built-in toolbar. */
function actionButton(page: Page, name: string) {
  return page.locator(".sw-vw-instrument").getByRole("button", { name, exact: true });
}

async function openConstructionControls(page: Page): Promise<void> {
  const details = page.locator(".sw-vw-details");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByText("Construction & debug controls", { exact: true }).click();
  }
}

test("boots product-first, paints, and exposes the ownership instruments", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1568, height: 900 });

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Main thread · Active: Main thread",
  );
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  const hero = await page.locator(".sw-showcase-page__hero").boundingBox();
  const installCommand = page.locator(".sw-showcase-page__install .sw-install-command");
  expect(hero).not.toBeNull();
  expect(hero!.height).toBeGreaterThanOrEqual(300);
  expect(hero!.height).toBeLessThanOrEqual(390);
  await expect(installCommand).toContainText("npm install @sheetwrite/core");
  expect(
    await installCommand.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  const stage = await page.locator(".sw-vw-gridstage").boundingBox();
  const instrument = await page.locator(".sw-vw-instrument").boundingBox();
  expect(stage).not.toBeNull();
  expect(instrument).not.toBeNull();
  expect(stage!.y).toBeLessThan(620);
  expect(stage!.width).toBeGreaterThan(instrument!.width * 2.5);
  await expect(page.locator(".sw-vw-stagewrap")).toBeInViewport();

  const scenarios = page.getByRole("tablist", { name: "Vanilla Grid scenarios" });
  await expect(scenarios).toBeVisible();
  await expect(scenarios.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: /Main \/ Worker/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("complementary", { name: "Lifecycle ownership" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Grid lifecycle" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Rendering thread" })).toBeVisible();
  await expect(page.getByTestId("activity")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('.sw-vw-stage [aria-label="Spreadsheet grid"]')).toBeAttached();

  await openConstructionControls(page);
  await expect(page.getByRole("toolbar", { name: "Workbench controls" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Data path" })).toBeVisible();

  await page.getByRole("tab", { name: /XLSX/ }).click();
  await expect(page.getByRole("toolbar", { name: "Workbook operations" })).toBeVisible();
  await expect(page.getByLabel("Import an XLSX workbook")).toBeAttached();

  const proofNav = page.getByRole("navigation", { name: "Dedicated capability proofs" });
  await expect(proofNav.locator('a[href="/showcases/performance/#million-rows"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/interoperability/#xlsx"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/database/"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/collaboration/"]')).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("scenario tabs support keyboard focus and drive real construction options", async ({
  page,
}) => {
  await page.goto(VANILLA_URL);
  await waitForLive(page);

  const lifecycle = page.getByRole("tab", { name: /Main \/ Worker/ });
  await lifecycle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Paged source/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /Paged source/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(/[?&]data=paged/);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2", {
    timeout: 20_000,
  });

  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /XLSX/ })).toBeFocused();
  await expect(page).not.toHaveURL(/data=paged/);
  await page.keyboard.press("Home");
  await expect(lifecycle).toBeFocused();
  await expect(lifecycle).toHaveAttribute("aria-selected", "true");
});
test("destroy, create, and reset bound explicit grid generations", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await commitB2(page, "generation-one-edit");
  await expect.poll(() => readB2(page)).toBe("generation-one-edit");

  // Explicit destroy: nothing of the grid survives.
  await page.getByRole("button", { name: "Destroy" }).click();
  await expect(page.getByTestId("destroyed")).toBeVisible();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "destroyed");
  await expect(page.locator(GRID)).toHaveCount(0);
  await expect(page.locator("#formula")).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);

  // Explicit create: a fresh generation with a fresh document.
  await page.getByRole("button", { name: "Create grid" }).click();
  await waitForLive(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect.poll(() => readB2(page)).not.toBe("generation-one-edit");

  await openConstructionControls(page);
  // Reset rebuilds with the same construction options.
  await commitB2(page, "generation-two-edit");
  await page.getByRole("button", { name: "Reset generation" }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "3", {
    timeout: 20_000,
  });
  await waitForLive(page);
  await expect.poll(() => readB2(page)).not.toBe("generation-two-edit");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("read-only is a live option that never rebuilds the grid", async ({ page }) => {
  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await openConstructionControls(page);

  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(page.locator("#formula")).toHaveJSProperty("readOnly", true);

  // The cell editor refuses to open while locked.
  await page.locator(GRID).click({ position: { x: 300, y: 82 } });
  await page.keyboard.press("F2");
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toHaveCount(0);
  // Same generation: no destroy/create happened.
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");

  await page.getByRole("checkbox", { name: "Read-only" }).uncheck();
  await expect(page.locator("#formula")).toHaveJSProperty("readOnly", false);
  await commitB2(page, "unlocked-edit");
  await expect.poll(() => readB2(page)).toBe("unlocked-edit");
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");
});

test("renderer selection is construction-bound and deep-linked", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  const workerUrls: string[] = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));

  await page.goto(VANILLA_URL);
  await waitForLive(page);

  await page.getByRole("radio", { name: "Web Worker" }).click();
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Web Worker · Active: Web Worker",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  await expect(page).toHaveURL(/[?&]renderer=worker/);
  // The rebuild is explicit: a second generation, not a mutated first one.
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker never acknowledged a frame",
    })
    .toBeGreaterThan(0);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);
  expect(workerUrls.length).toBe(1);
  expect(workerUrls[0]).toMatch(WORKER_ASSET);

  await page.getByRole("radio", { name: "Main thread" }).click();
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Main thread · Active: Main thread",
    { timeout: 20_000 },
  );
  await expect(page).not.toHaveURL(/renderer=worker/);
  await expect
    .poll(() => page.workers().length, { message: "Worker survived renderer teardown" })
    .toBe(0);

  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("DPR-only changes repaint both main-thread and Worker canvases", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    const resolutionQueries = new Set<MediaQueryList>();
    let dpr = 1;

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => dpr,
    });
    window.matchMedia = ((media: string): MediaQueryList => {
      if (!media.startsWith("(resolution: ")) return nativeMatchMedia(media);

      const target = new EventTarget();
      Object.defineProperties(target, {
        matches: {
          configurable: true,
          get: () => media === `(resolution: ${dpr}dppx)`,
        },
        media: { configurable: true, value: media },
        onchange: { configurable: true, writable: true, value: null },
      });
      Object.assign(target, {
        addListener(listener: EventListener): void {
          target.addEventListener("change", listener);
        },
        removeListener(listener: EventListener): void {
          target.removeEventListener("change", listener);
        },
      });
      const query = target as MediaQueryList;
      resolutionQueries.add(query);
      return query;
    }) as typeof window.matchMedia;
    Object.defineProperty(window, "__sheetwriteSetDpr", {
      configurable: true,
      value: (next: number): void => {
        dpr = next;
        for (const query of Array.from(resolutionQueries)) {
          if (!query.matches) query.dispatchEvent(new Event("change"));
        }
      },
    });
  });

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  const canvas = page.locator(CANVAS);
  const backingScale = () =>
    canvas.evaluate((element) => {
      const node = element as HTMLCanvasElement;
      return node.width / node.getBoundingClientRect().width;
    });
  await expect.poll(backingScale).toBeCloseTo(1, 1);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __sheetwriteSetDpr: (next: number) => void;
      }
    ).__sheetwriteSetDpr(2);
  });
  await expect.poll(backingScale).toBeCloseTo(2, 1);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __sheetwriteSetDpr: (next: number) => void;
      }
    ).__sheetwriteSetDpr(1);
  });
  await expect.poll(backingScale).toBeCloseTo(1, 1);

  await page.getByRole("radio", { name: "Web Worker" }).click();
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Web Worker · Active: Web Worker",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  await expect
    .poll(async () => Number((await canvas.getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker never acknowledged its initial frame",
    })
    .toBeGreaterThan(0);
  const firstWorkerFrame = Number((await canvas.getAttribute("data-worker-frame")) ?? 0);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __sheetwriteSetDpr: (next: number) => void;
      }
    ).__sheetwriteSetDpr(2);
  });
  await expect
    .poll(async () => Number((await canvas.getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not repaint after the DPR-only change",
    })
    .toBeGreaterThan(firstWorkerFrame);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  const secondWorkerFrame = Number((await canvas.getAttribute("data-worker-frame")) ?? 0);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __sheetwriteSetDpr: (next: number) => void;
      }
    ).__sheetwriteSetDpr(1);
  });
  await expect
    .poll(async () => Number((await canvas.getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not repaint after the rearmed DPR query changed",
    })
    .toBeGreaterThan(secondWorkerFrame);

  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("worker repaint keeps a cached non-shared view painted after a sub-row scroll", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${VANILLA_URL}?renderer=worker`);
  await waitForLive(page);
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Web Worker · Active: Web Worker",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker never acknowledged the initial frame",
    })
    .toBeGreaterThan(0);
  await expect.poll(() => canvasBodyPainted(page), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(false);

  const scroller = page.locator(`${GRID} .sheetwrite-scroller`);
  await scroller.hover();
  const initialFrame = Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0);
  await page.mouse.wheel(0, 8);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not paint the first sub-row scroll",
    })
    .toBeGreaterThan(initialFrame);

  const frameBeforeCachedPaint = Number(
    (await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0,
  );
  const cellsBeforeCachedPaint = await gridCellTexts(page);
  const scrollBeforeCachedPaint = await scroller.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 8);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollBeforeCachedPaint);
  const scrollAfterCachedPaint = await scroller.evaluate((element) => element.scrollTop);
  expect(scrollAfterCachedPaint - scrollBeforeCachedPaint).toBeLessThan(20);
  // The second fractional scroll stays inside the same row window, so the data
  // signature and visible cells stay fixed while another Worker frame paints.
  expect(await gridCellTexts(page)).toEqual(cellsBeforeCachedPaint);
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not repaint the cached view after a sub-row scroll",
    })
    .toBeGreaterThan(frameBeforeCachedPaint);
  await expect.poll(() => canvasBodyPainted(page), { timeout: 20_000 }).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("a failed Worker boot falls back honestly to the main thread", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  const failedWorkerUrls: string[] = [];
  // Two assets match `worker-*.js`: a tiny module that only exports the real
  // worker's URL (statically imported by the route chunk — aborting it kills
  // the whole page) and the multi-kilobyte worker bundle itself. Abort only
  // the bundle so the failure lands in the Worker boot path.
  await page.route("**/assets/worker-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.length < 1_000) {
      await route.fulfill({ response, body });
      return;
    }
    failedWorkerUrls.push(route.request().url());
    await route.abort("failed");
  });

  // Deep link straight into the Worker renderer.
  await page.goto(`${VANILLA_URL}?renderer=worker`);
  await waitForLive(page);

  const renderer = page.getByTestId("renderer");
  await expect(renderer).toContainText("Requested: Web Worker · Active: Main thread", {
    timeout: 20_000,
  });
  await expect(renderer).toContainText(/Fallback: .+/);
  await expect(renderer).toHaveAttribute("data-fallback-count", "1");
  expect(failedWorkerUrls.length).toBe(1);
  await expect
    .poll(() => page.workers().length, { message: "failed Worker was not terminated" })
    .toBe(0);

  // The fallback grid is fully alive: it paints and takes edits.
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);
  await commitB2(page, "fallback-edit");
  await expect.poll(() => readB2(page)).toBe("fallback-edit");

  expect(errors.page).toEqual([]);
});

test("the paged data path serves host pages and reports allocation honestly", async ({ page }) => {
  const errors = collectErrors(page);

  // Deep link straight into the paged datasource.
  await page.goto(`${VANILLA_URL}?data=paged`);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });

  const stats = page.getByTestId("paged-stats");
  await expect(stats).toBeVisible();
  await expect
    .poll(async () => Number((await stats.getAttribute("data-chunks")) ?? 0), {
      timeout: 15_000,
      message: "paged store never reported a loaded chunk",
    })
    .toBeGreaterThan(0);
  const initialChunks = Number((await stats.getAttribute("data-chunks")) ?? 0);
  await expect(stats).toHaveAttribute("data-fully-loaded", "false");

  // The aria mirror boots on the loading snapshot; focus a body cell so it
  // refreshes through normal grid interaction, then values are readable.
  await page.locator(GRID).click({ position: { x: 300, y: 82 } });
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain(FIRST_ACCOUNT);

  // Full-column aggregate over a partial store fails honestly.
  await actionButton(page, "Total ARR").click();
  await expect(page.getByTestId("activity")).toContainText("Needs the full dataset");
  // The summary sheet needs the whole fixture, so the host disables it here.
  await expect(actionButton(page, "Summary sheet")).toBeDisabled();

  // Scrolling far pulls new pages through the host page source.
  await page.locator(`${GRID} .sheetwrite-scroller`).evaluate((scroller) => {
    scroller.scrollTop = 500_000;
    scroller.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(async () => Number((await stats.getAttribute("data-chunks")) ?? 0), {
      timeout: 20_000,
      message: "scroll never grew the paged allocation",
    })
    .toBeGreaterThan(initialChunks);
  await expect(page.getByTestId("activity")).toContainText("served by the host page source");

  // Back to the dense path: stats disappear, aggregates complete.
  await page.getByRole("tab", { name: /Main \/ Worker/ }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect(page).not.toHaveURL(/data=paged/);
  await expect(page.getByTestId("paged-stats")).toHaveCount(0);
  await page.getByRole("tab", { name: /XLSX/ }).click();
  await actionButton(page, "Total ARR").click();
  await expect(page.getByTestId("activity")).toContainText("Pipeline total");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("workbook operations and the XLSX round trip run through the core API", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await page.getByRole("tab", { name: /XLSX/ }).click();

  // Sheet operation: summary tab with live cross-sheet formulas.
  await actionButton(page, "Summary sheet").click();
  await expect(page.locator(`${GRID} .sheetwrite-tab`, { hasText: "Summary" })).toBeVisible();
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain("Total ARR");

  // Neutral export produces a real download.
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await actionButton(page, "Export XLSX").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sheetwrite-workbench.xlsx");
  await expect(page.getByTestId("activity")).toContainText("Exported workbook");

  // Importing those bytes hydrates a new generation from the snapshot.
  const downloadPath = await download.path();
  await page.getByLabel("Import an XLSX workbook").setInputFiles({
    name: "roundtrip.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: readFileSync(downloadPath),
  });
  await expect(page.getByTestId("activity")).toContainText("Grid created from roundtrip.xlsx", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  // XLSX preserves the active Summary sheet. Its formulas survive the round trip,
  // and the owning data sheet remains reachable with its first account intact.
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain("Total ARR");
  const importedSummary = await gridCellTexts(page);
  const totalIndex = importedSummary.indexOf("Total ARR");
  expect(totalIndex).toBeGreaterThanOrEqual(0);
  expect(importedSummary[totalIndex + 1]).toMatch(/\d/);
  expect(importedSummary[totalIndex + 1]).not.toMatch(/^#/);
  await page.locator(`${GRID} .sheetwrite-tab`, { hasText: "Revenue pipeline" }).click();
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain(FIRST_ACCOUNT);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("the canvas stays fresh after the page scrolls past it", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await page.evaluate(() => {
      document.scrollingElement?.scrollTo(0, document.scrollingElement.scrollHeight);
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.scrollingElement?.scrollTo(0, 0));
    await page.locator(CANVAS).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await expect
      .poll(() => canvasBodyPainted(page), {
        message: `canvas stayed blank after page-scroll cycle ${cycle}`,
      })
      .toBe(true);
    expect(await gridCellTexts(page)).toContain(FIRST_ACCOUNT);
  }

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("the workbench stays operable on a mobile viewport", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  const stageTop = await page
    .locator(".sw-vw-gridstage")
    .evaluate((element) => (element as HTMLElement).offsetTop);
  const instrumentTop = await page
    .locator(".sw-vw-instrument")
    .evaluate((element) => (element as HTMLElement).offsetTop);
  expect(stageTop).toBeLessThan(instrumentTop);

  const installCommand = page.locator(".sw-showcase-page__install .sw-install-command");
  await expect(installCommand).toContainText("npm install @sheetwrite/core");
  await expect(page.getByRole("link", { name: /Open the integration guide/ })).toBeVisible();
  expect(
    await installCommand.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  // The workbench itself never overflows horizontally.
  const overflow = await page
    .locator(".sw-vw")
    .evaluate((section) => section.scrollWidth - section.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Core interactions still work at phone width.
  await commitB2(page, "mobile-edit");
  await expect.poll(() => readB2(page)).toBe("mobile-edit");

  await page.getByRole("button", { name: "Destroy" }).click();
  await expect(page.getByTestId("destroyed")).toBeVisible();
  await page.getByRole("button", { name: "Create grid" }).click();
  await waitForLive(page);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("selected scenarios follow the site theme contrast", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sheetwrite-theme", "light"));
  await page.goto(VANILLA_URL);
  await waitForLive(page);
  const selected = page.getByRole("tab", { name: /Main \/ Worker/ });
  const light = await selected.evaluate((element) => getComputedStyle(element).backgroundColor);
  const installCard = page.locator(".sw-showcase-page__install");
  const cardLight = await installCard.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => installCard.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(cardLight);
  await expect
    .poll(() => selected.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(light);
});
