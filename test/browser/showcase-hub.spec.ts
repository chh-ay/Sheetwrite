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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(siteUrl("/showcases/"));

  await expect(page.locator("main h1")).toHaveText("Every feature, live and tested.");
  // The Showcases link is page-current on the hub itself.
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");

  // One asymmetric gallery contains exactly the four capability showcases and
  // four framework integrations. At the acceptance viewport every launcher is
  // already discoverable without scrolling.
  const launchers = page.locator(".sw-hub-scenes .sw-hub-launch");
  await expect(launchers).toHaveCount(8);
  await expect(launchers.first()).toHaveAttribute("data-owner", "performance");
  const launcherViewportState = await launchers.evaluateAll((links) => ({
    allWithinViewport: links.every((link) => {
      const bounds = link.getBoundingClientRect();
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.top >= 0 &&
        bounds.bottom <= window.innerHeight
      );
    }),
    count: links.length,
  }));
  expect(launcherViewportState).toEqual({ allWithinViewport: true, count: 8 });
  const clippedLabels = await page
    .locator(
      ".sw-hub-launch__meta span, .sw-hub-launch__body > strong, .sw-hub-framework-scene code, .sw-hub-framework-scene small",
    )
    .evaluateAll((labels) =>
      labels
        .filter(
          (label) =>
            label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight,
        )
        .map((label) => label.textContent?.trim()),
    );
  expect(clippedLabels).toEqual([]);

  // The hub is a static launcher: previews do not eagerly mount a Grid or a
  // renderer surface. The separate engine diagnostic remains on demand.
  await expect(page.locator('main [role="grid"], main canvas')).toHaveCount(0);
  const internals = page.getByText("Implementation and measurement notes", { exact: true });
  await expect(internals).toBeVisible();
  await internals.click();
  await expect(page.getByRole("link", { name: "Inspect the live engine" })).toBeVisible();

  // Selection, keyboard activation, and focus-visible treatment are explicit.
  const allFilter = page.getByRole("button", { name: "All", exact: true });
  const dataFilter = page.getByRole("button", { name: "Data & scale", exact: true });
  const workbookFilter = page.getByRole("button", { name: "Workbook", exact: true });
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  await allFilter.focus();
  await page.keyboard.press("Tab");
  await expect(dataFilter).toBeFocused();
  const focusStyle = await dataFilter.evaluate((button) => {
    const style = getComputedStyle(button);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");
  await dataFilter.click();
  await expect(dataFilter).toHaveAttribute("aria-pressed", "true");
  await expect(allFilter).toHaveAttribute("aria-pressed", "false");
  await expect(launchers).toHaveCount(2);

  await workbookFilter.click();
  await expect(workbookFilter).toHaveAttribute("aria-pressed", "true");
  await expect(dataFilter).toHaveAttribute("aria-pressed", "false");
  await expect(launchers).toHaveCount(1);
  await expect(launchers).toHaveAttribute("data-owner", "interoperability");
  await expect(page.getByText("1 / 8 shown")).toBeVisible();
  await allFilter.click();
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  await expect(launchers).toHaveCount(8);

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

  // Mobile deliberately becomes one compact, ordered launch list. Preview
  // windows are removed from the flow while every owning link stays reachable.
  const launchers = page.locator(".sw-hub-scenes .sw-hub-launch");
  await expect(page.locator("main ol.sw-hub-scenes")).toBeVisible();
  await expect(launchers).toHaveCount(8);
  await expect(page.locator(".sw-hub-scene, .sw-hub-framework-scene").first()).toBeHidden();
  await expect(launchers.first()).toHaveAttribute("data-owner", "performance");
  await expect(launchers.last()).toHaveAttribute("data-owner", "svelte");

  const allFilter = page.getByRole("button", { name: "All", exact: true });
  await allFilter.scrollIntoViewIfNeeded();
  await allFilter.focus();
  await expect(allFilter).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Data & scale", exact: true })).toBeFocused();

  const databaseCard = page.locator(`main a[href="${SITE_BASE}/showcases/database/"]`).first();
  await databaseCard.scrollIntoViewIfNeeded();
  await expect(databaseCard).toBeVisible();
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
