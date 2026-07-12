import { defineConfig } from "vite";

export default defineConfig({
  worker: {
    rollupOptions: {
      output: { entryFileNames: "recipe-worker-[hash].js" },
    },
  },
});
