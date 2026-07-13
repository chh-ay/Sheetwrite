import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";

declare global {
  interface Window {
    __sheetwriteVueGrid?: Grid;
  }
}

import { examplePages, SITE_PORT } from "./playwright.config.js";

const EXPECTED_CELL_VALUE = {
  vanilla: "Customer 000001",
  react: "Customer 000001",
  vue: "Customer 0000001",
  svelte: "Product line 001",
  theming: "Account 001",
} satisfies Record<(typeof examplePages)[number], string>;

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
      // Wait on its visible request counter, then focus a body cell so the live
      // accessibility window is refreshed through normal grid interaction.
      await expect(page.locator(".stream-strip output")).toContainText(/[1-9][0-9]* requests/);
      await page.locator(".example-grid .sheetwrite").click({ position: { x: 80, y: 50 } });
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
  await page.goto(`http://localhost:${SITE_PORT}/test/xlsx/`);
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "XLSX smoke returned no result text",
  ).toBe("ready");
  expect(await result.textContent()).toContain('"formula":"=Input!A1*2"');
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("offline queue, two-grid sync, and presence converge in a browser", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`http://localhost:${SITE_PORT}/test/collaboration/`);
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "Collaboration smoke returned no result text",
  ).toBe("ready");
  const payload = JSON.parse((await result.textContent()) ?? "{}") as {
    literal?: number;
    formula?: number;
    sheetName?: string;
    presenceRects?: number;
    restoredMutation?: string;
    version?: number;
  };
  expect(payload).toEqual({
    literal: 21,
    formula: 42,
    sheetName: "Shared",
    presenceRects: 1,
    restoredMutation: "durable-browser-m1",
    version: 3,
  });
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

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
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

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
    (
      grid as Grid & {
        beginEdit(row: number, col: number): void;
      }
    ).beginEdit(0, 0);
  });

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
    (
      grid as Grid & {
        beginEdit(row: number, col: number): void;
      }
    ).beginEdit(1, 0);
  });

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
