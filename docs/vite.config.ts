import mdx from "@mdx-js/rollup";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import rehypeExpressiveCode from "rehype-expressive-code";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";
import { sheetwriteCodeHovers } from "./src/lib/sheetwrite-code-hovers.ts";

export default defineConfig({
  plugins: [
    {
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
        rehypePlugins: [
          [
            rehypeExpressiveCode,
            {
              defaultProps: { wrap: false },
              plugins: [
                sheetwriteCodeHovers({
                  cwd: new URL(".", import.meta.url).pathname,
                  shouldTransform: (codeBlock) => !/\bgenerated\b/.test(codeBlock.meta),
                }),
              ],
            },
          ],
        ],
      }),
      enforce: "pre",
    },
    tailwindcss(),
    tanstackStart({
      pages: [{ path: "/" }],
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
