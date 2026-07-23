import { expect, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

const route = siteUrl("/showcases/host-rows/");

test("host-owned rows keep stable identity across view and reconciliation changes", async ({
  page,
}) => {
  await page.goto(route);
  await expect(page.getByTestId("host-rows-showcase")).toBeVisible();
  await expect(page.getByTestId("host-entity-list").getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "Sort amount" }).click();
  await page.getByRole("button", { name: "Filter North" }).click();
  await expect(page.getByTestId("host-entity-list")).toContainText("account-a: Ada · 120 · North");
  await expect(page.getByTestId("host-entity-list")).toContainText("account-b: Lin · 75 · South");

  await page.getByRole("button", { name: "Insert row" }).click();
  await expect(page.getByTestId("host-entity-list").getByRole("listitem")).toHaveCount(4);
  await expect(page.getByTestId("host-entity-list")).toContainText("account-4: New account");

  await page.getByRole("button", { name: "Delete row" }).click();
  await expect(page.getByTestId("host-entity-list").getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "Reject next edit" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("rejected · rejected-showcase");

  await page.getByRole("button", { name: "Transformed accept" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("transformed · server-normalized");

  await page.getByRole("button", { name: "Remote update" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("remote");
  await expect(page.getByTestId("host-entity-list")).toContainText("account-a: Ada · 135 · North");
});
