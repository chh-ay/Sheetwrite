import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export const SITE_PORT = 4173;
export const examplePages = ["vanilla", "react", "vue", "svelte", "theming"] as const;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "**/*.spec.ts",
  outputDir: fileURLToPath(new URL("../../test-results/playwright", import.meta.url)),
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${SITE_PORT}`,
    headless: true,
  },
  webServer: {
    command: `bun run --filter '@sheetwrite/example-site' preview --host 127.0.0.1 --port ${SITE_PORT}`,
    url: `http://localhost:${SITE_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
