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

/** Host action buttons, scoped away from the grid's built-in toolbar. */
function actionButton(page: Page, name: string) {
  return page.getByRole("toolbar", { name: "Workbook operations" }).getByRole("button", { name });
}

test("boots the framework-free workbench, paints, and stays accessible", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Main thread · Active: Main thread",
  );
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  // Accessibility contract: named toolbars, named radio groups, a polite
  // live region for host activity, and a labelled grid host.
  await expect(page.getByRole("toolbar", { name: "Workbench controls" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Workbook operations" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Rendering thread" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Data path" })).toBeVisible();
  await expect(page.getByTestId("activity")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('.sw-vw-stage [aria-label="Spreadsheet grid"]')).toBeAttached();
  await expect(page.getByLabel("Import an XLSX workbook")).toBeAttached();

  // Proof pages are linked, not re-implemented, on this route.
  const proofNav = page.getByRole("navigation", { name: "Dedicated capability proofs" });
  await expect(proofNav.locator('a[href="/showcases/performance/#million-rows"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/interoperability/#xlsx"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/database/"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/collaboration/"]')).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
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

  // Reset rebuilds with the same construction options.
  await commitB2(page, "generation-two-edit");
  await page.getByRole("button", { name: "Reset" }).click();
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

test("renderer selection is construction-bound and deep-linked", async ({ page }) => {
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

test("a failed Worker boot falls back honestly to the main thread", async ({ page }) => {
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
  await page.getByRole("radio", { name: "Dense columnar" }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect(page).not.toHaveURL(/data=paged/);
  await expect(page.getByTestId("paged-stats")).toHaveCount(0);
  await actionButton(page, "Total ARR").click();
  await expect(page.getByTestId("activity")).toContainText("Pipeline total");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("workbook operations and the XLSX round trip run through the core API", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);

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

test("selected controls follow the site theme contrast", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sheetwrite-theme", "light"));
  await page.goto(VANILLA_URL);
  await waitForLive(page);
  const selected = page.getByRole("radio", { name: "Main thread" });
  const light = await selected.evaluate((element) => getComputedStyle(element).color);

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => selected.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(light);
});
