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
  await page.setViewportSize({ width: 1568, height: 844 });
  await page.goto(siteUrl("/showcases/"));
  await page.waitForLoadState("networkidle");

  await expect(page.locator("main h1")).toHaveText("Eight real experiences. Pick your proof.");
  // The Showcases link is page-current on the hub itself.
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");

  // The capability owners occupy the first row and framework owners the
  // second. All eight equal launchers fit the acceptance viewport.
  const launchers = page.locator(".sw-hub-scenes .sw-hub-launch");
  await expect(launchers).toHaveCount(8);
  await expect(launchers.first()).toHaveAttribute("data-owner", "performance");
  const launcherGeometry = await launchers.evaluateAll((links) =>
    links.map((link) => {
      const bounds = link.getBoundingClientRect();
      return {
        bottom: Math.round(bounds.bottom),
        height: Math.round(bounds.height),
        top: Math.round(bounds.top),
        width: Math.round(bounds.width),
      };
    }),
  );
  expect(new Set(launcherGeometry.map(({ width }) => width)).size).toBe(1);
  expect(new Set(launcherGeometry.map(({ height }) => height)).size).toBe(1);
  expect(
    [...new Set(launcherGeometry.map(({ top }) => top))].map(
      (top) => launcherGeometry.filter((card) => card.top === top).length,
    ),
  ).toEqual([4, 4]);
  expect(Math.max(...launcherGeometry.map(({ bottom }) => bottom))).toBeLessThanOrEqual(844);
  expect(Math.max(...launcherGeometry.map(({ bottom }) => bottom))).toBeGreaterThanOrEqual(780);
  const galleryWidth = await page
    .locator(".sw-hub-scenes")
    .evaluate((gallery) => Math.round(gallery.getBoundingClientRect().width));
  expect(galleryWidth).toBeGreaterThanOrEqual(1568 - 96);
  const clippedLabels = await page
    .locator(
      ".sw-hub-scene__caption, .sw-hub-framework-scene > span, .sw-hub-framework-scene code, .sw-hub-framework-scene small, .sw-hub-launch__meta, .sw-hub-launch__body > strong, .sw-hub-launch__summary, .sw-hub__owner-count",
    )
    .evaluateAll((labels) =>
      labels
        .filter(
          (label) =>
            label.getClientRects().length > 0 &&
            (label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight),
        )
        .map((label) => label.textContent?.trim()),
    );
  expect(clippedLabels).toEqual([]);
  const bodyFontSizes = await page
    .locator(".sw-hub-launch__body > strong, .sw-hub-launch__summary")
    .evaluateAll((labels) =>
      labels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
    );
  expect(Math.min(...bodyFontSizes)).toBeGreaterThanOrEqual(14);

  // The hub is a static launcher: previews do not eagerly mount a Grid or a
  // renderer surface.
  await expect(page.locator('main [role="grid"], main canvas')).toHaveCount(0);

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
  await dataFilter.press("Enter");
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

test("gallery geometry is equal, readable, and unclipped across themes", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  const viewports = [
    { columns: 4, height: 844, width: 1568 },
    { columns: 4, height: 900, width: 1440 },
    { columns: 2, height: 900, width: 1024 },
    { columns: 1, height: 844, width: 390 },
  ] as const;
  const themes = ["dark", "light"] as const;
  const contentSelector =
    ".sw-hub-scene__caption, .sw-hub-framework-scene > span, .sw-hub-framework-scene code, .sw-hub-framework-scene small, .sw-hub-launch__meta, .sw-hub-launch__body > strong, .sw-hub-launch__summary, .sw-hub__owner-count";

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(siteUrl("/showcases/"));
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    for (const theme of themes) {
      await page.evaluate((nextTheme) => {
        document.documentElement.dataset.theme = nextTheme;
      }, theme);
      const geometry = await page.locator(".sw-hub-launch").evaluateAll((cards) =>
        cards.map((card) => {
          const bounds = card.getBoundingClientRect();
          return {
            bottom: Math.round(bounds.bottom),
            height: Math.round(bounds.height),
            top: Math.round(bounds.top),
            width: Math.round(bounds.width),
          };
        }),
      );
      const firstCard = geometry[0];
      expect(firstCard).toBeDefined();
      expect(geometry).toHaveLength(8);
      expect(geometry.every((card) => card.width === firstCard?.width)).toBe(true);
      expect(geometry.every((card) => card.height === firstCard?.height)).toBe(true);
      const rowTops = geometry
        .map(({ top }) => top)
        .filter((top, index, tops) => tops.indexOf(top) === index);
      expect(rowTops).toHaveLength(8 / viewport.columns);
      expect(
        rowTops.every(
          (top) => geometry.filter((card) => card.top === top).length === viewport.columns,
        ),
      ).toBe(true);
      if (viewport.width >= 1440) {
        expect(Math.max(...geometry.map(({ bottom }) => bottom))).toBeLessThanOrEqual(
          viewport.height,
        );
        expect(Math.max(...geometry.map(({ bottom }) => bottom))).toBeGreaterThanOrEqual(
          viewport.height - 64,
        );
        const galleryWidth = await page
          .locator(".sw-hub-scenes")
          .evaluate((gallery) => Math.round(gallery.getBoundingClientRect().width));
        expect(galleryWidth).toBeGreaterThanOrEqual(viewport.width - 96);
      }

      const contentBounds = await page.locator(contentSelector).evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => ({
            clipped:
              element.scrollWidth > element.clientWidth ||
              element.scrollHeight > element.clientHeight,
            text: element.textContent?.trim(),
          })),
      );
      expect(contentBounds.filter(({ clipped }) => clipped).map(({ text }) => text)).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

      if (viewport.width !== 1440) {
        await page.screenshot({
          path: testInfo.outputPath(`hub-${viewport.width}-${theme}.png`),
        });
      }
    }
  }

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("hub stays accessible and usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await page.goto(siteUrl("/showcases/"));
  await page.waitForLoadState("networkidle");

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

test("all four capability routes share one 2 by 2 hero contract", async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  for (const route of ["performance", "database", "interoperability", "collaboration"]) {
    await page.goto(siteUrl(`/showcases/${route}/`));
    const hero = page.locator(".sw-capability-hero");
    await expect(hero).toHaveCount(1);
    const facts = hero.locator(".sw-capability-hero__facts > div");
    await expect(facts).toHaveCount(4);
    const geometry = await facts.evaluateAll((items) =>
      items.map((item) => {
        const bounds = item.getBoundingClientRect();
        return { left: Math.round(bounds.left), top: Math.round(bounds.top) };
      }),
    );
    expect(new Set(geometry.map(({ left }) => left)).size, `${route} hero columns`).toBe(2);
    expect(new Set(geometry.map(({ top }) => top)).size, `${route} hero rows`).toBe(2);
  }
});
