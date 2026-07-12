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
const emitted = await walk(resolve("dist"));
const wasm = emitted.filter((path) => path.endsWith(".wasm"));
const workers = emitted.filter((path) => /(?:^|\/)worker-[^/]*\.js$/.test(path));
if (wasm.length === 0) throw new Error("webpack emitted no .wasm asset");
if (workers.length === 0) throw new Error("webpack emitted no worker chunk");
console.log("webpack WASM assets:", wasm.map((path) => relative(process.cwd(), path)).join(", "));
console.log(
  "webpack worker chunks:",
  workers.map((path) => relative(process.cwd(), path)).join(", "),
);
