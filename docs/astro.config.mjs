// @ts-check
import { readFile, writeFile } from "node:fs/promises";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

/** @returns {import("astro").AstroIntegration} */
function pagefindWorkerUrls() {
  return {
    name: "sheetwrite-pagefind-worker-urls",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const workerUrl = new URL("pagefind/pagefind-worker.js", dir);
        const generated = await readFile(workerUrl, "utf8");
        const original = 'let basePath=opts.basePath||"/pagefind/";';
        const replacement =
          'let basePath=opts.basePath||"/pagefind/";if(basePath.startsWith("/"))basePath=new URL(basePath,self.location.origin).href;';
        if (!generated.includes(original)) {
          throw new Error("Pagefind worker base-path initialization changed");
        }
        await writeFile(workerUrl, generated.replace(original, replacement));
      },
    },
  };
}

// One product site: routed documentation plus every runnable Sheetwrite example.
export default defineConfig({
  site: process.env.SHEETWRITE_SITE_URL ?? "http://localhost:4321",
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !pathname.startsWith("/test/") && !pathname.startsWith("/__test__/");
      },
    }),
    starlight({
      title: "Sheetwrite",
      description: "Guides, examples, and generated API reference for Sheetwrite.",
      customCss: ["/src/styles/docs.css", "/src/styles/api-reference.css"],
      components: {
        PageSidebar: "./src/components/PageSidebar.astro",
        SocialIcons: "./src/components/FrameworkSelect.astro",
      },
      expressiveCode: {
        defaultProps: { wrap: false },
      },
      pagefind: true,
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Documentation home", link: "/docs/" },
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
    pagefindWorkerUrls(),
    react(),
    vue(),
    svelte(),
  ],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
