import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { createLoader } from "../../wasm/loader-state.mjs";

describe("WASM loader lifecycle", () => {
  it("deduplicates one source, rejects a conflicting source, and retries after failure", async () => {
    const gate = Promise.withResolvers();
    const calls = [];
    let fail = true;
    const loader = createLoader(async (source) => {
      calls.push(source);
      if (source === "deferred") await gate.promise;
      if (source === "retry" && fail) {
        fail = false;
        throw new Error("transient compile failure");
      }
    });

    const first = loader.load("deferred");
    const duplicate = loader.load("deferred");
    await expect(loader.load("other")).rejects.toThrow("different source while initialization");
    expect(loader.isLoaded()).toBe(false);
    gate.resolve();
    await Promise.all([first, duplicate]);
    expect(loader.isLoaded()).toBe(true);
    expect(calls).toEqual(["deferred"]);

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      await loader.load("other");
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings).toEqual([
      "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
    ]);

    const retrying = createLoader(async (source) => {
      calls.push(source);
      if (source === "retry" && fail) {
        fail = false;
        throw new Error("transient compile failure");
      }
    });
    fail = true;
    await expect(retrying.load("retry")).rejects.toThrow("transient compile failure");
    expect(retrying.isLoaded()).toBe(false);
    await retrying.load("retry");
    expect(retrying.isLoaded()).toBe(true);
  });

  it("initializes the Node loader from its packaged default binary", async () => {
    const loader = await import(`../../wasm/loader-node.mjs?coverage-default=${Date.now()}`);

    expect(loader.isLoaded()).toBe(false);
    await loader.load();
    expect(loader.isLoaded()).toBe(true);
  });

  it("initializes the Node loader from an explicit compiled module", async () => {
    const bytes = await readFile(
      new URL("../../wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
    );
    const module = await WebAssembly.compile(bytes);
    const loader = await import(`../../wasm/loader-node.mjs?coverage-explicit=${Date.now()}`);

    expect(loader.isLoaded()).toBe(false);
    await loader.load(module);
    expect(loader.isLoaded()).toBe(true);
  });
});
