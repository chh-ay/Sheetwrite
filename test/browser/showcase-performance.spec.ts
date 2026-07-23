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
  return Number((text ?? "").replace(/,/g, "").replace(/[^\d.]/g, ""));
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
  const { windowText, rowText, columnText, selected } = await page.evaluate(() => {
    const text = (testId: string): string | null =>
      document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
    return {
      windowText: text("scale-window-a1"),
      rowText: text("scale-window-rows"),
      columnText: text("scale-window-columns"),
      selected: text("scale-current-a1"),
    };
  });
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

async function assertLoadedPeriodWithoutStaleFlash(page: Page, row: number): Promise<void> {
  const expectedPeriod = `FY${2024 + (Math.floor(row / 12) % 5)} P${String((row % 12) + 1).padStart(2, "0")}`;
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
    if (sample.state === "unloaded") {
      expect(sample.value).toBe("#LOADING!");
    } else {
      expect(sample.value).toBe(expectedPeriod);
    }
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
    .toBe(expectedPeriod);
}

async function gridBodyPoint(page: Page, row: number, column: number) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    const viewport = page.viewportSize();
    if (viewport === null || (point.y >= 0 && point.y < viewport.height)) return point;
    await page.evaluate(
      ({ targetY, viewportHeight }) => window.scrollBy(0, targetY - viewportHeight / 2),
      { targetY: point.y, viewportHeight: viewport.height },
    );
  }
  throw new Error(`Could not bring cell r${row} c${column} into the viewport`);
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
  const cacheBudgetBytes = Number(
    await page.getByTestId("scale-grid").getAttribute("data-cache-bytes"),
  );

  const stats = await pagedStats(page);
  expect(stats).not.toBeNull();
  expect(stats!.fullyLoaded).toBe(false);
  expect(stats!.allocatedBytes).toBeLessThanOrEqual(cacheBudgetBytes);
  expect(stats!.loadedCells).toBeLessThan(ROWS * COLUMNS);
  expect(cacheBudgetBytes).toBe(32 * 1024 * 1024);
  await expect(page.getByText("Resident tile payload", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("32 MiB cache ceiling", { exact: false }).first()).toBeVisible();

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

  await page.getByTestId("scale-global-details").locator("summary").click();
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

test("semantic headers and coherent financial operations values are rendered by the real Grid", async ({
  page,
}) => {
  await bootScale(page);
  const columnHeaders = page.locator(`${GRID} [role="columnheader"]`);
  await expect(columnHeaders.nth(0)).toHaveText("Period");
  await expect(columnHeaders.nth(1)).toHaveText("Account");
  await expect(columnHeaders.nth(2)).toHaveText("Region");
  await expect(columnHeaders.nth(3)).toHaveText("Revenue");

  const schema = await page.evaluate(() =>
    window.__sheetwriteScaleGrid?.store
      .getWorkbook()
      .sheets[0]?.columns.slice(0, 12)
      .map(({ header, type, numberFormat }) => ({
        header,
        type,
        ...(numberFormat ? { numberFormat } : {}),
      })),
  );
  expect(schema).toEqual([
    { header: "Period", type: "text" },
    { header: "Account", type: "text" },
    { header: "Region", type: "text" },
    { header: "Revenue", type: "currency" },
    { header: "COGS", type: "currency" },
    { header: "Gross profit", type: "currency" },
    { header: "Operating expenses", type: "currency" },
    { header: "EBITDA", type: "currency" },
    { header: "EBITDA margin", type: "number", numberFormat: "0.0%" },
    { header: "Forecast revenue", type: "currency" },
    { header: "Variance", type: "currency" },
    { header: "Plan status", type: "text" },
  ]);

  await page.getByTestId("scale-jump-row").fill("1");
  await page.getByTestId("scale-jump-column").fill("12");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("L1");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(
          { length: 12 },
          (_, col) =>
            window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
              sheet: "scale",
              row: 0,
              col,
            }) ?? "unloaded",
        ),
      ),
    )
    .not.toContain("unloaded");

  const row = await page.evaluate(() =>
    Array.from(
      { length: 12 },
      (_, col) =>
        window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row: 0, col }).resolved,
    ),
  );
  const formulas = await page.evaluate(() => {
    const store = window.__sheetwriteScaleGrid?.store;
    return [5, 7, 8, 10].map((col) => store?.getFormula({ sheet: "scale", row: 0, col }));
  });
  expect(formulas).toEqual(["=D1-E1", "=F1-G1", "=IF(D1=0,0,H1/D1)", "=D1-J1"]);
  expect(row[0]).toBe("FY2024 P01");
  expect(row[1]).toMatch(/4100|4200|4300|4400/);
  expect(["North America", "EMEA", "APAC", "Latin America"]).toContain(row[2]);
  const revenue = Number(row[3]);
  const cogs = Number(row[4]);
  const grossProfit = Number(row[5]);
  const operatingExpenses = Number(row[6]);
  const ebitda = Number(row[7]);
  const margin = Number(row[8]);
  const forecastRevenue = Number(row[9]);
  const variance = Number(row[10]);
  expect(revenue).toBeGreaterThan(0);
  expect(cogs).toBeGreaterThan(0);
  expect(grossProfit).toBeCloseTo(revenue - cogs, 5);
  expect(ebitda).toBeCloseTo(grossProfit - operatingExpenses, 5);
  expect(margin).toBeCloseTo(ebitda / revenue, 4);
  expect(variance).toBeCloseTo(revenue - forecastRevenue, 5);
  expect(["Ahead", "On plan", "Watch"]).toContain(row[11]);
});

test("row and column navigators agree with the public window headers", async ({ page }) => {
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
      .poll(async () => {
        const rows = (await page.getByTestId("scale-window-rows").textContent())?.match(
          /([\d,]+)\s*–\s*([\d,]+)/,
        );
        return numericText(rows?.[2] ?? null);
      })
      .toBeGreaterThanOrEqual(dataRow + 1);
    const readout = await readWindow(page);
    expect(readout.firstRow).toBeLessThanOrEqual(dataRow + 1);
    expect(readout.lastRow).toBeGreaterThanOrEqual(dataRow + 1);
    landmarkRows.push(readout.firstRow);
    await assertLoadedPeriodWithoutStaleFlash(page, dataRow);
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

  const columnRail = page.getByTestId("scale-column-overview");
  await columnRail.focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("scale-current-a1")).toHaveText(/^ALL\d+$/);
  await expect.poll(async () => (await readWindow(page)).firstColumn).toBeGreaterThan(900);
  await expect(page.getByTestId("scale-selected-formula")).toHaveText(/^=J\d+\*\(1\+/);
});

test("a distant physical edit survives clean-tile eviction, far horizontal motion, and revisit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await bootScale(page);
  const grid = page.locator(GRID);
  await page.getByTestId("scale-eviction-stress").click();
  await expect(grid).toHaveAttribute("data-cache-bytes", String(1024 * 1024));
  await expect(page.getByTestId("scale-status")).toContainText(
    "Optional 1 MiB eviction stress active",
  );
  const chunkRows = Number(await grid.getAttribute("data-chunk-rows"));
  expect(chunkRows).toBe(4_096);
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
  await page.getByTestId("scale-jump-row").fill("737904");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D737904");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
          sheet: "scale",
          row: 737_903,
          col: 3,
        }),
      ),
    )
    .toBe("loaded-value");
  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");

  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          target: window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 741_999,
            col: 3,
          }),
          cleanComparison: window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 737_903,
            col: 3,
          }),
        })),
      { timeout: 20_000 },
    )
    .toEqual({ target: "loaded-value", cleanComparison: "loaded-value" });

  await grid.scrollIntoViewIfNeeded();
  const target = await gridBodyPoint(page, 741_999, 3);
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect(grid).toBeFocused();
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

  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let sampledColumn = (await readWindow(page)).firstColumn;
  for (let motion = 0; motion < 34 && sampledColumn <= 900; motion += 1) {
    await page.mouse.wheel(3_600, 0);
    let observedColumn = sampledColumn;
    await expect
      .poll(async () => {
        const columns = (await page.getByTestId("scale-window-columns").textContent())?.match(
          /([A-Z]+)\s*–\s*([A-Z]+)/,
        );
        observedColumn = columnIndex(columns?.[1] ?? "A");
        return observedColumn;
      })
      .toBeGreaterThan(sampledColumn);
    sampledColumn = observedColumn;
  }
  const farWindow = await readWindow(page);
  expect(farWindow.firstColumn).toBeGreaterThan(900);
  expect(farWindow.lastColumn).toBeLessThan(COLUMNS);

  for (const landmark of ["0", "25", "99", "0", "25"]) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await page.waitForTimeout(250);
  }
  let watchedCleanState: string | undefined;
  for (let visit = 0; visit < 128; visit += 1) {
    const row = 10_000 + visit * 7_500;
    const column = 1 + ((visit * 113) % 990);
    if (
      Math.floor((row - 1) / chunkRows) === Math.floor(737_903 / chunkRows) ||
      Math.floor((row - 1) / chunkRows) === Math.floor(741_999 / chunkRows)
    ) {
      continue;
    }
    await page.getByTestId("scale-jump-row").fill(String(row));
    await page.getByTestId("scale-jump-column").fill(String(column));
    await page.getByTestId("scale-jump").click();
    await expect
      .poll(() =>
        page.evaluate(
          ({ targetRow, targetColumn }) =>
            window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
              sheet: "scale",
              row: targetRow - 1,
              col: targetColumn - 1,
            }),
          { targetRow: row, targetColumn: column },
        ),
      )
      .toMatch(/loaded/);
    watchedCleanState = await page.evaluate(() =>
      window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
        sheet: "scale",
        row: 737_903,
        col: 3,
      }),
    );
    if (watchedCleanState === "unloaded") break;
  }
  expect(watchedCleanState, "finite 32 MiB churn never evicted the watched clean tile").toBe(
    "unloaded",
  );

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 737_903,
            col: 3,
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
  const cacheBudgetBytes = Number(await grid.getAttribute("data-cache-bytes"));
  expect(afterEviction!.allocatedBytes).toBeLessThanOrEqual(cacheBudgetBytes);
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

  await page.locator(".sw-sp-render-details summary").click();
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

test("desktop first viewport is a live Grid with an adjacent navigation instrument", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootScale(page);
  const layout = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const instrument = document.querySelector<HTMLElement>(".sw-sp-instrument");
    const paging = document.querySelector<HTMLElement>("#paging");
    return {
      viewportHeight: innerHeight,
      grid: grid?.getBoundingClientRect().toJSON(),
      instrument: instrument?.getBoundingClientRect().toJSON(),
      paging: paging?.getBoundingClientRect().toJSON(),
    };
  });
  expect(layout.grid).toBeTruthy();
  expect(layout.instrument).toBeTruthy();
  expect(layout.grid!.top).toBeLessThan(layout.viewportHeight * 0.45);
  expect(layout.grid!.height).toBeGreaterThan(layout.viewportHeight * 0.55);
  expect(layout.grid!.bottom).toBeGreaterThan(layout.viewportHeight * 0.78);
  expect(layout.instrument!.left).toBeGreaterThanOrEqual(layout.grid!.right - 1);
  expect(layout.paging!.top).toBeGreaterThanOrEqual(layout.grid!.bottom - 1);
  expect(layout.paging!.top).toBeGreaterThan(layout.viewportHeight * 0.9);
  await expect(page.getByRole("heading", { name: "Jump deep. Then scroll wide." })).toBeVisible();
});

test("Grid zoom changes real rendered geometry and reset restores the logical window", async ({
  page,
}) => {
  await bootScale(page);
  const beforeWindow = await readWindow(page);
  const before = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
      transform: getComputedStyle(host).transform,
    };
  });
  expect(before).not.toBeNull();
  expect(before!.zoom).toBe(1);
  expect(before!.transform).toBe("none");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("scale-zoom-value")).toHaveText("125%");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const zoomedWindow = await readWindow(page);
  expect(zoomedWindow.firstRow).toBe(beforeWindow.firstRow);
  expect(zoomedWindow.firstColumn).toBe(beforeWindow.firstColumn);
  expect(zoomedWindow.selected).toBe(beforeWindow.selected);
  const zoomed = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
      transform: getComputedStyle(host).transform,
    };
  });
  expect(zoomed).not.toBeNull();
  expect(zoomed!.zoom).toBe(1.25);
  expect(zoomed!.rowHeight).toBeGreaterThan(before!.rowHeight);
  expect(zoomed!.probe?.row).toBeLessThan(before!.probe?.row ?? Number.POSITIVE_INFINITY);
  expect(zoomed!.selection).toEqual(before!.selection);
  expect(zoomed!.transform).toBe("none");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("scale-zoom-value")).toHaveText("100%");
  const reset = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
    };
  });
  expect(reset).not.toBeNull();
  expect(reset!.zoom).toBe(1);
  expect(reset!.rowHeight).toBe(before!.rowHeight);
  expect(reset!.probe).toEqual(before!.probe);
  expect(reset!.selection).toEqual(before!.selection);
  await expect.poll(() => readWindow(page)).toEqual(beforeWindow);
});

test("comparison evidence uses an explicit evidence-aligned logarithmic axis", async ({ page }) => {
  await bootScale(page);
  const comparison = page.getByTestId("scale-evidence-compare");
  await expect(comparison).toContainText("1× is the parity baseline");

  const chart = await comparison.evaluate((root) => {
    const ticks = Array.from(
      root.querySelectorAll(".sw-sp-scale-curve__axis > div > span"),
      (tick) => Number((tick.textContent ?? "").replace(/,/g, "").replace("×", "")),
    );
    const ratios = Array.from(root.querySelectorAll(".sw-sp-scale-curve li > strong"), (label) =>
      Number((label.textContent ?? "").replace("×", "")),
    );
    const widths = Array.from(root.querySelectorAll(".sw-sp-scale-curve__track > span"), (bar) =>
      Number.parseFloat((bar as HTMLElement).style.width),
    );
    return { ticks, ratios, widths };
  });

  expect(chart.ticks.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < chart.ticks.length; index += 1) {
    expect(chart.ticks[index]).toBe(chart.ticks[index - 1]! * 10);
  }
  const domainExponent = Math.log10(chart.ticks[chart.ticks.length - 1]!);
  expect(chart.widths).toHaveLength(chart.ratios.length);
  for (let index = 0; index < chart.ratios.length; index += 1) {
    expect(chart.widths[index]).toBeCloseTo(
      (Math.log10(Math.max(chart.ratios[index]!, 1)) / domainExponent) * 100,
      4,
    );
  }
  expect(Math.max(...chart.widths)).toBeLessThanOrEqual(100);
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
  } else if (browserName === "webkit") {
    await grid.locator(".sheetwrite-scroller").evaluate((scroller) => {
      scroller.scrollTop += 1_200;
    });
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

  await page.locator(".sw-sp-render-details summary").click();
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
        ".sw-sp-zoom button, .sw-sp-zoom output, .sw-sp-stress button, .sw-sp-render-switch button, .sw-sp-navigator input, .sw-sp-landmarks button, .sw-sp-jump input, .sw-sp-jump button",
      ),
    ]
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect().toJSON()),
  }));
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
          ".sw-sp-zoom button, .sw-sp-zoom output, .sw-sp-stress button, .sw-sp-render-switch button, .sw-sp-navigator input, .sw-sp-landmarks button, .sw-sp-jump input, .sw-sp-jump button",
        ),
      ].filter((element) => element.offsetParent !== null);
      const metricValues = [
        ...document.querySelectorAll<HTMLElement>(".sw-sp-proof-wins article > strong"),
      ].map((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      });
      const metricLabels = [
        ...document.querySelectorAll<HTMLElement>(".sw-sp-proof-wins article > span"),
      ].map((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        grid: grid?.getBoundingClientRect().toJSON(),
        controls: controls.map((element) => element.getBoundingClientRect().toJSON()),
        metricValues,
        metricLabels,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.grid?.height ?? 0).toBeGreaterThanOrEqual(viewport.minimumGridHeight);
    for (const rect of layout.controls) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(rect.width).toBeGreaterThan(0);
    }
    for (const metric of layout.metricValues) {
      expect(metric.height).toBeLessThanOrEqual(metric.lineHeight + 1);
      expect(metric.scrollWidth).toBeLessThanOrEqual(metric.clientWidth + 1);
    }
    for (const label of layout.metricLabels) {
      expect(label.height).toBeLessThanOrEqual(label.lineHeight + 1);
    }
  }
});
