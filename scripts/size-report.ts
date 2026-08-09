import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import {
  assertPublishedFilePolicy,
  readReleaseManifestDigest,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";

export const SIZE_PROTOCOL_VERSION = 2;
export const SIZE_TOOL_NAME = "sheetwrite-delivery-size";
export const SIZE_TOOL_VERSION = "2.0.0";
export const BUNDLER_SOURCE_MAP_MODE = "hidden-external";

export type MetricUnit = "bytes" | "count";
export type PackedCategory =
  | "css"
  | "declarations"
  | "maps"
  | "metadata"
  | "runtime-js"
  | "runtime-source"
  | "wasm";
export type AssetKind = "css" | "javascript" | "wasm";

export interface PackFile {
  path: string;
  size: number;
}

export interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: PackFile[];
}

export interface Metric {
  actual: number;
  unit: MetricUnit;
  category: string;
  owner: string;
}

export interface SizeReleaseSnapshot {
  version: string;
  capturedAt?: string;
  source: string;
  metrics: Record<string, Pick<Metric, "actual" | "unit">>;
}

export interface SizeHistory {
  schemaVersion: 1;
  releases: SizeReleaseSnapshot[];
}

export interface BundlerAsset {
  path: string;
  kind: AssetKind;
  owner: string;
  roles: string[];
}
export interface BundlerProvenance {
  buildMode: string;
  minified: boolean;
  minifier: { name: string; version: string };
  externals: string[];
  target: string;
  sourceMaps: string;
  attributionMethod: string;
}

export interface BundlerModuleAttribution {
  id: string;
  owner: string;
  attribution: "source-map" | "opaque-asset";
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
}
export interface BundlerAttributedAsset {
  path: string;
  sha256: string;
}

export interface BundlerEntryAttribution {
  name: string;
  entry: string;
  eagerImports: string[];
  assets: BundlerAttributedAsset[];
  generatedBytes: number;
  modules: BundlerModuleAttribution[];
}

export interface BundlerEvidence {
  schemaVersion: number;
  bundler: "next" | "vite" | "webpack";
  version: string;
  assets: BundlerAsset[];
  provenance: BundlerProvenance;
  attribution: BundlerEntryAttribution[];
}

export interface PackageReport {
  name: string;
  tarballBytes: number;
  unpackedBytes: number;
  fileCount: number;
  categories: Record<PackedCategory, number>;
}

export interface ClosureReport {
  name: string;
  packageCount: number;
  logicalBytes: number;
  packages: string[];
}

export interface AssetReport extends BundlerAsset {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  sha256: string;
}
export interface AttributionFindings {
  comparison: {
    entry: "core-first-paint";
    buildMode: string;
    minified: true;
    externals: string[];
    target: string;
    sourceMaps: string;
    attributionMethod: string;
    minifiers: Record<"next" | "vite", { name: string; version: string }>;
    fixtureAndConfigurationDifferences: Array<{
      bundler: "next" | "vite";
      eagerImports: string[];
      nonSheetwriteRawBytes: number;
      opaqueFrameworkRawBytes: number;
    }>;
  };
  firstPaint: Array<{
    bundler: "next" | "vite";
    generatedBytes: number;
    sheetwriteRawBytes: number;
    rootBarrelRawBytes: number;
    eagerImports: string[];
  }>;
  subpaths: Array<{
    subpath: "sync" | "collaboration" | "rebase" | "persistence";
    publicExportAdded: false;
    decision: "retain-root-export" | "requires-isolated-subpath-proof";
    reason: string;
    retainedModules: Array<{
      bundler: "next" | "vite";
      rawBytes: number;
      brotliBytes: number;
    }>;
    materialWinThreshold: { brotliBytes: 7680; percent: 10 };
  }>;
}

export interface SizeReport {
  schemaVersion: number;
  protocolVersion: number;
  tool: { name: string; version: string };
  /** Protocol-binding capture stamp; the docs evidence page requires it. */
  meta: { commit: string; dirty: boolean; timestamp: string };
  toolchain: Record<string, string>;
  metrics: Record<string, Metric>;
  packages: PackageReport[];
  closures: ClosureReport[];
  bundlers: Array<{
    name: BundlerEvidence["bundler"];
    version: string;
    provenance: BundlerProvenance;
    attribution: BundlerEntryAttribution[];
    assets: AssetReport[];
  }>;
  attributionFindings: AttributionFindings;
  reproduction: string;
}

interface PackageManifest {
  name: string;
  version: string;
  files?: string[];
  dependencies?: Record<string, string>;
}

interface PackedPackage {
  name: string;
  tarballPath: string;
  report: PackageReport;
}

const repositoryRoot = resolve(import.meta.dir, "..");
const bundlerEvidenceRoot = join(repositoryRoot, "test-results/bundlers");
const reportPath = join(import.meta.dir, "size-report.json");
const historyPath = join(import.meta.dir, "size-history.json");
const xlsxCodecPackages: Record<string, true> = {
  fflate: true,
};
const packageDirectories = [
  "packages/wasm",
  "packages/core",
  "packages/xlsx",
  "packages/react",
  "packages/vue",
  "packages/svelte",
] as const;
const requiredBundlerRoles: Record<BundlerEvidence["bundler"], readonly string[]> = {
  vite: [
    "core-initial",
    "react-initial",
    "vue-initial",
    "svelte-initial",
    "worker-async",
    "xlsx-async",
  ],
  webpack: ["core-initial", "worker-async"],
  next: ["core-initial"],
};
const ATTRIBUTION_METHOD = "source-map-generated-spans-with-explicit-opaque-assets-v2";
const COMPARABLE_ENTRY = "core-first-paint";
const SUBPATH_CANDIDATES = ["sync", "collaboration", "rebase", "persistence"] as const;

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
  );
}

export function parsePackJson(input: string): PackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(
      `Malformed npm pack JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack JSON must contain exactly one result");
  }
  const candidate = parsed[0] as Record<string, unknown>;
  if (
    typeof candidate.filename !== "string" ||
    candidate.filename.length === 0 ||
    !isNonNegativeInteger(candidate.size) ||
    !isNonNegativeInteger(candidate.unpackedSize) ||
    !Array.isArray(candidate.files)
  ) {
    throw new Error("npm pack JSON has invalid filename, size, unpackedSize, or files");
  }
  const seen = new Set<string>();
  const files = candidate.files.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`npm pack JSON file ${index} is malformed`);
    }
    const file = entry as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      !isNonNegativeInteger(file.size)
    ) {
      throw new Error(`npm pack JSON file ${index} has invalid path or size`);
    }
    if (seen.has(file.path)) throw new Error(`npm pack JSON contains duplicate file ${file.path}`);
    seen.add(file.path);
    return { path: file.path, size: file.size };
  });
  return {
    filename: candidate.filename,
    size: candidate.size,
    unpackedSize: candidate.unpackedSize,
    files,
  };
}

export function classifyPackedPath(path: string): PackedCategory {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wasm")) return "wasm";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".map")) return "maps";
  if (/\.d\.(?:c|m)?ts$/.test(lower)) return "declarations";
  if (/\.(?:c|m)?js$/.test(lower)) return "runtime-js";
  if (/\.(?:svelte|ts|tsx|jsx)$/.test(lower)) return "runtime-source";
  if (
    /(?:^|\/)(?:package\.json|license(?:\.[^/]*)?|readme(?:\.[^/]*)?|notice(?:\.[^/]*)?)$/i.test(
      path,
    )
  ) {
    return "metadata";
  }
  throw new Error(`Unclassified packed artifact: ${path}`);
}

export function summarizePack(name: string, result: PackResult): PackageReport {
  assertPublishedFilePolicy(
    name,
    result.files.map((file) => file.path),
  );
  const categories: Record<PackedCategory, number> = {
    css: 0,
    declarations: 0,
    maps: 0,
    metadata: 0,
    "runtime-js": 0,
    "runtime-source": 0,
    wasm: 0,
  };
  let fileBytes = 0;
  for (const file of result.files) {
    categories[classifyPackedPath(file.path)] += file.size;
    fileBytes += file.size;
  }
  if (fileBytes !== result.unpackedSize) {
    throw new Error(
      `${name} npm pack file bytes ${fileBytes} do not equal unpackedSize ${result.unpackedSize}`,
    );
  }
  return {
    name,
    tarballBytes: result.size,
    unpackedBytes: result.unpackedSize,
    fileCount: result.files.length,
    categories,
  };
}

export function compressedSizes(data: Uint8Array): {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
} {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

export async function walkLogicalBytes(root: string): Promise<{ bytes: number; files: number }> {
  const visitedDirectories = new Set<string>();
  const visitedFiles = new Set<string>();
  let bytes = 0;
  let files = 0;

  async function visit(path: string): Promise<void> {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      await visit(target);
      return;
    }
    if (entry.isDirectory()) {
      const canonical = await realpath(path);
      if (visitedDirectories.has(canonical)) return;
      visitedDirectories.add(canonical);
      const entries = await readdir(path);
      entries.sort();
      for (const name of entries) await visit(join(path, name));
      return;
    }
    if (!entry.isFile()) return;
    const canonical = await realpath(path);
    if (visitedFiles.has(canonical)) return;
    visitedFiles.add(canonical);
    bytes += entry.size;
    files += 1;
  }

  await visit(root);
  return { bytes, files };
}

export function validateBundlerEvidence(value: unknown): BundlerEvidence {
  if (value === null || typeof value !== "object") throw new Error("Bundler evidence is malformed");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SIZE_PROTOCOL_VERSION) {
    throw new Error(`Bundler evidence protocol mismatch: ${String(candidate.schemaVersion)}`);
  }
  if (!(["next", "vite", "webpack"] as unknown[]).includes(candidate.bundler)) {
    throw new Error(`Unknown bundler evidence owner: ${String(candidate.bundler)}`);
  }
  if (
    typeof candidate.version !== "string" ||
    candidate.version.length === 0 ||
    !Array.isArray(candidate.assets)
  ) {
    throw new Error("Bundler evidence has invalid version or assets");
  }
  const bundler = candidate.bundler as BundlerEvidence["bundler"];
  const seen = new Set<string>();
  const assets = candidate.assets.map((value, index) => {
    if (value === null || typeof value !== "object") {
      throw new Error(`${bundler} asset ${index} is malformed`);
    }
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.path !== "string" ||
      asset.path.length === 0 ||
      !(asset.kind === "javascript" || asset.kind === "css" || asset.kind === "wasm") ||
      typeof asset.owner !== "string" ||
      asset.owner.length === 0 ||
      asset.owner === "unclassified" ||
      !Array.isArray(asset.roles) ||
      asset.roles.length === 0 ||
      !asset.roles.every((role) => typeof role === "string" && role.length > 0)
    ) {
      throw new Error(`${bundler} asset ${index} is missing path, kind, owner, or roles`);
    }
    if (seen.has(asset.path)) throw new Error(`${bundler} contains duplicate asset ${asset.path}`);
    seen.add(asset.path);
    return {
      path: asset.path,
      kind: asset.kind,
      owner: asset.owner,
      roles: [...new Set(asset.roles as string[])].sort(),
    } as BundlerAsset;
  });
  for (const role of requiredBundlerRoles[bundler]) {
    if (!assets.some((asset) => asset.roles.includes(role))) {
      throw new Error(`${bundler} is missing required ${role} asset ownership`);
    }
  }
  if (!assets.some((asset) => asset.kind === "wasm")) {
    throw new Error(`${bundler} is missing a required WASM asset`);
  }
  const initialRoles = new Set(["core-initial", "react-initial", "vue-initial", "svelte-initial"]);
  for (const asset of assets) {
    if (
      (asset.roles.includes("worker-async") || asset.roles.includes("xlsx-async")) &&
      asset.roles.some((role) => initialRoles.has(role))
    ) {
      throw new Error(`${bundler} async asset ${asset.path} leaked into an initial entry`);
    }
  }

  if (candidate.provenance === null || typeof candidate.provenance !== "object") {
    throw new Error(`${bundler} is missing build provenance`);
  }
  const provenanceValue = candidate.provenance as Record<string, unknown>;
  const minifierValue = provenanceValue.minifier;
  if (
    typeof provenanceValue.buildMode !== "string" ||
    provenanceValue.buildMode.length === 0 ||
    typeof provenanceValue.minified !== "boolean" ||
    minifierValue === null ||
    typeof minifierValue !== "object" ||
    typeof (minifierValue as Record<string, unknown>).name !== "string" ||
    (minifierValue as Record<string, unknown>).name === "" ||
    typeof (minifierValue as Record<string, unknown>).version !== "string" ||
    (minifierValue as Record<string, unknown>).version === "" ||
    !Array.isArray(provenanceValue.externals) ||
    !provenanceValue.externals.every(
      (external) => typeof external === "string" && external.length > 0,
    ) ||
    typeof provenanceValue.target !== "string" ||
    provenanceValue.target.length === 0 ||
    provenanceValue.sourceMaps !== BUNDLER_SOURCE_MAP_MODE ||
    provenanceValue.attributionMethod !== ATTRIBUTION_METHOD
  ) {
    throw new Error(`${bundler} build provenance is malformed or unsupported`);
  }
  const externals = provenanceValue.externals as string[];
  if (new Set(externals).size !== externals.length) {
    throw new Error(`${bundler} build provenance contains duplicate externals`);
  }
  const provenance: BundlerProvenance = {
    buildMode: provenanceValue.buildMode,
    minified: provenanceValue.minified,
    minifier: {
      name: (minifierValue as Record<string, unknown>).name as string,
      version: (minifierValue as Record<string, unknown>).version as string,
    },
    externals: [...externals].sort(),
    target: provenanceValue.target,
    sourceMaps: provenanceValue.sourceMaps,
    attributionMethod: provenanceValue.attributionMethod,
  };

  if (!Array.isArray(candidate.attribution) || candidate.attribution.length === 0) {
    throw new Error(`${bundler} is missing module attribution`);
  }
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const seenEntries = new Set<string>();
  const attribution = candidate.attribution.map((value, entryIndex) => {
    if (value === null || typeof value !== "object") {
      throw new Error(`${bundler} attribution entry ${entryIndex} is malformed`);
    }
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.name !== "string" ||
      entry.name.length === 0 ||
      typeof entry.entry !== "string" ||
      entry.entry.length === 0 ||
      !Array.isArray(entry.eagerImports) ||
      entry.eagerImports.length === 0 ||
      !entry.eagerImports.every(
        (specifier) => typeof specifier === "string" && specifier.length > 0,
      ) ||
      !Array.isArray(entry.assets) ||
      entry.assets.length === 0 ||
      !entry.assets.every(
        (asset) =>
          asset !== null &&
          typeof asset === "object" &&
          typeof (asset as Record<string, unknown>).path === "string" &&
          ((asset as Record<string, unknown>).path as string).length > 0 &&
          typeof (asset as Record<string, unknown>).sha256 === "string" &&
          /^[a-f0-9]{64}$/.test((asset as Record<string, unknown>).sha256 as string),
      ) ||
      !isNonNegativeInteger(entry.generatedBytes) ||
      entry.generatedBytes === 0 ||
      !Array.isArray(entry.modules) ||
      entry.modules.length === 0
    ) {
      throw new Error(`${bundler} attribution entry ${entryIndex} is incomplete`);
    }
    if (seenEntries.has(entry.name)) {
      throw new Error(`${bundler} contains duplicate attribution entry ${entry.name}`);
    }
    seenEntries.add(entry.name);
    const attributedAssets = (entry.assets as Array<Record<string, unknown>>).map((asset) => ({
      path: asset.path as string,
      sha256: asset.sha256 as string,
    }));
    const attributedPaths = attributedAssets.map((asset) => asset.path);
    if (new Set(attributedPaths).size !== attributedPaths.length) {
      throw new Error(`${bundler} ${entry.name} contains duplicate attributed assets`);
    }
    for (const { path } of attributedAssets) {
      const asset = assetByPath.get(path);
      if (asset === undefined || asset.kind !== "javascript") {
        throw new Error(`${bundler} ${entry.name} attributes unknown JavaScript asset ${path}`);
      }
    }
    const seenModules = new Set<string>();
    const modules = entry.modules.map((value, moduleIndex) => {
      if (value === null || typeof value !== "object") {
        throw new Error(`${bundler} ${entry.name} module ${moduleIndex} is malformed`);
      }
      const module = value as Record<string, unknown>;
      if (
        typeof module.id !== "string" ||
        module.id.length === 0 ||
        typeof module.owner !== "string" ||
        module.owner.length === 0 ||
        module.owner === "unclassified" ||
        !(module.attribution === "source-map" || module.attribution === "opaque-asset") ||
        !isNonNegativeInteger(module.rawBytes) ||
        module.rawBytes === 0 ||
        !isNonNegativeInteger(module.gzipBytes) ||
        module.gzipBytes === 0 ||
        !isNonNegativeInteger(module.brotliBytes) ||
        module.brotliBytes === 0
      ) {
        throw new Error(`${bundler} ${entry.name} module ${moduleIndex} lacks ownership or sizes`);
      }
      const opaqueIdentity =
        module.owner === `${bundler}:opaque-framework` &&
        (module.id as string).startsWith(`${bundler}:opaque/`);
      if ((module.attribution === "opaque-asset") !== opaqueIdentity) {
        throw new Error(
          `${bundler} ${entry.name} module ${moduleIndex} has invalid opaque ownership`,
        );
      }
      if (seenModules.has(module.id)) {
        throw new Error(`${bundler} ${entry.name} contains duplicate module ${module.id}`);
      }
      seenModules.add(module.id);
      return {
        id: module.id,
        owner: module.owner,
        attribution: module.attribution,
        rawBytes: module.rawBytes,
        gzipBytes: module.gzipBytes,
        brotliBytes: module.brotliBytes,
      } as BundlerModuleAttribution;
    });
    const attributedBytes = modules.reduce((sum, module) => sum + module.rawBytes, 0);
    if (attributedBytes !== entry.generatedBytes) {
      throw new Error(
        `${bundler} ${entry.name} module bytes ${attributedBytes} do not equal generated bytes ${entry.generatedBytes}`,
      );
    }
    return {
      name: entry.name,
      entry: entry.entry,
      eagerImports: [...new Set(entry.eagerImports as string[])].sort(),
      assets: attributedAssets.sort((left, right) => left.path.localeCompare(right.path)),
      generatedBytes: entry.generatedBytes,
      modules: modules.sort((left, right) => left.id.localeCompare(right.id)),
    } as BundlerEntryAttribution;
  });
  if (!seenEntries.has(COMPARABLE_ENTRY)) {
    throw new Error(`${bundler} is missing ${COMPARABLE_ENTRY} module attribution`);
  }
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler,
    version: candidate.version,
    assets,
    provenance,
    attribution,
  };
}

export function validateComparableAttribution(evidence: readonly BundlerEvidence[]): void {
  const byBundler = new Map(evidence.map((entry) => [entry.bundler, entry]));
  const next = byBundler.get("next");
  const vite = byBundler.get("vite");
  if (next === undefined || vite === undefined) {
    throw new Error("Comparable attribution requires both Next.js and Vite evidence");
  }
  for (const entry of [next, vite]) {
    if (
      entry.provenance.buildMode !== "production" ||
      entry.provenance.minified !== true ||
      entry.provenance.target !== "browser" ||
      entry.provenance.sourceMaps !== BUNDLER_SOURCE_MAP_MODE ||
      entry.provenance.attributionMethod !== ATTRIBUTION_METHOD
    ) {
      throw new Error(`${entry.bundler} attribution is not a minified production browser build`);
    }
  }
  for (const field of [
    "buildMode",
    "minified",
    "target",
    "sourceMaps",
    "attributionMethod",
  ] as const) {
    if (next.provenance[field] !== vite.provenance[field]) {
      throw new Error(`Next.js and Vite attribution differ in ${field}`);
    }
  }
  if (JSON.stringify(next.provenance.externals) !== JSON.stringify(vite.provenance.externals)) {
    throw new Error("Next.js and Vite attribution use incomparable externals");
  }
  const nextEntry = next.attribution.find((entry) => entry.name === COMPARABLE_ENTRY);
  const viteEntry = vite.attribution.find((entry) => entry.name === COMPARABLE_ENTRY);
  if (nextEntry === undefined || viteEntry === undefined) {
    throw new Error(`Comparable attribution is missing ${COMPARABLE_ENTRY}`);
  }
  if (JSON.stringify(nextEntry.eagerImports) !== JSON.stringify(viteEntry.eagerImports)) {
    throw new Error("Next.js and Vite first-paint eager imports differ");
  }
}
export function buildAttributionFindings(
  evidence: readonly BundlerEvidence[],
): AttributionFindings {
  validateComparableAttribution(evidence);
  const comparable = (bundler: "next" | "vite") => {
    const owner = evidence.find((entry) => entry.bundler === bundler);
    const entry = owner?.attribution.find((candidate) => candidate.name === COMPARABLE_ENTRY);
    if (owner === undefined || entry === undefined) {
      throw new Error(`Missing ${bundler} ${COMPARABLE_ENTRY} attribution`);
    }
    return { owner, entry };
  };
  const next = comparable("next");
  const vite = comparable("vite");
  const pairs = [next, vite] as const;
  const firstPaint = pairs.map(({ owner, entry }) => ({
    bundler: owner.bundler as "next" | "vite",
    generatedBytes: entry.generatedBytes,
    sheetwriteRawBytes: entry.modules
      .filter((module) => module.owner === "@sheetwrite/core")
      .reduce((sum, module) => sum + module.rawBytes, 0),
    rootBarrelRawBytes: entry.modules
      .filter(
        (module) =>
          module.owner === "@sheetwrite/core" &&
          /(?:^|\/)(?:dist\/index\.js|src\/index\.ts)$/.test(module.id),
      )
      .reduce((sum, module) => sum + module.rawBytes, 0),
    eagerImports: entry.eagerImports,
  }));
  const subpaths: AttributionFindings["subpaths"] = SUBPATH_CANDIDATES.map((subpath) => {
    const modulePattern = new RegExp(`(?:^|/)(?:dist/${subpath}\\.js|src/${subpath}\\.ts)$`);
    const retainedModules = pairs.map(({ owner, entry }) => {
      const modules = entry.modules.filter(
        (module) => module.owner === "@sheetwrite/core" && modulePattern.test(module.id),
      );
      return {
        bundler: owner.bundler as "next" | "vite",
        rawBytes: modules.reduce((sum, module) => sum + module.rawBytes, 0),
        brotliBytes: modules.reduce((sum, module) => sum + module.brotliBytes, 0),
      };
    });
    const retained = retainedModules.some((measurement) => measurement.rawBytes > 0);
    return {
      subpath,
      publicExportAdded: false,
      decision: retained ? "requires-isolated-subpath-proof" : "retain-root-export",
      reason: retained
        ? "The module is present in a comparable first-paint graph, but attribution alone does not prove the counterfactual bundle saving required for a public subpath."
        : "Neither comparable first-paint graph retains this module, so a dedicated public subpath has no measured initial-bundle benefit.",
      retainedModules,
      materialWinThreshold: { brotliBytes: 7680, percent: 10 },
    };
  });
  return {
    comparison: {
      entry: COMPARABLE_ENTRY,
      buildMode: next.owner.provenance.buildMode,
      minified: true,
      externals: next.owner.provenance.externals,
      target: next.owner.provenance.target,
      sourceMaps: next.owner.provenance.sourceMaps,
      attributionMethod: next.owner.provenance.attributionMethod,
      minifiers: {
        next: next.owner.provenance.minifier,
        vite: vite.owner.provenance.minifier,
      },
      fixtureAndConfigurationDifferences: pairs.map(({ owner, entry }) => ({
        bundler: owner.bundler as "next" | "vite",
        eagerImports: entry.eagerImports,
        nonSheetwriteRawBytes: entry.modules
          .filter((module) => module.owner !== "@sheetwrite/core")
          .reduce((sum, module) => sum + module.rawBytes, 0),
        opaqueFrameworkRawBytes: entry.modules
          .filter((module) => module.attribution === "opaque-asset")
          .reduce((sum, module) => sum + module.rawBytes, 0),
      })),
    },
    firstPaint,
    subpaths,
  };
}

function processEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  environment.CI = "1";
  environment.NEXT_TELEMETRY_DISABLED = "1";
  return environment;
}

async function runCommand(command: string[], cwd = repositoryRoot): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    env: processEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit code ${exitCode}\n${stdout.trim()}\n${stderr.trim()}`,
    );
  }
  return stdout;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function rewriteWorkspaceRanges(
  dependencies: Record<string, string> | undefined,
  versions: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith("workspace:")) return [name, range];
      const version = versions.get(name);
      if (version === undefined) throw new Error(`No workspace version found for ${name}`);
      return [name, version];
    }),
  );
}

async function copyManifestEntry(
  sourceRoot: string,
  packageRoot: string,
  entry: string,
): Promise<void> {
  if (!/[*?[\]{}]/u.test(entry)) {
    await cp(join(sourceRoot, entry), join(packageRoot, entry), { recursive: true });
    return;
  }
  const matches = Array.from(
    new Bun.Glob(entry).scanSync({
      cwd: sourceRoot,
      dot: true,
      onlyFiles: true,
      followSymlinks: false,
    }),
  );
  if (matches.length === 0) throw new Error(`Package file pattern matched nothing: ${entry}`);
  for (const path of matches) {
    const target = join(packageRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(sourceRoot, path), target);
  }
}

async function packPackages(temporaryRoot: string): Promise<PackedPackage[]> {
  const stageRoot = join(temporaryRoot, "stage");
  const tarballRoot = join(temporaryRoot, "tarballs");
  await Promise.all([
    mkdir(stageRoot, { recursive: true }),
    mkdir(tarballRoot, { recursive: true }),
  ]);
  const sourceManifests = await Promise.all(
    packageDirectories.map((directory) =>
      readJson<PackageManifest>(join(repositoryRoot, directory, "package.json")),
    ),
  );
  const versions = new Map(sourceManifests.map((manifest) => [manifest.name, manifest.version]));
  const packed: PackedPackage[] = [];

  for (let index = 0; index < packageDirectories.length; index += 1) {
    const directory = packageDirectories[index];
    const sourceManifest = sourceManifests[index];
    if (directory === undefined || sourceManifest === undefined)
      throw new Error("Package list mismatch");
    const sourceRoot = join(repositoryRoot, directory);
    const packageRoot = join(stageRoot, basename(directory));
    await mkdir(packageRoot, { recursive: true });
    for (const path of sourceManifest.files ?? []) {
      await copyManifestEntry(sourceRoot, packageRoot, path);
    }
    await cp(join(repositoryRoot, "LICENSE"), join(packageRoot, "LICENSE"));
    await cp(join(sourceRoot, "README.md"), join(packageRoot, "README.md"));
    const manifest: PackageManifest = {
      ...sourceManifest,
      dependencies: rewriteWorkspaceRanges(sourceManifest.dependencies, versions),
    };
    await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const output = await runCommand(
      ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
      packageRoot,
    );
    const result = parsePackJson(output);
    packed.push({
      name: manifest.name,
      tarballPath: join(tarballRoot, result.filename),
      report: summarizePack(manifest.name, result),
    });
  }
  return packed;
}

async function loadPackedArtifacts(
  artifactDirectory: string,
  temporaryRoot: string,
): Promise<PackedPackage[]> {
  const artifactRoot = resolve(artifactDirectory);
  const release = await verifyReleaseArtifacts(artifactRoot);
  const extractRoot = join(temporaryRoot, "artifact-packages");
  await mkdir(extractRoot, { recursive: true });
  const packed: PackedPackage[] = [];
  for (const artifact of release.packages) {
    const packageRoot = join(extractRoot, artifact.name.replaceAll("/", "-"));
    await mkdir(packageRoot, { recursive: true });
    const tarballPath = join(artifactRoot, artifact.path);
    await runCommand(["tar", "-xzf", tarballPath, "-C", packageRoot]);
    const files = await Promise.all(
      artifact.files.map(async (path) => ({
        path,
        size: (await stat(join(packageRoot, "package", path))).size,
      })),
    );
    packed.push({
      name: artifact.name,
      tarballPath,
      report: summarizePack(artifact.name, {
        filename: artifact.path,
        size: artifact.bytes,
        unpackedSize: artifact.unpackedBytes,
        files,
      }),
    });
  }
  return packed;
}

async function sumPackageFiles(packageRoot: string): Promise<number> {
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) bytes += (await stat(path)).size;
    }
  }
  await visit(packageRoot);
  return bytes;
}

async function measureClosure(
  name: string,
  dependencyNames: readonly string[],
  packed: ReadonlyMap<string, string>,
  temporaryRoot: string,
  sequence: number,
): Promise<ClosureReport> {
  const consumerRoot = join(temporaryRoot, `closure-${name}-${sequence}`);
  await cp(join(repositoryRoot, "test/release-locks", name), consumerRoot, { recursive: true });
  const artifactRoot = join(consumerRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  const closureTarballs = new Map<string, string>();
  for (const packageName of dependencyNames) {
    const tarball = packed.get(packageName);
    if (tarball === undefined) throw new Error(`No packed tarball for ${packageName}`);
    closureTarballs.set(packageName, tarball);
    await cp(tarball, join(artifactRoot, basename(tarball)));
  }
  await bindCanonicalTarballIntegrities(join(consumerRoot, "package-lock.json"), closureTarballs);
  await runCommand(
    ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"],
    consumerRoot,
  );
  const lock = await readJson<{ packages?: Record<string, unknown> }>(
    join(consumerRoot, "package-lock.json"),
  );
  if (lock.packages === undefined)
    throw new Error(`${name} committed lockfile has no package graph`);
  const packagePaths = Object.keys(lock.packages)
    .filter((path) => /(?:^|\/)node_modules\//.test(path))
    .sort();
  const seen = new Set<string>();
  const packageNames: string[] = [];
  let logicalBytes = 0;
  for (const lockPath of packagePaths) {
    const packageRoot = join(consumerRoot, lockPath);
    const canonical = await realpath(packageRoot);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const manifest = await readJson<{ name?: unknown; version?: unknown }>(
      join(packageRoot, "package.json"),
    );
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`${name} installed package at ${lockPath} has malformed identity`);
    }
    packageNames.push(`${manifest.name}@${manifest.version}`);
    logicalBytes += await sumPackageFiles(packageRoot);
  }
  packageNames.sort();
  if (name !== "core-xlsx") {
    const leaked = packageNames.filter((identity) => {
      const packageName = identity.split("@").slice(0, -1).join("@");
      return xlsxCodecPackages[packageName] === true;
    });
    if (leaked.length > 0)
      throw new Error(`${name} runtime closure contains XLSX codec packages: ${leaked.join(", ")}`);
  }
  return { name, packageCount: packageNames.length, logicalBytes, packages: packageNames };
}

function addMetric(
  metrics: Record<string, Metric>,
  key: string,
  actual: number,
  unit: MetricUnit,
  category: string,
  owner: string,
): void {
  if (metrics[key] !== undefined) throw new Error(`Duplicate size metric ${key}`);
  if (!isNonNegativeInteger(actual)) throw new Error(`Metric ${key} is non-finite or malformed`);
  metrics[key] = { actual, unit, category, owner };
}

async function loadBundlerEvidence(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<BundlerEvidence[]> {
  if (!reuseBundlers) {
    const command = ["node", "test/bundler-fixtures/run.mjs"];
    if (artifactDirectory !== undefined) command.push("--artifacts", resolve(artifactDirectory));
    await runCommand(command);
  }
  const evidence: BundlerEvidence[] = [];
  for (const bundler of ["vite", "webpack", "next"] as const) {
    const path = join(bundlerEvidenceRoot, `${bundler}.json`);
    evidence.push(validateBundlerEvidence(await readJson<unknown>(path)));
  }
  validateComparableAttribution(evidence);
  return evidence;
}

async function reportAsset(asset: BundlerAsset): Promise<AssetReport> {
  const absolutePath = resolve(repositoryRoot, asset.path);
  if (!absolutePath.startsWith(`${repositoryRoot}${sep}`)) {
    throw new Error(`Bundler asset escapes repository root: ${asset.path}`);
  }
  const content = await readFile(absolutePath);
  const compressed = compressedSizes(content);
  return {
    ...asset,
    ...compressed,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
export function assertAttributionAssetsFresh(
  evidence: Pick<BundlerEvidence, "bundler" | "attribution">,
  assets: readonly Pick<AssetReport, "path" | "rawBytes" | "sha256">[],
): void {
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  for (const entry of evidence.attribution) {
    let generatedBytes = 0;
    for (const attributed of entry.assets) {
      const asset = assetByPath.get(attributed.path);
      if (asset === undefined) {
        throw new Error(
          `${evidence.bundler} ${entry.name} attribution asset disappeared: ${attributed.path}`,
        );
      }
      if (asset.sha256 !== attributed.sha256) {
        throw new Error(
          `${evidence.bundler} ${entry.name} attribution asset SHA-256 changed: ${attributed.path}`,
        );
      }
      generatedBytes += asset.rawBytes;
    }
    if (generatedBytes !== entry.generatedBytes) {
      throw new Error(
        `${evidence.bundler} ${entry.name} generated bytes changed after attribution`,
      );
    }
  }
}

function metricSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase());
}

export function addPackageSizeMetrics(
  metrics: Record<string, Metric>,
  report: PackageReport,
): void {
  const prefix = `package.${report.name}`;
  addMetric(
    metrics,
    `${prefix}.tarballBytes`,
    report.tarballBytes,
    "bytes",
    "package-tarball",
    report.name,
  );
  addMetric(
    metrics,
    `${prefix}.unpackedBytes`,
    report.unpackedBytes,
    "bytes",
    "package-unpacked",
    report.name,
  );
  addMetric(
    metrics,
    `${prefix}.fileCount`,
    report.fileCount,
    "count",
    "package-files",
    report.name,
  );
  for (const [category, bytes] of Object.entries(report.categories).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    addMetric(
      metrics,
      `${prefix}.${metricSegment(category)}Bytes`,
      bytes,
      "bytes",
      `package-unpacked-${category}`,
      report.name,
    );
  }
}

async function buildSizeReport(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<SizeReport> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-size-report-"));
  try {
    const packedPackages =
      artifactDirectory === undefined
        ? await packPackages(temporaryRoot)
        : await loadPackedArtifacts(artifactDirectory, temporaryRoot);
    const tarballs = new Map(packedPackages.map((entry) => [entry.name, entry.tarballPath]));
    const closureSpecs: Array<[string, string[]]> = [
      ["core", ["@sheetwrite/wasm", "@sheetwrite/core"]],
      ["react", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/react"]],
      ["vue", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/vue"]],
      ["svelte", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/svelte"]],
      ["core-xlsx", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/xlsx"]],
    ];
    const closures = await Promise.all(
      closureSpecs.map(([name, names], index) =>
        measureClosure(name, names, tarballs, temporaryRoot, index),
      ),
    );
    const repeatedCore = await measureClosure(
      "core",
      closureSpecs[0]?.[1] ?? [],
      tarballs,
      temporaryRoot,
      closureSpecs.length,
    );
    const core = closures[0];
    if (
      core === undefined ||
      core.packageCount !== repeatedCore.packageCount ||
      core.logicalBytes !== repeatedCore.logicalBytes ||
      JSON.stringify(core.packages) !== JSON.stringify(repeatedCore.packages)
    ) {
      throw new Error("Repeated core clean-install closure measurement was not deterministic");
    }

    const bundlerEvidence = await loadBundlerEvidence(reuseBundlers, artifactDirectory);
    const attributionFindings = buildAttributionFindings(bundlerEvidence);
    const bundlers: SizeReport["bundlers"] = [];
    for (const evidence of bundlerEvidence) {
      const assets = await Promise.all(evidence.assets.map(reportAsset));
      assets.sort((left, right) => left.path.localeCompare(right.path));
      assertAttributionAssetsFresh(evidence, assets);
      bundlers.push({
        name: evidence.bundler,
        version: evidence.version,
        provenance: evidence.provenance,
        attribution: evidence.attribution,
        assets,
      });
    }
    bundlers.sort((left, right) => left.name.localeCompare(right.name));

    const metrics: Record<string, Metric> = {};
    for (const entry of packedPackages) addPackageSizeMetrics(metrics, entry.report);
    for (const closure of closures) {
      const prefix = `closure.${closure.name}`;
      addMetric(
        metrics,
        `${prefix}.packageCount`,
        closure.packageCount,
        "count",
        "install-closure",
        closure.name,
      );
      addMetric(
        metrics,
        `${prefix}.logicalBytes`,
        closure.logicalBytes,
        "bytes",
        "install-closure",
        closure.name,
      );
      const codecPackageCount = closure.packages.filter((identity) => {
        const packageName = identity.split("@").slice(0, -1).join("@");
        return xlsxCodecPackages[packageName] === true;
      }).length;
      if (closure.name !== "core-xlsx") {
        addMetric(
          metrics,
          `${prefix}.xlsxCodecPackageCount`,
          codecPackageCount,
          "count",
          "optional-dependency-isolation",
          closure.name,
        );
      }
    }
    for (const bundler of bundlers) {
      const roles = [...new Set(bundler.assets.flatMap((asset) => asset.roles))].sort();
      for (const role of roles) {
        for (const kind of ["javascript", "css", "wasm"] as const) {
          const selected = bundler.assets.filter(
            (asset) => asset.kind === kind && asset.roles.includes(role),
          );
          if (selected.length === 0) continue;
          const prefix = `bundler.${bundler.name}.${metricSegment(role)}.${kind}`;
          addMetric(
            metrics,
            `${prefix}.rawBytes`,
            selected.reduce((sum, asset) => sum + asset.rawBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.gzipBytes`,
            selected.reduce((sum, asset) => sum + asset.gzipBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.brotliBytes`,
            selected.reduce((sum, asset) => sum + asset.brotliBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
        }
      }
    }
    for (const entry of attributionFindings.firstPaint) {
      addMetric(
        metrics,
        `attribution.${entry.bundler}.coreFirstPaint.sheetwriteRawBytes`,
        entry.sheetwriteRawBytes,
        "bytes",
        "browser-module-attribution",
        `${entry.bundler}:@sheetwrite/core`,
      );
      addMetric(
        metrics,
        `attribution.${entry.bundler}.coreFirstPaint.rootBarrelRawBytes`,
        entry.rootBarrelRawBytes,
        "bytes",
        "browser-module-attribution",
        `${entry.bundler}:@sheetwrite/core`,
      );
    }
    for (const candidate of attributionFindings.subpaths) {
      for (const retained of candidate.retainedModules) {
        addMetric(
          metrics,
          `attribution.${retained.bundler}.${candidate.subpath}.rawBytes`,
          retained.rawBytes,
          "bytes",
          "browser-module-attribution",
          `${retained.bundler}:@sheetwrite/core/${candidate.subpath}`,
        );
        addMetric(
          metrics,
          `attribution.${retained.bundler}.${candidate.subpath}.brotliBytes`,
          retained.brotliBytes,
          "bytes",
          "browser-module-attribution",
          `${retained.bundler}:@sheetwrite/core/${candidate.subpath}`,
        );
      }
    }
    for (const [name, path] of [
      ["styles", join(repositoryRoot, "packages/core/styles.css")],
      ["shell", join(repositoryRoot, "packages/core/shell.css")],
    ] as const) {
      const sizes = compressedSizes(await readFile(path));
      for (const [metric, value] of Object.entries(sizes)) {
        addMetric(
          metrics,
          `css.${name}.${metric}`,
          value,
          "bytes",
          "browser-css",
          `@sheetwrite/core/${name}.css`,
        );
      }
    }

    const npmVersion = (await runCommand(["npm", "--version"])).trim();

    return {
      schemaVersion: SIZE_PROTOCOL_VERSION,
      protocolVersion: SIZE_PROTOCOL_VERSION,
      tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
      meta: {
        commit: (await runCommand(["git", "rev-parse", "HEAD"])).trim(),
        dirty:
          (await runCommand(["git", "status", "--porcelain", "--untracked-files=no"])).trim()
            .length > 0,
        timestamp: new Date().toISOString(),
      },
      toolchain: {
        bun: Bun.version,
        next: bundlers.find((entry) => entry.name === "next")?.version ?? "missing",
        node: process.versions.node,
        npm: npmVersion,
        vite: bundlers.find((entry) => entry.name === "vite")?.version ?? "missing",
        webpack: bundlers.find((entry) => entry.name === "webpack")?.version ?? "missing",
      },
      metrics: Object.fromEntries(
        Object.entries(metrics).sort(([left], [right]) => left.localeCompare(right)),
      ),
      packages: packedPackages
        .map((entry) => entry.report)
        .sort((left, right) => left.name.localeCompare(right.name)),
      closures: closures.sort((left, right) => left.name.localeCompare(right.name)),
      bundlers,
      attributionFindings,
      reproduction: "bun run size:report",
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function formatMetricDisplay(
  metric: Pick<Metric, "actual" | "unit">,
): readonly [value: string, unit: string] {
  if (metric.unit === "count") return [metric.actual.toLocaleString("en-US"), "count"];
  if (metric.actual >= 1024 ** 3) return [(metric.actual / 1024 ** 3).toFixed(2), "GiB"];
  if (metric.actual >= 1024 ** 2) return [(metric.actual / 1024 ** 2).toFixed(2), "MiB"];
  if (metric.actual >= 1024) return [(metric.actual / 1024).toFixed(1), "KiB"];
  return [metric.actual.toLocaleString("en-US"), "B"];
}

export function formatMetricDelta(
  current: Pick<Metric, "actual" | "unit">,
  previous: Pick<Metric, "actual" | "unit"> | undefined,
): readonly [change: string, percentage: string] {
  if (previous === undefined || previous.unit !== current.unit) return ["not tracked", "—"];
  const delta = current.actual - previous.actual;
  const [magnitude, unit] = formatMetricDisplay({ actual: Math.abs(delta), unit: current.unit });
  const change = delta === 0 ? `0 ${unit}` : `${delta > 0 ? "+" : "-"}${magnitude} ${unit}`;
  const percentage =
    previous.actual === 0
      ? current.actual === 0
        ? "0.0%"
        : "new"
      : `${delta >= 0 ? "+" : ""}${((delta / previous.actual) * 100).toFixed(1)}%`;
  return [change, percentage];
}

export function formatTable(report: SizeReport): string {
  const rows = ["metric\tactual\tunit"];
  for (const [key, metric] of Object.entries(report.metrics)) {
    const [value, unit] = formatMetricDisplay(metric);
    rows.push(`${key}\t${value}\t${unit}`);
  }
  return rows.join("\n");
}

export function formatReleaseComparison(
  current: Record<string, Pick<Metric, "actual" | "unit">>,
  baseline: SizeReleaseSnapshot,
): string {
  const rows = [`metric\tcurrent\tunit\tchange vs v${baseline.version}\tchange %`];
  for (const [key, previous] of Object.entries(baseline.metrics)) {
    const metric = current[key];
    if (metric === undefined || metric.unit !== previous.unit) continue;
    const [value, unit] = formatMetricDisplay(metric);
    const [change, percentage] = formatMetricDelta(metric, previous);
    rows.push(`${key}\t${value}\t${unit}\t${change}\t${percentage}`);
  }
  return rows.join("\n");
}

export function formatSizeHistory(history: SizeHistory): string {
  const rows: string[] = [];
  for (let index = 1; index < history.releases.length; index += 1) {
    const previous = history.releases[index - 1]!;
    const current = history.releases[index]!;
    rows.push(`v${previous.version} → v${current.version}`);
    rows.push(formatReleaseComparison(current.metrics, previous));
  }
  return rows.length === 0
    ? "No release-to-release size comparison is available."
    : rows.join("\n\n");
}

function assertReleaseVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

export async function capturePublishedRelease(version: string): Promise<SizeReleaseSnapshot> {
  assertReleaseVersion(version);
  const metrics: SizeReleaseSnapshot["metrics"] = {};
  for (const directory of packageDirectories) {
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, directory, "package.json"), "utf8"),
    ) as PackageManifest;
    const metadataResponse = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(version)}`,
    );
    if (!metadataResponse.ok) {
      throw new Error(`Published package not found: ${manifest.name}@${version}`);
    }
    const metadata = (await metadataResponse.json()) as {
      dist?: { fileCount?: number; tarball?: string; unpackedSize?: number };
      version?: string;
    };
    if (
      metadata.version !== version ||
      !metadata.dist?.tarball ||
      !isNonNegativeInteger(metadata.dist.fileCount) ||
      !isNonNegativeInteger(metadata.dist.unpackedSize)
    ) {
      throw new Error(`Incomplete registry size metadata: ${manifest.name}@${version}`);
    }
    const tarballResponse = await fetch(metadata.dist.tarball);
    if (!tarballResponse.ok) throw new Error(`Cannot download ${manifest.name}@${version}`);
    const prefix = `package.${manifest.name}`;
    metrics[`${prefix}.tarballBytes`] = {
      actual: (await tarballResponse.arrayBuffer()).byteLength,
      unit: "bytes",
    };
    metrics[`${prefix}.unpackedBytes`] = {
      actual: metadata.dist.unpackedSize,
      unit: "bytes",
    };
    metrics[`${prefix}.fileCount`] = {
      actual: metadata.dist.fileCount,
      unit: "count",
    };
  }
  return {
    version,
    capturedAt: new Date().toISOString(),
    source: "npm registry published artifacts",
    metrics,
  };
}
export function validateSizeHistory(value: unknown): SizeHistory {
  if (typeof value !== "object" || value === null) throw new Error("Invalid size history");
  const candidate = value as Partial<SizeHistory>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.releases)) {
    throw new Error("Invalid size history schema");
  }
  const versions = new Set<string>();
  for (const release of candidate.releases) {
    if (
      typeof release !== "object" ||
      release === null ||
      typeof release.version !== "string" ||
      typeof release.source !== "string" ||
      typeof release.metrics !== "object" ||
      release.metrics === null
    ) {
      throw new Error("Invalid size history release");
    }
    if (versions.has(release.version))
      throw new Error(`Duplicate size release: ${release.version}`);
    versions.add(release.version);
    for (const [key, metric] of Object.entries(release.metrics)) {
      if (
        typeof key !== "string" ||
        typeof metric !== "object" ||
        metric === null ||
        !Number.isFinite(metric.actual) ||
        (metric.unit !== "bytes" && metric.unit !== "count")
      ) {
        throw new Error(`Invalid size history metric: ${release.version}/${key}`);
      }
    }
  }
  return candidate as SizeHistory;
}

async function readSizeHistory(): Promise<SizeHistory> {
  return validateSizeHistory(await readJson<unknown>(historyPath));
}

async function recordRelease(history: SizeHistory, release: SizeReleaseSnapshot): Promise<void> {
  if (history.releases.some((entry) => entry.version === release.version)) {
    throw new Error(`Size history already contains v${release.version}`);
  }
  const updated: SizeHistory = {
    schemaVersion: 1,
    releases: [...history.releases, release],
  };
  await writeFile(historyPath, `${JSON.stringify(updated, null, 2)}\n`);
  await runCommand(["bunx", "biome", "format", "--write", historyPath]);
}

async function writeReport(report: SizeReport): Promise<void> {
  await rm(join(import.meta.dir, "size-report-failure.json"), { force: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await runCommand(["bunx", "biome", "format", "--write", reportPath]);
}

async function writeFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(
    join(import.meta.dir, "size-report-failure.json"),
    `${JSON.stringify(
      {
        schemaVersion: SIZE_PROTOCOL_VERSION,
        tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
        error: message,
        reproduction: "bun run size:report",
      },
      null,
      2,
    )}\n`,
  );
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function cli(): Promise<void> {
  const mode = process.argv[2] ?? "report";
  const reuseBundlers = process.argv.includes("--reuse-bundlers");
  const artifactDirectory = optionValue("--artifacts");
  try {
    if (mode !== "report" && mode !== "history" && mode !== "record") {
      throw new Error(`Unknown size-report mode: ${mode}`);
    }
    const history = await readSizeHistory();
    if (mode === "history") {
      console.log(formatSizeHistory(history));
      return;
    }
    if (mode === "record") {
      const version = optionValue("--version");
      if (version === undefined) throw new Error("record mode requires --version");
      if (history.releases.some((release) => release.version === version)) {
        console.log(
          `Published v${version} is already present in ${relative(repositoryRoot, historyPath)}`,
        );
        return;
      }
      const release = await capturePublishedRelease(version);
      await recordRelease(history, release);
      console.log(`Recorded published v${version} in ${relative(repositoryRoot, historyPath)}`);
      return;
    }
    if (artifactDirectory?.startsWith("--")) {
      throw new Error("--artifacts requires a directory");
    }
    const requiredArtifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
    if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifactDirectory === undefined) {
      throw new Error("Artifact-only size reporting requires --artifacts");
    }
    if (
      requiredArtifacts !== undefined &&
      (artifactDirectory === undefined || resolve(artifactDirectory) !== resolve(requiredArtifacts))
    ) {
      throw new Error("Size report artifact input differs from the canonical artifact set");
    }
    const report = await buildSizeReport(reuseBundlers, artifactDirectory);
    await writeReport(report);
    console.log(formatTable(report));
    const baseline = history.releases.at(-1);
    if (baseline !== undefined) {
      console.log(
        `\nCurrent workspace vs latest published release:\n${formatReleaseComparison(report.metrics, baseline)}`,
      );
    }
    console.log(`JSON report: ${relative(repositoryRoot, reportPath)}`);
    if (artifactDirectory !== undefined) {
      console.log(
        `Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifactDirectory)}`,
      );
    }
  } catch (error) {
    await writeFailure(error);
    throw error;
  }
}

if (import.meta.main) await cli();
