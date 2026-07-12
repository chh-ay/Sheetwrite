import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve("dist");
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
    ),
  );
  return nested.flat();
}
const emitted = await walk(root);
const wasm = emitted.filter((path) => path.endsWith(".wasm"));
const workers = emitted.filter((path) => /(?:^|\/)recipe-worker-[^/]*\.js$/.test(path));
if (wasm.length === 0) throw new Error("Vite emitted no .wasm asset");
if (workers.length === 0) throw new Error("Vite emitted no ?worker&url worker chunk");
const stylesheets = emitted.filter((path) => path.endsWith(".css"));
if (stylesheets.length === 0) throw new Error("Vite emitted no adapter stylesheet");
const css = (await Promise.all(stylesheets.map((path) => readFile(path, "utf8")))).join("\n");
if (!css.includes(".sheetwrite")) {
  throw new Error("Packed adapter stylesheets did not resolve canonical core CSS");
}
const javascript = emitted.filter((path) => path.endsWith(".js"));
const browserGraph = (await Promise.all(javascript.map((path) => readFile(path, "utf8")))).join(
  "\n",
);
if (/node:fs(?:\/promises)?|fs\/promises/.test(browserGraph)) {
  throw new Error("Vite browser graph contains a Node filesystem import");
}
console.log("Vite WASM assets:", wasm.map((path) => relative(process.cwd(), path)).join(", "));
console.log("Vite worker chunks:", workers.map((path) => relative(process.cwd(), path)).join(", "));
