import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repositoryRoot = resolve("../../..");
const root = resolve("dist");
const manifest = JSON.parse(await readFile(resolve(root, ".vite/manifest.json"), "utf8"));
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const rolesByFile = new Map();
const kindByFile = new Map();
const initialRoles = ["core-initial", "react-initial", "svelte-initial", "vue-initial"];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
    ),
  );
  return nested.flat();
}

function addFile(file, role) {
  const kind = file.endsWith(".js")
    ? "javascript"
    : file.endsWith(".css")
      ? "css"
      : file.endsWith(".wasm")
        ? "wasm"
        : undefined;
  if (!kind) return;
  const previousKind = kindByFile.get(file);
  if (previousKind && previousKind !== kind) throw new Error(`Vite asset ${file} changed kind`);
  kindByFile.set(file, kind);
  const roles = rolesByFile.get(file) ?? new Set();
  roles.add(role);
  rolesByFile.set(file, roles);
}

function findEntry(html) {
  const matches = Object.entries(manifest).filter(
    ([key, chunk]) =>
      chunk.isEntry && (key === html || chunk.src === html || key.endsWith(`/${html}`)),
  );
  if (matches.length !== 1)
    throw new Error(`Expected one Vite manifest entry for ${html}, got ${matches.length}`);
  return matches[0][0];
}

function staticGraph(rootKey) {
  const visited = new Set();
  const pending = [rootKey];
  while (pending.length > 0) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
    visited.add(key);
    for (const imported of chunk.imports ?? []) pending.push(imported);
  }
  return visited;
}

function addChunk(key, role) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
  addFile(chunk.file, role);
  for (const file of chunk.css ?? []) addFile(file, role);
  for (const file of chunk.assets ?? []) {
    if (file.endsWith(".js") && !/(?:^|\/)worker-[^/]*\.js$/.test(file)) {
      throw new Error(`Unclassified Vite JavaScript URL asset: ${file}`);
    }
    addFile(file, file.endsWith(".js") ? "worker-async" : role);
  }
}

const entryRoles = {
  "index.html": "core-initial",
  "react.html": "react-initial",
  "svelte.html": "svelte-initial",
  "vue.html": "vue-initial",
  "worker.html": "worker-loader-initial",
  "xlsx.html": "xlsx-loader-initial",
};
const defaultInitialChunks = new Set();
const staticGraphsByHtml = new Map();
for (const [html, role] of Object.entries(entryRoles)) {
  const graph = staticGraph(findEntry(html));
  staticGraphsByHtml.set(html, graph);
  for (const key of graph) {
    addChunk(key, role);
    if (initialRoles.includes(role)) defaultInitialChunks.add(key);
  }
}

const xlsxStatic = staticGraph(findEntry("xlsx.html"));
const dynamicPending = [];
for (const key of xlsxStatic) dynamicPending.push(...(manifest[key].dynamicImports ?? []));
const dynamicVisited = new Set();
while (dynamicPending.length > 0) {
  const rootKey = dynamicPending.pop();
  for (const key of staticGraph(rootKey)) {
    if (dynamicVisited.has(key)) continue;
    dynamicVisited.add(key);
    if (!defaultInitialChunks.has(key)) addChunk(key, "xlsx-async");
    dynamicPending.push(...(manifest[key].dynamicImports ?? []));
  }
}
if (dynamicVisited.size === 0) throw new Error("Vite emitted no lazy XLSX chunk");

const emitted = await walk(root);
const publicFiles = emitted
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const workerFiles = publicFiles.filter((path) => /(?:^|\/)recipe-worker-[^/]*\.js$/.test(path));
if (workerFiles.length !== 1)
  throw new Error(`Expected one Vite Worker chunk, got ${workerFiles.length}`);
addFile(workerFiles[0], "worker-async");
const wasmFiles = publicFiles.filter((path) => path.endsWith(".wasm"));
if (wasmFiles.length !== 1)
  throw new Error(`Expected one Vite WASM asset, got ${wasmFiles.length}`);
if (!rolesByFile.has(wasmFiles[0])) {
  for (const role of initialRoles) addFile(wasmFiles[0], role);
}
for (const file of publicFiles) {
  if (!rolesByFile.has(file)) throw new Error(`Unclassified Vite emitted asset: ${file}`);
}
for (const file of rolesByFile.keys()) {
  if (!publicFiles.includes(file))
    throw new Error(`Vite manifest asset is missing from output: ${file}`);
}

const stylesheets = publicFiles.filter((path) => path.endsWith(".css"));
const css = (
  await Promise.all(stylesheets.map((path) => readFile(resolve(root, path), "utf8")))
).join("\n");
if (!css.includes(".sheetwrite")) {
  throw new Error("Packed adapter stylesheets did not resolve canonical core CSS");
}
const javascript = publicFiles.filter((path) => path.endsWith(".js"));
const browserGraph = (
  await Promise.all(javascript.map((path) => readFile(resolve(root, path), "utf8")))
).join("\n");
if (/node:fs(?:\/promises)?|fs\/promises/.test(browserGraph)) {
  throw new Error("Vite browser graph contains a Node filesystem import");
}

const assets = publicFiles.map((file) => {
  const roles = [...rolesByFile.get(file)].sort();
  const owner =
    roles.length === 1
      ? roles[0]
      : roles.every((role) => initialRoles.includes(role))
        ? "shared-initial"
        : `shared:${roles.join("+")}`;
  return {
    path: relative(repositoryRoot, resolve(root, file)).replaceAll("\\", "/"),
    kind: kindByFile.get(file),
    owner,
    roles,
  };
});
const coreGraph = staticGraphsByHtml.get("index.html");
if (coreGraph === undefined) throw new Error("Vite core entry graph was not recorded");
const attribution = [
  await attributeEntry({
    assetFiles: [...coreGraph]
      .map((key) => manifest[key]?.file)
      .filter((file) => typeof file === "string" && file.endsWith(".js")),
    bundler: "vite",
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    entry: "index.html",
    name: "core-first-paint",
    repositoryRoot,
    root,
  }),
];
const esbuildVersion = packageLock.packages?.["node_modules/esbuild"]?.version;
if (typeof esbuildVersion !== "string") throw new Error("Vite fixture lock is missing esbuild");
const evidence = {
  schemaVersion: 2,
  bundler: "vite",
  version: packageManifest.dependencies.vite,
  assets,
  provenance: attributionProvenance({ minifier: "esbuild", version: esbuildVersion }),
  attribution,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/vite.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Vite size manifest:", relative(process.cwd(), evidencePath));
