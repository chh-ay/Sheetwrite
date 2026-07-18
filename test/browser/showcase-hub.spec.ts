import { expect, type Page, test } from "@playwright/test";
import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "../../docs/src/showcases/capabilities.js";
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

test("hub lists every capability with an owning proof link and no errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/showcases/"));

  await expect(page.locator("main h1")).toHaveText("Every capability, proven live.");
  // The Showcases link is page-current on the hub itself.
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");

  // Every inventory entry renders with its stable id and its owner link.
  await expect(page.locator(".sw-hub-cap")).toHaveCount(CAPABILITY_INVENTORY.length);
  for (const owner of CAPABILITY_OWNERS) {
    const links = page.locator(`main a[href="${SITE_BASE}${owner.href}"]`);
    expect(await links.count()).toBeGreaterThan(0);
  }

  // Landmarks and headings: one h1, labelled sections, real list semantics.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "The capability index" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("every owner route URL in the inventory stays resolvable", async ({ request }) => {
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

  // The capability index remains reachable and readable, and keyboard focus
  // lands on real links with accessible names.
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
