import { expect, type Locator, type Page, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

// Browser contracts for the two capability proof routes:
//   /showcases/database/       — IndexedDB persistence lifecycle
//   /showcases/collaboration/  — two-client sequencing protocol
// Every test runs in a fresh context, so each page starts from empty
// IndexedDB and the demos must seed, converge, and clean up on their own.

const DATABASE_URL = siteUrl("/showcases/database/");
const COLLABORATION_URL = siteUrl("/showcases/collaboration/");

/** Seed ledger total: 12*30 + 4*145 + 90*11 + 6*82 + 300*1.5. */
const DATABASE_SEED_TOTAL = "2,872";
/** Seed sprint total: 8 + 5 + 3 + 5 + 2. */
const COLLABORATION_SEED_TOTAL = "23";
const READY_TIMEOUT = 30_000;

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

async function databaseReady(page: Page): Promise<void> {
  await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

async function collaborationReady(page: Page): Promise<void> {
  await expect(page.getByTestId("clb-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

function client(page: Page, slug: "a" | "b"): Locator {
  return page.locator(`[data-client="${slug}"]`);
}

test.describe("database proof", () => {
  test("boots from IndexedDB, commits, compacts, and reports live counters", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);
    await expect(page.getByTestId("dbx-tail")).toHaveText("0");

    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-log")).toContainText("Committed v1");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);

    // Nine more commits cross the 8-record tail bound and force compaction.
    for (let index = 0; index < 9; index++) {
      await commit.click();
      await expect(page.getByTestId("dbx-version")).toHaveText(String(index + 2));
    }
    await expect(page.getByTestId("dbx-log")).toContainText("Compacted");
    const snapshotVersion = Number(await page.getByTestId("dbx-snapshot-version").textContent());
    expect(snapshotVersion).toBeGreaterThan(0);
    const tail = Number(await page.getByTestId("dbx-tail").textContent());
    expect(tail).toBeLessThanOrEqual(8);
    expect(Number(await page.getByTestId("dbx-reads").textContent())).toBeGreaterThan(0);
    expect(Number(await page.getByTestId("dbx-writes").textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId("dbx-bytes")).not.toHaveText("0 B");

    // The ownership boundary is explicit: host-owned concerns are labeled.
    const boundary = page.getByTestId("proof-boundary");
    await expect(boundary.locator('[data-owner="host"]')).toHaveCount(3);
    await expect(boundary).toContainText("Authentication & authorization");
    await expect(boundary).toContainText("Server database");
    await expect(boundary).toContainText("Transport & deployment");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("keeps durable pending work across a real page reload", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await page.getByRole("checkbox", { name: "Autosave" }).uncheck();
    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await commit.click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("2");
    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    // Durable puts are asynchronous; reload only once the queue is fully
    // persisted (activity leaves "persisting" for the offline "pending" state).
    await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-activity", "pending");

    await page.reload();
    await databaseReady(page);
    // Autosave defaults on after reload: the restored queue drains in order.
    await expect(page.getByTestId("dbx-log")).toContainText("Restored 2 durable pending commits", {
      timeout: READY_TIMEOUT,
    });
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);

    // The in-page session restart proves the same recovery without a navigation.
    await page.getByRole("button", { name: "Close and reopen session" }).click();
    await databaseReady(page);
    await expect(page.getByTestId("dbx-version")).toHaveText("2");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("answers duplicate retries idempotently and recovers from conflicts", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    // Lost acknowledgement: the server stores v1, the client keeps the commit
    // pending, and the retry with the same mutation id answers duplicate.
    await page.getByRole("button", { name: "Lose next acknowledgement" }).click();
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-log")).toContainText("was lost in transit");
    await expect(page.getByTestId("dbx-pending")).toHaveText("1");
    await expect(page.getByTestId("dbx-version")).toHaveText("1");

    await page.getByRole("button", { name: "Retry pending commit" }).click();
    await expect(page.getByTestId("dbx-log")).toContainText("Duplicate acknowledgement");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-version")).toHaveText("1");

    // Conflict: an external writer advances the head; the next local commit
    // conflicts and recovers through rebase + remount + resubmit.
    await page.getByRole("button", { name: "External writer commit" }).click();
    await expect(page.getByTestId("dbx-log")).toContainText("External writer committed v2");
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-log")).toContainText("Base-version conflict");
    await expect(page.getByTestId("dbx-log")).toContainText("Recovered: remounted at v2");
    await expect(page.getByTestId("dbx-version")).toHaveText("3");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("reset deletes the demo databases and reseeds from v0", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-version")).toHaveText("1");

    await page.getByRole("button", { name: "Reset demo data" }).click();
    await databaseReady(page);
    await expect(page.getByTestId("dbx-log")).toContainText("reseeded from the canonical ledger");
    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("stays operable on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await noHorizontalOverflow(page);
    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await expect(commit).toBeVisible();
    await commit.click();
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(page.getByTestId("dbx-log")).toContainText("Committed v1");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});

test.describe("collaboration proof", () => {
  test("converges two clients with ordered commits and presence", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    await expect(page.getByTestId("clb-a-total")).toHaveText(COLLABORATION_SEED_TOTAL);
    await expect(page.getByTestId("clb-b-total")).toHaveText(COLLABORATION_SEED_TOTAL);

    await client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" }).click();
    await expect(page.getByTestId("clb-a-total")).toHaveText("24");
    await expect(page.getByTestId("clb-b-total")).toHaveText("24");
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v1");
    await expect(page.getByTestId("clb-server-version")).toHaveText("v1");
    await expect(page.getByTestId("clb-server-log")).toContainText("v1 applied");
    await expect(page.getByTestId("clb-b-log")).toContainText("Applied remote v1");

    // Presence: the sample edit selected Ana's cell; Bram sees her.
    await expect(page.getByTestId("clb-b-roster")).toContainText("Ana");
    await expect(page.getByTestId("clb-a-roster")).toContainText("Bram");
    await expect(
      page.locator('[data-testid="clb-b-grid"] [data-sheetwrite-presence="actor-ana"]').first(),
    ).toBeAttached({ timeout: 10_000 });

    const boundary = page.getByTestId("proof-boundary");
    await expect(boundary.locator('[data-owner="host"]')).toHaveCount(3);
    await expect(boundary).toContainText("Auth, authorization & deployment");
    await expect(boundary).toContainText("Durable server storage");
    await expect(boundary).toContainText("Transport");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("drains an offline durable queue in order and answers duplicate retries", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    // Bram disconnects and keeps working; commits queue durably.
    await client(page, "b").getByRole("checkbox", { name: "Online" }).uncheck();
    await expect(page.getByTestId("clb-b-connection")).toHaveText("offline");
    const bramEdit = client(page, "b").getByRole("button", { name: "Edit “Offline drain QA”" });
    await bramEdit.click();
    await bramEdit.click();
    await expect(page.getByTestId("clb-b-pending")).toHaveText("2");
    await expect(page.getByTestId("clb-b-total")).toHaveText("25");
    await expect(page.getByTestId("clb-a-total")).toHaveText(COLLABORATION_SEED_TOTAL);
    await expect(page.getByTestId("clb-server-version")).toHaveText("v0");

    // Reconnecting drains the queue in order through the same protocol.
    await client(page, "b").getByRole("checkbox", { name: "Online" }).check();
    await expect(page.getByTestId("clb-b-pending")).toHaveText("0");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-a-total")).toHaveText("25");
    await expect(page.getByTestId("clb-server-log")).toContainText("v1 applied");
    await expect(page.getByTestId("clb-server-log")).toContainText("v2 applied");

    // Ana loses an acknowledgement; her retry is answered with duplicate.
    await client(page, "a").getByRole("button", { name: "Lose next ack" }).click();
    await client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" }).click();
    await expect(page.getByTestId("clb-a-log")).toContainText("was lost in transit");
    await expect(page.getByTestId("clb-a-pending")).toHaveText("1");
    await client(page, "a").getByRole("button", { name: "Retry pending" }).click();
    await expect(page.getByTestId("clb-a-log")).toContainText("Duplicate acknowledgement");
    await expect(page.getByTestId("clb-a-pending")).toHaveText("0");
    await expect(page.getByTestId("clb-server-log")).toContainText("duplicate");
    await expect(page.getByTestId("clb-a-total")).toHaveText("26");
    await expect(page.getByTestId("clb-b-total")).toHaveText("26");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("buffers version gaps and recovers from a base-version conflict", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    // Gap: Bram's link holds v1 back, v2 arrives first and buffers.
    await client(page, "b").getByRole("button", { name: "Hold next broadcast" }).click();
    const anaEdit = client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" });
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-log")).toContainText("Version gap: expected v1");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v0");

    await client(page, "b")
      .getByRole("button", { name: /Release held/ })
      .click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-total")).toHaveText("25");
    await expect(page.getByTestId("clb-b-log")).toContainText("Applied remote v1");
    await expect(page.getByTestId("clb-b-log")).toContainText("Applied remote v2");

    // Conflict: Ana misses a server-authored commit and commits on a stale base.
    await client(page, "a").getByRole("button", { name: "Hold next broadcast" }).click();
    await page.getByRole("button", { name: "Server-authored commit" }).click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v3");
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-log")).toContainText("Conflict: commit based on v2");
    await expect(page.getByTestId("clb-a-log")).toContainText("Recovered at v3");
    await expect(page.getByTestId("clb-a-version")).toHaveText("v4");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v4");
    await expect(page.getByTestId("clb-a-total")).toHaveText(
      (await page.getByTestId("clb-b-total").textContent()) ?? "",
    );

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("stays operable on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    await noHorizontalOverflow(page);
    await expect(client(page, "a")).toBeVisible();
    await expect(client(page, "b")).toBeVisible();
    await client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" }).click();
    await expect(page.getByTestId("clb-a-total")).toHaveText("24");
    await expect(page.getByTestId("clb-b-total")).toHaveText("24");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});
