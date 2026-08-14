import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repositoryRoot = resolve("../../..");
const nextRoot = resolve(".next");
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));

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

const emitted = await walk(nextRoot);
const staticAssets = emitted.filter(
  (path) => path.includes("/.next/static/") && /\.(?:css|js|wasm)$/.test(path),
);
const wasm = staticAssets.filter((path) => path.endsWith(".wasm"));
if (wasm.length !== 1)
  throw new Error(`Expected one browser Next.js WASM asset, got ${wasm.length}`);
const selected = [...new Set(staticAssets)].sort();
function initialUrls(html) {
  return new Set(
    [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|wasm)(?:\?[^"]*)?)"/g)].map((match) =>
      match[1].split("?")[0].replace(/^\/_next\//, ""),
    ),
  );
}

const lifecycleInitialUrls = initialUrls(await readFile(resolve("out/index.html"), "utf8"));
const attributionHtml = await readFile(resolve("out/attribution.html"), "utf8").catch(() =>
  readFile(resolve("out/attribution/index.html"), "utf8"),
);
const attributionInitialUrls = initialUrls(attributionHtml);
const assets = selected.map((path) => {
  const nextRelative = relative(nextRoot, path).replaceAll("\\", "/");
  const kind = path.endsWith(".js") ? "javascript" : path.endsWith(".css") ? "css" : "wasm";
  const roles = [];
  if (kind === "wasm" || lifecycleInitialUrls.has(nextRelative)) roles.push("core-initial");
  if (attributionInitialUrls.has(nextRelative)) roles.push("core-attribution-initial");
  if (roles.length === 0) roles.push("next-async");
  return {
    path: relative(repositoryRoot, path).replaceAll("\\", "/"),
    kind,
    owner: roles.length === 1 ? roles[0] : `shared:${roles.join("+")}`,
    roles,
  };
});
if (!assets.some((asset) => asset.kind === "javascript" && asset.roles.includes("core-initial"))) {
  throw new Error("Next.js manifest identified no initial browser JavaScript");
}
const attributionAssetFiles = selected
  .map((path) => relative(nextRoot, path).replaceAll("\\", "/"))
  .filter((path) => path.endsWith(".js") && attributionInitialUrls.has(path));
const attribution = [
  await attributeEntry({
    assetFiles: attributionAssetFiles,
    bundler: "next",
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    entry: "app/attribution/page.tsx",
    name: "core-first-paint",
    opaqueAssetFiles: attributionAssetFiles.filter((path) =>
      /(?:^|\/)polyfills-[^/]+\.js$/.test(path),
    ),
    repositoryRoot,
    root: nextRoot,
  }),
];
const evidence = {
  schemaVersion: 2,
  bundler: "next",
  version: packageManifest.dependencies.next,
  assets,
  provenance: attributionProvenance({
    minifier: "next-swc",
    version: packageManifest.dependencies.next,
  }),
  attribution,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/next.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Next.js size manifest:", relative(process.cwd(), evidencePath));
