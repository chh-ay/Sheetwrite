// @ts-check
import { readdir, readFile, writeFile } from "node:fs/promises";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { withBasePath } from "./src/base-path.ts";
import { sheetwriteCodeHovers } from "./src/lib/sheetwrite-code-hovers.ts";

const PRODUCTION_SITE = "https://chh-ay.github.io";
const PRODUCTION_BASE = "/Sheetwrite";

/** @param {string} base @returns {import("astro").AstroIntegration} */
function pagefindWorkerUrls(base) {
  return {
    name: "sheetwrite-pagefind-worker-urls",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const workerUrl = new URL("pagefind/pagefind-worker.js", dir);
        const generated = await readFile(workerUrl, "utf8");
        const original = 'let basePath=opts.basePath||"/pagefind/";';
        const fallback = JSON.stringify(withBasePath("/pagefind/", base));
        const replacement = `let basePath=opts.basePath||${fallback};if(basePath.startsWith("/"))basePath=new URL(basePath,self.location.origin).href;`;
        if (!generated.includes(original)) {
          throw new Error("Pagefind worker base-path initialization changed");
        }
        await writeFile(workerUrl, generated.replace(original, replacement));
      },
    },
  };
}

/** @param {URL} directory @param {string} base */
async function prefixBuiltHtmlLinks(directory, base) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        await prefixBuiltHtmlLinks(target, base);
        return;
      }
      if (!entry.name.endsWith(".html")) return;
      const html = await readFile(target, "utf8");
      const rewritten = html.replace(
        /\b(href|src)=(["'])(\/[^"']*)/g,
        (match, attribute, quote, path) => {
          if (path.startsWith("//") || path === base || path.startsWith(`${base}/`)) return match;
          return `${attribute}=${quote}${withBasePath(path, base)}`;
        },
      );
      if (rewritten !== html) await writeFile(target, rewritten);
    }),
  );
}

/** @param {string} base @returns {import("astro").AstroIntegration} */
function basePathOutput(base) {
  return {
    name: "sheetwrite-base-path-output",
    hooks: {
      "astro:build:done": async ({ dir }) => prefixBuiltHtmlLinks(dir, base),
    },
  };
}

// One product site: routed documentation plus every runnable Sheetwrite example.
const production = process.argv.includes("build");
const site =
  process.env.SHEETWRITE_SITE_URL ?? (production ? PRODUCTION_SITE : "http://localhost:4321");
const base = process.env.SHEETWRITE_BASE_PATH ?? (production ? PRODUCTION_BASE : "/");
if (production && (site !== PRODUCTION_SITE || base !== PRODUCTION_BASE)) {
  throw new Error(
    `Production docs require site=${PRODUCTION_SITE} and base=${PRODUCTION_BASE}; received site=${site} base=${base}`,
  );
}
/** @param {string} path */
const route = (path) => withBasePath(path, base);

// One product site: routed documentation plus every runnable Sheetwrite example.
export default defineConfig({
  site,
  base,
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !pathname.startsWith(route("/test/")) && !pathname.startsWith(route("/__test__/"));
      },
    }),
    starlight({
      title: "Sheetwrite",
      description: "Guides, examples, and generated API reference for Sheetwrite.",
      favicon: "/favicon.svg",
      customCss: ["/src/styles/docs.css", "/src/styles/api-reference.css"],
      components: {
        Header: "./src/components/DocsHeader.astro",
        Footer: "./src/components/DocsFooter.astro",
        ThemeSelect: "./src/components/DocsThemeSelect.astro",
      },
      expressiveCode: {
        defaultProps: { wrap: false },
        plugins: [
          sheetwriteCodeHovers({
            cwd: new URL(".", import.meta.url).pathname,
            shouldTransform: (codeBlock) => !/\bgenerated\b/.test(codeBlock.meta),
          }),
        ],
      },
      pagefind: true,
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Install Sheetwrite", link: "/docs/start/installation/" },
            { label: "Build your first grid", link: "/docs/start/first-grid/" },
          ],
        },
        {
          label: "Core concepts",
          collapsed: true,
          items: [
            { label: "Runtime and state ownership", link: "/docs/concepts/runtime-ownership/" },
          ],
        },
        {
          label: "Framework adapters",
          collapsed: true,
          items: [
            { label: "Adapter lifecycle", link: "/docs/frameworks/lifecycle/" },
            { label: "Vanilla JavaScript", link: "/docs/frameworks/vanilla/" },
            { label: "React", link: "/docs/frameworks/react/" },
            { label: "Vue", link: "/docs/frameworks/vue/" },
            { label: "Svelte", link: "/docs/frameworks/svelte/" },
          ],
        },
        {
          label: "Guides",
          collapsed: true,
          items: [
            {
              label: "Build",
              collapsed: true,
              items: [
                { label: "Configure the grid", link: "/docs/guides/configuration/" },
                { label: "Interaction and editing", link: "/docs/guides/interaction/" },
                { label: "Data operations", link: "/docs/guides/data-operations/" },
                { label: "Formulas", link: "/docs/guides/formulas/" },
                { label: "Styling and theming", link: "/docs/guides/styling/" },
              ],
            },
            {
              label: "Ship",
              collapsed: true,
              items: [
                { label: "Persistence and recovery", link: "/docs/guides/persistence/" },
                { label: "Collaboration and sync", link: "/docs/guides/collaboration/" },
                { label: "Worker rendering", link: "/docs/guides/worker-rendering/" },
                { label: "XLSX import and export", link: "/docs/guides/xlsx-export/" },
                { label: "Performance evidence", link: "/docs/guides/performance-resources/" },
                { label: "Accessibility", link: "/docs/guides/accessibility/" },
              ],
            },
          ],
        },
        {
          label: "Reference",
          collapsed: true,
          items: [
            { label: "Package entry points", link: "/docs/reference/package-entry-points/" },
            { label: "Events and errors", link: "/docs/reference/events-errors/" },
            { label: "Document operations", link: "/docs/reference/document-operations/" },
            { label: "Compatibility and limits", link: "/docs/reference/compatibility-limits/" },
            { label: "Guide migration matrix", link: "/docs/reference/migration-matrix/" },
          ],
        },
        {
          label: "API reference",
          collapsed: true,
          items: [
            { label: "API overview", link: "/docs/api/" },
            {
              label: "Core",
              collapsed: true,
              items: [
                { label: "Main package", link: "/docs/api/core/" },
                { label: "Adapter utilities", link: "/docs/api/core-adapter/" },
                { label: "Browser storage", link: "/docs/api/core-browser/" },
                { label: "Application shell", link: "/docs/api/core-shell/" },
                { label: "Worker entry point", link: "/docs/api/core-worker/" },
                { label: "Test utilities", link: "/docs/api/core-testing/" },
                { label: "Grid styles", link: "/docs/api/core-styles-css/" },
                { label: "Shell styles", link: "/docs/api/core-shell-css/" },
              ],
            },
            {
              label: "Adapters",
              collapsed: true,
              items: [
                { label: "React API", link: "/docs/api/react/" },
                { label: "React styles", link: "/docs/api/react-styles-css/" },
                { label: "Vue API", link: "/docs/api/vue/" },
                { label: "Vue styles", link: "/docs/api/vue-styles-css/" },
                { label: "Svelte API", link: "/docs/api/svelte/" },
                { label: "Svelte styles", link: "/docs/api/svelte-styles-css/" },
              ],
            },
            {
              label: "Engine and files",
              collapsed: true,
              items: [
                { label: "WASM engine", link: "/docs/api/wasm/" },
                { label: "WASM binary", link: "/docs/api/wasm-wasm/" },
                { label: "XLSX", link: "/docs/api/xlsx/" },
                { label: "XLSX registration", link: "/docs/api/xlsx-register/" },
              ],
            },
          ],
        },
        {
          label: "Runnable examples",
          collapsed: true,
          items: [
            { label: "Vanilla workbook", link: "/vanilla/" },
            { label: "React analytics", link: "/react/" },
            { label: "Vue streaming data", link: "/vue/" },
            { label: "Svelte formulas", link: "/svelte/" },
            { label: "Theme laboratory", link: "/theming/" },
          ],
        },
      ],
    }),
    basePathOutput(base),
    pagefindWorkerUrls(base),
    react(),
    vue(),
    svelte(),
  ],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
