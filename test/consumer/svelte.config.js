import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// svelte-check reads this instead of probing vite.config.ts (whose plugin
// detection fails under svelte-check's config loader).
export default {
  preprocess: vitePreprocess(),
};
