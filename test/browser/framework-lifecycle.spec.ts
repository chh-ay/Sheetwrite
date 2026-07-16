import { expect, type Page, test } from "@playwright/test";
import { LIFECYCLE_CELL } from "../../docs/src/test-fixtures/framework-lifecycle/fixture.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

interface BrowserErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

async function canvasBodyPainted(page: Page): Promise<boolean> {
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector(".sheetwrite canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const context = canvas.getContext("2d");
    const bounds = canvas.getBoundingClientRect();
    if (!context || bounds.width === 0 || bounds.height === 0) return null;

    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const left = Math.ceil(64 * scaleX);
    const top = Math.ceil(40 * scaleY);
    const width = Math.min(Math.ceil(256 * scaleX), canvas.width - left);
    const height = Math.min(Math.ceil(160 * scaleY), canvas.height - top);
    if (width <= 0 || height <= 0) return null;
    return Array.from(context.getImageData(left, top, width, height).data);
  });

  return sample !== null && hasOpaqueForeground(sample);
}

for (const framework of ["react", "vue", "svelte"] as const) {
  test(`framework lifecycle: ${framework} falls back, retries, becomes ready, and paints`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(siteUrl(`/test/framework-lifecycle/${framework}/`));

    const fallback = page.locator("[data-lifecycle-fallback]");
    const status = page.locator("[data-lifecycle-status]");
    const errorCount = page.locator("[data-lifecycle-errors]");
    await expect(fallback).toBeVisible();
    await expect(status).toHaveText("error", { timeout: 15_000 });
    await expect(errorCount).toHaveText("1");

    await page.locator("[data-lifecycle-retry]").click();
    await expect(status).toHaveText("ready", { timeout: 15_000 });
    await expect(page.locator("[data-lifecycle-ready]")).toHaveText("1:initial");
    await expect(errorCount).toHaveText("1");
    await expect(fallback).toHaveCount(0);
    await expect
      .poll(() => page.locator('.sheetwrite [role="gridcell"]').allTextContents(), {
        timeout: 15_000,
        message: `${framework} lifecycle fixture did not expose its known cell`,
      })
      .toContain(LIFECYCLE_CELL);
    await expect
      .poll(() => canvasBodyPainted(page), {
        timeout: 15_000,
        message: `${framework} lifecycle fixture did not paint a body cell`,
      })
      .toBe(true);

    await page.waitForTimeout(50);
    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });
}
