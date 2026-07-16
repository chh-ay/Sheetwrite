import type { ExpressiveCodeTheme } from "@expressive-code/core";
import { nodeTypes } from "@mdx-js/mdx";
import mdx from "@mdx-js/rollup";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeRaw from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";
import { sheetwriteCodeHovers } from "./src/lib/sheetwrite-code-hovers.ts";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Marks pre blocks hydration-safe and strips Expressive Code's idle-callback
 * tabindex script: the docs app owns scroll-focus sync deterministically in
 * `initializeCodeEnhancements`. */
function markResponsiveCodeBlocks() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.tagName === "pre") {
        node.properties = { ...node.properties, suppressHydrationWarning: true };
      }
      if (node.children) {
        node.children = node.children.filter(
          (child) =>
            !(
              child.tagName === "script" &&
              child.children?.some(
                (content) =>
                  content.type === "text" && content.value?.includes("tabindex-js-module"),
              )
            ),
        );
        for (const child of node.children) visit(child);
      }
    };
    visit(tree);
  };
}

export default defineConfig({
  plugins: [
    {
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
        rehypePlugins: [
          [
            rehypeExpressiveCode,
            {
              defaultProps: { wrap: false },
              styleOverrides: {
                codeFontFamily: "var(--sw-font-mono)",
                uiFontFamily: "var(--sw-font-body)",
              },
              useDarkModeMediaQuery: false,
              themeCssSelector: (theme: ExpressiveCodeTheme) => `[data-theme='${theme.type}']`,
              plugins: [
                sheetwriteCodeHovers({
                  cwd: new URL(".", import.meta.url).pathname,
                  shouldTransform: (codeBlock) => !/\bgenerated\b/.test(codeBlock.meta),
                }),
              ],
            },
          ],
          // Raw HTML re-parse must run after Expressive Code: it drops fence `data.meta`.
          [rehypeRaw, { passThrough: nodeTypes }],
          markResponsiveCodeBlocks,
        ],
      }),
      enforce: "pre",
    },
    tailwindcss(),
    tanstackStart({
      pages: [
        { path: "/" },
        { path: "/docs/" },
        { path: "/docs/proof/", sitemap: { exclude: true } },
        // Test fixtures stay reachable for Playwright but out of search surfaces.
        { path: "/test/xlsx/", sitemap: { exclude: true } },
        { path: "/test/collaboration/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/react/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/vue/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/svelte/", sitemap: { exclude: true } },
      ],
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
        autoSubfolderIndex: true,
      },
      sitemap: {
        enabled: true,
        host: "https://sheetwrite.vercel.app",
      },
    }),
    vue(),
    svelte(),
    viteReact({ include: /\.(?:js|jsx|ts|tsx|md|mdx)$/ }),
  ],
});
