import type { Grid } from "@sheetwrite/core";
import "@sheetwrite/svelte/styles.css";
import { mount, unmount } from "svelte";
import App from "./SvelteApp.svelte";
import { assertUnmounted, passed } from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("Svelte Vite fixture is missing #app");
const host = target;
const component = mount(App, {
  target: host,
  props: {
    onComplete(getGrid: () => Grid | undefined) {
      queueMicrotask(() => {
        void unmount(component).then(() => {
          assertUnmounted(host, getGrid());
          passed("svelte");
        });
      });
    },
  },
});
