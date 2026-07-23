import { expect, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

const FIXTURE_URL = siteUrl("/test/renderers/");
const HOST = '[aria-label="DOM renderer browser fixture"]';
const CELL = `${HOST} .sheetwrite-dom-cell`;

interface FixtureStats {
  mounts: number;
  updates: number;
  destroys: number;
  live: number;
  generation: number;
  nodes: number;
  activations: number;
}

declare global {
  interface Window {
    __sheetwriteRendererFixture?: {
      stats(): FixtureStats;
      scroll(top: number, left: number): void;
      select(row: number, col: number): void;
      selection(): unknown;
      editTall(value: string, color: string): void;
      styleCollision(): void;
      edit(value: string): void;
      replace(): void;
      zoom(value: number): void;
      resize(width: number, height: number): void;
      reset(): void;
      destroy(): void;
    };
  }
}

test("interactive DOM controls and off-window merge anchors preserve native behavior", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(FIXTURE_URL);
  await expect(page.locator("#renderer-status")).toHaveAttribute("data-status", "ready", {
    timeout: 20_000,
  });

  const merged = page.locator(`${CELL}[data-row="2"][data-col="1"] button`);
  await page.evaluate(() => window.__sheetwriteRendererFixture?.select(4, 4));
  await merged.click();
  await expect(merged).toBeFocused();
  expect(
    (await page.evaluate(() => window.__sheetwriteRendererFixture?.stats()))?.activations,
  ).toBe(1);
  expect(await page.evaluate(() => window.__sheetwriteRendererFixture?.selection())).toEqual({
    kind: "cell",
    addr: { sheet: "s1", row: 4, col: 4 },
  });
  await merged.press("Enter");
  expect(
    (await page.evaluate(() => window.__sheetwriteRendererFixture?.stats()))?.activations,
  ).toBe(2);
  expect(await page.evaluate(() => window.__sheetwriteRendererFixture?.selection())).toEqual({
    kind: "cell",
    addr: { sheet: "s1", row: 4, col: 4 },
  });

  const tallCell = page.locator(`${CELL}[data-row="20"][data-col="1"]`);
  await expect(tallCell).toHaveCount(0);
  await page.evaluate(() => window.__sheetwriteRendererFixture?.scroll(35 * 28, 0));
  await expect(tallCell).toBeVisible();
  const tallButton = tallCell.locator("button");
  await expect(tallButton).toHaveText("first:r20c1");
  await tallButton.evaluate((element) => {
    element.dataset.identity = "direct-tall-anchor";
  });
  await page.evaluate(() =>
    window.__sheetwriteRendererFixture?.editTall("browser-off-window-edit", "#123456"),
  );
  await expect(tallButton).toHaveText("first:browser-off-window-edit");
  await expect(tallButton).toHaveAttribute("data-color", "#123456");
  await expect(tallButton).toHaveAttribute("data-identity", "direct-tall-anchor");

  await page.evaluate(() => {
    window.__sheetwriteRendererFixture?.scroll(0, 0);
    window.__sheetwriteRendererFixture?.styleCollision();
  });
  await expect(page.locator(`${CELL}[data-row="0"][data-col="1"] button`)).toHaveAttribute(
    "data-color",
    "#aa0000",
  );
  await expect(page.locator(`${CELL}[data-row="1"][data-col="1"] button`)).toHaveAttribute(
    "data-color",
    "#0000aa",
  );
  expect(errors).toEqual([]);
});

test("DOM renderer lifecycle and absolute accessibility indices", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(FIXTURE_URL);
  await expect(page.locator("#renderer-status")).toHaveAttribute("data-status", "ready", {
    timeout: 20_000,
  });

  const initial = await page.evaluate(() => window.__sheetwriteRendererFixture?.stats());
  expect(initial).toBeDefined();
  expect(initial?.live).toBe(initial?.nodes);
  expect(initial?.nodes ?? 0).toBeGreaterThan(0);
  await expect(page.locator(`${CELL}[data-row="2"][data-col="1"]`)).toHaveCount(1);
  await expect(page.locator(`${CELL}[data-row="2"][data-col="2"]`)).toHaveCount(0);

  const merged = page.locator(`${CELL}[data-row="2"][data-col="1"] button`);
  await merged.evaluate((element) => {
    element.dataset.identity = "retained-anchor";
  });
  await page.evaluate(() => window.__sheetwriteRendererFixture?.edit("browser-edit"));
  await expect(merged).toHaveText("first:browser-edit");
  await expect(merged).toHaveAttribute("data-identity", "retained-anchor");

  await merged.focus();
  const frozenLeft = await page
    .locator(`${CELL}[data-row="0"][data-col="0"] .sheetwrite-dom-cell-bounds`)
    .evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const bodyBounds = page.locator(
    `${CELL}[data-row="2"][data-col="1"] .sheetwrite-dom-cell-bounds`,
  );
  const bodyLeft = await bodyBounds.evaluate((element) =>
    Number.parseFloat((element as HTMLElement).style.left),
  );
  await page.evaluate(() => window.__sheetwriteRendererFixture?.scroll(0, 24));
  await expect(merged).toBeFocused();
  expect(
    await page
      .locator(`${CELL}[data-row="0"][data-col="0"] .sheetwrite-dom-cell-bounds`)
      .evaluate((element) => Number.parseFloat((element as HTMLElement).style.left)),
  ).toBe(frozenLeft);
  expect(
    await bodyBounds.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left)),
  ).toBeLessThan(bodyLeft);

  await page.evaluate(() => window.__sheetwriteRendererFixture?.zoom(1.5));
  await expect(merged).toHaveAttribute("data-width", "300");
  await page.evaluate(() => window.__sheetwriteRendererFixture?.resize(420, 220));
  await expect(page.locator(HOST)).toHaveCSS("width", "420px");
  await expect
    .poll(async () => {
      const hostBox = await page.locator(HOST).boundingBox();
      const visibleBoxes = await page.locator(`${CELL}:visible`).evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
      );
      return Boolean(
        hostBox &&
          visibleBoxes.every(
            (box) => box.left >= hostBox.x && box.right <= hostBox.x + hostBox.width + 0.5,
          ),
      );
    })
    .toBe(true);

  await page.evaluate(() => window.__sheetwriteRendererFixture?.scroll(280, 620));
  const absoluteColumns = await page
    .locator(`${HOST} [role="columnheader"]`)
    .evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute("aria-colindex"))),
    );
  expect(absoluteColumns.length).toBeGreaterThan(0);
  expect(absoluteColumns[0]).toBeGreaterThan(1);
  expect(
    absoluteColumns.every((value, index) => index === 0 || value > absoluteColumns[index - 1]!),
  ).toBe(true);

  let peakNodes = 0;
  for (const [top, left] of [
    [0, 0],
    [560, 300],
    [1_120, 700],
    [1_680, 900],
  ] as const) {
    const stats = await page.evaluate(
      ([nextTop, nextLeft]) => {
        window.__sheetwriteRendererFixture?.scroll(nextTop, nextLeft);
        return window.__sheetwriteRendererFixture?.stats();
      },
      [top, left] as const,
    );
    if (!stats) throw new Error("renderer fixture disappeared");
    peakNodes = Math.max(peakNodes, stats.nodes);
    expect(stats.live).toBe(stats.nodes);
  }
  expect(peakNodes).toBeLessThanOrEqual(80);

  const replacementTarget = page.locator(`${CELL}:visible button`).first();
  await replacementTarget.focus();
  const beforeReplacement = await page.evaluate(() => window.__sheetwriteRendererFixture?.stats());
  await page.evaluate(() => window.__sheetwriteRendererFixture?.replace());
  await expect(page.locator(`${CELL}:visible button`).first()).toContainText("second:");
  await expect(page.locator(HOST)).toBeFocused();
  const afterReplacement = await page.evaluate(() => window.__sheetwriteRendererFixture?.stats());
  expect(afterReplacement?.destroys ?? 0).toBeGreaterThan(beforeReplacement?.destroys ?? 0);
  expect(afterReplacement?.live).toBe(afterReplacement?.nodes);

  await page.evaluate(() => window.__sheetwriteRendererFixture?.reset());
  await expect(page.locator(HOST)).toHaveAttribute("data-generation", "2");
  await expect(page.locator(`${HOST} .sheetwrite-dom-overlay`)).toHaveCount(1);
  await expect(page.locator('[data-identity="retained-anchor"]')).toHaveCount(0);
  const reset = await page.evaluate(() => window.__sheetwriteRendererFixture?.stats());
  expect(reset?.live).toBe(reset?.nodes);

  await page.evaluate(() => window.__sheetwriteRendererFixture?.destroy());
  await expect(page.locator(`${HOST} .sheetwrite-dom-overlay`)).toHaveCount(0);
  const destroyed = await page.evaluate(() => window.__sheetwriteRendererFixture?.stats());
  expect(destroyed?.live).toBe(0);
  expect(destroyed?.nodes).toBe(0);
  expect(errors).toEqual([]);
});
