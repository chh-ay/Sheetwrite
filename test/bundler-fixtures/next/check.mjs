import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(directory, entry.name))
          : [resolve(directory, entry.name)],
      ),
    )
  ).flat();
}
const emitted = await walk(resolve(".next"));
const wasm = emitted.filter((path) => path.endsWith(".wasm"));
if (wasm.length === 0) throw new Error("Next.js emitted no .wasm asset");
console.log("Next.js WASM assets:", wasm.map((path) => relative(process.cwd(), path)).join(", "));
