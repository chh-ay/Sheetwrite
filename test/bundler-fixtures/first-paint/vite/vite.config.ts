import { resolve } from "node:path";
import { defineConfig } from "vite";

const output = process.env.SHEETWRITE_FIRST_PAINT_OUTPUT;
const core = process.env.SHEETWRITE_FIRST_PAINT_CORE;
if (!output || !core) {
  throw new Error("SHEETWRITE_FIRST_PAINT_OUTPUT and SHEETWRITE_FIRST_PAINT_CORE are required");
}

export default defineConfig({
  resolve: {
    alias: {
      "@sheetwrite/core": resolve(core),
    },
  },
  build: {
    manifest: true,
    minify: "esbuild",
    outDir: resolve(output),
    sourcemap: "hidden",
  },
});
