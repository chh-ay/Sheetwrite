import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

// Focused contracts for the /vue/ business workbench: reactive configuration,
// validation/protection at the mutation barrier, notes and row metadata,
// workbook/sheet operations, host persistence state, and the explicit Vue
// props/events surface. Shared boot/nav coverage stays in examples.spec.ts;
// canonical adapter reset coverage stays in framework-lifecycle.spec.ts.

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
    __sheetwriteVuePaintFonts?: string[];
  }
}

const VUE_URL = siteUrl("/vue/");
const APP = ".sw-vuewb-app";
const GRID = `${APP} .sheetwrite`;

// Deterministic scenario observables (docs/src/showcases/scenarios/business.ts):
// status[row] = BUSINESS_STATUSES[(row * 7) % 4]; qty[0] = 1; unitCost[0] = 8.
const FIRST_PO = "PO-0001";
const STATUS_RULE = "orders-status-list";
const PROTECTION_ID = "orders-computed-totals";
const SEEDED_NOTE = "Held for finance review — resubmit with the Q3 budget code.";
const SUPPLIER_BANNER = "Approved supplier directory — FY26";

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
  const sample = await page.evaluate((selector) => {
    const canvas = document.querySelector(`${selector} canvas`);
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
  }, GRID);
  return sample !== null && hasOpaqueForeground(sample);
}

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(VUE_URL);
  await page.waitForSelector(GRID, { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)), {
      timeout: 15_000,
      message: "vue workbench grid handle never became ready",
    })
    .toBe(true);
  // The suppliers seed and persistence binding land with @ready.
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0", {
    timeout: 15_000,
  });
}

async function openTask(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}

function cellValue(page: Page, sheet: string, row: number, col: number) {
  return page.evaluate(
    ([s, r, c]) =>
      window.__sheetwriteVueWorkbench?.grid.store.getCell({
        sheet: String(s),
        row: Number(r),
        col: Number(c),
      }).resolved ?? null,
    [sheet, row, col] as const,
  );
}

/** Commit `text` into a cell through the real editor + keyboard path. */
async function commitCell(page: Page, row: number, col: number, text: string): Promise<void> {
  await page.evaluate(
    ([r, c, value]) => {
      const grid = window.__sheetwriteVueWorkbench?.grid;
      if (!grid) throw new Error("grid handle missing");
      const addr = { sheet: "orders", row: Number(r), col: Number(c) };
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      grid.beginEdit(Number(r), Number(c), String(value));
    },
    [row, col, text] as const,
  );
  await page.keyboard.press("Enter");
}

test("boots the governed business workbook, paints, and stays accessible", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1568, height: 869 });
  await openWorkbench(page);

  // The frozen PO column stays out of the ARIA mirror window, so the first
  // mirrored body cell is the supplier column; PO-0001 is asserted from the
  // store below.
  await expect
    .poll(() => page.locator(`${GRID} [role="gridcell"]`).allTextContents(), { timeout: 15_000 })
    .toContain("Mekong Freight");
  await expect.poll(() => canvasBodyPainted(page), { timeout: 15_000 }).toBe(true);

  // Scenario governance is live in the document model, not page copy.
  const model = await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    const workbook = grid.store.getWorkbook();
    const orders = workbook.sheets.find((sheet) => sheet.id === "orders")!;
    const suppliers = workbook.sheets.find((sheet) => sheet.id === "suppliers")!;
    return {
      firstPo: grid.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved,
      rules: orders.validationRules?.map((rule) => rule.id),
      protection: orders.protectedRanges?.map((range) => range.id),
      notes: orders.notes?.length,
      conditionalFormats: orders.conditionalFormats?.length,
      unitCostFormat: orders.columns[5]?.numberFormat,
      frozenCols: orders.frozenCols,
      rowHeight2: orders.rowHeights?.get(2) ?? null,
      rowHeight7: orders.rowHeights?.get(7) ?? null,
      suppliersFrozenRows: suppliers.frozenRows,
      suppliersMerges: suppliers.merges?.length,
      banner: grid.store.getCell({ sheet: "suppliers", row: 0, col: 0 }).resolved,
      bannerCovered: grid.store.getCell({ sheet: "suppliers", row: 0, col: 1 }).resolved,
      bannerBold: grid.store.getCell({ sheet: "suppliers", row: 0, col: 0 }).style.bold,
      total0: grid.store.getCell({ sheet: "orders", row: 0, col: 6 }).resolved,
    };
  });
  expect(model.firstPo).toBe(FIRST_PO);
  expect(model.rules).toEqual(["orders-status-list", "orders-qty-bounds"]);
  expect(model.protection).toEqual([PROTECTION_ID]);
  expect(model.notes).toBe(2);
  expect(model.conditionalFormats).toBe(1);
  expect(model.unitCostFormat).toBe("$#,##0");
  expect(model.frozenCols).toBe(1);
  // Row metadata from setRowMeta document operations (BUSINESS_ROW_META).
  expect(model.rowHeight2).toBe(44);
  expect(model.rowHeight7).toBe(44);
  expect(model.suppliersFrozenRows).toBe(1);
  expect(model.suppliersMerges).toBe(1);
  expect(model.banner).toBe(SUPPLIER_BANNER);
  expect(model.bannerCovered).toBeNull();
  expect(model.bannerBold).toBe(true);
  expect(model.total0).toBe(8); // =E1*F1 evaluated by the engine

  // The governed workflow, not generic controls, is the first visible task.
  const taskTabs = page.getByRole("tablist", { name: "Workbook tasks" });
  await expect(taskTabs).toBeVisible();
  await expect(page.getByRole("tab", { name: "Protection" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("policy-result")).toContainText(
    "Protected totals require the finance-lead role.",
  );
  const taskGeometry = await taskTabs.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(taskGeometry.scrollWidth).toBeLessThanOrEqual(taskGeometry.clientWidth);
  const gridBox = await page.locator(`${APP} .sw-demo-grid`).boundingBox();
  const panelBox = await page.locator(`${APP} .sw-vuewb-panel`).boundingBox();
  expect(gridBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(gridBox!.y).toBeLessThan(869);
  expect(gridBox!.width).toBeGreaterThan(panelBox!.width * 2);
  expect(gridBox!.height).toBeGreaterThan(500);
  const eventBox = await page.getByTestId("event-panel").boundingBox();
  expect(eventBox).not.toBeNull();
  expect(eventBox!.height).toBeGreaterThanOrEqual(120);

  // Host persistence and lifecycle state remain explicit, labeled text.
  await expect(page.getByTestId("generation")).toHaveText("1 · initial");
  await expect(page.getByTestId("workbook-state")).toHaveText("2 sheet(s) · active orders");

  // Accessible names for every interactive surface.
  await expect(page.getByRole("toolbar", { name: "Workbench configuration" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Host role" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Spreadsheet formatting" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Sheets" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Orders sheet" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Suppliers sheet" })).toBeVisible();
  await openTask(page, "Notes");
  const noteEditor = page.getByRole("textbox", { name: "Cell note" });
  await expect(noteEditor).toBeVisible();
  expect(await noteEditor.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(90);
  await expect(page.getByRole("heading", { name: "Cell notes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notes", exact: true })).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Adapter events" })).toBeVisible();
  await expect(page.getByTestId("persistence")).toHaveAttribute("aria-live", "polite");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("a valid status edit commits, queues, and syncs to the host adapter", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  await commitCell(page, 4, 3, "Approved");
  await expect.poll(() => cellValue(page, "orders", 4, 3)).toBe("Approved");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await expect(page.getByTestId("persistence")).toHaveAttribute("data-state", "pending");
  await expect(page.getByTestId("persistence")).toContainText("1 pending commit(s) · host v0");
  // Reset-bound configuration is gated while local work is unsynced.
  await expect(page.getByTestId("mutation-policy")).toBeDisabled();
  await expect(page.getByTestId("feed")).toContainText("@grid-change");

  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toHaveAttribute("data-state", "synced");
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v1");
  await expect(page.getByTestId("server-version")).toHaveText("v1");
  await expect(page.getByTestId("last-ack")).toContainText("vue-biz-1 → v1");
  await expect(page.getByTestId("mutation-policy")).toBeEnabled();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("an off-list status is rejected at the barrier as a structured issue", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  // status[5] = BUSINESS_STATUSES[(5 * 7) % 4] = "Paid".
  expect(await cellValue(page, "orders", 5, 3)).toBe("Paid");
  await commitCell(page, 5, 3, "Perhaps");

  const feed = page.getByTestId("feed");
  await expect(feed).toContainText("grid.on(mutation-rejected)");
  await expect(feed).toContainText(STATUS_RULE);
  expect(await cellValue(page, "orders", 5, 3)).toBe("Paid");
  await expect(page.getByTestId("pending-count")).toHaveText("0");
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("protected totals show rejection, role correction, and accepted mutation in one journey", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("orders!G1");
  await expect(inspector).toContainText("locked · Computed totals");

  await page.getByTestId("challenge-attempt").click();
  const result = page.getByTestId("policy-result");
  await expect(result).toHaveAttribute("data-state", "rejected");
  await expect(result).toContainText(PROTECTION_ID);
  await expect(result).toContainText("Rejected");
  expect(await cellValue(page, "orders", 0, 6)).toBe(8);
  await expect(page.getByTestId("pending-count")).toHaveText("0");

  await page.getByTestId("challenge-authorize").click();
  await expect(page.getByTestId("role-finance-lead")).toHaveAttribute("aria-pressed", "true");
  await expect(inspector).toContainText("override allowed (finance lead)");
  await expect(result).toHaveAttribute("data-state", "authorized");

  await page.getByTestId("challenge-attempt").click();
  await expect(result).toHaveAttribute("data-state", "accepted");
  await expect(result).toContainText("orders!G1 changed from 8 to 999");
  await expect.poll(() => cellValue(page, "orders", 0, 6)).toBe(999);
  await expect(page.getByTestId("pending-count")).toHaveText("1");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("cell notes flow through the document model and the host pipeline", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 2, col: 3 } });
  });
  await openTask(page, "Notes");
  const note = page.getByRole("textbox", { name: "Cell note" });
  await expect(note).toHaveValue(SEEDED_NOTE);

  await note.fill("Cleared with finance on Friday.");
  await page.getByTestId("note-save").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteVueWorkbench!.grid.getNote({ sheet: "orders", row: 2, col: 3 }),
      ),
    )
    .toBe("Cleared with finance on Friday.");
  await expect(page.getByTestId("pending-count")).toHaveText("1");

  await page.getByTestId("note-clear").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteVueWorkbench!.grid.getNote({ sheet: "orders", row: 2, col: 3 }),
      ),
    )
    .toBeNull();
  await expect(page.getByTestId("pending-count")).toHaveText("2");

  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v2");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("workbook and sheet operations stay reactive through the public API", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  // Rename the active sheet from host UI.
  await openTask(page, "Sheets");
  const rename = page.getByRole("textbox", { name: "Active sheet name" });
  await expect(rename).toHaveValue("Orders");
  await rename.fill("Purchase orders");
  await page.getByTestId("rename-apply").click();
  await expect(page.getByRole("tab", { name: "Purchase orders sheet" })).toBeVisible();

  // Add a sheet; the workbench activates it.
  await page.getByTestId("add-sheet").click();
  await expect(page.getByTestId("workbook-state")).toHaveText("3 sheet(s) · active archive");
  await expect(page.getByRole("tab", { name: "Archive FY25 sheet" })).toBeVisible();
  await expect(page.getByTestId("add-sheet")).toBeDisabled();
  await expect(page.getByTestId("feed")).toContainText("@active-sheet-change");

  // Switch sheets; cross-sheet state (banner, merge anchor) is intact.
  await page.getByTestId("open-suppliers").click();
  await expect(page.getByTestId("workbook-state")).toHaveText("3 sheet(s) · active suppliers");
  expect(await cellValue(page, "suppliers", 0, 0)).toBe(SUPPLIER_BANNER);

  // Sheet workflow is document work: it syncs to the host like any edit.
  await expect(page.getByTestId("pending-count")).toHaveText("2");
  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v2");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability native tabs expose the complete accessible worksheet lifecycle", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  const ordersOptions = page.getByRole("button", { name: "Options for Orders sheet" });
  await ordersOptions.focus();
  await page.keyboard.press("ArrowDown");
  const renameOption = page.getByRole("menuitem", { name: "Rename Orders sheet" });
  await expect(renameOption).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ordersOptions).toBeFocused();
  await expect(ordersOptions).toHaveAttribute("aria-expanded", "false");
  await ordersOptions.click();
  await page.getByRole("menuitem", { name: "Rename Orders sheet" }).click();
  const editor = page.getByRole("textbox", { name: "Rename Orders sheet" });
  await editor.fill("Suppliers");
  await editor.press("Enter");
  await expect(page.locator(`${GRID} [role="alert"][data-code="duplicate"]`)).toHaveText(
    "Sheet name duplicates another sheet case-insensitively",
  );
  await expect(editor).toBeFocused();
  await expect(page.getByTestId("pending-count")).toHaveText("0");

  await editor.fill("Purchase orders");
  await editor.press("Enter");
  await expect(page.getByRole("tab", { name: "Purchase orders sheet" })).toBeVisible();

  await page.getByRole("button", { name: "Add sheet", exact: true }).click();
  const added = page.getByRole("tab", { name: "Sheet 3 sheet" });
  await expect(added).toBeVisible();
  await expect(added).toHaveAttribute("aria-selected", "true");

  await added.focus();
  await page.keyboard.press("Control+Shift+ArrowLeft");
  expect(
    await page.evaluate(() =>
      window.__sheetwriteVueWorkbench!.grid.store.getWorkbook().sheets.map((sheet) => sheet.name),
    ),
  ).toEqual(["Purchase orders", "Sheet 3", "Suppliers"]);

  await page.getByRole("button", { name: "Options for Sheet 3 sheet" }).click();
  await page.getByRole("menuitem", { name: "Hide Sheet 3 sheet" }).click();
  await expect(added).toHaveCount(0);
  const unhide = page.getByLabel("Unhide sheet");
  await expect(unhide).toBeVisible();
  await unhide.click();
  await page
    .getByRole("group", { name: "Hidden sheets" })
    .getByRole("button", { name: "Sheet 3" })
    .click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toBeVisible();

  await page.getByRole("tab", { name: "Sheet 3 sheet" }).click();
  await page.getByRole("button", { name: "Options for Sheet 3 sheet" }).click();
  await page.getByRole("menuitem", { name: "Remove Sheet 3 sheet" }).click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Suppliers sheet" }).click();
  expect(
    await page.evaluate(
      () => window.__sheetwriteVueWorkbench!.grid.exportSnapshot().workbook.activeSheet,
    ),
  ).toBe("suppliers");
  await expect(page.getByTestId("pending-count")).toHaveText("6");
  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v6");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability native worksheet controls remain operable at 390×844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await openWorkbench(page);

  await page.getByRole("button", { name: "Options for Orders sheet" }).click();
  await page.getByRole("menuitem", { name: "Rename Orders sheet" }).click();
  const editor = page.getByRole("textbox", { name: "Rename Orders sheet" });
  await editor.fill("Enterprise purchase orders");
  await editor.press("Enter");
  await expect(page.getByRole("tab", { name: "Enterprise purchase orders sheet" })).toBeVisible();

  await page.getByRole("button", { name: "Add sheet", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toBeVisible();
  const sheet3Options = page.getByRole("button", { name: "Options for Sheet 3 sheet" });
  await sheet3Options.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Rename Sheet 3 sheet" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const hideSheet3 = page.getByRole("menuitem", { name: "Hide Sheet 3 sheet" });
  await expect(hideSheet3).toBeFocused();
  await page.keyboard.press("Space");
  await page.getByLabel("Unhide sheet").click();
  await page
    .getByRole("group", { name: "Hidden sheets" })
    .getByRole("button", { name: "Sheet 3" })
    .click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toBeVisible();

  const overflow = await page.locator(".sheetwrite-tabbar").evaluate((bar) => ({
    clientWidth: bar.clientWidth,
    scrollWidth: bar.scrollWidth,
    documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  expect(overflow.clientWidth).toBeGreaterThan(0);
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.documentOverflow).toBe(false);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("toolbar formatting commits live styles through the grid", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);
  await page.evaluate(() => {
    window.__sheetwriteVuePaintFonts = [];
    const canvas = document.querySelector<HTMLCanvasElement>(".sw-vuewb-grid canvas");
    const context = canvas?.getContext("2d");
    if (!context) throw new Error("Vue workbench canvas context unavailable");
    const originalFillText = context.fillText.bind(context);
    context.fillText = (text: string, x: number, y: number, maxWidth?: number): void => {
      if (text === "Kampot Mills") window.__sheetwriteVuePaintFonts?.push(context.font);
      if (maxWidth === undefined) originalFillText(text, x, y);
      else originalFillText(text, x, y, maxWidth);
    };
  });

  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 1, col: 1 } });
  });
  await page.evaluate(() => {
    window.__sheetwriteVuePaintFonts = [];
  });
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench!.grid.store.getCell({
            sheet: "orders",
            row: 1,
            col: 1,
          }).style.bold ?? false,
      ),
    )
    .toBe(true);
  // Style commits are pending host work like any other document operation.
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVuePaintFonts?.some(
            (font) => /\bbold\b/.test(font) && !/\bbold\s+(?:[1-9]\d{0,2}|1000)\b/.test(font),
          ) ?? false,
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    window.__sheetwriteVuePaintFonts = [];
  });
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench!.grid.store.getCell({
            sheet: "orders",
            row: 1,
            col: 1,
          }).style.italic ?? false,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVuePaintFonts?.some(
            (font) =>
              /\bitalic\s+bold\b/.test(font) && !/\bbold\s+(?:[1-9]\d{0,2}|1000)\b/.test(font),
          ) ?? false,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("pending-count")).toHaveText("2");

  const colorInput = page.locator(".sheetwrite-tb-fillColor");
  await colorInput.evaluate((input: HTMLInputElement) => {
    for (const color of ["#224466", "#668844", "#aa5533"]) {
      input.value = color;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await expect(page.getByTestId("pending-count")).toHaveText("2");
  await colorInput.dispatchEvent("change");
  await expect(page.getByTestId("pending-count")).toHaveText("3");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("mutation policy is reset-bound: the grid rebuilds and persistence rebinds", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  // Local content proves the reset re-ingests pristine scenario data.
  await commitCell(page, 4, 3, "Approved");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await expect(page.getByTestId("mutation-policy")).toBeDisabled();
  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v1");

  await openTask(page, "Renderer");
  await page.getByText("Adapter settings", { exact: true }).click();
  await page.getByTestId("mutation-policy").click();
  await expect(page.getByTestId("generation")).toHaveText("2 · input-reset", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("props")).toContainText("partial");
  await expect(page.getByTestId("feed")).toContainText(":mutation-policy");
  // A replacement Grid generation re-seeds a fresh host adapter session.
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0");
  await expect.poll(() => cellValue(page, "orders", 4, 3)).toBe("Draft");
  await expect.poll(() => canvasBodyPainted(page), { timeout: 15_000 }).toBe(true);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("read-only is a live option that never rebuilds the grid", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  await openTask(page, "Renderer");
  await page.getByText("Adapter settings", { exact: true }).click();
  const readOnly = page.getByTestId("readonly");
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(GRID)).toHaveAttribute("aria-readonly", "true");
  await openTask(page, "Notes");
  await expect(page.getByRole("textbox", { name: "Cell note" })).toBeDisabled();
  await expect(page.getByTestId("props")).toContainText("true");
  await expect(page.getByRole("button", { name: "Add sheet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Options for / })).toHaveCount(0);

  // Mutation is disabled while navigation stays alive; no reset happened. The
  // editor must not even open (commitCell would strand Enter on the toggle).
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 4, col: 3 } });
    grid.beginEdit(4, 3, "Approved");
  });
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toHaveCount(0);
  expect(await cellValue(page, "orders", 4, 3)).toBe("Draft");
  await expect(page.getByTestId("pending-count")).toHaveText("0");
  await expect(page.getByTestId("generation")).toHaveText("1 · initial");

  await openTask(page, "Renderer");
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Add sheet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Options for Orders sheet" })).toBeVisible();
  await commitCell(page, 4, 3, "Approved");
  await expect.poll(() => cellValue(page, "orders", 4, 3)).toBe("Approved");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("the workbench stays operable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await openWorkbench(page);

  // The panel stacks below the grid instead of disappearing.
  const gridBox = await page.locator(`${APP} .sw-demo-grid`).boundingBox();
  const panelBox = await page.locator(`${APP} .sw-vuewb-panel`).boundingBox();
  expect(gridBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.y).toBeGreaterThanOrEqual(gridBox!.y + gridBox!.height - 1);
  await openTask(page, "Notes");
  const mobileRailGeometry = await page.locator(".sw-vuewb-tasktabs").evaluate((navigator) => {
    const events = document.querySelector<HTMLElement>("[data-testid='event-panel']");
    const note = document.querySelector<HTMLTextAreaElement>("[data-testid='note-input']");
    return {
      navigatorClientWidth: navigator.clientWidth,
      navigatorScrollWidth: navigator.scrollWidth,
      eventHeight: events?.getBoundingClientRect().height ?? 0,
      noteClientHeight: note?.clientHeight ?? 0,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(mobileRailGeometry.navigatorScrollWidth).toBeLessThanOrEqual(
    mobileRailGeometry.navigatorClientWidth,
  );
  expect(mobileRailGeometry.eventHeight).toBeGreaterThanOrEqual(120);
  expect(mobileRailGeometry.noteClientHeight).toBeGreaterThanOrEqual(90);
  expect(mobileRailGeometry.documentOverflow).toBe(false);

  // The full governed flow works with touch-sized chrome.
  await commitCell(page, 4, 3, "Approved");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await openTask(page, "Persistence");
  await page.getByTestId("sync").scrollIntoViewIfNeeded();
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v1");

  await commitCell(page, 5, 3, "Perhaps");
  await expect(page.getByTestId("feed")).toContainText(STATUS_RULE);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
