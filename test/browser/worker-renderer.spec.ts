import { expect, type Page, test } from "@playwright/test";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

const REACT_URL = siteUrl("/react/");
const GRID = ".sw-demo-grid .sheetwrite";
const CANVAS = `${GRID} .sheetwrite-canvas`;
const INITIAL_CUSTOMER = "Account 000001";
const SCROLLED_CUSTOMER = "Account 000101";
const WORKER_ASSET = /\/_astro\/worker-[A-Za-z0-9_-]+\.js$/;

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

async function accessibilityValues(page: Page): Promise<string[]> {
  return page.locator(`${GRID} [role="gridcell"]`).allTextContents();
}

async function frameGeneration(page: Page): Promise<number> {
  const generation = await page.locator(CANVAS).getAttribute("data-worker-frame");
  return Number(generation ?? 0);
}

async function canvasBodyPainted(page: Page): Promise<boolean> {
  const box = await page.locator(CANVAS).boundingBox();
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

async function editFirstCustomer(page: Page, value: string): Promise<void> {
  // Toolbar 36px + column header 32px + first body row; customer is column C.
  await page.locator(GRID).click({ position: { x: 300, y: 82 } });
  await page.keyboard.press("F2");
  const editor = page.locator(`${GRID} .sheetwrite-editor`);
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await editor.press("Enter");
  await expect.poll(() => accessibilityValues(page)).toContain(value);
}

test("production Worker renderer loads, paints, edits, and scrolls", async ({ page }) => {
  const errors = collectErrors(page);
  const workerRequests: string[] = [];
  const workerResponses = new Map<string, number>();
  const workerUrls: string[] = [];
  page.on("request", (request) => {
    if (WORKER_ASSET.test(request.url())) workerRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (WORKER_ASSET.test(response.url())) workerResponses.set(response.url(), response.status());
  });
  page.on("worker", (worker) => workerUrls.push(worker.url()));

  await page.goto(REACT_URL);
  const renderer = page.getByTestId("renderer");
  await expect(renderer).toContainText("Requested: canvas · Active: canvas");
  await expect.poll(() => accessibilityValues(page)).toContain(INITIAL_CUSTOMER);

  const capabilities = await page.evaluate(() => ({
    worker: typeof Worker === "function",
    offscreenCanvas: typeof OffscreenCanvas === "function",
    transferableCanvas:
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function",
  }));
  expect(
    capabilities,
    `Chromium Worker capability matrix: ${JSON.stringify(capabilities)}`,
  ).toEqual({
    worker: true,
    offscreenCanvas: true,
    transferableCanvas: true,
  });

  await page.getByRole("checkbox", { name: "Worker renderer" }).check();
  await expect(renderer).toContainText("Requested: worker · Active: worker");
  await expect(renderer).toHaveAttribute("data-fallback-count", "0");
  await expect
    .poll(() => frameGeneration(page), { message: "Worker never acknowledged a frame" })
    .toBeGreaterThan(0);
  await expect
    .poll(() => canvasBodyPainted(page), { message: "Worker body frame stayed blank" })
    .toBe(true);
  await expect.poll(() => accessibilityValues(page)).toContain(INITIAL_CUSTOMER);

  expect(workerRequests).toHaveLength(1);
  expect(workerUrls).toHaveLength(1);
  expect(workerUrls[0]).toBe(workerRequests[0]);
  expect(workerUrls[0]).toMatch(WORKER_ASSET);
  expect(workerResponses.get(workerRequests[0]!)).toBe(200);
  expect(await page.workers()[0]!.evaluate(() => typeof OffscreenCanvas)).toBe("function");

  const beforeEdit = await frameGeneration(page);
  await editFirstCustomer(page, "Worker browser edit");
  await expect
    .poll(() => frameGeneration(page), { message: "edit produced no Worker frame" })
    .toBeGreaterThan(beforeEdit);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  const beforeScroll = await frameGeneration(page);
  await page.locator(`${GRID} .sheetwrite-scroller`).evaluate((scroller) => {
    scroller.scrollTop = 2_800;
    scroller.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => accessibilityValues(page)).toContain(SCROLLED_CUSTOMER);
  await expect
    .poll(() => frameGeneration(page), { message: "scroll produced no Worker frame" })
    .toBeGreaterThan(beforeScroll);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);

  await page.getByRole("checkbox", { name: "Worker renderer" }).uncheck();
  await expect(renderer).toContainText("Requested: canvas · Active: canvas");
  await expect
    .poll(() => page.workers().length, { message: "Worker survived renderer teardown" })
    .toBe(0);
  await expect(page.locator(`${GRID} .sheetwrite-canvas`)).toHaveCount(1);
  await expect(page.locator(".sw-demo-grid > .sheetwrite")).toHaveCount(1);
});

test("production Worker renderer falls back after a module-load failure", async ({ page }) => {
  const errors = collectErrors(page);
  const failedWorkerUrls: string[] = [];
  await page.route("**/_astro/worker-*.js", async (route) => {
    failedWorkerUrls.push(route.request().url());
    await route.abort("failed");
  });

  await page.goto(REACT_URL);
  const renderer = page.getByTestId("renderer");
  await expect(renderer).toContainText("Requested: canvas · Active: canvas");
  await page.getByRole("checkbox", { name: "Worker renderer" }).check();

  await expect(renderer).toContainText("Requested: worker · Active: canvas");
  await expect(renderer).toContainText(/Fallback: .+/);
  await expect(renderer).toHaveAttribute("data-fallback-count", "1");
  expect(failedWorkerUrls).toHaveLength(1);
  expect(failedWorkerUrls[0]).toMatch(WORKER_ASSET);
  await expect
    .poll(() => page.workers().length, { message: "failed Worker was not terminated" })
    .toBe(0);

  await expect.poll(() => accessibilityValues(page)).toContain(INITIAL_CUSTOMER);
  await expect
    .poll(() => canvasBodyPainted(page), { message: "fallback canvas stayed blank" })
    .toBe(true);
  await editFirstCustomer(page, "Fallback browser edit");
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  await expect(page.locator(`${GRID} .sheetwrite-canvas`)).toHaveCount(1);
  await expect(page.locator(".sw-demo-grid > .sheetwrite")).toHaveCount(1);
  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);

  await page.getByRole("checkbox", { name: "Worker renderer" }).uncheck();
  await expect(renderer).toContainText("Requested: canvas · Active: canvas");
  await expect(renderer).toHaveAttribute("data-fallback-count", "0");
  await expect(page.locator(`${GRID} .sheetwrite-canvas`)).toHaveCount(1);
  await expect(page.locator(".sw-demo-grid > .sheetwrite")).toHaveCount(1);
});
