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

/** Interactive steps need attached listeners; the root component marks hydration. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
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

test("documentation root serves the overview", async ({ page }) => {
  await page.goto(docsUrl());
  await expect(page).toHaveURL(docsUrl());
  await expect(page.locator("main h1")).toHaveText("Build web spreadsheets you still own.");
  await expect(page.locator('.sw-sidebar__nav a[href="/docs/"]')).toBeVisible();
});

test("sidebar lists performance inside the start section", async ({ page }) => {
  await page.goto(docsUrl());
  const navigation = page.getByRole("navigation", { name: "Documentation" });
  const start = navigation.getByRole("heading", { name: "Start" }).locator("..");

  await expect(start.getByRole("link")).toHaveText([
    "Overview",
    "Installation",
    "First grid",
    "Performance",
  ]);
  await expect(navigation.getByRole("heading", { name: "Benchmark" })).toHaveCount(0);
});

test("sidebar marks only the nearest documentation route as current", async ({ page }) => {
  for (const [path, label] of [
    ["start/first-grid/", "First grid"],
    ["api/core/", "@sheetwrite/core"],
    ["api/core/grid/", "@sheetwrite/core"],
  ] as const) {
    await page.goto(docsUrl(path));
    const navigation = page.getByRole("navigation", { name: "Documentation" });
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("site root serves the product landing", async ({ page }) => {
  const errors = collectErrors(page);
  const response = await page.goto(siteUrl("/"));
  expect(response?.ok()).toBe(true);
  // Semantic contract: exactly one H1, and no live grid runtime on the landing.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main canvas, main .sheetwrite")).toHaveCount(0);
  await expect(page).toHaveTitle("Sheetwrite — TypeScript spreadsheet and data grid");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Build fast, editable web spreadsheets with TypeScript, Canvas, Rust/WASM, and first-party React, Vue, Svelte, and vanilla JavaScript adapters. Get started.",
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "Sheetwrite spreadsheet grid showing typed web data",
  );
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
    "content",
    "Sheetwrite spreadsheet grid showing typed web data",
  );
  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent ?? "null")));
  expect(structuredData).toHaveLength(1);
  expect(
    structuredData[0]?.["@graph"]?.map((entry: { "@type": string }) => entry["@type"]),
  ).toEqual(["WebSite", "SoftwareSourceCode"]);
  expect(structuredData[0]?.["@graph"]?.[1]).toMatchObject({
    codeRepository: "https://github.com/chh-ay/sheetwrite",
    license: "https://opensource.org/license/mit",
    programmingLanguage: ["TypeScript", "Rust"],
    runtimePlatform: ["Web", "WebAssembly"],
    version: "0.1.0",
  });
  // Benchmark section publishes real generated numbers, never placeholders.
  const benchStats = page.locator("#benchmarks .sw-bench-stats li");
  await expect(benchStats.first()).toBeVisible();
  await expect(page.locator("#benchmarks")).toContainText("Read the full protocol.");
  // Capability navigation: four owned proofs and four adapter workbenches link out.
  await expect(page.locator("main a[data-proof]")).toHaveCount(4);
  await expect(page.locator("main a[data-framework]")).toHaveCount(4);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
  await page.getByRole("link", { name: /Performance & scale/ }).click();
  await expect(page).toHaveURL(siteUrl("/showcases/performance/"));
  await page.goBack();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(docsUrl("start/installation/"));
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
        `https://sheetwrite.vercel.app/docs/${route}`,
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
    await waitForHydration(page);

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
      const sidebar = document.querySelector(".sw-sidebar")?.getBoundingClientRect();
      const article = document.querySelector(".sw-document")?.getBoundingClientRect();
      if (!sidebar || !article) return null;
      return {
        left: article.left - sidebar.right,
        right: window.innerWidth - article.right,
      };
    });

    expect(gutters).not.toBeNull();
    expect(Math.abs((gutters?.left ?? 0) - (gutters?.right ?? 0))).toBeLessThanOrEqual(1);
  });

  test("documentation tokens resolve into the critical computed surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(docsUrl("start/installation/"));
    const documentation = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const header = document.querySelector<HTMLElement>(".sw-docs-header");
      const sidebar = document.querySelector<HTMLElement>(".sw-sidebar");
      const article = document.querySelector<HTMLElement>(".sw-document");
      const code = document.querySelector<HTMLElement>(".expressive-code pre code");
      if (!header || !sidebar || !article || !code) return null;
      return {
        surfaceToken: root.getPropertyValue("--sw-surface-0").trim(),
        accentToken: root.getPropertyValue("--sw-accent").trim(),
        bodyBackground: body.backgroundColor,
        bodyFont: body.fontFamily,
        headerHeight: header.getBoundingClientRect().height,
        sidebarWidth: sidebar.getBoundingClientRect().width,
        articleWidth: article.getBoundingClientRect().width,
        codeFont: getComputedStyle(code).fontFamily,
      };
    });
    expect(documentation).not.toBeNull();
    expect(documentation?.surfaceToken).not.toBe("");
    expect(documentation?.accentToken).not.toBe("");
    expect(documentation?.bodyBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(documentation?.bodyFont).toContain("Inter");
    expect(documentation?.headerHeight ?? 0).toBeGreaterThan(40);
    expect(documentation?.sidebarWidth ?? 0).toBeGreaterThan(200);
    expect(documentation?.articleWidth ?? 0).toBeGreaterThan(600);
    expect(documentation?.codeFont).toContain("JetBrains Mono");

    await page.goto(docsUrl("api/core/grid/"));
    const apiMember = page.locator(".api-member").first();
    await expect(apiMember).toBeVisible();
    const memberStyle = await apiMember.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopWidth };
    });
    expect(memberStyle.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(memberStyle.border)).toBeGreaterThan(0);
  });

  test("code blocks preserve syntax, chrome, highlighting, focus, and type hovers", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("sheetwrite-theme", "light"));
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);

    const block = page
      .locator(".expressive-code")
      .filter({ has: page.locator("figcaption", { hasText: "Vanilla" }) });
    await expect(block).toBeVisible();
    const light = await block.evaluate((root) => {
      const pre = root.querySelector("pre");
      const title = root.querySelector("figcaption");
      const trigger = root.querySelector<HTMLElement>("[data-sw-code-popover-trigger]");
      const tokenColors = [
        ...new Set(
          [...root.querySelectorAll<HTMLElement>(".ec-line span[style]")].map(
            (token) => getComputedStyle(token).color,
          ),
        ),
      ];
      if (!pre || !title || !trigger) return null;
      const preStyle = getComputedStyle(pre);
      const titleStyle = getComputedStyle(title);
      const triggerStyle = getComputedStyle(trigger);
      return {
        preBackground: preStyle.backgroundColor,
        overflowX: preStyle.overflowX,
        whiteSpace: preStyle.whiteSpace,
        titleBackground: titleStyle.backgroundColor,
        titleBorder: titleStyle.borderBottomWidth,
        tokenColors,
        triggerDecoration: triggerStyle.textDecorationLine,
        triggerDecorationStyle: triggerStyle.textDecorationStyle,
        triggerCursor: triggerStyle.cursor,
      };
    });
    expect(light).not.toBeNull();
    expect(light?.preBackground).toBe("rgb(255, 255, 255)");
    expect(light?.overflowX).toBe("auto");
    expect(light?.whiteSpace).toBe("pre");
    expect(light?.titleBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(light?.titleBorder ?? "0")).toBeGreaterThan(0);
    expect(light?.tokenColors.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(light?.triggerDecoration).toContain("underline");
    expect(light?.triggerDecorationStyle).toBe("wavy");
    expect(light?.triggerCursor).toBe("help");

    const trigger = block.locator("[data-sw-code-popover-trigger]").first();
    await trigger.focus();
    const panelId = await trigger.getAttribute("data-sw-code-popover-trigger");
    expect(panelId).not.toBeNull();
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: /use dark theme/i }).click();
    await expect
      .poll(() => block.locator("pre").evaluate((pre) => getComputedStyle(pre).backgroundColor))
      .not.toBe(light?.preBackground);

    await page.goto(docsUrl("proof"));
    const markedLine = page.locator(".expressive-code .ec-line.mark");
    await expect(markedLine).toBeVisible();
    await expect
      .poll(() => markedLine.evaluate((line) => getComputedStyle(line).backgroundColor))
      .not.toBe("rgba(0, 0, 0, 0)");

    // A deterministically overflowing block: declarations pretty-print at 78
    // columns, so a 520px viewport guarantees horizontal overflow in the
    // revealed Grid declaration.
    await page.setViewportSize({ width: 520, height: 900 });
    await page.goto(docsUrl("api/core/grid/"));
    await waitForHydration(page);
    await page.locator(".api-declaration summary").click();
    const scrollable = page.locator(".api-declaration .expressive-code pre").first();
    await expect(scrollable).toHaveAttribute("tabindex", "0");
    await expect(scrollable).toHaveAttribute("role", "region");
  });

  test("code frame titles share the header baseline without a nested tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl("start/installation/"));
    const alignment = await page
      .locator('.sw-tabs [role="tabpanel"] .frame.has-title')
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
    await waitForHydration(page);
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
        docs: "Bind grid",
        minimumCount: 20,
        // The self-restating `grid: Grid | undefined` hover is intentionally
        // suppressed; the public props type resolving is the stable contract.
        signature: "SheetwriteProps",
      },
    ] as const;
    for (const example of frameworkHovers) {
      await page.goto(docsUrl(example.path));
      await waitForHydration(page);
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
    test(`documentation landing remains aligned at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 855 });
      await page.goto(siteUrl());
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: /npm install @sheetwrite\/core Copy install command/ }),
      ).toBeVisible();
      const layout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>("main");
        const targets = [
          ...document.querySelectorAll<HTMLElement>(
            "main a[data-proof], main a[data-framework], [data-hero-panel]",
          ),
        ];
        if (!main || targets.length === 0) return null;
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          cardsFit: targets.every((card) => {
            const bounds = card.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= window.innerWidth + 1;
          }),
        };
      });
      expect(layout).not.toBeNull();
      expect(layout?.documentFits).toBe(true);
      expect(layout?.cardsFit).toBe(true);
      if (width === 1568) {
        await page.getByRole("link", { name: "Get started" }).click();
        await expect(page).toHaveURL(docsUrl("start/installation/"));
        await expect(page.locator("main h1")).toHaveText("Installation");
      }
    });
  }

  test("framework tabs synchronize and persist across guides", async ({ page }) => {
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    const expectStyledPanel = async (language: string) => {
      const panel = page.getByRole("tabpanel");
      await expect(panel.locator(".frame.is-terminal .sr-only")).toHaveCSS("position", "absolute");
      const colors = await panel
        .locator(`pre[data-language="${language}"] .code`)
        .first()
        .evaluate((code) => ({
          code: getComputedStyle(code).color,
          tokens: Array.from(
            code.querySelectorAll<HTMLElement>("span[style]"),
            (token) => getComputedStyle(token).color,
          ),
        }));
      expect(colors.tokens.length).toBeGreaterThan(0);
      expect(colors.tokens.some((color) => color !== colors.code)).toBe(true);
    };
    const reactTab = page.getByRole("tab", { name: "React", exact: true });
    await expect(reactTab).toBeVisible();
    await reactTab.click();
    await expect(reactTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("@sheetwrite/react");
    await expectStyledPanel("tsx");
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-framework"))).toBe("React");

    await page.goto(docsUrl("frameworks/lifecycle/"));
    await expect(page.getByRole("tab", { name: "React", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toContainText("SheetwriteGrid");

    await page.getByRole("tab", { name: "Vue", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-framework"))).toBe("Vue");
    await page.goto(docsUrl("start/installation/"));
    await expect(page.getByRole("tab", { name: "Vue", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectStyledPanel("vue");
    await page.getByRole("tab", { name: "Svelte", exact: true }).click();
    await expectStyledPanel("svelte");
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
    await waitForHydration(page);
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
      await waitForHydration(page);
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
    // Pin the OS scheme so the toggle's accessible name is deterministic.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);

    const navigation = page.getByRole("navigation", { name: "Documentation" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Installation" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const theme = page.getByRole("button", { name: "Use light theme" });
    await expect(theme).toBeVisible();
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-theme"))).toBe("light");

    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      navigationScrollable:
        (document.querySelector(".sw-sidebar__nav")?.scrollWidth ?? 0) >=
        (document.querySelector(".sw-sidebar__nav")?.clientWidth ?? 0),
    }));
    expect(layout.fits).toBe(true);
    expect(layout.navigationScrollable).toBe(true);
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
      // A concrete page: opening search mid /docs/ redirect re-render is racy.
      await page.goto(docsUrl("start/installation/"));
      await waitForHydration(page);
      await page
        .getByRole("button", { name: /search/i })
        .first()
        .click();
      const search = page.locator('input[placeholder="Search APIs, guides, and examples"]');
      await search.fill(term);
      const matchingLink = page.locator(`a[href='${expectedHref}']`);
      await expect(matchingLink.first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test("documentation search excludes browser-only test routes", async ({ page }) => {
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    await page
      .getByRole("button", { name: /search/i })
      .first()
      .click();
    await page
      .locator('input[placeholder="Search APIs, guides, and examples"]')
      .fill("XLSX browser verification");
    await expect(page.locator(`a[href^='${SITE_BASE}/test/']`)).toHaveCount(0);
  });

  test("member deep links open and emphasize the target row", async ({ page }) => {
    // The search-anchor form: the fragment targets a hidden h3, and the
    // following collapsed details row must open and carry the emphasis flag.
    await page.goto(docsUrl("api/core/grid/#applytransaction"));
    await waitForHydration(page);
    const member = page.locator("#grid-apply-transaction");
    await expect(member).toHaveAttribute("open", "");
    await expect(member).toHaveAttribute("data-revealed", "");
    await expect(member.locator(".expressive-code").first()).toBeVisible();
  });
});
