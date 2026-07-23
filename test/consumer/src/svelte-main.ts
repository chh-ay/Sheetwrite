/// <reference types="vite/client" />
import type { Grid } from "@sheetwrite/core";
import "@sheetwrite/svelte/styles.css";
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import { assertUnmounted, markPassed } from "./lifecycle.js";

const target = document.getElementById("app");
if (!target) throw new Error("Packed Svelte consumer is missing #app");

const component = mount(App, {
  target,
  props: {
    onComplete(getGrid: () => Grid | undefined) {
      queueMicrotask(() => {
        void unmount(component).then(() => {
          assertUnmounted(target, getGrid());
          markPassed("svelte");
        });
      });
    },
  },
});
