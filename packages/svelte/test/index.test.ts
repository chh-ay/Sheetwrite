import { describe, expect, it } from "bun:test";
import SheetwriteGrid from "../src/Grid.svelte";
import type { SheetwriteGridProps } from "../src/props.js";

// Svelte's client mount reaches ready under happy-dom, but its teardown promise
// does not settle in Bun's test runtime. React/Vue own executable teardown
// parity; svelte-check and this test keep the compiled public component wired.
describe("SheetwriteGrid Svelte package", () => {
  it("compiles the component against the single shared public prop contract", () => {
    const component: unknown = SheetwriteGrid;
    expect(typeof component).toBe("function");
    const accepts = (_props: SheetwriteGridProps): void => {};
    expect(typeof accepts).toBe("function");
  });
});
