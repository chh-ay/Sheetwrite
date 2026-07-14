import { expect, type Page, test } from "@playwright/test";
import { SITE_PORT } from "./playwright.config.js";

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
  return `http://localhost:${SITE_PORT}/docs/${path}`;
}

const representativeRoutes = [
  "",
  "start/first-grid/",
  "frameworks/vanilla/",
  "frameworks/react/",
  "frameworks/vue/",
  "frameworks/svelte/",
  "guides/xlsx-export/",
  "reference/compatibility-limits/",
  "api/core/",
  "api/core/grid/",
  "api/xlsx/",
] as const;

test.describe("documentation site", () => {
  for (const route of representativeRoutes) {
    test(`documentation site renders /docs/${route} without browser errors`, async ({ page }) => {
      const errors = collectErrors(page);
      const response = await page.goto(docsUrl(route));
      expect(response?.ok()).toBe(true);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main")).toBeVisible();
      expect(errors.page).toEqual([]);
      expect(errors.console).toEqual([]);
    });
  }

  test("documentation site exposes sidebar, pagination, examples, and checked code", async ({
    page,
  }) => {
    await page.goto(docsUrl("start/first-grid/"));

    await expect(page.getByRole("navigation", { name: /main/i })).toContainText("Start");
    await expect(page.locator("main h1")).toHaveText("Your first grid");
    await expect(page.locator("main pre code").first()).toContainText('from "@sheetwrite/core"');
    await expect(page.getByRole("button", { name: /copy/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Vanilla example" })).toHaveAttribute(
      "href",
      "/vanilla/",
    );
    await expect(page.locator("a[rel='prev'], a[rel='next']").first()).toBeVisible();
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

  for (const width of [347, 700, 1568] as const) {
    test(`documentation landing remains aligned at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 855 });
      await page.goto(docsUrl());
      const layout = await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>(".sw-docs-hero");
        const sections = [
          document.querySelector<HTMLElement>(".sw-docs-hero-copy"),
          document.querySelector<HTMLElement>(".sw-docs-code"),
          document.querySelector<HTMLElement>(".sw-docs-facts"),
        ];
        const code = document.querySelector<HTMLElement>(".sw-docs-code pre");
        const main = document.querySelector<HTMLElement>(".main-pane");
        if (!hero || !code || !main || sections.some((section) => !section)) return null;
        const heroBounds = hero.getBoundingClientRect();
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          sectionsFit: sections.every((section) => {
            const bounds = section!.getBoundingClientRect();
            return bounds.left >= heroBounds.left && bounds.right <= heroBounds.right;
          }),
          codeFits: code.scrollWidth <= code.clientWidth,
          mainWidth: main.getBoundingClientRect().width,
          tocAbsent: document.querySelector(".right-sidebar-container") === null,
        };
      });
      expect(layout).not.toBeNull();
      expect(layout?.documentFits).toBe(true);
      expect(layout?.sectionsFit).toBe(true);
      expect(layout?.codeFits).toBe(true);
      expect(layout?.tocAbsent).toBe(true);
      if (width === 1568) expect(layout?.mainWidth).toBeGreaterThanOrEqual(width * 0.6);
    });
  }

  for (const width of [1280, 1568] as const) {
    test(`documentation content layout remains balanced at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(docsUrl("guides/formulas/"));
      const layout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>(".main-pane");
        const content = document.querySelector<HTMLElement>(".sl-markdown-content");
        const toc = document.querySelector<HTMLElement>(".right-sidebar-container");
        if (!main || !content) return null;
        const mainBounds = main.getBoundingClientRect();
        const tocBounds = toc?.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          mainRight: mainBounds.right,
          contentWidth: contentBounds.width,
          contentInsetDelta: Math.abs(
            contentBounds.left - mainBounds.left - (mainBounds.right - contentBounds.right),
          ),
          tocDisplay: toc ? getComputedStyle(toc).display : "none",
          tocWidth: tocBounds?.width ?? 0,
          tablesFillFrames: [...document.querySelectorAll("table")].every((table) => {
            const width = table.getBoundingClientRect().width;
            return [...table.rows].every(
              (row) => Math.abs(row.getBoundingClientRect().width - width) < 3,
            );
          }),
          codeFramesContained: [
            ...document.querySelectorAll<HTMLElement>(".expressive-code figure.frame"),
          ].every((frame) => {
            const bounds = frame.getBoundingClientRect();
            return bounds.left >= contentBounds.left && bounds.right <= contentBounds.right;
          }),
          codeLinesPreserveSource: [
            ...document.querySelectorAll<HTMLElement>(".expressive-code .ec-line .code"),
          ].every((code) => getComputedStyle(code).whiteSpace === "pre"),
          codeFramesHaveBorders: [
            ...document.querySelectorAll<HTMLElement>(".expressive-code figure.frame"),
          ].every((frame) => Number.parseFloat(getComputedStyle(frame).borderWidth) >= 1),
        };
      });
      expect(layout).not.toBeNull();
      expect(layout?.documentFits).toBe(true);
      expect(layout?.contentInsetDelta).toBeLessThanOrEqual(1);
      expect(layout?.tablesFillFrames).toBe(true);
      expect(layout?.codeFramesContained).toBe(true);
      expect(layout?.codeLinesPreserveSource).toBe(true);
      expect(layout?.codeFramesHaveBorders).toBe(true);
      expect(layout?.tocDisplay).toBe("none");
      expect(layout?.tocWidth).toBe(0);
      expect(layout?.mainRight).toBe(width);
    });
  }
  for (const width of [347, 1280, 1568] as const) {
    test(`code chrome remains aligned and source-preserving at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(docsUrl("start/installation/"));
      const chrome = await page
        .locator(".expressive-code figure.frame.has-title")
        .first()
        .evaluate((frame) => {
          const header = frame.querySelector<HTMLElement>(".header");
          const button = frame.querySelector<HTMLButtonElement>(".copy button");
          const code = frame.querySelector<HTMLElement>(".ec-line .code");
          const pre = frame.querySelector<HTMLElement>("pre");
          if (!header || !button || !code || !pre) return null;
          const headerBounds = header.getBoundingClientRect();
          const buttonBounds = button.getBoundingClientRect();
          return {
            buttonCenterDelta: Math.abs(
              headerBounds.top +
                headerBounds.height / 2 -
                (buttonBounds.top + buttonBounds.height / 2),
            ),
            buttonWidth: buttonBounds.width,
            buttonHeight: buttonBounds.height,
            buttonDisplay: getComputedStyle(button).display,
            codeWhiteSpace: getComputedStyle(code).whiteSpace,
            preOverflowX: getComputedStyle(pre).overflowX,
            documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          };
        });
      expect(chrome).not.toBeNull();
      expect(chrome?.buttonCenterDelta).toBeLessThanOrEqual(1);
      expect(chrome?.buttonWidth).toBeGreaterThanOrEqual(36);
      expect(chrome?.buttonHeight).toBeGreaterThanOrEqual(36);
      expect(chrome?.buttonDisplay).toBe("grid");
      expect(chrome?.codeWhiteSpace).toBe("pre");
      expect(chrome?.preOverflowX).toBe("auto");
      expect(chrome?.documentFits).toBe(true);
    });
  }

  test("the header framework selector is the single persisted framework control", async ({
    page,
  }) => {
    await page.goto(docsUrl());
    let framework = page.locator(".sw-framework-menu:visible summary");
    await expect(framework).toHaveCount(1);
    await expect(framework).toContainText("Framework");
    await framework.click();
    await expect(page.locator(".sw-framework-menu:visible details")).toHaveAttribute("open", "");
    await page.locator('.sw-framework-options:visible [data-framework="React"]').click();
    await expect(page).toHaveURL(/\/docs\/frameworks\/react\/$/);
    framework = page.locator(".sw-framework-menu:visible summary");
    await expect(framework).toContainText("React");
    await page.goto(docsUrl("start/installation/"));
    await expect(page.locator(".sw-framework-menu:visible summary")).toContainText("React");
    await expect(page.locator("starlight-tabs")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl("start/installation/"));
    await page.waitForFunction(() => customElements.get("starlight-menu-button") !== undefined);
    const menuControl = page.locator("starlight-menu-button");
    await menuControl.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page.getByRole("button", { name: /menu/i }).first().click();
    await expect(menuControl).toHaveAttribute("aria-expanded", "true");
    framework = page.locator(".sw-framework-menu:visible summary");
    await expect(framework).toHaveCount(1);
    await expect(framework).toContainText("React");
    await framework.click();
    await page.locator('.sw-framework-options:visible [data-framework="Vue"]').click();
    await expect(page).toHaveURL(/\/docs\/frameworks\/vue\/$/);
  });

  test("generated API indexes lead to focused, progressively disclosed symbol pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1568, height: 900 });
    await page.goto(docsUrl("api/core/"));
    await expect(page.locator(".right-sidebar-container")).toHaveCount(0);
    await expect(page.locator(".api-symbol-card").first()).toBeVisible();
    expect(await page.locator(".api-symbol-card").count()).toBeGreaterThan(50);
    await expect(page.locator(".expressive-code")).toHaveCount(0);
    await page.locator('.api-symbol-card[href="/docs/api/core/grid/"]').click();
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
      const diagram = page.locator(".sw-architecture");
      await expect(diagram).toBeVisible();
      await expect(diagram.locator("article")).toHaveCount(5);
      await expect(diagram).toContainText("SheetwriteStore");
      await expect(diagram).toContainText("Columnar engine");
      await expect(page.locator(".mermaid, code.language-mermaid")).toHaveCount(0);
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
    const theme = page
      .locator("select:visible")
      .filter({ has: page.locator('option[value="light"]') })
      .first();
    await expect(theme).toBeVisible();
    await theme.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.keyboard.press("Escape");
    await expect(menuControl).toHaveAttribute("aria-expanded", "false");
  });

  test("documentation live example renders request-aware context-menu items", async ({ page }) => {
    await page.goto(`http://localhost:${SITE_PORT}/vanilla/`);
    const grid = page.locator(".sheetwrite");
    await expect(grid).toBeVisible();
    await grid.click({ button: "right", position: { x: 90, y: 70 } });

    const copy = page.locator('[data-context-menu-item="copy"]');
    await expect(copy).toContainText("Copy");
    await expect(copy.locator(".sheetwrite-context-menu-shortcut")).toHaveText("Ctrl+C");
    await expect(page.locator('[data-context-menu-item="highlight"]')).toBeVisible();
    await page.locator('[data-context-menu-item="highlight"]').click();
    await expect(page.locator(".sheetwrite-context-menu")).toBeHidden();
  });

  const searchTargets = {
    rendererKind: "/docs/api/core/grid/#rendererkind",
    onGridChange: "/docs/api/core-adapter/grid-adapter-event-handlers/#ongridchange",
    applyTransaction: "/docs/api/core/grid/#applytransaction",
    SnapshotValidationError: "/docs/api/core/snapshot-validation-error/",
    toXlsxWorkbook: "/docs/api/core/to-xlsx-workbook/",
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
    await expect(page.locator("a[href^='/test/']")).toHaveCount(0);
  });
});
