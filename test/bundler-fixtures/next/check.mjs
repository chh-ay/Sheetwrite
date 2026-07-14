import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

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
const html = await readFile(resolve("out/index.html"), "utf8");
const initialUrls = new Set(
  [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|wasm)(?:\?[^"]*)?)"/g)].map((match) =>
    match[1].split("?")[0].replace(/^\/_next\//, ""),
  ),
);
const assets = selected.map((path) => {
  const nextRelative = relative(nextRoot, path).replaceAll("\\", "/");
  const kind = path.endsWith(".js") ? "javascript" : path.endsWith(".css") ? "css" : "wasm";
  const isInitial = kind === "wasm" || initialUrls.has(nextRelative);
  return {
    path: relative(repositoryRoot, path).replaceAll("\\", "/"),
    kind,
    owner: isInitial ? "core-initial" : "next-async",
    roles: [isInitial ? "core-initial" : "next-async"],
  };
});
if (!assets.some((asset) => asset.kind === "javascript" && asset.owner === "core-initial")) {
  throw new Error("Next.js manifest identified no initial browser JavaScript");
}
const evidence = {
  schemaVersion: 1,
  bundler: "next",
  version: packageManifest.dependencies.next,
  assets,
};
const evidencePath = resolve(repositoryRoot, "test-results/delivery-size/bundlers/next.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Next.js size manifest:", relative(process.cwd(), evidencePath));
