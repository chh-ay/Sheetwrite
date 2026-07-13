import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";

declare global {
  interface Window {
    __sheetwriteVueGrid?: Grid;
  }
}

import { examplePages, SITE_PORT } from "./playwright.config.js";

/**
 * Shared boot contract for every production-built example page: it loads
 * without console/page errors, the grid host mounts, WASM initializes far
 * enough to paint cells, and the canvas contains non-background pixels.
 */

function urlOf(page: (typeof examplePages)[number]): string {
  return `http://localhost:${SITE_PORT}/${page}/`;
}

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

/** True when the first grid canvas holds any pixel that isn't the page background. */
async function canvasPainted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const w = Math.min(canvas.width, 320);
    const h = Math.min(canvas.height, 200);
    if (w === 0 || h === 0) return false;

    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return true;
    }
    return false;
  });
}

for (const name of examplePages) {
  test(`${name} example boots, initializes WASM, and paints cells`, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(urlOf(name));
    await page.waitForSelector(".sheetwrite", { state: "attached", timeout: 15_000 });
    await expect
      .poll(() => canvasPainted(page), { timeout: 15_000, message: "grid canvas never painted" })
      .toBe(true);

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });
}

test("example pages cross-link through the shared nav", async ({ page }) => {
  await page.goto(urlOf("vanilla"));
  await page.waitForSelector(".sw-nav");
  await page.click('.sw-nav a[href="/react/"]');
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect(page.locator('.sw-nav a[aria-current="page"]')).toHaveText("React");
});

test("vanilla example commits an edit through the formula bar and undoes it", async ({ page }) => {
  await page.goto(urlOf("vanilla"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached" });

  // Select B2 via the name box, then commit a literal through the formula bar.
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await page.fill("#formula", "browser-smoke");
  await page.press("#formula", "Enter");

  // Re-selecting the same cell echoes the committed value back into the bar.
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await expect(page.locator("#formula")).toHaveValue("browser-smoke");

  // Ctrl+Z on the grid host undoes the commit.
  await page.click(".sheetwrite", { position: { x: 200, y: 100 } });
  await page.keyboard.press("Control+z");
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await expect(page.locator("#formula")).not.toHaveValue("browser-smoke");
});

test("theming example repaints when switching themes", async ({ page }) => {
  await page.goto(urlOf("theming"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached" });
  await expect.poll(() => canvasPainted(page)).toBe(true);

  const sample = () =>
    page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return "";
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      return [...ctx.getImageData(0, 0, 60, 40).data.slice(0, 240)].join(",");
    });

  const light = await sample();
  const darkButton = page.getByRole("button", { name: /dark/i });
  await darkButton.click();
  await expect.poll(sample, { message: "theme switch never repainted" }).not.toBe(light);
});

test("vue paged datasource keeps one million rows allocation-lazy", async ({ page }) => {
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });

  const stats = async () =>
    page.evaluate(() => {
      const store = window.__sheetwriteVueGrid?.store;
      if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
        return null;
      }
      return store.getPagedStats("orders");
    });
  await expect.poll(stats, { timeout: 15_000 }).toMatchObject({
    fullyLoaded: false,
  });
  await expect
    .poll(async () => (await stats())?.loadedCells ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0);

  const initial = await stats();
  expect(initial).not.toBeNull();
  expect(initial!.allocatedBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(
    await page.evaluate(
      () => window.__sheetwriteVueGrid?.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved,
    ),
  ).toBe(1);

  await page.evaluate(() => {
    window.__sheetwriteVueGrid?.scrollToCell({ sheet: "orders", row: 500_000, col: 0 });
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteVueGrid?.store.getCell({
              sheet: "orders",
              row: 500_000,
              col: 0,
            }).resolved,
        ),
      { timeout: 15_000 },
    )
    .toBe(500_001);
  expect((await stats())!.allocatedBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
});

test("vue sync demo queues, retries, and acknowledges a stable mutation", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  const sync = page.getByTestId("sync");
  await expect(sync).toContainText("All changes synced");

  await page.getByRole("button", { name: /Edit visible row/i }).click();
  await expect(sync).toContainText("1 pending mutation");

  const acknowledge = page.getByRole("button", { name: /Acknowledge changes/i });
  await acknowledge.click();
  await expect(page.locator(".example-log")).toContainText("retry ready");
  await expect(sync).toContainText("1 pending mutation");

  await acknowledge.click();
  await expect(sync).toContainText("All changes synced · server v1");
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("svelte example edits a cross-sheet formula through the shell bar", async ({ page }) => {
  await page.goto(urlOf("svelte"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });

  await page.fill(".sheetwrite-shell-namebox", "F1");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("=SUM(B1:E1)");
});
