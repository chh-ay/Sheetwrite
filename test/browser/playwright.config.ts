import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const requestedSitePort = Number(process.env.SHEETWRITE_TEST_PORT ?? 4173);
if (
  !Number.isSafeInteger(requestedSitePort) ||
  requestedSitePort < 1 ||
  requestedSitePort > 65_535
) {
  throw new Error(`Invalid SHEETWRITE_TEST_PORT: ${process.env.SHEETWRITE_TEST_PORT ?? ""}`);
}
export const SITE_PORT = requestedSitePort;
export const SITE_BASE = "";
export function siteUrl(path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `http://localhost:${SITE_PORT}${SITE_BASE}${suffix}`;
}
export const examplePages = ["vanilla", "react", "vue", "svelte"] as const;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "**/*.spec.ts",
  outputDir: fileURLToPath(new URL("../../test-results/playwright", import.meta.url)),
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: siteUrl(),
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@dpr2-render/,
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      grep: /@portability/,
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      grep: /@portability/,
      use: { browserName: "webkit" },
    },
    // These projects exercise Playwright browser engines at a real DPR 2.
    // Their names deliberately make no OS-browser claim: native macOS Safari
    // hardware verification remains an external release check.
    {
      name: "chromium-engine-dpr2",
      grep: /@dpr2-render/,
      metadata: {
        automationEngine: "Playwright Chromium",
        hostPlatform: `${process.platform}-${process.arch}`,
        nativeMacOSSafariHardwareVerification: "external",
      },
      use: {
        browserName: "chromium",
        deviceScaleFactor: 2,
        viewport: { width: 1_568, height: 900 },
      },
    },
    {
      name: "webkit-engine-dpr2",
      grep: /@dpr2-render/,
      metadata: {
        automationEngine: "Playwright WebKit (not macOS Safari)",
        hostPlatform: `${process.platform}-${process.arch}`,
        nativeMacOSSafariHardwareVerification: "external",
      },
      use: {
        browserName: "webkit",
        deviceScaleFactor: 2,
        viewport: { width: 1_568, height: 900 },
      },
    },
  ],
  webServer: {
    command: `PORT=${SITE_PORT} bun scripts/serve-docs.ts`,
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: siteUrl(),
    timeout: 120_000,
    // Each run owns a fresh server. Parallel worktrees must provide distinct
    // SHEETWRITE_TEST_PORT values so one branch can never validate another's dist.
    reuseExistingServer: false,
  },
});
