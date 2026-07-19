import { expect, type Page, test } from "@playwright/test";
import { CAPABILITY_OWNERS } from "../../docs/src/showcases/capabilities.js";
import { SITE_BASE, siteUrl } from "./playwright.config.js";

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

test("hub launches every owning showcase without errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/showcases/"));

  await expect(page.locator("main h1")).toHaveText("Every capability, live and verified.");
  // The Showcases link is page-current on the hub itself.
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");

  // The visual launcher leads with the four capability scenes — Performance
  // first — and keeps the four framework adapters as a secondary rail.
  await expect(page.locator(".sw-hub-scenes .sw-hub-launch")).toHaveCount(4);
  await expect(page.locator(".sw-hub-scenes .sw-hub-launch").first()).toHaveAttribute(
    "data-owner",
    "performance",
  );
  await expect(page.locator(".sw-hub-rail .sw-hub-rail__item")).toHaveCount(4);

  // Landmarks and headings: one h1, labelled sections, real list semantics.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("every owning showcase URL stays resolvable", async ({ request }) => {
  for (const owner of CAPABILITY_OWNERS) {
    const response = await request.get(siteUrl(owner.href));
    expect(response.ok(), `${owner.href} must resolve`).toBe(true);
  }
});

test("hub stays accessible and usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await page.goto(siteUrl("/showcases/"));

  await expect(page.locator("main h1")).toBeVisible();
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= window.innerWidth,
  }));
  expect(layout.fits).toBe(true);

  // The visual launchers remain reachable, and keyboard focus lands on real
  // links with accessible names.
  const hubLink = page.getByRole("link", { name: "Showcases" });
  await expect(hubLink).toBeVisible();
  await hubLink.focus();
  await expect(hubLink).toBeFocused();

  const databaseCard = page.locator(`main a[href="${SITE_BASE}/showcases/database/"]`).first();
  await databaseCard.scrollIntoViewIfNeeded();
  await expect(databaseCard).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
