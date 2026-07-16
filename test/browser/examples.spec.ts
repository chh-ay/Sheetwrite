import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";

declare global {
  interface Window {
    __sheetwriteVueGrid?: Grid;
  }
}

import { examplePages, SITE_BASE, siteUrl } from "./playwright.config.js";

// The intended fixture datasets: vanilla/react show the revenue accounts
// workbook, vue streams the million-row orders feed, svelte builds the
// formula model. First data cell per page.
const EXPECTED_CELL_VALUE = {
  vanilla: "Account 000001",
  react: "Account 000001",
  vue: "Customer 0000001",
  svelte: "Product line 001",
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
  test(`${name} example boots, initializes WASM, and paints cells`, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(urlOf(name));
    await page.waitForSelector(".sheetwrite", { state: "attached", timeout: 15_000 });
    if (name === "vue") {
      // The paged fixture resolves after the mirror's initial loading snapshot.
      // Wait for the first paged window through the public store handle, then
      // focus a body cell so the accessibility window refreshes through normal
      // grid interaction.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const grid = window.__sheetwriteVueGrid;
              if (!grid) return "handle-missing";
              return grid.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved;
            }),
          { timeout: 15_000 },
        )
        .toBe(1);
      await page.locator(".sw-demo-grid .sheetwrite").click({ position: { x: 80, y: 50 } });
    }
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

test("workbook XLSX backend preserves formulas in a browser build", async ({ page }) => {
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

test("offline queue, two-grid sync, and presence converge in a browser", async ({ page }) => {
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

test("example pages cross-link through the shared nav", async ({ page }) => {
  await page.goto(urlOf("vanilla"));
  await page.waitForSelector(".sw-product-nav");
  await page.click(`.sw-product-nav a[href="${SITE_BASE}/react/"]`);
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("React");
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

test("validation dropdown and checkbox editors are keyboard and ARIA operable", async ({
  page,
}) => {
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueGrid?.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved,
      ),
    )
    .not.toBe("#LOADING!");

  // The rule is host configuration (public API); the editor itself must open
  // through user input: select the cell, then press Enter on the grid host.
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueGrid;
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
          window.__sheetwriteVueGrid?.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved,
      ),
    )
    .toBe(2);

  await page.evaluate(() => {
    const grid = window.__sheetwriteVueGrid;
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
          window.__sheetwriteVueGrid?.store.getCell({ sheet: "orders", row: 1, col: 0 }).resolved,
      ),
    )
    .toBe(true);
});

test("vue sync demo queues, retries, and acknowledges a stable mutation", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  const sync = page.getByTestId("sync");
  await expect(sync).toContainText("All changes synced");

  await page.getByRole("button", { name: /Edit visible row/i }).click();
  await expect(sync).toContainText("1 pending mutation");

  const acknowledge = page.getByRole("button", { name: "Acknowledge", exact: true });
  await acknowledge.click();
  await expect(page.locator(".sw-vue-activity")).toContainText("retry ready");
  await expect(sync).toContainText("1 pending mutation");

  await acknowledge.click();
  await expect(sync).toContainText("All changes synced · server v1");
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("svelte example commits a formula-bar edit that the model keeps", async ({ page }) => {
  await page.goto(urlOf("svelte"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });

  // The model keeps a live SUM in F1.
  await page.fill(".sheetwrite-shell-namebox", "F1");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("=SUM(B1:E1)");

  // Commit a literal through the shell bar and read it back after
  // re-navigation: the edit must survive in the document, not just the input.
  await page.fill(".sheetwrite-shell-namebox", "B2");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await page.fill(".sheetwrite-shell-formula", "12345");
  await page.press(".sheetwrite-shell-formula", "Enter");
  await page.fill(".sheetwrite-shell-namebox", "B2");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("12345");
  await expect
    .poll(() => page.locator('.sheetwrite [role="gridcell"]').allTextContents())
    .toContain("12345");

  // The dependent SUM formula is untouched by the neighboring edit.
  await page.fill(".sheetwrite-shell-namebox", "F1");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("=SUM(B1:E1)");
});
