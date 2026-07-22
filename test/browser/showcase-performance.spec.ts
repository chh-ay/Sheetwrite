import { expect, type Page, test } from "@playwright/test";
import type { Grid, PagedStoreStats } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
    __sheetwriteColdLongTasks?: Array<{
      startTime: number;
      duration: number;
      name: string;
      attribution: string[];
    }>;
    __sheetwriteColdFrames?: Array<{
      startTime: number;
      duration: number;
      scripts: Array<{ sourceURL: string; duration: number; invoker: string }>;
    }>;
  }
}

const ROUTE = siteUrl("/showcases/performance/");
const GRID = '[data-testid="scale-grid"]';
const CACHE_BUDGET_BYTES = 4 * 1024 * 1024;
const ROWS = 1_000_000;
const COLUMNS = 1_000;

interface BootErrors {
  console: string[];
  page: string[];
}

interface WindowReadout {
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
  selected: string;
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

function columnIndex(label: string): number {
  let value = 0;
  for (const character of label) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function numericText(text: string | null): number {
  return Number((text ?? "").replaceAll(",", "").replaceAll(/[^\d.]/g, ""));
}

async function pagedStats(page: Page): Promise<PagedStoreStats | null> {
  return page.evaluate(() => {
    const store = window.__sheetwriteScaleGrid?.store;
    if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
      return null;
    }
    return store.getPagedStats("scale") as PagedStoreStats;
  });
}

async function bootScale(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("scale-status")).toContainText("1,000,000,000", {
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await pagedStats(page))?.loadedCells ?? 0, {
      timeout: 20_000,
      message: "the initial rectangular page never became resident",
    })
    .toBeGreaterThan(0);
}

async function readWindow(page: Page): Promise<WindowReadout> {
  const [windowText, rowText, columnText, selected] = await Promise.all([
    page.getByTestId("scale-window-a1").textContent(),
    page.getByTestId("scale-window-rows").textContent(),
    page.getByTestId("scale-window-columns").textContent(),
    page.getByTestId("scale-current-a1").textContent(),
  ]);
  const windowMatch = windowText?.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const rowMatch = rowText?.trim().match(/^(\d+)–(\d+)$/);
  const columnMatch = columnText?.trim().match(/^([A-Z]+)–([A-Z]+)$/);
  if (!windowMatch || !rowMatch || !columnMatch) {
    throw new Error(
      `Malformed public readout: ${JSON.stringify({ windowText, rowText, columnText })}`,
    );
  }
  const readout = {
    firstRow: Number(windowMatch[2]),
    lastRow: Number(windowMatch[4]),
    firstColumn: columnIndex(windowMatch[1]!),
    lastColumn: columnIndex(windowMatch[3]!),
    selected: selected?.trim() ?? "",
  };
  expect(readout.firstRow).toBe(Number(rowMatch[1]));
  expect(readout.lastRow).toBe(Number(rowMatch[2]));
  expect(readout.firstColumn).toBe(columnIndex(columnMatch[1]!));
  expect(readout.lastColumn).toBe(columnIndex(columnMatch[2]!));
  expect(readout.firstRow).toBeLessThanOrEqual(readout.lastRow);
  expect(readout.firstColumn).toBeLessThanOrEqual(readout.lastColumn);
  return readout;
}

async function assertLoadedRowIdWithoutStaleFlash(page: Page, row: number): Promise<void> {
  const samples: Array<{ state: string | null; value: unknown }> = [];
  for (let sample = 0; sample < 8; sample += 1) {
    samples.push(
      await page.evaluate((targetRow) => {
        const store = window.__sheetwriteScaleGrid?.store;
        return {
          state: store?.getCellLoadState?.({ sheet: "scale", row: targetRow, col: 0 }) ?? null,
          value: store?.getCell({ sheet: "scale", row: targetRow, col: 0 }).resolved,
        };
      }, row),
    );
    await page.waitForTimeout(20);
  }
  for (const sample of samples) {
    if (sample.state === "unloaded") expect(sample.value).toBeNull();
    else expect(sample.value).toBe(row + 1);
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          (targetRow) =>
            window.__sheetwriteScaleGrid?.store.getCell({
              sheet: "scale",
              row: targetRow,
              col: 0,
            }).resolved,
          row,
        ),
      { timeout: 20_000 },
    )
    .toBe(row + 1);
}

async function gridBodyPoint(page: Page, row: number, column: number) {
  const point = await page.evaluate(
    ({ targetRow, targetColumn }) => {
      const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
      const grid = window.__sheetwriteScaleGrid;
      if (!host || !grid) return null;
      const rect = host.getBoundingClientRect();
      for (let y = rect.top + 36; y < rect.bottom; y += 8) {
        for (let x = rect.left + 72; x < rect.right; x += 8) {
          const address = grid.getCellAtPoint(x, y);
          if (address?.row === targetRow && address.col === targetColumn) return { x, y };
        }
      }
      return null;
    },
    { targetRow: row, targetColumn: column },
  );
  if (!point) throw new Error(`Could not locate visible cell r${row} c${column}`);
  return point;
}

test("cold production route has no Sheetwrite-attributed task over 50 ms", async ({ browser }) => {
  const samples: Array<{
    usableMs: number;
    longTasks: NonNullable<Window["__sheetwriteColdLongTasks"]>;
    frames: NonNullable<Window["__sheetwriteColdFrames"]>;
    cpu: Array<{ functionName: string; url: string; durationMs: number }>;
  }> = [];

  for (let repetition = 0; repetition < 5; repetition += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Profiler.enable");
    await session.send("Profiler.start");
    await page.addInitScript(() => {
      window.__sheetwriteColdLongTasks = [];
      window.__sheetwriteColdFrames = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const attribution =
            "attribution" in entry && Array.isArray(entry.attribution)
              ? entry.attribution.map((item: { containerSrc?: string }) => item.containerSrc ?? "")
              : [];
          window.__sheetwriteColdLongTasks!.push({
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
            attribution,
          });
        }
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const frame = entry as PerformanceEntry & {
            scripts?: Array<{ sourceURL?: string; duration?: number; invoker?: string }>;
          };
          window.__sheetwriteColdFrames!.push({
            startTime: frame.startTime,
            duration: frame.duration,
            scripts: (frame.scripts ?? []).map((script) => ({
              sourceURL: script.sourceURL ?? "",
              duration: script.duration ?? 0,
              invoker: script.invoker ?? "",
            })),
          });
        }
      }).observe({ type: "long-animation-frame", buffered: true });
    });

    await bootScale(page);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const measured = await page.evaluate(() => ({
      usableMs: performance.now(),
      longTasks: (window.__sheetwriteColdLongTasks ?? []).filter(
        (entry) => entry.startTime <= performance.now(),
      ),
      frames: (window.__sheetwriteColdFrames ?? []).filter(
        (entry) => entry.startTime <= performance.now(),
      ),
    }));
    const { profile } = await session.send("Profiler.stop");
    const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
    const totals = new Map<number, number>();
    profile.samples?.forEach((nodeId, index) => {
      totals.set(nodeId, (totals.get(nodeId) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
    });
    const cpu = [...totals]
      .map(([nodeId, duration]) => ({
        functionName: nodes.get(nodeId)?.functionName ?? "",
        url: nodes.get(nodeId)?.url ?? "",
        durationMs: duration / 1_000,
      }))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 12);
    samples.push({ ...measured, cpu });
    await context.close();
  }

  const longTaskEvidence = samples.flatMap((sample, repetition) =>
    sample.longTasks
      .filter((task) => task.duration > 50)
      .map((task) => ({
        repetition,
        task,
        frames: sample.frames.filter(
          (frame) =>
            task.startTime < frame.startTime + frame.duration &&
            frame.startTime < task.startTime + task.duration,
        ),
      })),
  );
  const sheetwriteLongTasks = longTaskEvidence.filter((evidence) =>
    evidence.frames.some((frame) =>
      frame.scripts.some((script) =>
        /\/assets\/(?:showcases\.performance-|grid-|sheetwrite_|core-)/.test(script.sourceURL),
      ),
    ),
  );
  console.log(
    `COLD_ROUTE_EVIDENCE ${JSON.stringify({ samples, longTaskEvidence, sheetwriteLongTasks })}`,
  );
  expect(sheetwriteLongTasks).toEqual([]);
});

test("the live Grid is exactly one billion logical addresses with bounded rectangular pages", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);
  await expect(
    page.getByRole("heading", { name: "One billion addresses. One bounded working set." }),
  ).toBeVisible();
  await expect(page.getByTestId("scale-status")).toContainText(
    "1,000,000 rows × 1,000 columns = 1,000,000,000 logical addresses",
  );
  const workbook = await page.evaluate(() => window.__sheetwriteScaleGrid?.store.getWorkbook());
  expect(workbook?.sheets).toHaveLength(1);
  expect(workbook?.sheets[0]?.rowCount).toBe(ROWS);
  expect(workbook?.sheets[0]?.columns).toHaveLength(COLUMNS);

  const stats = await pagedStats(page);
  expect(stats).not.toBeNull();
  expect(stats!.fullyLoaded).toBe(false);
  expect(stats!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);
  expect(stats!.loadedCells).toBeLessThan(ROWS * COLUMNS);

  const initial = await readWindow(page);
  expect(initial.firstRow).toBe(1);
  expect(initial.firstColumn).toBe(0);
  await expect(page.getByTestId("scale-last-band")).toContainText("columns");
  expect(
    numericText(await page.getByTestId("scale-requested-cells").textContent()),
  ).toBeGreaterThan(0);
  expect(numericText(await page.getByTestId("scale-returned-cells").textContent())).toBeGreaterThan(
    0,
  );

  await page.getByTestId("scale-scan-attempt").click();
  await expect(page.getByTestId("scale-scan-report")).toHaveAttribute("data-state", "incomplete");
  await expect(page.getByTestId("scale-scan-report")).toContainText("IncompleteDataError");
  await expect(page.getByTestId("scale-scan-report")).toContainText("1,000,000,000");
  await page.getByTestId("scale-export-attempt").click();
  await expect(page.getByTestId("scale-export-report")).toHaveAttribute("data-state", "incomplete");
  await expect(page.getByTestId("scale-export-report")).toContainText("IncompleteDataError");
  await expect(page.getByTestId("scale-query-state")).toContainText("incomplete");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("wheel, Page keys, landmarks, and a physical overview drag agree with public headers", async ({
  page,
}) => {
  await bootScale(page);
  const grid = page.locator(GRID);
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const initial = await readWindow(page);
  await page.mouse.wheel(0, 1_800);
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeGreaterThan(initial.firstRow);
  const afterWheel = await readWindow(page);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("PageDown");
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeGreaterThan(afterWheel.firstRow);
  const afterPageDown = await readWindow(page);
  await page.keyboard.press("PageUp");
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeLessThan(afterPageDown.firstRow);

  const landmarkRows: number[] = [];
  for (const [landmark, selected, dataRow] of [
    ["25", "A250001", 250_000],
    ["74", "A740000", 739_999],
    ["99", "A990000", 989_999],
  ] as const) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await expect(page.getByTestId("scale-current-a1")).toHaveText(selected);
    await expect
      .poll(async () => (await readWindow(page)).lastRow)
      .toBeGreaterThanOrEqual(dataRow + 1);
    const readout = await readWindow(page);
    expect(readout.firstRow).toBeLessThanOrEqual(dataRow + 1);
    expect(readout.lastRow).toBeGreaterThanOrEqual(dataRow + 1);
    landmarkRows.push(readout.firstRow);
    await assertLoadedRowIdWithoutStaleFlash(page, dataRow);
  }
  expect(landmarkRows[0]).toBeLessThan(landmarkRows[1]!);
  expect(landmarkRows[1]).toBeLessThan(landmarkRows[2]!);

  const rail = page.getByTestId("scale-overview");
  const railBox = await rail.boundingBox();
  if (!railBox) throw new Error("Overview rail has no physical bounds");
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height * 0.02);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height * 0.55, {
    steps: 14,
  });
  await page.mouse.up();
  await expect.poll(async () => (await readWindow(page)).firstRow).toBeLessThan(landmarkRows[2]!);
  await readWindow(page);
});

test("a distant physical edit survives clean-tile eviction, far horizontal motion, and revisit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await bootScale(page);
  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect
    .poll(async () => {
      const readout = await readWindow(page);
      return readout.lastRow >= 742_000 && readout.lastColumn >= 3;
    })
    .toBe(true);
  const exactWindow = await readWindow(page);
  expect(exactWindow.firstRow).toBeLessThanOrEqual(742_000);
  expect(exactWindow.lastRow).toBeGreaterThanOrEqual(742_000);
  expect(exactWindow.firstColumn).toBeLessThanOrEqual(3);
  expect(exactWindow.lastColumn).toBeGreaterThanOrEqual(3);

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 741_999,
            col: 4,
          }),
        ),
      { timeout: 20_000 },
    )
    .toMatch(/loaded/);

  const target = await gridBodyPoint(page, 741_999, 3);
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press("F2");
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toBeVisible();
  await page.locator(`${GRID} .sheetwrite-editor`).fill("777777");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row: 741_999, col: 3 })
            .resolved,
      ),
    )
    .toBe(777_777);

  const grid = page.locator(GRID);
  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sampledColumns: number[] = [];
  for (let motion = 0; motion < 34; motion += 1) {
    await page.mouse.wheel(3_600, 0);
    await page.waitForTimeout(125);
    sampledColumns.push((await readWindow(page)).firstColumn);
  }
  for (let index = 1; index < sampledColumns.length; index += 1) {
    expect(sampledColumns[index]).toBeGreaterThanOrEqual(sampledColumns[index - 1]!);
  }
  const farWindow = await readWindow(page);
  expect(farWindow.firstColumn).toBeGreaterThan(900);
  expect(farWindow.lastColumn).toBeLessThan(COLUMNS);

  for (const landmark of ["0", "25", "99", "0", "25"]) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await page.waitForTimeout(250);
  }

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 741_999,
            col: 4,
          }),
        ),
      { timeout: 20_000 },
    )
    .toBe("unloaded");
  expect(
    await page.evaluate(() =>
      window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
        sheet: "scale",
        row: 741_999,
        col: 3,
      }),
    ),
  ).toBe("local-edit");
  await expect(page.getByTestId("scale-eviction-watch")).toHaveAttribute(
    "data-clean-state",
    "unloaded",
  );
  await expect(page.getByTestId("scale-eviction-watch")).toContainText(
    "Clean tile evicted; sparse dirty value retained",
  );

  const afterEviction = await pagedStats(page);
  expect(afterEviction!.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);
  expect(afterEviction!.dirtyCells).toBe(1);
  const visibleWidth = farWindow.lastColumn - farWindow.firstColumn + 1;
  const amplification = Number(await page.getByTestId("scale-column-amplification").textContent());
  expect(amplification).toBeLessThanOrEqual(visibleWidth + 10);
  expect(amplification).toBeLessThan(64);

  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row: 741_999, col: 3 })
            .resolved,
      ),
    )
    .toBe(777_777);
});

test("main and Worker canvas paths report what actually mounted", async ({ page }) => {
  const errors = collectErrors(page);
  await bootScale(page);
  await expect(page.getByTestId("scale-renderer-active")).toHaveText("canvas");
  await expect(page.locator(`${GRID} canvas`)).toHaveCount(1);

  await page.getByTestId("scale-renderer-worker").click();
  await page.waitForSelector(`${GRID} canvas`, { state: "attached" });
  await expect(page.getByTestId("scale-renderer-state")).toContainText("Requested worker");
  const active = (await page.getByTestId("scale-renderer-active").textContent())?.trim();
  expect(["canvas", "worker"]).toContain(active);
  if (active === "canvas")
    await expect(page.getByTestId("scale-renderer-state")).toContainText("fallback");
  await expect(page.locator(`${GRID} canvas`)).toHaveCount(1);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability mobile touch input, lifecycle, and responsive reflow stay operable", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await bootScale(page);
  const grid = page.locator(GRID);
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error("Mobile Grid has no physical bounds");
  expect(box.width).toBeGreaterThan(200);
  expect(box.height).toBeLessThanOrEqual(844 * 0.6);
  expect(await grid.evaluate((element) => getComputedStyle(element).touchAction)).toContain(
    "pan-x",
  );
  const beforeTap = await readWindow(page);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await readWindow(page)).selected).not.toBe(beforeTap.selected);
  const beforeTouch = await readWindow(page);
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    const x = Math.round(box.x + box.width / 2);
    const startY = Math.round(box.y + box.height * 0.8);
    const endY = Math.round(box.y + box.height * 0.2);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY, id: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: Math.round(startY + ((endY - startY) * step) / 8), id: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
  } else {
    await grid.hover();
    await page.mouse.wheel(0, 1_200);
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
  }

  await page.getByTestId("scale-renderer-worker").click();
  await page.waitForSelector(`${GRID} canvas`, { state: "attached" });
  await expect(page.getByTestId("scale-renderer-state")).toContainText("Requested worker");
  await page.getByTestId("scale-renderer-canvas").click();
  await expect(page.getByTestId("scale-renderer-active")).toHaveText("canvas");
  await expect(page.locator(`${GRID} canvas`)).toHaveCount(1);

  const layout = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controls: [
      ...document.querySelectorAll<HTMLElement>(
        ".sw-sp-render-switch button, .sw-sp-overview-panel input, .sw-sp-overview-panel button, .sw-sp-jump input, .sw-sp-jump button",
      ),
    ].map((element) => element.getBoundingClientRect().toJSON()),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  for (const rect of layout.controls) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(layout.innerWidth + 1);
  }
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
  await context.close();
});

test("owned controls do not clip at desktop, phone, or 200% reflow dimensions", async ({
  page,
}) => {
  const viewports = [
    { width: 1568, height: 898, minimumGridHeight: 898 * 0.6 },
    { width: 1440, height: 1000, minimumGridHeight: 1000 * 0.6 },
    { width: 390, height: 844, minimumGridHeight: 0 },
    { width: 720, height: 500, minimumGridHeight: 0 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootScale(page);
    const layout = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          ".sw-sp-render-switch button, .sw-sp-overview-panel input, .sw-sp-overview-panel button, .sw-sp-jump input, .sw-sp-jump button",
        ),
      ];
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        grid: grid?.getBoundingClientRect().toJSON(),
        controls: controls.map((element) => element.getBoundingClientRect().toJSON()),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.grid?.height ?? 0).toBeGreaterThanOrEqual(viewport.minimumGridHeight);
    for (const rect of layout.controls) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(rect.width).toBeGreaterThan(0);
    }
  }
});
