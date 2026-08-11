import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    sourcemap: "hidden",
    manifest: true,
    minify: "esbuild",
    rollupOptions: {
      input: {
        core: resolve(import.meta.dirname, "index.html"),
        react: resolve(import.meta.dirname, "react.html"),
        svelte: resolve(import.meta.dirname, "svelte.html"),
        vue: resolve(import.meta.dirname, "vue.html"),
        worker: resolve(import.meta.dirname, "worker.html"),
        xlsx: resolve(import.meta.dirname, "xlsx.html"),
      },
    },
  },
  worker: {
    rollupOptions: {
      output: { entryFileNames: "recipe-worker-[hash].js" },
    },
  },
});
