import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  // The fixture entry uses top-level await (initSheetwrite gate).
  build: { outDir: "dist-vite", target: "esnext" },
});
