import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const distRoot = resolve(import.meta.dir, "../docs/dist/client");
const defaultPages = [
  "index.html",
  "react/index.html",
  "svelte/index.html",
  "vanilla/index.html",
  "vue/index.html",
  "test/collaboration/index.html",
  "test/framework-lifecycle/react/index.html",
  "test/framework-lifecycle/svelte/index.html",
  "test/framework-lifecycle/vue/index.html",
];
const xlsxMarker = "sheetwrite-workbook-metadata-v1";

async function collectStaticGraph(entrypoints: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const queue = [...entrypoints];
  while (queue.length > 0) {
    const path = queue.pop()!;
    if (files.has(path)) continue;
    const content = await readFile(path, "utf8");
    files.set(path, content);
    const directory = dirname(path);
    const staticImports = [
      ...content.matchAll(/\bimport\s*["']([^"']+)["']/g),
      ...content.matchAll(
        /\bimport\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s*from\s*["']([^"']+)["']/g,
      ),
    ];
    for (const match of staticImports) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) queue.push(resolve(directory, specifier));
    }
  }
  return files;
}

async function entrypointsFromHtml(relativePath: string): Promise<string[]> {
  const html = await readFile(join(distRoot, relativePath), "utf8");
  const entrypoints: string[] = [];
  for (const match of html.matchAll(
    /(?:src|component-url|renderer-url|href)=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) entrypoints.push(join(distRoot, match[1]));
  }
  return entrypoints;
}

const defaultEntrypoints = (
  await Promise.all(defaultPages.map((page) => entrypointsFromHtml(page)))
).flat();
const defaultGraph = await collectStaticGraph(defaultEntrypoints);
for (const [path, content] of defaultGraph) {
  if (basename(path).startsWith("register.") || content.includes(xlsxMarker)) {
    throw new Error(`Default example graph eagerly includes the XLSX backend through ${path}`);
  }
}

const reactGraph = await collectStaticGraph(await entrypointsFromHtml("react/index.html"));
const lazyEntrypoints: string[] = [];
for (const [path, content] of reactGraph) {
  for (const match of content.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier?.startsWith(".")) lazyEntrypoints.push(resolve(dirname(path), specifier));
  }
  // Vite 8's preload helper hoists dynamic-import dependencies into
  // __vite__mapDeps as dist-root-relative asset strings.
  for (const match of content.matchAll(/["']assets\/([^"']+\.js)["']/g)) {
    if (match[1] !== undefined) lazyEntrypoints.push(join(distRoot, "assets", match[1]));
  }
}
const lazyGraph = await collectStaticGraph(lazyEntrypoints);
if (![...lazyGraph.values()].some((content) => content.includes(xlsxMarker))) {
  throw new Error("React workbook XLSX action cannot reach the backend through a lazy import");
}

const xlsxEntrypoints = await entrypointsFromHtml("test/xlsx/index.html");
const xlsxGraph = await collectStaticGraph(xlsxEntrypoints);
if (![...xlsxGraph.values()].some((content) => content.includes(xlsxMarker))) {
  throw new Error("Dedicated XLSX route does not contain the concrete workbook backend");
}

console.log(
  `Example XLSX isolation passed (${defaultGraph.size} default chunks, ${xlsxGraph.size} XLSX chunks)`,
);
