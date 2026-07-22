import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteInteropGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/interoperability/");
const POSITIVE_FIXTURE_IDS = [
  "sheetwrite-libreoffice-positive",
  "libreoffice-rich",
  "libreoffice-metadata",
] as const;
const HOSTILE_FIXTURE_IDS = [
  "traversal",
  "doctype",
  "deep-xml",
  "compression-ratio",
  "corrupt-deflate",
] as const;

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

async function bootInterop(page: Page, url = ROUTE): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.locator('[data-testid="interop-status"]').textContent(), {
      timeout: 15_000,
      message: "interoperability workbench never finished booting",
    })
    .toContain("Loaded:");
}

test("interoperability page boots, verifies fixture checksums in-browser, and probes the package boundary", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  // The isolation probe ran before this page ever loaded @sheetwrite/xlsx, so
  // a direct navigation must observe the unregistered typed error.
  await expect(page.locator('[data-testid="interop-isolation-error"]')).toContainText(
    "XLSX backend not registered",
  );

  // Committed fixture bytes are hashed with WebCrypto and compared to the
  // manifest digests — provenance proven live, for every fixture.
  for (const id of POSITIVE_FIXTURE_IDS) {
    await expect
      .poll(() => page.locator(`[data-testid="fixture-${id}-digest"]`).getAttribute("data-state"), {
        timeout: 20_000,
        message: `${id} checksum never verified`,
      })
      .toBe("verified");
  }

  // Honest producer matrix: every status is backed by corpus records. Google
  // Sheets and Microsoft Excel are suite-verified from genuine producer bytes
  // (not run here), and the residual unverified aspects stay spelled out.
  const matrix = page.locator('[data-testid="interop-producer-matrix"]');
  const excelRow = matrix.locator('[data-producer="Microsoft Excel"]');
  await expect(excelRow).toHaveAttribute("data-state", "verified-suite");
  await expect(excelRow).toContainText("Apache POI");
  const sheetsRow = matrix.locator('[data-producer="Google Sheets"]');
  await expect(sheetsRow).toHaveAttribute("data-state", "verified-suite");
  await expect(sheetsRow).toContainText("genuine Google Sheets-exported workbook");
  await expect(sheetsRow).toContainText("Not yet verified from Google Sheets bytes");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability compatibility lab deep-links exact boundaries and filters the executable inventory", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page, `${ROUTE}?compatibility=producer.google-sheets`);

  const detail = page.getByTestId("compatibility-detail");
  await expect(detail).toContainText("Pinned public Google Sheets export");
  await expect(detail).toContainText("unverified-producer-evidence");
  await expect(detail).toContainText("No Google Sheets import or resave behavior is claimed.");
  await expect(detail).toContainText("/docs/reference/compatibility-matrix/#sources");

  const cases = [
    ["formula.portable-operators", "supported", "evaluated"],
    ["xlsx.rich-workbook", "partial", "warning"],
    ["worksheet.very-hidden", "roundtrip-only", "preserved"],
    ["clipboard.delimited", "partial", "flattened"],
    ["formula.let-lambda", "unsupported", "unsupported"],
  ] as const;
  for (const [id, status, result] of cases) {
    await page.getByTestId(`compatibility-${id}`).click();
    await expect(detail).toHaveAttribute("data-status", status);
    await expect(detail).toHaveAttribute("data-result", result);
  }

  await page.getByTestId("compatibility-status-filter").selectOption("unsupported");
  const unsupported = page.locator(".sw-si-compat__records button");
  expect(await unsupported.count()).toBeGreaterThan(0);
  for (const button of await unsupported.all()) {
    await expect(button).toHaveAttribute("data-status", "unsupported");
  }

  await page.getByTestId("compatibility-status-filter").selectOption("all");
  await page.getByTestId("compatibility-area-filter").selectOption("formula");
  const formulas = page.locator(".sw-si-compat__records button");
  expect(await formulas.count()).toBeGreaterThan(0);
  for (const button of await formulas.all()) {
    await expect(button).toContainText("formula /");
  }
  await page.getByTestId("compatibility-dialect-filter").selectOption("excel");
  for (const button of await formulas.all()) {
    await expect(button).toContainText("/ excel");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("live round-trip preserves formulas, the merge, and frozen rows after an edit", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  // Edit through the real shell chrome: name box jump, formula-bar commit.
  await page.fill(".sheetwrite-shell-namebox", "B2");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await page.fill(".sheetwrite-shell-formula", "Edited task chair");
  await page.press(".sheetwrite-shell-formula", "Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "orders", row: 1, col: 1 })
            .resolved,
      ),
    )
    .toBe("Edited task chair");

  await page.click('[data-testid="interop-roundtrip"]');
  const report = page.locator('[data-testid="interop-roundtrip-report"]');
  await expect(report).toBeVisible({ timeout: 15_000 });
  await expect(report).toHaveAttribute("data-state", "pass");
  // Canonical document ships 9 formulas (6 line totals + 3 invoice formulas).
  await expect(page.locator('[data-testid="interop-roundtrip-formulas"]')).toHaveText("9/9");
  // The warnings panel now reflects the round-trip operation, not the empty state.
  await expect(page.locator('[data-testid="interop-warnings"]')).not.toContainText(
    "No interchange operation has run yet",
  );

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("committed LibreOffice fixture imports live with structured coded warnings", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  const load = page.locator('[data-testid="fixture-libreoffice-rich-load"]');
  await expect(load).toBeEnabled({ timeout: 20_000 });
  await load.click();

  await expect
    .poll(() => page.locator('[data-testid="interop-source"]').textContent(), { timeout: 15_000 })
    .toContain("libreoffice-rich.xlsx");

  // Supported features arrive intact: the committed fixture's three worksheets
  // (including the hidden one) exist in the live workbook after import.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteInteropGrid?.store
            .getWorkbook()
            .sheets.map((sheet) => sheet.name)
            .sort(),
        ),
      { timeout: 15_000 },
    )
    .toEqual(["Calc", "Hidden", "Inputs"]);

  // The import reports its fidelity losses as structured, coded warnings —
  // every rendered warning carries a code chip from the public warning union.
  const warnings = page.locator('[data-testid="interop-warnings"]');
  await expect(warnings).toContainText("libreoffice-rich.xlsx");
  const codes = await warnings.locator(".sw-si-warncode").allTextContents();
  expect(codes.length).toBeGreaterThan(0);
  const VALID_CODES = [
    "boolean-literal",
    "rich-text",
    "hyperlink",
    "unsupported-cell-value",
    "unsupported-feature",
    "external-relationship",
    "external-formula",
    "format-loss",
    "validation-loss",
    "invalid-metadata",
  ];
  for (const code of codes) {
    expect(VALID_CODES).toContain(code.trim());
  }
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("hostile packages, aborted signals, and resource ceilings are rejected with typed errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await page.click('[data-testid="interop-hostile-run"]');
  for (const id of HOSTILE_FIXTURE_IDS) {
    await expect
      .poll(() => page.locator(`[data-testid="hostile-${id}"]`).getAttribute("data-state"), {
        timeout: 20_000,
        message: `hostile package ${id} was not rejected`,
      })
      .toBe("rejected");
  }

  await page.click('[data-testid="interop-abort-demo"]');
  const abortReport = page.locator('[data-testid="interop-abort-report"]');
  await expect(abortReport).toBeVisible({ timeout: 15_000 });
  await expect(abortReport).toHaveAttribute("data-state", "pass");
  await expect(abortReport).toContainText("AbortError");

  await page.click('[data-testid="interop-cellcap-demo"]');
  const cellCap = page.locator('[data-testid="interop-cellcap-report"]');
  await expect(cellCap).toBeVisible({ timeout: 15_000 });
  await expect(cellCap).toHaveAttribute("data-state", "pass");
  await expect(cellCap).toContainText("XlsxResourceError");
  await expect(cellCap).toContainText("maxCells");

  await page.click('[data-testid="interop-csvcap-demo"]');
  const csvCap = page.locator('[data-testid="interop-csvcap-report"]');
  await expect(csvCap).toHaveAttribute("data-state", "pass");
  await expect(csvCap).toContainText("DelimitedTextResourceError");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("CSV export neutralizes injection payloads and pasted CSV rebuilds the workbench", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await page.click('[data-testid="interop-csv-export"]');
  const proof = page.locator('[data-testid="interop-injection-proof"]');
  await expect(proof).toBeVisible();
  // The stored literal starts with `=`; the hardened CSV path prefixes `'`.
  await expect(proof).toContainText("'=HYPERLINK(");
  await expect(page.locator('[data-testid="interop-csv-output"]')).toBeVisible();

  // TSV of the current selection goes through the clipboard-dialect exporter.
  await page.click(".sw-si-grid", { position: { x: 120, y: 80 } });
  await page.click('[data-testid="interop-tsv-export"]');
  await expect(page.locator('[data-testid="interop-tsv-output"]')).toBeVisible();

  await page.fill(
    '[data-testid="interop-csv-input"]',
    "region,units,revenue\neu-west,12,3400\nus-east,7,2050",
  );
  await page.click('[data-testid="interop-csv-import"]');
  await expect
    .poll(() => page.locator('[data-testid="interop-source"]').textContent(), { timeout: 15_000 })
    .toContain("Pasted CSV (2 rows)");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 0, col: 0 })
            .resolved,
      ),
    )
    .toBe("eu-west");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 1, col: 2 })
            .resolved,
      ),
    )
    .toBe(2050);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("interoperability page stays operable and labeled on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await bootInterop(page);

  // Section anchors resolve and the section nav is an accessible landmark.
  const sectionNav = page.getByRole("navigation", { name: "Page sections" });
  await expect(sectionNav).toBeVisible();
  // The rail always marks exactly one current section, so users know where
  // they are on the long page.
  await expect(sectionNav.locator('a[aria-current="true"]')).toHaveCount(1);
  for (const anchor of ["xlsx", "fixtures", "warnings", "delimited", "limits", "isolation"]) {
    await expect(page.locator(`#${anchor}`)).toHaveCount(1);
  }
  await expect(page.getByLabel("Interoperability workbench grid")).toBeVisible();

  // Controls remain reachable and usable at phone width.
  const roundTrip = page.locator('[data-testid="interop-roundtrip"]');
  await roundTrip.scrollIntoViewIfNeeded();
  await roundTrip.click();
  await expect(page.locator('[data-testid="interop-roundtrip-report"]')).toBeVisible({
    timeout: 15_000,
  });

  // No horizontal document overflow on the phone layout.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
