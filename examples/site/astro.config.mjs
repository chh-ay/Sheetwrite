// @ts-check
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";

// One site, every Sheetwrite example: vanilla + theming as plain pages,
// React/Vue/Svelte as client-only islands sharing a single WASM engine init.
export default defineConfig({
  integrations: [react(), vue(), svelte()],
  devToolbar: { enabled: false },
});
