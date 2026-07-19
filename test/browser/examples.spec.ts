import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
  }
}

import { examplePages, SITE_BASE, siteUrl } from "./playwright.config.js";

// The intended fixture datasets: vanilla/react show the revenue accounts
// workbook, vue runs the governed business orders workbook, svelte hydrates
// the offline dispatch log. First data cell mirrored per page (vue's frozen
// PO column and svelte's frozen ticket column stay out of the ARIA window,
// so their first mirrored cells are the supplier and site columns).
const EXPECTED_CELL_VALUE = {
  vanilla: "Account 000001",
  react: "Account 000001",
  vue: "Mekong Freight",
  svelte: "Riverside depot",
} satisfies Record<(typeof examplePages)[number], string>;

/**
 * Shared boot contract for every production-built example page: it loads
 * without console/page errors, the grid host mounts, WASM initializes far
 * enough to paint cells, and the canvas contains non-background pixels.
 */

function urlOf(page: (typeof examplePages)[number]): string {
  return siteUrl(`/${page}/`);
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

/** True when the canvas body holds opaque paint beyond its dominant background. */
async function canvasBodyPainted(page: Page): Promise<boolean> {
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector(".sheetwrite canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const ctx = canvas.getContext("2d");
    const bounds = canvas.getBoundingClientRect();
    if (!ctx || bounds.width === 0 || bounds.height === 0) return null;

    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    // All shipped themes keep their row/column headers within these insets.
    // Sampling beyond both excludes grid chrome while retaining several body cells.
    const left = Math.ceil(64 * scaleX);
    const top = Math.ceil(40 * scaleY);
    const width = Math.min(Math.ceil(256 * scaleX), canvas.width - left);
    const height = Math.min(Math.ceil(160 * scaleY), canvas.height - top);
    if (width <= 0 || height <= 0) return null;

    return Array.from(ctx.getImageData(left, top, width, height).data);
  });

  return sample !== null && hasOpaqueForeground(sample);
}

for (const name of examplePages) {
  test(`${name} example boots, initializes WASM, and paints cells`, {
    tag: name === "vanilla" ? "@portability" : "@chromium-only",
  }, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(urlOf(name));
    await page.waitForSelector(".sheetwrite", { state: "attached", timeout: 15_000 });
    await expect
      .poll(() => page.locator('.sheetwrite [role="gridcell"]').allTextContents(), {
        timeout: 15_000,
        message: `${name} grid never exposed its expected cell value`,
      })
      .toContain(EXPECTED_CELL_VALUE[name]);
    await expect
      .poll(() => canvasBodyPainted(page), {
        timeout: 15_000,
        message: "grid body cells never painted",
      })
      .toBe(true);

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });
}

test("workbook XLSX backend preserves formulas in a browser build", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/test/xlsx/"));
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "XLSX smoke returned no result text",
  ).toBe("ready");
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("offline queue, two-grid sync, and presence converge in a browser", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/test/collaboration/"));
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "Collaboration smoke returned no result text",
  ).toBe("ready");
  const payload = JSON.parse((await result.textContent()) ?? "{}") as Record<string, unknown>;
  // The harness self-checks before reporting ready; assert the durable
  // outcomes without pinning incidental counters like presence node counts.
  expect(payload).toMatchObject({
    literal: 21,
    formula: 42,
    sheetName: "Shared",
    restoredMutation: "durable-browser-m1",
  });
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("example pages cross-link through the capability hub", async ({ page }) => {
  await page.goto(urlOf("vanilla"));
  await page.waitForSelector(".sw-product-nav");
  const showcasesLink = page.locator(`.sw-product-nav a[href="${SITE_BASE}/showcases/"]`);
  // On a workbench route the hub link is ancestor-current, not page-current.
  await expect(showcasesLink).toHaveAttribute("aria-current", "true");
  await showcasesLink.click();
  await expect(page).toHaveURL(siteUrl("/showcases/"));
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");
  await expect(page.locator("main h1")).toHaveText("Every capability, live and verified.");
  // Framework deep links stay reachable from the hub's workbench cards.
  await page.locator(`main a[href="${SITE_BASE}/react/"]`).first().click();
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
});

test("vanilla example commits an edit through the formula bar and undoes it", {
  tag: "@portability",
}, async ({ page }) => {
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

test("validation dropdown and checkbox editors are keyboard and ARIA operable", async ({
  page,
}) => {
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)))
    .toBe(true);

  // The rule is host configuration (public API); the editor itself must open
  // through user input: select the cell, then press Enter on the grid host.
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    if (!grid) throw new Error("Vue grid is unavailable");
    grid.setValidationRule({
      id: "browser-list",
      range: { sheet: "orders", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      condition: { kind: "list", values: [1, 2, 3] },
      policy: "reject",
      helpText: "Choose an order ID",
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 0, col: 0 } });
  });
  await page.locator(".sw-demo-grid .sheetwrite").press("Enter");

  const list = page.getByRole("listbox", { name: "Choose an order ID" });
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench?.grid.store.getCell({ sheet: "orders", row: 0, col: 0 })
            .resolved,
      ),
    )
    .toBe(2);

  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    if (!grid) throw new Error("Vue grid is unavailable");
    grid.setValidationRule({
      id: "browser-checkbox",
      range: { sheet: "orders", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
      condition: { kind: "checkbox", checkedValue: true, uncheckedValue: false },
      policy: "reject",
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 1, col: 0 } });
  });
  await page.locator(".sw-demo-grid .sheetwrite").press("Enter");

  const checkbox = page.getByRole("checkbox", { name: "Toggle checkbox" });
  await expect(checkbox).toBeVisible();
  await page.keyboard.press(" ");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench?.grid.store.getCell({ sheet: "orders", row: 1, col: 0 })
            .resolved,
      ),
    )
    .toBe(true);
});
