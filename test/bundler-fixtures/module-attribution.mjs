import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const SOURCE_MAPS_MODE = "hidden-external";
const BASE64 = Object.fromEntries(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (character, index) => [character, index],
  ),
);
const ATTRIBUTION_METHOD = "source-map-generated-spans-with-explicit-opaque-assets-v2";

function compressedSizes(data) {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9, mtime: 0 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const character of segment) {
    const digit = BASE64[character];
    if (digit === undefined) throw new Error(`Invalid source-map VLQ character ${character}`);
    value += (digit & 31) << shift;
    if ((digit & 32) !== 0) {
      shift += 5;
      continue;
    }
    const negative = (value & 1) === 1;
    const decoded = value >> 1;
    values.push(negative ? -decoded : decoded);
    value = 0;
    shift = 0;
  }
  if (shift !== 0) throw new Error(`Truncated source-map VLQ segment ${segment}`);
  return values;
}

function decodedMappings(map) {
  if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== "string") {
    throw new Error("Module attribution requires a non-indexed source map v3");
  }
  const lines = [];
  let sourceIndex = 0;
  for (const encodedLine of map.mappings.split(";")) {
    let generatedColumn = 0;
    const mappings = [];
    for (const encodedSegment of encodedLine.split(",")) {
      if (encodedSegment.length === 0) continue;
      const fields = decodeVlq(encodedSegment);
      if (fields.length !== 1 && fields.length !== 4 && fields.length !== 5) {
        throw new Error(`Unsupported source-map segment width ${fields.length}`);
      }
      generatedColumn += fields[0];
      let source;
      if (fields.length >= 4) {
        sourceIndex += fields[1];
        source = map.sources[sourceIndex];
        if (typeof source !== "string") {
          throw new Error(`Source-map segment references missing source ${sourceIndex}`);
        }
      }
      mappings.push({ generatedColumn, source });
    }
    lines.push(mappings);
  }
  return lines;
}

function normalizeSource(source, bundler) {
  const decoded = decodeURIComponent(source).replaceAll("\\", "/").split("!").at(-1).split("?")[0];
  const nodeModules = decoded.lastIndexOf("/node_modules/");
  if (nodeModules >= 0) {
    const packagePath = decoded
      .slice(nodeModules + "/node_modules/".length)
      .replace(/^\.pnpm\/[^/]+\/node_modules\//, "");
    const segments = packagePath.split("/").filter(Boolean);
    const packageName = segments[0]?.startsWith("@")
      ? `${segments[0]}/${segments[1] ?? "missing"}`
      : (segments[0] ?? "missing");
    return { id: packagePath, owner: packageName };
  }
  const workspaceCore = decoded.lastIndexOf("/packages/core/");
  if (workspaceCore >= 0) {
    return {
      id: `@sheetwrite/core/${decoded.slice(workspaceCore + "/packages/core/".length)}`,
      owner: "@sheetwrite/core",
    };
  }
  const fixture = decoded.lastIndexOf("/test/bundler-fixtures/");
  if (fixture >= 0) {
    return {
      id: `fixture/${decoded.slice(fixture + "/test/bundler-fixtures/".length)}`,
      owner: "fixture",
    };
  }
  const sourceIndex = decoded.lastIndexOf("/src/");
  if (sourceIndex >= 0) {
    return { id: `fixture${decoded.slice(sourceIndex)}`, owner: "fixture" };
  }
  const stableFixture = decoded.replace(/^webpack:\/\/[^/]*\//, "").replace(/^\.\//, "");
  if (stableFixture.startsWith("app/")) {
    return { id: `fixture/${stableFixture}`, owner: "fixture" };
  }
  const stable = decoded
    .replace(/^webpack:\/\/[^/]*\//, "")
    .replace(/^file:\/\//, "")
    .replace(/^(?:\.\.\/)+/, "")
    .replace(/^\.\//, "")
    .replaceAll("\0", "virtual:");
  return {
    id:
      stable.length === 0
        ? `${bundler}:runtime`
        : stable.startsWith("/")
          ? `${bundler}:runtime/absolute`
          : `${bundler}:runtime/${stable}`,
    owner: `${bundler}:runtime`,
  };
}

async function sourceMapFor(assetPath, source) {
  const match = source.match(/\n?\/\/[#@] sourceMappingURL=([^\s]+)\s*$/);
  const mapPath =
    match === null || match[1].startsWith("data:")
      ? `${assetPath}.map`
      : resolve(dirname(assetPath), decodeURIComponent(match[1]));
  try {
    return JSON.parse(await readFile(mapPath, "utf8"));
  } catch (error) {
    throw new Error(`Module attribution requires an external source map for ${assetPath}`, {
      cause: error,
    });
  }
}

function appendSpan(spans, identity, text) {
  if (text.length === 0) return;
  const key = `${identity.owner}\0${identity.id}`;
  const previous = spans.get(key);
  if (previous === undefined) spans.set(key, { ...identity, parts: [text] });
  else previous.parts.push(text);
}

function attributeSource(source, map, bundler) {
  const spans = new Map();
  const mappingLines = decodedMappings(map);
  const generatedLines = source.split("\n");
  const runtime = { id: `${bundler}:runtime`, owner: `${bundler}:runtime` };
  for (let lineIndex = 0; lineIndex < generatedLines.length; lineIndex++) {
    const line = generatedLines[lineIndex] + (lineIndex + 1 < generatedLines.length ? "\n" : "");
    const contentLength = generatedLines[lineIndex].length;
    const mappings = mappingLines[lineIndex] ?? [];
    let cursor = 0;
    let owner = runtime;
    for (const mapping of mappings) {
      if (mapping.generatedColumn < cursor || mapping.generatedColumn > contentLength) {
        throw new Error(`Source-map generated column escapes line ${lineIndex + 1}`);
      }
      appendSpan(spans, owner, line.slice(cursor, mapping.generatedColumn));
      owner =
        mapping.source === undefined
          ? runtime
          : normalizeSource(`${map.sourceRoot ?? ""}${mapping.source}`, bundler);
      cursor = mapping.generatedColumn;
    }
    appendSpan(spans, owner, line.slice(cursor));
  }
  return spans;
}

function mergeSpans(target, source) {
  for (const [key, identity] of source) {
    const previous = target.get(key);
    if (previous === undefined) target.set(key, identity);
    else previous.parts.push(...identity.parts);
  }
}

export async function attributeEntry({
  assetFiles,
  bundler,
  eagerImports,
  opaqueAssetFiles = [],
  entry,
  name,
  repositoryRoot,
  root,
}) {
  const selected = [...new Set(assetFiles)].sort();
  const opaque = new Set(opaqueAssetFiles);
  for (const file of opaque) {
    if (!selected.includes(file)) {
      throw new Error(`${bundler} ${name} declares a non-initial opaque asset ${file}`);
    }
  }
  if (selected.length === 0) throw new Error(`${bundler} ${name} has no initial JavaScript assets`);
  const spans = new Map();
  let generatedBytes = 0;
  const attributedAssets = [];
  for (const file of selected) {
    if (!file.endsWith(".js")) throw new Error(`Cannot attribute non-JavaScript asset ${file}`);
    const assetPath = resolve(root, file);
    if (assetPath !== root && !assetPath.startsWith(`${root}${sep}`)) {
      throw new Error(`Attribution asset escapes fixture output: ${file}`);
    }
    const content = await readFile(assetPath);
    const source = content.toString("utf8");
    generatedBytes += content.byteLength;
    attributedAssets.push({
      path: relative(repositoryRoot, assetPath).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    if (opaque.has(file)) {
      appendSpan(
        spans,
        { id: `${bundler}:opaque/${file}`, owner: `${bundler}:opaque-framework` },
        source,
      );
    } else {
      mergeSpans(spans, attributeSource(source, await sourceMapFor(assetPath, source), bundler));
    }
  }
  const modules = [...spans.values()]
    .map(({ id, owner, parts }) => ({
      id,
      owner,
      attribution: owner === `${bundler}:opaque-framework` ? "opaque-asset" : "source-map",
      ...compressedSizes(Buffer.from(parts.join(""))),
    }))
    .filter((module) => module.rawBytes > 0)
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.owner.localeCompare(right.owner),
    );
  const attributedBytes = modules.reduce((sum, module) => sum + module.rawBytes, 0);
  if (attributedBytes !== generatedBytes) {
    throw new Error(
      `${bundler} ${name} attributed ${attributedBytes} of ${generatedBytes} generated bytes`,
    );
  }
  return {
    name,
    entry,
    eagerImports: [...new Set(eagerImports)].sort(),
    assets: attributedAssets,
    generatedBytes,
    modules,
  };
}

export function attributionProvenance({ minifier, version }) {
  return {
    buildMode: "production",
    minified: true,
    minifier: { name: minifier, version },
    externals: [],
    target: "browser",
    sourceMaps: SOURCE_MAPS_MODE,
    attributionMethod: ATTRIBUTION_METHOD,
  };
}
