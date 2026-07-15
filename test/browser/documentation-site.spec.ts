import { expect, type Page, test } from "@playwright/test";
import { SITE_BASE, SITE_PORT, siteUrl } from "./playwright.config.js";

interface PageErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): PageErrors {
  const errors: PageErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

function docsUrl(path = ""): string {
  return siteUrl(`/docs/${path}`);
}

const representativeRoutes = [
  "start/installation/",
  "start/first-grid/",
  "frameworks/lifecycle/",
  "frameworks/vanilla/",
  "frameworks/react/",
  "frameworks/vue/",
  "frameworks/svelte/",
  "guides/xlsx-export/",
  "guides/configuration/",
  "reference/compatibility-limits/",
  "api/core/",
  "api/core/grid/",
  "api/xlsx/",
] as const;

test("documentation root redirects to installation", async ({ page }) => {
  await page.goto(docsUrl());
  await expect(page).toHaveURL(docsUrl("start/installation/"));
  await expect(page.locator("main h1")).toHaveText("Installation");
});

test.describe("documentation site", () => {
  for (const route of representativeRoutes) {
    test(`documentation site renders /docs/${route} without browser errors`, async ({ page }) => {
      const errors = collectErrors(page);
      const escapedRequests: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          url.origin === `http://localhost:${SITE_PORT}` &&
          url.pathname !== SITE_BASE &&
          !url.pathname.startsWith(`${SITE_BASE}/`)
        ) {
          escapedRequests.push(url.pathname);
        }
      });
      const response = await page.goto(docsUrl(route));
      expect(response?.ok()).toBe(true);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main")).toBeVisible();
      expect(errors.page).toEqual([]);
      expect(errors.console).toEqual([]);
      const rootRelativeUrls = await page
        .locator('a[href^="/"], link[href^="/"], script[src^="/"]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href") ?? element.getAttribute("src")),
        );
      expect(rootRelativeUrls.every((url) => url?.startsWith(`${SITE_BASE}/`))).toBe(true);
      expect(escapedRequests).toEqual([]);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://chh-ay.github.io${SITE_BASE}/docs/${route}`,
      );
    });
  }

  test("public pages expose a loadable shared icon", async ({ page, request }) => {
    for (const route of [
      "/",
      "/docs/start/installation/",
      "/vanilla/",
      "/react/",
      "/vue/",
      "/svelte/",
    ]) {
      await page.goto(siteUrl(route));
      await expect(page.locator('link[rel~="icon"]')).toHaveAttribute(
        "href",
        `${SITE_BASE}/favicon.svg`,
      );
    }

    const response = await request.get(siteUrl("/favicon.svg"));
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
  });

  test("first-grid guide offers usable navigation, copy, and live-example entry", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: `http://localhost:${SITE_PORT}`,
    });
    await page.goto(docsUrl("start/first-grid/"));

    await expect(page.getByRole("link", { name: "Install Sheetwrite", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /copy/i }).first().click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("@sheetwrite/core");
    await page.getByRole("link", { name: "Vanilla example", exact: true }).click();
    await expect(page).toHaveURL(siteUrl("/vanilla/"));
    await expect(page.locator(".sheetwrite")).toBeVisible({ timeout: 15_000 });
  });

  test("documentation headings and keyboard entry remain accessible", async ({ page }) => {
    await page.goto(docsUrl("guides/interaction/"));
    const headings = await page
      .locator("main h1, main h2, main h3, main h4, main h5, main h6")
      .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));
    expect(headings[0]).toBe(1);
    for (let index = 1; index < headings.length; index += 1) {
      expect((headings[index] ?? 1) - (headings[index - 1] ?? 1)).toBeLessThanOrEqual(1);
    }

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    await expect(page.locator(":focus")).toHaveAttribute("href", /#_top|#main-content/);
  });

  test("desktop documentation article is centered within its pane", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(docsUrl("start/installation/"));
    const gutters = await page.evaluate(() => {
      const pane = document.querySelector(".main-pane")?.getBoundingClientRect();
      const article = document
        .querySelector(".content-panel .sl-container")
        ?.getBoundingClientRect();
      if (!pane || !article) return null;
      return {
        left: article.left - pane.left,
        right: pane.right - article.right,
      };
    });

    expect(gutters).not.toBeNull();
    expect(Math.abs((gutters?.left ?? 0) - (gutters?.right ?? 0))).toBeLessThanOrEqual(1);
  });

  test("code frame titles share the header baseline without a nested tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl("start/installation/"));
    const alignment = await page
      .locator('starlight-tabs [role="tabpanel"]:not([hidden]) .frame.has-title')
      .first()
      .evaluate((frame) => {
        const header = frame.querySelector(".header")?.getBoundingClientRect();
        const title = frame.querySelector(".title")?.getBoundingClientRect();
        if (!header || !title) return null;
        return {
          headerHeight: header.height,
          titleHeight: title.height,
          topGap: title.top - header.top,
          bottomGap: header.bottom - title.bottom,
        };
      });

    expect(alignment).not.toBeNull();
    expect(alignment?.titleHeight ?? Infinity).toBeLessThan((alignment?.headerHeight ?? 0) * 0.6);
    expect(Math.abs((alignment?.topGap ?? 0) - (alignment?.bottomGap ?? 0))).toBeLessThanOrEqual(2);
  });

  test("all framework examples expose owned, accessible type details", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const expectResolvedSignatures = async (
      minimumCount: number,
      expected: readonly string[],
    ): Promise<void> => {
      const signatures = await page
        .locator(".sw-code-popover__accessible-signature")
        .allTextContents();
      expect(signatures.length).toBeGreaterThanOrEqual(minimumCount);
      const joined = signatures.join("\n");
      expect(joined).not.toMatch(/\bany\b|__VLS|unresolved/i);
      for (const signature of expected) expect(joined).toContain(signature);
    };
    await page.goto(docsUrl("frameworks/react/"));
    await expectResolvedSignatures(20, [
      "event: ChangeEvent",
      "SheetProps.onReady: (event: GridReadyEvent) => void",
    ]);
    const reactSymbol = page
      .locator('pre[data-language="tsx"] .sw-code-popover__trigger')
      .filter({ hasText: "Sheetwrite" })
      .first();
    await expect(reactSymbol).toBeVisible();

    await reactSymbol.hover();
    const reactDetails = page
      .locator(".sw-code-popover__panel:visible")
      .filter({ hasText: "SheetwriteProps" })
      .first();
    await expect(reactDetails).toBeVisible();
    await expect(reactDetails).toContainText("SheetwriteProps");
    await expect(reactDetails).toContainText("Convenience component for local object rows.");
    await expect(reactDetails).toContainText("prop-driven resets and unmount cleanup");
    await expect(reactDetails).toContainText("SheetwriteGrid");
    await expect(reactDetails.locator(".expressive-code")).toHaveCount(0);

    const surface = await reactDetails.evaluate((popover) => {
      const bounds = popover.getBoundingClientRect();
      const signature = popover.querySelector<HTMLElement>(".sw-code-popover__signature--wide");
      const styles = getComputedStyle(popover);
      return {
        borderRadius: Number.parseFloat(styles.borderRadius),
        boxShadow: styles.boxShadow,
        signatureRight: signature?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        popoverRight: bounds.right,
        accentDividerHeight: signature
          ? Number.parseFloat(getComputedStyle(signature).borderBlockStartWidth)
          : 0,
        signatureLines: signature?.querySelectorAll(".sw-code-popover__line").length ?? 0,
      };
    });
    expect(surface.borderRadius).toBeGreaterThanOrEqual(8);
    expect(surface.boxShadow).not.toBe("none");
    expect(surface.signatureRight).toBeLessThanOrEqual(surface.popoverRight);
    expect(surface.accentDividerHeight).toBeGreaterThanOrEqual(2);
    expect(surface.signatureLines).toBeGreaterThan(1);

    await page.mouse.move(0, 0);
    await expect(page.locator(".sw-code-popover__panel:visible")).toHaveCount(0);
    await reactSymbol.focus();
    await expect(reactDetails).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sw-code-popover__panel:visible")).toHaveCount(0);
    await expect(reactSymbol).toBeFocused();

    const frameworkHovers = [
      {
        path: "frameworks/vanilla/",
        language: "ts",
        symbol: "createGrid",
        docs: "Creates and mounts an imperative Grid",
        minimumCount: 15,
        signature: "host: HTMLElement",
      },
      {
        path: "frameworks/vue/",
        language: "vue",
        symbol: "Sheetwrite",
        docs: "live option updates",
        minimumCount: 20,
        signature: "onGridChange: (event: ChangeEvent) => void",
      },
      {
        path: "frameworks/svelte/",
        language: "svelte",
        symbol: "Sheetwrite",
        docs: "Bind grid to access the live Grid",
        minimumCount: 20,
        signature: "grid: Grid | undefined",
      },
    ] as const;
    for (const example of frameworkHovers) {
      await page.goto(docsUrl(example.path));
      await expectResolvedSignatures(example.minimumCount, [example.signature]);
      const symbol = page
        .locator(`pre[data-language="${example.language}"] .sw-code-popover__trigger`)
        .filter({ hasText: example.symbol })
        .first();
      await expect(symbol).toBeVisible();
      await symbol.focus();
      const details = page.locator(".sw-code-popover__panel:visible").first();
      await expect(details).toBeVisible();
      await expect(details).toContainText(example.symbol);
      await expect(details).toContainText(example.docs);
      await expect(details.locator(".expressive-code")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.locator(".sw-code-popover__panel:visible")).toHaveCount(0);
    }

    await page.setViewportSize({ width: 347, height: 700 });
    await page.goto(docsUrl("frameworks/react/"));
    const mobileSymbol = page
      .locator('pre[data-language="tsx"] .sw-code-popover__trigger')
      .filter({ hasText: "Sheetwrite" })
      .first();
    await mobileSymbol.focus();
    const mobileDetails = page
      .locator(".sw-code-popover__panel:visible")
      .filter({ hasText: "SheetwriteProps" })
      .first();
    await expect(mobileDetails).toBeVisible();
    await expect(mobileDetails.locator(".sw-code-popover__signature--narrow")).toBeVisible();
    const mobileBounds = await mobileDetails.evaluate((popover) => {
      const bounds = popover.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: popover.scrollWidth,
        clientWidth: popover.clientWidth,
      };
    });
    expect(mobileBounds.left).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.right).toBeLessThanOrEqual(mobileBounds.viewportWidth);
    expect(mobileBounds.bottom).toBeLessThanOrEqual(mobileBounds.viewportHeight);
    expect(mobileBounds.scrollWidth).toBeLessThanOrEqual(mobileBounds.clientWidth);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    const darkSurface = await mobileDetails.evaluate((popover) => {
      const signature = popover.querySelector<HTMLElement>(".sw-code-popover__signature--narrow");
      return {
        panel: getComputedStyle(popover).backgroundColor,
        signature: signature ? getComputedStyle(signature).backgroundColor : "",
      };
    });
    expect(darkSurface.panel).not.toBe(darkSurface.signature);
  });

  for (const width of [347, 700, 1568] as const) {
    test(`product landing remains aligned at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 855 });
      await page.goto(siteUrl());
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.getByLabel("Interactive revenue workbook")).toBeVisible();
      const layout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>("main");
        const sections = main ? [...main.querySelectorAll<HTMLElement>(":scope > section")] : [];
        if (!main || sections.length === 0) return null;
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          sectionsFit: sections.every((section) => {
            const bounds = section.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= window.innerWidth + 1;
          }),
        };
      });
      expect(layout).not.toBeNull();
      expect(layout?.documentFits).toBe(true);
      expect(layout?.sectionsFit).toBe(true);
      if (width === 1568) {
        await page.getByLabel("Market").click();
        await page.getByRole("option", { name: "Tokyo", exact: true }).click();
        await expect(page.locator(".sw-live-workbook__metrics b").first()).toHaveText("14,286");
        await page.getByLabel("Find").fill("Account 000042");
        await expect(page.locator(".sw-live-workbook__controls output")).toContainText("1 matches");
      }
    });
  }

  test("framework preference synchronizes examples and persists across guides", async ({
    page,
  }) => {
    await page.goto(docsUrl("start/installation/"));
    const preference = page.getByLabel("Preferred framework");
    await expect(preference).toHaveCount(1);
    await preference.click();
    await page.keyboard.press("End");
    await expect(page.locator(":focus")).toHaveAttribute("data-framework-option", "svelte");
    await page.keyboard.press("Escape");
    await expect(preference).toHaveAttribute("aria-expanded", "false");
    await preference.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator('starlight-tabs [role="tab"][aria-selected="true"]')).toHaveText(
      "React",
    );
    await expect(page.locator('starlight-tabs [role="tabpanel"]:not([hidden])')).toContainText(
      "@sheetwrite/react",
    );
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-docs-framework"))).toBe(
      "react",
    );

    await page.goto(docsUrl("frameworks/lifecycle/"));
    await expect(page.getByLabel("Preferred framework")).toContainText("React");
    await expect(page.locator('starlight-tabs [role="tab"][aria-selected="true"]')).toHaveText(
      "React",
    );

    await page.goto(docsUrl("frameworks/react/"));
    await page.getByLabel("Preferred framework").click();
    await page.getByRole("option", { name: "Vue", exact: true }).click();
    await expect(page).toHaveURL(docsUrl("frameworks/vue/"));
  });

  for (const framework of ["react", "vue", "svelte"] as const) {
    test(`${framework} showcase renders its real grid without runtime errors`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(siteUrl(`/${framework}/`));
      await expect(page.locator(".sw-demo-app .sheetwrite")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("main h1")).toBeVisible();
      expect(errors.console).toEqual([]);
      expect(errors.page).toEqual([]);
    });
  }

  test("generated API indexes lead to focused, progressively disclosed symbol pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1568, height: 900 });
    await page.goto(docsUrl("api/core/"));
    await page.locator(`a[href="${SITE_BASE}/docs/api/core/grid/"]`).first().click();
    await expect(page).toHaveURL(/\/docs\/api\/core\/grid\/$/);
    await expect(page.locator("main h1")).toContainText("Grid");
    await expect(page.locator(".api-member").first()).not.toHaveAttribute("open");
    await page.locator("#grid-get-cell-at-point summary").click();
    await expect(page.locator("#grid-get-cell-at-point pre")).toContainText(
      "clientX: number, clientY: number",
    );
    await expect(page.locator(".api-declaration")).not.toHaveAttribute("open");
    await page.locator(".api-declaration summary").click();
    await expect(page.locator(".api-declaration .expressive-code")).toBeVisible();
  });

  for (const width of [347, 1280, 1568] as const) {
    test(`generated API symbol layout contains no overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(docsUrl("api/core/grid/"));
      await page.locator("#grid-set-presence-overlays summary").click();
      await page.locator(".api-declaration summary").click();
      const layout = await page.evaluate(() => ({
        documentFits: document.documentElement.scrollWidth <= window.innerWidth,
        memberListFits:
          (document.querySelector(".api-member-list")?.getBoundingClientRect().right ?? Infinity) <=
          window.innerWidth,
        declarationFits:
          (document.querySelector(".api-declaration")?.getBoundingClientRect().right ?? Infinity) <=
          window.innerWidth,
      }));
      expect(layout.documentFits).toBe(true);
      expect(layout.memberListFits).toBe(true);
      expect(layout.declarationFits).toBe(true);
    });
  }

  for (const width of [390, 1568] as const) {
    test(`runtime architecture stays semantic and contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(docsUrl("concepts/runtime-ownership/"));
      const diagram = page.getByRole("region", {
        name: "Sheetwrite runtime ownership and data flow",
      });
      await expect(diagram).toBeVisible();
      const contained = await diagram.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          document.documentElement.scrollWidth <= window.innerWidth &&
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth
        );
      });
      expect(contained).toBe(true);
    });
  }

  test("documentation mobile navigation and theme control work", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl());

    await page.waitForFunction(() => customElements.get("starlight-menu-button") !== undefined);
    await page
      .locator("starlight-menu-button")
      .evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const menuControl = page.locator("starlight-menu-button");
    const menu = page.getByRole("button", { name: /menu/i }).first();
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menuControl).toHaveAttribute("aria-expanded", "true");
    const theme = page.locator("#starlight__sidebar").getByRole("button", { name: "Select theme" });
    await expect(theme).toBeVisible();
    await theme.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(theme).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.keyboard.press("Escape");
    await expect(menuControl).toHaveAttribute("aria-expanded", "false");
  });

  test("documentation live example renders request-aware context-menu items", async ({ page }) => {
    await page.goto(siteUrl("/vanilla/"));
    const grid = page.locator(".sheetwrite");
    await expect(grid).toBeVisible();
    await grid.scrollIntoViewIfNeeded();
    await grid.click({ button: "right", position: { x: 400, y: 70 } });

    const copy = page.getByRole("menuitem", { name: /^Copy/ });
    await expect(copy).toContainText("Ctrl+C");
    const highlight = page.getByRole("menuitem", { name: /^Highlight cell/ });
    await expect(highlight).toHaveCount(1);
    await expect(highlight).toBeVisible();
    await highlight.click();
    await expect(page.locator(".sheetwrite-context-menu")).toBeHidden();
  });

  const searchTargets = {
    rendererKind: `${SITE_BASE}/docs/api/core/grid/#rendererkind`,
    onGridChange: `${SITE_BASE}/docs/api/core-adapter/grid-adapter-event-handlers/#ongridchange`,
    applyTransaction: `${SITE_BASE}/docs/api/core/grid/#applytransaction`,
    SnapshotValidationError: `${SITE_BASE}/docs/api/core/snapshot-validation-error/`,
    toXlsxWorkbook: `${SITE_BASE}/docs/api/core/to-xlsx-workbook/`,
  } as const;

  for (const [term, expectedHref] of Object.entries(searchTargets)) {
    test(`documentation search resolves ${term} to its generated anchor`, async ({ page }) => {
      await page.goto(docsUrl());
      await page
        .getByRole("button", { name: /search/i })
        .first()
        .click();
      const search = page.locator('input[placeholder="Search"]');
      await search.fill(term);
      const matchingLink = page.locator(`a[href='${expectedHref}']`);
      await expect(matchingLink.first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test("documentation search excludes browser-only test routes", async ({ page }) => {
    await page.goto(docsUrl());
    await page
      .getByRole("button", { name: /search/i })
      .first()
      .click();
    await page.locator('input[placeholder="Search"]').fill("XLSX browser verification");
    await expect(page.locator(`a[href^='${SITE_BASE}/test/']`)).toHaveCount(0);
  });
});
