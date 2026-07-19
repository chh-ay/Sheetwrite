import { expect, type Page, test } from "@playwright/test";
import {
  ANALYTICS_EXPECTED,
  ANALYTICS_ROWS,
  analyticsArr,
} from "../../docs/src/showcases/scenarios/analytics.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

const REACT_URL = siteUrl("/react/");
const GRID = ".sw-demo-grid .sheetwrite";

// Grid geometry from the analytics workbook + shared showcase theme:
// toolbar 36px + column header 32px + 30px rows, then ID 72, Account 210,
// Market 130, Segment 118, Seats 90, ARR 138. The row-number gutter is
// adaptive: max(48, ceil(digits × 13px × 0.6 + 12)) = 59 for 6-digit rows.
const GUTTER = Math.max(48, Math.ceil(String(ANALYTICS_ROWS).length * 13 * 0.6 + 12));
const ROW0_Y = 36 + 32 + 15;
const ROW_H = 30;
const ACCOUNT_X = GUTTER + 72 + 105;
const SEATS_X = GUTTER + 72 + 210 + 130 + 118 + 45;
const ARR_X = GUTTER + 72 + 210 + 130 + 118 + 90 + 69;

const TOKYO_ROWS = ANALYTICS_EXPECTED.marketRowCounts.Tokyo ?? 0;
const TOKYO_ARR = ANALYTICS_EXPECTED.marketTotals.Tokyo ?? 0;
const TOTAL_ARR = ANALYTICS_EXPECTED.totalArr;

function en(value: number): string {
  return value.toLocaleString("en-US");
}

interface BrowserErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

async function expectNoErrors(page: Page, errors: BrowserErrors): Promise<void> {
  await page.waitForTimeout(50);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
}

/** Ready gate: the adapter published generation 1 and the canvas is attached. */
async function openWorkbench(page: Page): Promise<void> {
  await page.goto(REACT_URL);
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("generation")).toHaveText("1", { timeout: 20_000 });
}

async function gridcellTexts(page: Page): Promise<string[]> {
  return page.locator(`${GRID} [role="gridcell"]`).allTextContents();
}

async function selectOption(page: Page, control: "Market" | "Segment", label: string) {
  await page
    .locator(".sw-demo-controlbar__controls .sw-demo-select", { hasText: control })
    .locator(".sw-demo-select__trigger")
    .click();
  await page.getByRole("option", { name: label }).click();
}

/** The grid's built-in toolbar also exposes Undo/Redo; scope to the host row. */
function editButton(page: Page, name: "Undo" | "Redo") {
  return page.getByRole("toolbar", { name: "Editing controls" }).getByRole("button", { name });
}

async function canvasBodyPainted(page: Page): Promise<boolean> {
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector(".sw-demo-grid .sheetwrite canvas");
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

test.describe("react workbench — controlled analytics", () => {
  test("filters, aggregates, and derived summaries follow controlled state", async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);

    // Canonical boot state straight from the shared scenario contract.
    await expect(page.getByTestId("rows-visible")).toHaveText(en(ANALYTICS_ROWS));
    await expect
      .poll(() => gridcellTexts(page), { timeout: 15_000 })
      .toContain(ANALYTICS_EXPECTED.firstDataCell.text);
    await expect(page.getByTestId("kpi-total")).toHaveAttribute("data-raw", String(TOTAL_ARR), {
      timeout: 15_000,
    });
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOTAL_ARR));

    // Market filter: view narrows and the focused KPI swaps to the SUMIF row.
    await selectOption(page, "Market", "Tokyo");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS));
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR));

    // Segment filter composes (AND) with the market filter.
    await selectOption(page, "Segment", "Enterprise");
    const composed = Number(
      (await page.getByTestId("rows-visible").innerText()).replaceAll(",", ""),
    );
    expect(composed).toBeGreaterThan(0);
    expect(composed).toBeLessThan(TOKYO_ROWS);

    // Reset view restores the canonical query state.
    await page.getByRole("button", { name: "Reset view" }).click();
    await expect(page.getByTestId("rows-visible")).toHaveText(en(ANALYTICS_ROWS));
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOTAL_ARR));

    await expectNoErrors(page, errors);
  });

  test("search, replace-all, and undo/redo round-trip through grid history", async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);

    await page.getByLabel("Search accounts").fill("Account 000777");
    await page.getByLabel("Search accounts").press("Enter");
    await expect(page.getByTestId("matches")).toHaveText("1");

    await page.getByLabel("Replacement text").fill("Keystone 000777");
    await page.getByRole("button", { name: "Replace all" }).click();
    await expect(page.getByTestId("activity")).toContainText("Replaced 1 cell");
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Keystone 000777");

    await editButton(page, "Undo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000777");
    await editButton(page, "Redo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Keystone 000777");
    await editButton(page, "Undo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000777");

    await expectNoErrors(page, errors);
  });

  test("controlled formula entry recalculates cell and KPI formulas", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await openWorkbench(page);

    let expectedMax = 0;
    for (let row = 0; row < ANALYTICS_ROWS; row++) {
      expectedMax = Math.max(expectedMax, analyticsArr(row));
    }

    // Selecting a cell reconciles the controlled formula input from the grid.
    await page.locator(GRID).click({ position: { x: SEATS_X, y: ROW0_Y } });
    await expect(page.getByTestId("selection-address")).toHaveText("R1 C5");
    await expect(page.getByTestId("formula-input")).toHaveValue("5");

    // A committed formula evaluates against the named range immediately.
    await page.getByTestId("formula-input").fill("=MAX(ANNUAL_ARR)");
    await page.getByTestId("formula-input").press("Enter");
    await expect
      .poll(async () => (await gridcellTexts(page)).join("\u0000"), { timeout: 15_000 })
      .toContain(String(expectedMax));

    // Editing an ARR literal recalculates both the formula cell and the KPIs.
    await page.locator(GRID).click({ position: { x: ARR_X, y: ROW0_Y } });
    await expect(page.getByTestId("formula-input")).toHaveValue("480");
    await page.getByTestId("formula-input").fill("1000000");
    await page.getByTestId("formula-input").press("Enter");
    await expect(page.getByTestId("kpi-total")).toHaveAttribute(
      "data-raw",
      String(TOTAL_ARR - 480 + 1_000_000),
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("kpi-largest")).toHaveAttribute("data-raw", "1000000");
    await expect
      .poll(async () => (await gridcellTexts(page)).join("\u0000"), { timeout: 15_000 })
      .toContain("1000000");

    await expectNoErrors(page, errors);
  });

  test("grid-native clipboard and fill-handle flows stay undoable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = collectErrors(page);
    await openWorkbench(page);

    // Copy the first account over the second with grid keyboard clipboard.
    await page.locator(GRID).click({ position: { x: ACCOUNT_X, y: ROW0_Y } });
    await page.keyboard.press("ControlOrMeta+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 })
      .toContain("Account 000001");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+v");
    await expect
      .poll(
        async () => (await gridcellTexts(page)).filter((text) => text === "Account 000001").length,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2);
    await editButton(page, "Undo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000002");

    // Fill-handle drag: a two-cell text source tiles downward (the numeric
    // columns are arithmetic sequences, so extending them changes nothing).
    const box = await page.locator(GRID).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.locator(GRID).click({ position: { x: ACCOUNT_X, y: ROW0_Y } });
    await page.keyboard.press("Shift+ArrowDown");
    const accountRight = GUTTER + 72 + 210;
    await page.mouse.move(box.x + accountRight, box.y + 36 + 32 + ROW_H * 2);
    await page.mouse.down();
    // Drop on row 4's center (view row index 3) so the fill covers rows 3–4.
    await page.mouse.move(box.x + accountRight, box.y + 36 + 32 + ROW_H * 3 + 15, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByTestId("activity")).toContainText("(fill)", { timeout: 15_000 });
    await expect
      .poll(
        async () => (await gridcellTexts(page)).filter((text) => text === "Account 000002").length,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2);
    expect(await gridcellTexts(page)).not.toContain("Account 000003");
    await editButton(page, "Undo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000003");

    await expectNoErrors(page, errors);
  });

  test("CSV import lands as one undoable commit and exports hand off downloads", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);

    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect((await csvDownload).suggestedFilename()).toBe("analytics-pipeline.csv");

    const xlsxDownload = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Export XLSX" }).click();
    expect((await xlsxDownload).suggestedFilename()).toBe("analytics-pipeline.xlsx");
    await expect(page.getByTestId("activity")).toContainText("XLSX export prepared");

    // Import through the shared core CSV codec: two rows overlay the top of
    // the pipeline as one undoable commit and the KPI formulas recalculate.
    const csv = [
      "ID,Account,Market,Segment,Seats,ARR",
      "1,Imported Alpha,Tokyo,Enterprise,10,111",
      "2,Imported Beta,Berlin,SMB,20,222",
      "",
    ].join("\r\n");
    await page.getByTestId("import-csv").setInputFiles({
      name: "quarterly.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
    await expect(page.getByTestId("activity")).toContainText("Imported 2 rows from quarterly.csv");
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Imported Alpha");
    const imported = TOTAL_ARR - analyticsArr(0) - analyticsArr(1) + 111 + 222;
    await expect(page.getByTestId("kpi-total")).toHaveAttribute("data-raw", String(imported), {
      timeout: 15_000,
    });

    await editButton(page, "Undo").click();
    await expect(page.getByTestId("kpi-total")).toHaveAttribute("data-raw", String(TOTAL_ARR), {
      timeout: 15_000,
    });
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000001");

    // The deep-fidelity handoff points at the interoperability proofs.
    await expect(page.getByTestId("interop-link")).toHaveAttribute(
      "href",
      "/showcases/interoperability/",
    );

    await expectNoErrors(page, errors);
  });

  test("lifecycle: reload reconciles controlled state, live options do not reset, renderer swap does", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);
    await expect(page.getByTestId("ready-reason")).toHaveText("initial");

    // Controlled state set before the reset…
    await selectOption(page, "Market", "Tokyo");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS));

    // …survives an input-reset: the fresh grid instance is reconciled from React.
    await page.getByRole("button", { name: "Reload dataset" }).click();
    await expect(page.getByTestId("generation")).toHaveText("2", { timeout: 20_000 });
    await expect(page.getByTestId("ready-reason")).toHaveText("input-reset");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS), { timeout: 15_000 });
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR), {
      timeout: 15_000,
    });

    // Read-only is a live option: no new generation, editing surface disabled.
    const readOnlyToggle = page.getByRole("button", { name: "Read-only" });
    await readOnlyToggle.click();
    await expect(readOnlyToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("formula-input")).toBeDisabled();
    await expect(page.getByTestId("generation")).toHaveText("2");
    await readOnlyToggle.click();
    await expect(readOnlyToggle).toHaveAttribute("aria-pressed", "false");

    // Renderer selection is reset-sensitive and reported through React state.
    await page.getByRole("radio", { name: "Web Worker" }).click();
    await expect(page.getByTestId("generation")).toHaveText("3", { timeout: 20_000 });
    await expect(page.getByTestId("ready-reason")).toHaveText("renderer-reset");
    await expect(page.getByTestId("renderer")).toContainText("Active: Web Worker", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
    // The worker owns the canvas (OffscreenCanvas), so 2D-context sampling is
    // impossible; presented frames are proven by the worker frame counter.
    await expect
      .poll(
        async () =>
          Number(
            (await page.locator(`${GRID} .sheetwrite-canvas`).getAttribute("data-worker-frame")) ??
              0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    await expectNoErrors(page, errors);
  });

  test("mobile: workbench boots, filters, and stays operable at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    const errors = collectErrors(page);
    await openWorkbench(page);

    await expect.poll(() => canvasBodyPainted(page), { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("rows-visible")).toHaveText(en(ANALYTICS_ROWS));

    await selectOption(page, "Market", "Tokyo");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS));
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR));

    // Derived summaries and workflow controls stay visible on small screens.
    await expect(page.getByTestId("kpi-total")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Data workflow" })).toBeVisible();

    await expectNoErrors(page, errors);
  });

  test("accessibility contract: named toolbars, live status, and ARIA grid mirror", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);

    await expect(page.getByRole("toolbar", { name: "Query controls" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Editing controls" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Data workflow" })).toBeVisible();

    // Related controls cluster into named groups inside each toolbar.
    await expect(
      page
        .getByRole("toolbar", { name: "Query controls" })
        .getByRole("group", { name: "Account search" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("toolbar", { name: "Editing controls" })
        .getByRole("group", { name: "Replace" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("toolbar", { name: "Data workflow" })
        .getByRole("group", { name: "Data exchange" }),
    ).toBeVisible();

    await expect(page.getByRole("radiogroup", { name: "Rendering thread" })).toBeVisible();
    await expect(page.getByLabel("Search accounts")).toBeVisible();
    await expect(page.getByLabel("Formula or value")).toBeVisible();
    await expect(page.getByLabel("Import CSV file")).toBeAttached();

    // The activity readout is a polite live region.
    await expect(page.getByTestId("activity")).toHaveAttribute("aria-live", "polite");

    // The virtualized window mirrors into real ARIA gridcells.
    await expect
      .poll(async () => (await gridcellTexts(page)).filter((text) => text.length > 0).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    await expectNoErrors(page, errors);
  });
});
