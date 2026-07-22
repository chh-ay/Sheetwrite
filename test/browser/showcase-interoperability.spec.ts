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

  // Await the core boundary rejection before any XLSX action can lazily load
  // @sheetwrite/xlsx/register.
  await expect(page.getByTestId("interop-isolation")).toHaveAttribute("data-state", "isolated");
  await expect(page.getByTestId("interop-isolation-error")).toContainText(
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

  // External workbook metadata is not an executed result. Excel and Google
  // Sheets remain unavailable until reviewed bytes/results are checked in.
  const producerResults = page.locator('[data-testid="interop-producer-matrix"]');
  const excelRow = producerResults.locator('[data-producer="Microsoft Excel"]');
  await expect(excelRow).toHaveAttribute("data-state", "unverified");
  await expect(excelRow).toContainText("Result unavailable");
  await expect(excelRow).toContainText("Apache POI");
  await expect(excelRow).toContainText("no Excel result is available here");
  const sheetsRow = producerResults.locator('[data-producer="Google Sheets"]');
  await expect(sheetsRow).toHaveAttribute("data-state", "unverified");
  await expect(sheetsRow).toContainText("Result unavailable");
  await expect(sheetsRow).toContainText("no Google Sheets result is available here");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability compatibility results expose every truthful state from checked data", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page, `${ROUTE}?compatibility=producer.google-sheets`);

  const inventoryDetail = page.getByTestId("compatibility-detail");
  await expect(inventoryDetail).toContainText("Recorded public Google Sheets export");
  await expect(inventoryDetail).toContainText(
    "No Google Sheets import or resave behavior is claimed.",
  );
  await expect(inventoryDetail).toContainText("Open the checked source");

  const summary = page.getByTestId("compatibility-results-summary");
  await expect(summary).toContainText("2,350");
  await expect(summary).toContainText("2,000");
  await expect(summary).toContainText("250");
  await expect(summary).toContainText("100");
  await expect(summary).toContainText("2,290 of 2,290 supported tests passed locally");
  await expect(summary).toContainText("0 reviewed results");
  await expect(summary).toContainText("2,290 supported tests still lack");
  await expect(summary).toContainText("60 unsupported tests");
  await expect(page.getByTestId("compatibility-test-set-checksum")).toHaveText(
    "bdf94c76df81ea1fa2e1bf96a557c41b21a0f11ea11ae612fcccc35157d7275a",
  );

  const detail = page.getByTestId("compatibility-result-detail");

  // Shared local pass: a local result is real, while incumbent app observations
  // remain explicitly unavailable.
  await expect(detail).toHaveAttribute("data-behavior", "shared");
  await expect(detail).toHaveAttribute("data-status", /local-pass/u);
  await expect(page.getByTestId("app-result-excel-desktop")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  await expect(page.getByTestId("app-result-google-sheets")).toContainText(
    "no reviewed result file is attached",
  );

  // The checked set currently carries exact tolerance only. Exercise that
  // truthful comparison boundary rather than inventing a numeric tolerance.
  await expect(page.getByTestId("compatibility-tolerance")).toHaveText("Exact type and value");

  // Excel-specific behavior exists, but no reviewed Excel result is attached.
  await page.getByTestId("compatibility-behavior-filter").selectOption("excel");
  await expect(detail).toHaveAttribute("data-behavior", "excel");
  await expect(detail).toHaveAttribute("data-status", /known-difference/u);
  await expect(page.getByTestId("known-difference")).toContainText("1900-02-29");
  await expect(page.getByTestId("app-result-excel-desktop")).toContainText("Result unavailable");

  // The separate checked feature boundary records the Google-only scope and
  // still renders it as unavailable rather than claiming an executed result.
  await page.getByTestId("inventory-behavior-filter").selectOption("google-sheets");
  await expect(inventoryDetail).toContainText("Recorded public Google Sheets export");
  await expect(inventoryDetail).toContainText("missing bytes display unavailable status");

  // Known difference.
  await page.getByTestId("compatibility-behavior-filter").selectOption("all");
  await page.getByTestId("compatibility-status-filter").selectOption("known-difference");
  await expect(detail).toHaveAttribute("data-status", /known-difference/u);
  await expect(page.getByTestId("known-difference")).toBeVisible();

  // Explicit unsupported nonclaim.
  await page.getByTestId("compatibility-status-filter").selectOption("unsupported");
  await expect(detail).toHaveAttribute("data-status", /unsupported/u);
  await expect(detail).toContainText("excluded from the pass percentage");

  // Warning behavior, with a real workbook-operation preview from checked data.
  await page.getByTestId("compatibility-status-filter").selectOption("warning");
  await expect(detail).toHaveAttribute("data-status", /warning/u);
  await expect(detail).toContainText("Warning behavior check");
  await expect(page.getByTestId("compatibility-workbook-preview")).toContainText('"warnings"');

  // Regression is a tested empty state: there are no reviewed external results,
  // therefore there can be no reviewed regression record.
  await page.getByTestId("compatibility-status-filter").selectOption("regression");
  await expect(page.getByTestId("compatibility-results-empty")).toContainText(
    "No reviewed regressions are recorded",
  );
  await expect(page.locator(".sw-si-results .sw-si-compat__records button")).toHaveCount(0);

  // Function/feature filtering and case selection work through the keyboard.
  await page.getByTestId("compatibility-status-filter").selectOption("all");
  const featureFilter = page.getByTestId("compatibility-feature-filter");
  await featureFilter.selectOption("function:ABS");
  const absResults = page.locator(".sw-si-results .sw-si-compat__records button");
  await expect(absResults).toHaveCount(1);
  await expect(absResults.first()).toContainText("ABS");
  await featureFilter.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("compatibility-behavior-filter")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("compatibility-status-filter")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(absResults.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detail).toContainText("ABS");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("analytical workbook recalculates real precedents and clears resized spills", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  for (const name of ["Orders", "Invoice", "Assumptions", "Analysis"]) {
    await expect(page.getByRole("tab", { name: `${name} sheet` })).toBeVisible();
  }

  const initial = await page.evaluate(() => {
    const grid = window.__sheetwriteInteropGrid;
    if (!grid) throw new Error("interop grid unavailable");
    const cell = (sheet: string, row: number, col: number) =>
      grid.store.getCell({ sheet, row, col }).resolved;
    const formula = (sheet: string, row: number, col: number) =>
      grid.store.getFormula({ sheet, row, col });
    return {
      sheets: grid.store.getWorkbook().sheets.map(({ id, name }) => ({ id, name })),
      formulas: {
        lookup: formula("assumptions", 1, 1),
        payment: formula("analysis", 0, 3),
        spill: formula("analysis", 0, 4),
        date: formula("analysis", 4, 0),
        statistical: formula("analysis", 1, 3),
        letResult: formula("analysis", 2, 3),
        npv: formula("analysis", 3, 3),
        irr: formula("analysis", 4, 3),
      },
      values: {
        rate: cell("assumptions", 1, 1),
        payment: cell("analysis", 0, 3),
        statistical: cell("analysis", 1, 3),
        letResult: cell("analysis", 2, 3),
        npv: cell("analysis", 3, 3),
        irr: cell("analysis", 4, 3),
        startDate: cell("analysis", 0, 0),
        endDate: cell("analysis", 4, 0),
        spill: Array.from({ length: 6 }, (_, row) => cell("analysis", row, 4)),
      },
    };
  });

  expect(initial.sheets).toEqual([
    { id: "orders", name: "Orders" },
    { id: "invoice", name: "Invoice" },
    { id: "assumptions", name: "Assumptions" },
    { id: "analysis", name: "Analysis" },
  ]);
  expect(initial.formulas).toEqual({
    lookup: "=XLOOKUP(B1,C1:C3,D1:D3)",
    payment: "=-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4)",
    spill: "=SEQUENCE(Assumptions!B5,1,1,1)",
    date: "=EDATE(A4,12)",
    statistical: "=ROUND(STDEV.S(Orders!E1:E6),2)",
    letResult:
      "=LET(payment,-PMT(Assumptions!B2/12,Assumptions!B3,Assumptions!B4),ROUND(payment*Assumptions!B3-payment,2))",
    npv: "=NPV(Assumptions!B2,B2:B5)+B1",
    irr: "=IRR(B1:B5)",
  });
  expect(initial.values.rate).toBeCloseTo(0.06, 12);
  expect(initial.values.payment).toBeCloseTo(1032.7971564849884, 10);
  expect(initial.values.statistical).toBe(1592.74);
  expect(initial.values.letResult).toBe(11360.77);
  expect(initial.values.npv).toBeCloseTo(127.86964444879777, 10);
  expect(initial.values.irr).toBeCloseTo(0.06464423448532142, 10);
  expect(initial.values.startDate).toBe(46053);
  expect(initial.values.endDate).toBe(47514);
  expect(initial.values.spill).toEqual([1, 2, 3, 4, null, null]);
  await expect(page.getByTestId("interop-model-evidence")).toContainText(
    "No new Excel or Google Sheets result",
  );

  await page.getByTestId("interop-rate-input").selectOption("0.09");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({
            sheet: "analysis",
            row: 0,
            col: 3,
          }).resolved,
      ),
    )
    .toBeCloseTo(1049.4177212390496, 10);
  const afterRate = await page.evaluate(() => {
    const store = window.__sheetwriteInteropGrid?.store;
    if (!store) throw new Error("interop grid unavailable");
    const resolved = (sheet: string, row: number, col: number) =>
      store.getCell({ sheet, row, col }).resolved;
    return {
      payment: resolved("analysis", 0, 3),
      npv: resolved("analysis", 3, 3),
      letResult: resolved("analysis", 2, 3),
      unchanged: {
        statistical: resolved("analysis", 1, 3),
        irr: resolved("analysis", 4, 3),
        endDate: resolved("analysis", 4, 0),
        spill: Array.from({ length: 6 }, (_, row) => resolved("analysis", row, 4)),
      },
    };
  });
  expect(afterRate.payment).toBeCloseTo(1049.4177212390496, 10);
  expect(afterRate.npv).toBeCloseTo(-660.9804303132023, 10);
  expect(afterRate.letResult).toBe(11543.59);
  expect(afterRate.unchanged).toEqual({
    statistical: initial.values.statistical,
    irr: initial.values.irr,
    endDate: initial.values.endDate,
    spill: initial.values.spill,
  });
  const rateScope = page.getByTestId("interop-model-change-scope");
  await expect(rateScope).toHaveAttribute("data-change-count", "1");
  await expect(rateScope).toHaveAttribute("data-changed-results", "Payment,NPV,LET");
  await expect(rateScope).toContainText("assumptions!R2C4");

  await page.getByTestId("interop-spill-input").selectOption("6");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(
          { length: 6 },
          (_, row) =>
            window.__sheetwriteInteropGrid?.store.getCell({
              sheet: "analysis",
              row,
              col: 4,
            }).resolved,
        ),
      ),
    )
    .toEqual([1, 2, 3, 4, 5, 6]);
  await expect(rateScope).toHaveAttribute("data-changed-results", "Spill");
  await expect(rateScope).toContainText("assumptions!R5C2");

  await page.getByTestId("interop-spill-input").selectOption("3");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteInteropGrid?.store;
        if (!store) return null;
        return Array.from({ length: 6 }, (_, row) => ({
          value: store.getCell({ sheet: "analysis", row, col: 4 }).resolved,
          anchor: store.getSpillAnchor({ sheet: "analysis", row, col: 4 }),
        }));
      }),
    )
    .toEqual([
      { value: 1, anchor: { sheet: "analysis", row: 0, col: 4 } },
      { value: 2, anchor: { sheet: "analysis", row: 0, col: 4 } },
      { value: 3, anchor: { sheet: "analysis", row: 0, col: 4 } },
      { value: null, anchor: null },
      { value: null, anchor: null },
      { value: null, anchor: null },
    ]);
  await expect(page.getByTestId("interop-model-spill")).toHaveText("1, 2, 3");

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
  // Canonical document ships 21 formulas across the interchange and analytical sheets.
  await expect(page.locator('[data-testid="interop-roundtrip-formulas"]')).toHaveText("21/21");
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
  await expect(abortReport).toContainText(/AbortError|SheetwriteError/);
  await expect(abortReport).toContainText(/abort/i);

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
