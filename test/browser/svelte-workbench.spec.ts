import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteSvelteGrid?: Grid;
  }
}

/**
 * Focused contracts for the /svelte/ offline workbench: durable pending
 * queue, connectivity/activity, reconnect drain, presence, base-version
 * conflict recovery, and remount persistence. Expected values mirror the
 * canonical scenario module (docs/src/showcases/scenarios/offline.ts):
 * ticket 1 cell "FT-0001", local edits write "Done · field sync N" to the
 * status column (D, index 3) of row N-1, colleague commits write
 * "Crew HQ-1" to the crew column (index 5) of row 7.
 */

const SHEET = "dispatch";
const STATUS_COL = 3;
const CREW_COL = 5;
const COLLEAGUE_ROW = 7;

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

async function bootWorkbench(page: Page): Promise<void> {
  await page.goto(siteUrl("/svelte/"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v0", {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(() => (window.__sheetwriteSvelteGrid ? "ready" : "missing")), {
      timeout: 15_000,
      message: "grid handle never published",
    })
    .toBe("ready");
}

async function revealRecoveryScenarios(page: Page): Promise<void> {
  const details = page.getByTestId("rare-actions");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
  await expect(details).toHaveAttribute("open", "");
}

async function assertPresenceGeometry(page: Page): Promise<void> {
  await page.evaluate(
    ({ row, col }) => {
      window.__sheetwriteSvelteGrid?.scrollToCell({ sheet: "dispatch", row, col });
    },
    { row: COLLEAGUE_ROW, col: CREW_COL },
  );
  const range = page.locator('[data-sheetwrite-presence="hq-ops"]').first();
  const label = page.locator('[data-sheetwrite-presence-label="hq-ops"]');
  await expect(range).toBeVisible({ timeout: 15_000 });
  await expect(label).toHaveCount(1);
  await expect(label).toHaveAttribute("role", "img");
  await expect(label).toHaveAttribute("aria-label", "Remote selection: Rina · HQ ops");
  await expect(label).toHaveAttribute("title", "Rina · HQ ops");
  await expect(range).toHaveText("");

  const [gridBox, rangeBox, labelBox] = await Promise.all([
    page.locator(".sheetwrite").first().boundingBox(),
    range.boundingBox(),
    label.boundingBox(),
  ]);
  expect(gridBox).not.toBeNull();
  expect(rangeBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(labelBox!.x).toBeGreaterThanOrEqual(gridBox!.x);
  expect(labelBox!.y).toBeGreaterThanOrEqual(gridBox!.y);
  expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(gridBox!.x + gridBox!.width + 0.5);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(gridBox!.y + gridBox!.height + 0.5);

  const kind = await label.getAttribute("data-presence-kind");
  if (kind === "marker") {
    await expect(label).toHaveText("");
    expect(labelBox!.width).toBeLessThanOrEqual(8);
    expect(labelBox!.height).toBeLessThanOrEqual(8);
    expect(labelBox!.y + labelBox!.height).toBeLessThan(rangeBox!.y + rangeBox!.height / 2);
  } else {
    expect(kind).toBe("chip");
    const valueBandTop = rangeBox!.y + Math.max(0, (rangeBox!.height - 16) / 2);
    const valueBandBottom = valueBandTop + Math.min(16, rangeBox!.height);
    expect(labelBox!.y + labelBox!.height <= valueBandTop || labelBox!.y >= valueBandBottom).toBe(
      true,
    );
  }

  const appearance = await label.evaluate((element) => {
    const style = getComputedStyle(element);
    const parse = (value: string): [number, number, number, number] => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
    };
    const luminance = ([red, green, blue]: [number, number, number, number]): number => {
      const channel = (value: number): number => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    };
    const background = parse(style.backgroundColor);
    const foreground = parse(style.color);
    const lighter = Math.max(luminance(background), luminance(foreground));
    const darker = Math.min(luminance(background), luminance(foreground));
    return {
      alpha: background[3],
      contrast: (lighter + 0.05) / (darker + 0.05),
      pointerEvents: style.pointerEvents,
    };
  });
  expect(appearance.alpha).toBeGreaterThanOrEqual(0.95);
  if (kind === "chip") expect(appearance.contrast).toBeGreaterThanOrEqual(4.5);
  expect(appearance.pointerEvents).toBe("none");
}

function resolvedCell(page: Page, row: number, col: number): Promise<unknown> {
  return page.evaluate(
    ([sheet, r, c]) =>
      window.__sheetwriteSvelteGrid?.store.getCell({
        sheet: sheet as string,
        row: r as number,
        col: c as number,
      }).resolved,
    [SHEET, row, col] as const,
  );
}

test("svelte workbench boots synced, paints the dispatch model, and shows live presence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = collectErrors(page);
  await bootWorkbench(page);

  // Visual acceptance: the compact route introduction yields to the actual
  // product surface, and the editable Grid owns more of the first viewport
  // than the adjacent queue evidence.
  const gridSurface = page.locator(".sw-svw .sw-demo-grid");
  const syncRail = page.locator(".sw-svw-rail");
  await expect(gridSurface).toBeVisible();
  await expect(page.getByTestId("connection-toggle")).toContainText("Connected");
  await expect(page.getByTestId("queue-count")).toBeVisible();
  const firstViewport = await Promise.all([gridSurface.boundingBox(), syncRail.boundingBox()]);
  expect(firstViewport[0]).not.toBeNull();
  expect(firstViewport[1]).not.toBeNull();
  const visibleGridHeight =
    Math.min(900, firstViewport[0]!.y + firstViewport[0]!.height) -
    Math.max(0, firstViewport[0]!.y);
  const visibleRailHeight =
    Math.min(900, firstViewport[1]!.y + firstViewport[1]!.height) -
    Math.max(0, firstViewport[1]!.y);
  expect(firstViewport[0]!.y).toBeLessThan(450);
  expect(visibleGridHeight).toBeGreaterThan(360);
  expect(firstViewport[0]!.width * visibleGridHeight).toBeGreaterThan(
    firstViewport[1]!.width * visibleRailHeight * 2,
  );

  // The ARIA mirror windows the scrollable pane; the frozen ticket column is
  // asserted through the authoritative store handle below.
  await expect
    .poll(() => page.locator('.sheetwrite [role="gridcell"]').allTextContents(), {
      timeout: 15_000,
      message: "dispatch grid never exposed its first data row",
    })
    .toContain("Riverside depot");
  await expect.poll(() => resolvedCell(page, 0, 0)).toBe("FT-0001");

  // Accessibility contract: switch semantics, status region, live activity feed.
  const toggle = page.getByTestId("connection-toggle");
  await expect(toggle).toHaveRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("sync-status")).toHaveRole("status");
  await expect(page.getByTestId("activity-feed")).toHaveAttribute("aria-live", "polite");

  // Both identities are visible, and the colleague's selection is painted as a
  // real presence overlay on the grid surface.
  await expect(page.getByTestId("presence-list")).toContainText("You · Field tablet");
  await expect(page.getByTestId("presence-list")).toContainText("Rina · HQ ops");
  await expect
    .poll(() => page.locator('[data-sheetwrite-presence="hq-ops"]').count(), {
      timeout: 15_000,
      message: "colleague presence overlay never painted",
    })
    .toBeGreaterThan(0);
  await assertPresenceGeometry(page);
  await test.info().attach("svelte-presence-1440x900-baseline", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await assertPresenceGeometry(page);
  await test.info().attach("svelte-presence-1440x1000-baseline", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Use (?:light|dark) theme/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", initialTheme ?? "");
  await assertPresenceGeometry(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await assertPresenceGeometry(page);

  // A 720×500 CSS viewport is the reflow boundary produced by 200% browser
  // zoom on the required 1440×1000 capture viewport.
  await page.setViewportSize({ width: 720, height: 500 });
  await assertPresenceGeometry(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("offline edits queue durably and drain in order on reconnect", async ({ page }) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await page.getByTestId("connection-toggle").click();
  await expect(page.getByTestId("connection-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("sync-status")).toContainText("Offline");

  await page.getByTestId("log-button").click();
  await page.getByTestId("log-button").click();
  await expect(page.getByTestId("queue-count")).toHaveText("2");
  await expect(page.getByTestId("sync-status")).toContainText("2 edits queued offline");
  const queued = page.getByTestId("pending-queue").locator("li");
  await expect(queued).toHaveCount(2);
  await expect(queued.nth(0)).toContainText("you-1");
  await expect(queued.nth(1)).toContainText("you-2");

  // Local rendering was never blocked: both edits are already in the model.
  await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Done · field sync 1");
  await expect.poll(() => resolvedCell(page, 1, STATUS_COL)).toBe("Done · field sync 2");

  // Reconnect through the keyboard: the switch is a real focusable control.
  await page.getByTestId("connection-toggle").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");
  await expect(page.getByTestId("activity-feed")).toContainText("Server v2 acknowledged you-2");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("the durable outbox survives a full island remount while offline", async ({ page }) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await page.getByTestId("connection-toggle").click();
  await page.getByTestId("log-button").click();
  await expect(page.getByTestId("queue-count")).toHaveText("1");

  await revealRecoveryScenarios(page);
  await page.getByTestId("remount-button").click();
  await expect(page.locator(".sw-svw")).toHaveAttribute("data-generation", "2", {
    timeout: 15_000,
  });
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });

  // The new grid generation hydrates the pending edit from IndexedDB and
  // re-applies it locally; nothing was sent while offline.
  await expect(page.getByTestId("activity-feed")).toContainText(
    "Restored 1 durable edit from the IndexedDB outbox",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("queue-count")).toHaveText("1");
  await expect
    .poll(() => resolvedCell(page, 0, STATUS_COL), {
      timeout: 15_000,
      message: "restored durable edit never became visible on the remounted grid",
    })
    .toBe("Done · field sync 1");

  await page.getByTestId("connection-toggle").click();
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v1", {
    timeout: 15_000,
  });
  await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Done · field sync 1");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("reconnecting onto concurrent server work surfaces a conflict that merge resolves", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await page.getByTestId("connection-toggle").click();
  await page.getByTestId("log-button").click();
  await revealRecoveryScenarios(page);
  await page.getByTestId("colleague-button").click();
  await expect(page.getByTestId("activity-feed")).toContainText(
    "committed server v1 while you're offline",
  );

  await page.getByTestId("connection-toggle").click();
  const conflictPanel = page.getByTestId("conflict-panel");
  await expect(conflictPanel).toBeVisible({ timeout: 15_000 });
  await expect(conflictPanel).toContainText("you-1");
  await expect(conflictPanel).toContainText("based on v0; the server is at v1");
  await expect(conflictPanel).toContainText("no overlap with your queued edits");
  await expect(page.getByTestId("sync-status")).toContainText("conflict", { ignoreCase: true });
  await expect(
    page.getByTestId("pending-queue").locator('li[data-status="conflicted"]'),
  ).toHaveCount(1);

  await page.getByTestId("merge-button").click();
  await expect(conflictPanel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");

  // Convergence: both the remote crew assignment and the queued local status
  // edit are in the model after recovery.
  await expect.poll(() => resolvedCell(page, COLLEAGUE_ROW, CREW_COL)).toBe("Crew HQ-1");
  await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Done · field sync 1");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("server-sequenced remote commits apply live while online", async ({ page }) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await revealRecoveryScenarios(page);
  await page.getByTestId("colleague-button").click();
  await expect
    .poll(() => resolvedCell(page, COLLEAGUE_ROW, CREW_COL), {
      timeout: 15_000,
      message: "remote commit never applied to the live grid",
    })
    .toBe("Crew HQ-1");
  await expect(page.getByTestId("sync-status")).toContainText("server v1");
  await expect(page.getByTestId("activity-feed")).toContainText("Applied remote v1");
  await expect(page.getByTestId("queue-count")).toHaveText("0");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("reconnecting with an empty queue reloads a document the server moved ahead of", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await page.getByTestId("connection-toggle").click();
  await revealRecoveryScenarios(page);
  await page.getByTestId("colleague-button").click();
  await expect(page.getByTestId("activity-feed")).toContainText(
    "committed server v1 while you're offline",
  );

  // Nothing is queued locally, so there is no commit to conflict on; the
  // session detects the stale base and remounts from the authoritative head.
  await page.getByTestId("connection-toggle").click();
  await expect(page.locator(".sw-svw")).toHaveAttribute("data-generation", "2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v1", {
    timeout: 15_000,
  });
  await expect
    .poll(() => resolvedCell(page, COLLEAGUE_ROW, CREW_COL), {
      timeout: 15_000,
      message: "reloaded document lost the remote crew assignment",
    })
    .toBe("Crew HQ-1");
  await expect(page.getByTestId("activity-feed")).toContainText("Server moved ahead to v1");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("shell edits land in the outbox and survive the drain", async ({ page }) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  await page.getByTestId("connection-toggle").click();

  // A real user edit through the shared shell chrome commits a document
  // transaction, which the sync layer admits into the durable outbox.
  await page.fill(".sheetwrite-shell-namebox", "D1");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await page.fill(".sheetwrite-shell-formula", "Rerouted crew");
  await page.press(".sheetwrite-shell-formula", "Enter");

  await expect(page.getByTestId("queue-count")).toHaveText("1");
  await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Rerouted crew");
  await page.fill(".sheetwrite-shell-namebox", "D1");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("Rerouted crew");

  await page.getByTestId("connection-toggle").click();
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v1", {
    timeout: 15_000,
  });
  await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Rerouted crew");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("logging past the activity capacity never grows the workbench or grid", async ({ page }) => {
  const errors = collectErrors(page);
  await bootWorkbench(page);

  const workbench = page.locator(".sw-svw");
  const grid = page.locator(".sw-svw .sw-demo-grid");
  const initialWorkbench = (await workbench.boundingBox())?.height ?? 0;
  const initialGrid = (await grid.boundingBox())?.height ?? 0;
  expect(initialWorkbench).toBeGreaterThan(0);
  expect(initialGrid).toBeGreaterThan(0);

  // Queue offline so every logged update stays in the durable outbox and the
  // activity feed fills well past its visible window.
  await page.getByTestId("connection-toggle").click();
  for (let update = 0; update < 10; update += 1) {
    await page.getByTestId("log-button").click();
  }
  await expect(page.getByTestId("queue-count")).toHaveText("10");

  // The workbench is a fixed stage: overflow lives inside the rail, never in
  // the outer layout, so the workbook and grid keep their boot-time heights.
  const grownWorkbench = (await workbench.boundingBox())?.height ?? 0;
  const grownGrid = (await grid.boundingBox())?.height ?? 0;
  expect(Math.abs(grownWorkbench - initialWorkbench)).toBeLessThanOrEqual(1);
  expect(Math.abs(grownGrid - initialGrid)).toBeLessThanOrEqual(1);
  expect(
    await page
      .getByTestId("pending-queue")
      .evaluate((list) => list.scrollHeight > list.clientHeight + 1),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  // Bounding the viewport must not break the drain: reconnect and settle.
  await page.getByTestId("connection-toggle").click();
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v10", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");
  const drainedWorkbench = (await workbench.boundingBox())?.height ?? 0;
  expect(Math.abs(drainedWorkbench - initialWorkbench)).toBeLessThanOrEqual(1);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("mobile: sync rail stays operable through offline queue, remount, and drain", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await bootWorkbench(page);

    // The workbench must not overflow the phone viewport horizontally.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(page.getByTestId("sync-status")).toBeVisible();
    await expect(page.getByTestId("presence-list")).toBeVisible();
    await expect(page.getByTestId("presence-list")).toContainText("Rina · HQ ops");
    await assertPresenceGeometry(page);
    await test.info().attach("svelte-presence-390x844", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await page.getByTestId("connection-toggle").click();
    await page.getByTestId("log-button").click();
    await page.getByTestId("log-button").click();
    await expect(page.getByTestId("queue-count")).toHaveText("2");

    await revealRecoveryScenarios(page);
    await page.getByTestId("remount-button").click();
    await expect(page.locator(".sw-svw")).toHaveAttribute("data-generation", "2", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("queue-count")).toHaveText("2", { timeout: 15_000 });
    await expect(page.getByTestId("activity-feed")).toContainText(
      "Restored 2 durable edits from the IndexedDB outbox",
      { timeout: 15_000 },
    );

    await page.getByTestId("connection-toggle").click();
    await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
      timeout: 15_000,
    });

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test("mobile: conflict recovery works from the stacked rail", async ({ page }) => {
    const errors = collectErrors(page);
    await bootWorkbench(page);

    await page.getByTestId("connection-toggle").click();
    await page.getByTestId("log-button").click();
    await revealRecoveryScenarios(page);
    await page.getByTestId("colleague-button").click();
    await page.getByTestId("connection-toggle").click();

    await expect(page.getByTestId("conflict-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("merge-button").click();
    await expect(page.getByTestId("conflict-panel")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
      timeout: 15_000,
    });
    await expect.poll(() => resolvedCell(page, COLLEAGUE_ROW, CREW_COL)).toBe("Crew HQ-1");
    await expect.poll(() => resolvedCell(page, 0, STATUS_COL)).toBe("Done · field sync 1");

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });
});
