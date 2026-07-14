import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve("../../..");
const root = resolve("dist");
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

const publicFiles = (await walk(root))
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const wasm = publicFiles.filter((path) => path.endsWith(".wasm"));
const workers = publicFiles.filter((path) => /(?:^|\/)worker-[^/]*\.js$/.test(path));
if (wasm.length !== 1) throw new Error(`Expected one webpack WASM asset, got ${wasm.length}`);
if (workers.length !== 1)
  throw new Error(`Expected one webpack Worker chunk, got ${workers.length}`);
if (!publicFiles.includes("main.js")) throw new Error("webpack emitted no initial main.js");

const assets = publicFiles.map((file) => {
  const kind = file.endsWith(".js") ? "javascript" : file.endsWith(".css") ? "css" : "wasm";
  let owner;
  let roles;
  if (file === "main.js" || file === wasm[0]) {
    owner = "core-initial";
    roles = ["core-initial"];
  } else if (workers.includes(file)) {
    owner = "worker-async";
    roles = ["worker-async"];
  } else {
    throw new Error(`Unclassified webpack emitted asset: ${file}`);
  }
  return {
    path: relative(repositoryRoot, resolve(root, file)).replaceAll("\\", "/"),
    kind,
    owner,
    roles,
  };
});
const evidence = {
  schemaVersion: 1,
  bundler: "webpack",
  version: packageManifest.dependencies.webpack,
  assets,
};
const evidencePath = resolve(repositoryRoot, "test-results/delivery-size/bundlers/webpack.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("webpack size manifest:", relative(process.cwd(), evidencePath));
