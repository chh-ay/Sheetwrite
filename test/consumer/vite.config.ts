import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist-vite",
    target: "esnext",
    rollupOptions: {
      input: {
        svelte: resolve(import.meta.dirname, "index.html"),
        react: resolve(import.meta.dirname, "react.html"),
        vue: resolve(import.meta.dirname, "vue.html"),
      },
    },
  },
});
