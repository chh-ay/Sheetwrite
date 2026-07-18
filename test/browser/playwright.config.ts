import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export const SITE_PORT = 4173;
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
  ],
  webServer: {
    command: `PORT=${SITE_PORT} bun scripts/serve-docs.ts`,
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: siteUrl(),
    timeout: 120_000,
    // Concurrent local focused runs share one static dist server; CI must
    // always start fresh so it can never bind a stale dist (hash-mismatch 500s).
    reuseExistingServer: !process.env.CI,
  },
});
