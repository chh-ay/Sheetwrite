import { expect, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

const FIXTURE_URL = siteUrl("/test/semantic-grid/");
const HOST = '[aria-label="Semantic data grid browser fixture"]';

declare global {
  interface Window {
    __sheetwriteSemanticGridFixture?: {
      begin(row: number, col: number): void;
      select(rowStart: number, rowEnd: number, col: number): void;
      toggleBold(): void;
      setReadOnly(value: boolean): void;
      reset(): void;
      destroy(): void;
      stats(): { mounts: number; aborts: number; destroys: number };
    };
  }
}

test("semantic headers, editor lifecycle, focus, and command ARIA", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(FIXTURE_URL);
  await expect(page.locator("#semantic-grid-status")).toHaveAttribute("data-status", "ready", {
    timeout: 20_000,
  });

  const columnHeaders = page.locator(`${HOST} [role="columnheader"]`);
  await expect(columnHeaders.nth(0)).toHaveText("Customer name");
  await expect(columnHeaders.nth(1)).toHaveText("Account status");
  await expect(
    page.locator(`${HOST} [role="row"][aria-rowindex="2"] [role="gridcell"]`).first(),
  ).toHaveText("Alice");

  await page.evaluate(() => window.__sheetwriteSemanticGridFixture?.begin(0, 1));
  const editor = page.locator(`${HOST} .sheetwrite-custom-editor input`);
  await expect(editor).toHaveAttribute("aria-label", "Edit Account status, row 1");
  await editor.fill("Paused");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(page.locator(HOST)).toBeFocused();
  await expect(
    page.locator(`${HOST} [role="row"][aria-rowindex="2"] [role="gridcell"]`).nth(1),
  ).toHaveText("Paused");

  const bold = page.locator(`${HOST} .sheetwrite-tb-bold`);
  const undo = page.locator(`${HOST} .sheetwrite-tb-undo`);
  await page.evaluate(() => {
    window.__sheetwriteSemanticGridFixture?.select(0, 0, 0);
    window.__sheetwriteSemanticGridFixture?.toggleBold();
  });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(undo).toBeEnabled();

  await page.evaluate(() => window.__sheetwriteSemanticGridFixture?.select(0, 1, 0));
  await expect(bold).toHaveAttribute("aria-pressed", "mixed");
  await page.evaluate(() => window.__sheetwriteSemanticGridFixture?.setReadOnly(true));
  await expect(bold).toBeDisabled();
  await expect(undo).toBeDisabled();

  await page.evaluate(() => {
    window.__sheetwriteSemanticGridFixture?.setReadOnly(false);
    window.__sheetwriteSemanticGridFixture?.begin(0, 1);
  });
  await expect(editor).toHaveCount(1);
  await page.evaluate(() => window.__sheetwriteSemanticGridFixture?.reset());
  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => window.__sheetwriteSemanticGridFixture?.stats()))
    .toEqual({ mounts: 2, aborts: 2, destroys: 2 });
  await expect(columnHeaders.nth(0)).toHaveText("Customer name");
  await expect(columnHeaders.nth(1)).toHaveText("Account status");

  await page.evaluate(() => window.__sheetwriteSemanticGridFixture?.destroy());
  await expect(page.locator(`${HOST} .sheetwrite-custom-editor`)).toHaveCount(0);
  expect(errors).toEqual([]);
});
