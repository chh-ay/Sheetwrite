import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import * as ts from "typescript-compiler";
import {
  collectFenceHovers,
  formatDeclaration,
  formatTypeExpression,
  isHighQualityHover,
} from "../docs/src/lib/sheetwrite-code-hovers.js";
import { SheetwriteTypeEngine } from "../docs/src/lib/sheetwrite-type-engine.js";
import {
  type ApiEntryPoint,
  type ApiExport,
  type ApiPackage,
  analyzePublicApi,
  type PublicApiManifest,
} from "./public-api.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const contentRoot = join(repositoryRoot, "docs/src/content/docs");
const generatedDataRoot = join(repositoryRoot, "docs/src/generated");
const generatedManifestPath = join(generatedDataRoot, "public-api.json");
const docsContractPath = join(generatedDataRoot, "docs-contract.json");

export const MIGRATION_ROUTES = {
  "docs/README.md": "/docs/start/installation/",
  "docs/getting-started.md": "/docs/start/installation/",
  "docs/concepts.md": "/docs/concepts/runtime-ownership/",
  "docs/configuration.md": "/docs/guides/configuration/",
  "docs/framework-integration.md": "/docs/frameworks/lifecycle/",
  "docs/interaction.md": "/docs/guides/interaction/",
  "docs/data-operations.md": "/docs/guides/data-operations/",
  "docs/formulas.md": "/docs/guides/formulas/",
  "docs/collaboration.md": "/docs/guides/collaboration/",
  "docs/worker-rendering.md": "/docs/guides/worker-rendering/",
  "docs/styling.md": "/docs/guides/styling/",
  "docs/accessibility.md": "/docs/guides/accessibility/",
} as const;

const PACKAGE_DIRECTORIES: Readonly<Record<string, string>> = {
  "@sheetwrite/core": "packages/core",
  "@sheetwrite/react": "packages/react",
  "@sheetwrite/svelte": "packages/svelte",
  "@sheetwrite/vue": "packages/vue",
  "@sheetwrite/wasm": "packages/wasm",
  "@sheetwrite/xlsx": "packages/xlsx",
};

const REQUIRED_SEARCH_TARGETS = [
  { term: "rendererKind", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  {
    term: "onGridChange",
    packageName: "@sheetwrite/core",
    subpath: "./adapter",
    owner: "GridAdapterEventHandlers",
  },
  { term: "applyTransaction", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  { term: "getCellAtPoint", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
] as const;

const REQUIRED_SEARCH_TERMS = [
  "rendererKind",
  "onGridChange",
  "applyTransaction",
  "SnapshotValidationError",
  "toXlsxWorkbook",
] as const;

const FORBIDDEN_NAMES = [
  "LegacyDataSource",
  "setXlsxBackend",
  "setXlsxImportBackend",
  "toXlsx(",
  "fromXlsx(",
] as const;

interface ExpectedFile {
  path: string;
  content: string;
}

interface MarkdownDocument {
  path: string;
  content: string;
}

interface Fence {
  language: string;
  meta: string;
  code: string;
  line: number;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function entrySlug(packageName: string, subpath: string): string {
  const packageSlug = packageName.replace("@sheetwrite/", "");
  if (subpath === ".") return packageSlug;
  return `${packageSlug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function packageSourcePath(packageName: string, source: string): string {
  const separator = source.indexOf("#");
  const file = separator === -1 ? source : source.slice(0, separator);
  const fragment = separator === -1 ? undefined : source.slice(separator + 1);
  const packageDirectory = PACKAGE_DIRECTORIES[packageName];
  if (packageDirectory === undefined) return source;
  const normalized = posix(normalize(join(packageDirectory, file)));
  return fragment === undefined ? normalized : `${normalized}#${fragment}`;
}

function entryLabel(pkg: ApiPackage, entry: ApiEntryPoint): string {
  return entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}`;
}

function frontmatter(title: string, description: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
}

interface DeclarationMember {
  name: string;
  signature: string;
}

interface DeclarationShape {
  formatted: string;
  members: DeclarationMember[];
  variants: string[];
}

function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function documentationMarkdown(pkg: ApiPackage, entry: ApiEntryPoint, item: ApiExport): string {
  const documentation =
    item.documentation.trim() || "Source summary unavailable; docs:check rejects this omission.";
  return documentation.replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const linked = entry.exports.find((candidate) => candidate.name === target);
      return linked === undefined
        ? `\`${text}\``
        : `[\`${text}\`](${symbolRoute(pkg, entry, linked)})`;
    },
  );
}

function memberDocumentationHtml(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  documentation: string,
): string {
  return html(documentation).replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const linked = entry.exports.find((candidate) => candidate.name === target);
      return linked === undefined
        ? `<code>${text}</code>`
        : `<a href="${symbolRoute(pkg, entry, linked)}"><code>${text}</code></a>`;
    },
  );
}

function compactSummary(markdown: string): string {
  const plain = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = /^.{24,240}?[.!?](?=\s|$)/.exec(plain)?.[0];
  if (firstSentence !== undefined) return firstSentence;
  if (plain.length <= 220) return plain;
  const clipped = plain.slice(0, 217);
  return `${clipped.slice(0, clipped.lastIndexOf(" "))}…`;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  class: "Classes",
  enum: "Enums",
  function: "Functions",
  interface: "Interfaces",
  type: "Types",
  variable: "Variables",
};

function anchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const DECLARATION_KEYWORD =
  /^(?:declare|export|abstract|interface|type|class|enum|function|const|let|var|namespace)\b/;

/** Bare call-signature or type strings from the checker are not statements; wrap them so the TS parser and printer cannot mangle them. */
function parseableDeclaration(item: Pick<ApiExport, "name" | "signature">): string {
  const signature = item.signature.trim();
  if (DECLARATION_KEYWORD.test(signature)) return signature;
  if (signature.startsWith("<") || signature.startsWith("(")) {
    return `declare function ${item.name}${signature};`;
  }
  return `declare const ${item.name}: ${signature};`;
}

function declarationShape(signature: string): DeclarationShape {
  const source = ts.createSourceFile(
    "api.d.ts",
    signature,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = source.statements[0];
  if (declaration === undefined) return { formatted: signature, members: [], variants: [] };
  const formatted = ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printNode(ts.EmitHint.Unspecified, declaration, source);

  const memberNodes =
    ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration)
      ? declaration.members
      : ts.isTypeAliasDeclaration(declaration) && ts.isTypeLiteralNode(declaration.type)
        ? declaration.type.members
        : [];
  const members = memberNodes.map((member, index) => {
    const named = member as ts.NamedDeclaration;
    const name =
      named.name === undefined
        ? ts.isConstructorDeclaration(member)
          ? "constructor"
          : ts.isCallSignatureDeclaration(member)
            ? "call"
            : ts.isConstructSignatureDeclaration(member)
              ? "new"
              : ts.isIndexSignatureDeclaration(member)
                ? "index"
                : `member-${index + 1}`
        : named.name.getText(source).replace(/^["']|["']$/g, "");
    return {
      name,
      signature: member.getText(source).replace(/\s+/g, " ").trim(),
    };
  });
  const variants =
    ts.isTypeAliasDeclaration(declaration) && ts.isUnionTypeNode(declaration.type)
      ? declaration.type.types.map((variant) => variant.getText(source).replace(/\s+/g, " ").trim())
      : [];
  return { formatted, members, variants };
}

async function renderDeclaration(signature: string, expanded: boolean): Promise<string> {
  // Pretty-printed so long unions wrap per variant instead of scrolling; no
  // fence title - the surrounding "Declaration" heading already names it.
  const formatted = await formatDeclaration(signature);
  if (expanded) {
    return [
      '<div class="api-declaration-open" data-pagefind-ignore>',
      "",
      "```ts generated",
      formatted,
      "```",
      "",
      "</div>",
    ].join("\n");
  }
  return [
    '<details class="api-declaration" data-pagefind-ignore>',
    "<summary>View full TypeScript declaration</summary>",
    "",
    "```ts generated",
    formatted,
    "```",
    "",
    "</details>",
  ].join("\n");
}

function renderMembers(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  members: readonly DeclarationMember[],
): string {
  const searchTargets = new Set<string>(
    REQUIRED_SEARCH_TARGETS.filter(
      (target) =>
        target.packageName === pkg.name &&
        target.subpath === entry.subpath &&
        target.owner === item.name,
    ).map(({ term }) => term),
  );
  const memberDocs = new Map(item.memberDocs.map((member) => [member.name, member.documentation]));
  const documented = new Set<string>();
  const rows = members.map((member, index) => {
    const id = `${anchor(item.name)}-${anchor(member.name) || index + 1}`;
    const searchAnchor = searchTargets.has(member.name)
      ? `<h3 id="${member.name.toLowerCase()}" class="api-search-anchor">${html(member.name)}</h3>`
      : "";
    // Overload rows repeat a member name; the merged documentation renders once,
    // on the first row. Distinct per-overload docs need AST-ordinal extraction and
    // wait until the public surface actually contains such a case.
    const documentation = documented.has(member.name) ? undefined : memberDocs.get(member.name);
    if (documentation !== undefined) documented.add(member.name);
    const summary = documentation === undefined ? "" : compactSummary(documentation);
    const summaryDoc =
      documentation === undefined
        ? ""
        : ` <span class="api-member-summary">${memberDocumentationHtml(pkg, entry, summary)}</span>`;
    return [
      searchAnchor,
      `<details class="api-member" id="${id}" data-pagefind-weight="${searchTargets.has(member.name) ? "10" : "1"}">`,
      `<summary><code>${html(member.name)}</code>${summaryDoc}</summary>`,
      "",
      // A fenced block so member signatures get real syntax highlighting.
      "```ts generated",
      member.signature,
      "```",
      "",
      // Skip the body paragraph when it would only restate the summary line.
      ...(documentation === undefined ||
      documentation.replace(/`/g, "").replace(/\s+/g, " ").trim() === summary
        ? []
        : [`<p class="api-member-doc">${memberDocumentationHtml(pkg, entry, documentation)}</p>`]),
      "</details>",
    ].join("\n");
  });
  return [
    `## Members <span class="api-count" data-pagefind-ignore>${members.length}</span>`,
    "",
    '<div class="api-member-list">',
    ...rows,
    "</div>",
  ].join("\n");
}

function symbolRoute(pkg: ApiPackage, entry: ApiEntryPoint, item: ApiExport): string {
  return `/docs/api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}/`;
}

export async function renderSymbolPage(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
): Promise<string> {
  const label = entryLabel(pkg, entry);
  const source = packageSourcePath(pkg.name, item.source);
  const summary = documentationMarkdown(pkg, entry, item);
  const description = compactSummary(summary);
  const shape = declarationShape(parseableDeclaration(item));
  const body = [
    frontmatter(`${item.name} | ${label}`, description).trimEnd(),
    `<!-- api-export:${pkg.name}|${entry.subpath}|${item.name} -->`,
    `<div class="api-pagehead"><a class="api-backlink" href="/docs/api/${entrySlug(pkg.name, entry.subpath)}/">${html(label)}</a><span class="api-status" data-kind="${item.kind}">${item.kind}</span></div>`,
    "",
    summary,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    `<div><dt>Package</dt><dd><code>${html(label)}</code></dd></div>`,
    `<div><dt>Source</dt><dd><code>${html(source)}</code></dd></div>`,
    "</dl>",
    "",
  ];
  if (shape.members.length > 0) {
    body.push(renderMembers(pkg, entry, item, shape.members), "");
  }
  // A variants section earns its space only for structured unions; scalar
  // unions read best inline in the (expanded) declaration, where identifiers
  // are highlighted, hoverable, and linked.
  const structuredVariants = shape.variants.some((variant) => variant.includes("{"))
    ? shape.variants
    : [];
  if (structuredVariants.length > 0) {
    body.push(
      `## Variants <span class="api-count" data-pagefind-ignore>${structuredVariants.length}</span>`,
      "",
      '<div class="api-variant-list" data-pagefind-ignore>',
    );
    for (const variant of structuredVariants) {
      body.push(
        '<div class="api-variant">',
        "",
        "```ts generated",
        await formatTypeExpression(variant),
        "```",
        "",
        "</div>",
      );
    }
    body.push("</div>", "");
  }
  // One consistent model: the code section is always "Declaration", always
  // pretty-printed. It collapses only when Members/Variants already tell the
  // story above it; otherwise it is the page's primary content and expands.
  body.push(
    "## Declaration",
    "",
    await renderDeclaration(
      // `declare` is parser scaffolding, not information a reader needs.
      shape.formatted.replace(/^declare /, ""),
      shape.members.length === 0 && structuredVariants.length === 0,
    ),
    "",
  );
  return `${body.join("\n").trimEnd()}\n`;
}

export function renderEntryPage(pkg: ApiPackage, entry: ApiEntryPoint): string {
  const label = entryLabel(pkg, entry);
  const status =
    entry.classification === "supported"
      ? "Supported public entry point"
      : entry.classification === "internal"
        ? "Internal/transitive entry point; application code normally does not import it directly"
        : entry.classification === "test-only"
          ? "Testing-only public entry point"
          : "CSS or binary asset entry point";
  const body = [
    frontmatter(label, `API reference for ${label}.`).trimEnd(),
    `<span class="api-status" data-status="${entry.classification}">${entry.classification}</span>`,
    "",
    `**${status}.** Import this entry point as \`${label}\`.`,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    `<div><dt>Declaration target</dt><dd><code>${html(entry.target)}</code></dd></div>`,
    `<div><dt>Exports</dt><dd>${entry.exports.length}</dd></div>`,
    "</dl>",
    "",
  ];
  if (entry.source !== undefined) {
    body.push(`Source entry: \`${packageSourcePath(pkg.name, entry.source)}\``, "");
  }
  if (entry.kind === "asset") {
    body.push(
      "This package export is an asset rather than a TypeScript module. It is tracked here so package drift cannot bypass documentation review.",
      "",
    );
  } else if (entry.exports.length === 0) {
    body.push("This TypeScript entry point intentionally exports no named symbols.", "");
  } else {
    const groups = Map.groupBy(entry.exports, (item) => item.kind);
    body.push("## Exported symbols", "");
    for (const [kind, items] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
      body.push(
        `### ${KIND_LABELS[kind] ?? `${kind}s`} <span class="api-count" data-pagefind-ignore>${items.length}</span>`,
        "",
        '<div class="api-symbol-grid">',
        ...items.map((item) => {
          const summary = compactSummary(documentationMarkdown(pkg, entry, item));
          return [
            `<a class="api-symbol-card" href="${symbolRoute(pkg, entry, item)}">`,
            `<span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="${item.kind}" aria-hidden="true">${item.kind.charAt(0).toUpperCase()}</span><code>${html(item.name)}</code></span>`,
            `<span class="api-symbol-card__desc">${html(summary)}</span>`,
            "</a>",
          ].join("");
        }),
        "</div>",
        "",
      );
    }
  }
  return `${body.join("\n").trimEnd()}\n`;
}

function renderApiIndex(manifest: PublicApiManifest): string {
  const lines = [
    frontmatter(
      "API reference",
      "Generated reference for every classified Sheetwrite package entry point.",
    ).trimEnd(),
    "The package `exports` maps define this inventory. Supported, internal, asset, and testing-only entry points are classified explicitly; generated pages use declaration signatures and source JSDoc.",
    "",
  ];
  for (const pkg of manifest.packages) {
    lines.push(
      `## ${pkg.name}`,
      "",
      '<table class="api-entry-table">',
      "<thead><tr><th>Entry point</th><th>Classification</th><th>Symbols</th></tr></thead>",
      "<tbody>",
      ...pkg.entryPoints.map(
        (entry) =>
          `<tr><td><a href="/docs/api/${entrySlug(pkg.name, entry.subpath)}/"><code>${html(entryLabel(pkg, entry))}</code></a></td><td><span class="api-status" data-status="${entry.classification}">${entry.classification}</span></td><td>${entry.exports.length}</td></tr>`,
      ),
      "</tbody>",
      "</table>",
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderEntryPointInventory(manifest: PublicApiManifest): string {
  const lines = [
    frontmatter(
      "Package entry-point inventory",
      "Compiler-backed classification of every publishable Sheetwrite package export.",
    ).trimEnd(),
    "> Generated from package `exports` maps by `bun run docs:generate`.",
    "",
    "| Package entry point | Target | Classification | API page |",
    "| --- | --- | --- | --- |",
  ];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      lines.push(
        `| \`${entryLabel(pkg, entry)}\` | \`${entry.target}\` | ${entry.classification} | [Reference](/docs/api/${entrySlug(pkg.name, entry.subpath)}/) |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderMovedGuides(): string {
  const lines = [
    frontmatter(
      "Moved guides",
      "Where each former repository guide now lives in the documentation site.",
    ).trimEnd(),
    "The old loose Markdown files were removed only after every source guide had a canonical routed replacement.",
    "",
    "| Former repository guide | Canonical route |",
    "| --- | --- |",
  ];
  for (const [oldPath, route] of Object.entries(MIGRATION_ROUTES)) {
    lines.push(`| \`${oldPath}\` | [\`${route}\`](${route}) |`);
  }
  return `${lines.join("\n")}\n`;
}

interface EvidenceState {
  available: false;
  reason: string;
  source: string;
  reproduction: string;
}

interface RenderEvidenceResult {
  engine: string;
  scenarioId: string;
  round: number;
  status: string;
  medianMs: number;
  p95Ms: number;
  madMs: number;
  memory: { deltaBytes: number };
  validation: Array<{ passed: boolean }>;
}

interface ValidatedRenderEvidence {
  protocolVersion: number;
  metadata: {
    commit: string;
    dirty: boolean;
    timestamp: string;
    bunVersion: string;
    nodeVersion: string;
    browserVersion: string;
    os: string;
    arch: string;
    cpu: string;
    rounds: number;
    launchAttempts: Array<{ success: boolean }>;
  };
  config: { engines: string[]; rows: number[]; scenarios: string[] };
  results: RenderEvidenceResult[];
}

async function unavailableEvidence(path: string, reproduction: string): Promise<EvidenceState> {
  const source = posix(relative(repositoryRoot, path));
  if (!(await exists(path)))
    return { available: false, reason: "artifact is missing", source, reproduction };
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const metadata =
      value.metadata !== null && typeof value.metadata === "object"
        ? (value.metadata as Record<string, unknown>)
        : value.meta !== null && typeof value.meta === "object"
          ? (value.meta as Record<string, unknown>)
          : value;
    if (typeof metadata.commit !== "string" || typeof metadata.timestamp !== "string") {
      return {
        available: false,
        reason:
          "artifact has no protocol-bound commit and timestamp, so freshness cannot be established",
        source,
        reproduction,
      };
    }
    return {
      available: false,
      reason:
        "artifact does not expose the completeness and validation fields required by this view",
      source,
      reproduction,
    };
  } catch {
    return { available: false, reason: "artifact is not valid JSON", source, reproduction };
  }
}

async function validatedRenderEvidence(): Promise<
  { evidence: ValidatedRenderEvidence; source: string } | EvidenceState
> {
  const path = join(repositoryRoot, "bench/results/render-results.json");
  const source = posix(relative(repositoryRoot, path));
  const reproduction =
    "bun run --filter @sheetwrite/bench bench:render:prepare && bun run --filter @sheetwrite/bench bench:render && bun run --filter @sheetwrite/bench bench:render:validate";
  if (!(await exists(path)))
    return { available: false, reason: "artifact is missing", source, reproduction };
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ValidatedRenderEvidence>;
    const metadata = value.metadata;
    const config = value.config;
    const results = value.results;
    if (
      value.protocolVersion !== 1 ||
      metadata === undefined ||
      typeof metadata.commit !== "string" ||
      typeof metadata.timestamp !== "string" ||
      metadata.dirty !== false ||
      !Number.isInteger(metadata.rounds) ||
      metadata.rounds < 1 ||
      !Array.isArray(metadata.launchAttempts) ||
      config === undefined ||
      !Array.isArray(config.engines) ||
      !Array.isArray(config.rows) ||
      !Array.isArray(config.scenarios) ||
      !Array.isArray(results)
    ) {
      return {
        available: false,
        reason: "artifact metadata does not match controlled render protocol version 1",
        source,
        reproduction,
      };
    }
    const expected =
      metadata.rounds * config.engines.length * config.rows.length * config.scenarios.length;
    const complete =
      results.length === expected &&
      metadata.launchAttempts.every((attempt) => attempt.success === true) &&
      results.every(
        (result) =>
          result.status === "success" &&
          Number.isFinite(result.medianMs) &&
          Number.isFinite(result.p95Ms) &&
          Number.isFinite(result.madMs) &&
          Number.isFinite(result.memory?.deltaBytes) &&
          Array.isArray(result.validation) &&
          result.validation.every((check) => check.passed === true),
      );
    if (!complete) {
      return {
        available: false,
        reason: `controlled protocol is incomplete or has failures (${results.length}/${expected} scenarios)`,
        source,
        reproduction,
      };
    }
    return { evidence: value as ValidatedRenderEvidence, source };
  } catch {
    return { available: false, reason: "artifact is not valid JSON", source, reproduction };
  }
}

async function renderEvidencePage(): Promise<string> {
  const render = await validatedRenderEvidence();
  const states = [
    await unavailableEvidence(
      join(repositoryRoot, "bench/results/data-results.json"),
      "bun run --filter @sheetwrite/bench bench:data",
    ),
    await unavailableEvidence(
      join(repositoryRoot, "bench/results/formula-results.json"),
      "bun run --filter @sheetwrite/bench bench:formula",
    ),
    await unavailableEvidence(
      join(repositoryRoot, "test-results/delivery-size/size-report.json"),
      "bun run size:report",
    ),
  ];
  const lines = [
    frontmatter(
      "Performance and delivery evidence",
      "Freshness-gated benchmark and package-size evidence for Sheetwrite.",
    ).trimEnd(),
    "Every number on this page comes from a validated local protocol artifact; nothing is published from an unvalidated, incomplete, or protocol-mismatched run.",
    "",
    "## Render benchmark: Sheetwrite vs Handsontable",
    "",
  ];
  if ("evidence" in render) {
    const { evidence, source } = render;
    const metadata = evidence.metadata;
    const failures = evidence.results.filter(
      (result) =>
        result.status !== "success" || result.validation.some((check) => check.passed !== true),
    ).length;
    // Pivot rounds/engines into one row per scenario so the page reads as a
    // comparison instead of a raw artifact dump.
    const byScenario = new Map<string, Map<string, { medians: number[]; p95s: number[] }>>();
    for (const result of evidence.results) {
      const engines = byScenario.get(result.scenarioId) ?? new Map();
      byScenario.set(result.scenarioId, engines);
      const stats = engines.get(result.engine) ?? { medians: [], p95s: [] };
      engines.set(result.engine, stats);
      stats.medians.push(result.medianMs);
      stats.p95s.push(result.p95Ms);
    }
    const mid = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
    };
    const rows = evidence.config.rows.join(", ");
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.results.length}/${evidence.results.length} engine/scenario/round runs completed with ${failures} failures; every correctness checkpoint passed.</div>`,
      "",
      `Both engines drive the same ${rows}-row workbook through identical scripted interactions in a controlled Chromium (${metadata.browserVersion}) on ${metadata.cpu}. Captured ${metadata.timestamp} at \`${metadata.commit.slice(0, 12)}\` (clean worktree); raw artifact \`${source}\`.`,
      "",
    );
    const ms = (value: number): string => `${value.toFixed(value < 10 ? 2 : 1)} ms`;
    const comparisons: {
      scenario: string;
      ours: { median: number; p95: number };
      theirs: { median: number; p95: number };
    }[] = [];
    for (const [scenario, engines] of byScenario) {
      const ours = engines.get("sheetwrite");
      const theirs = engines.get("handsontable");
      if (!ours || !theirs) continue;
      comparisons.push({
        scenario,
        ours: { median: mid(ours.medians), p95: mid(ours.p95s) },
        theirs: { median: mid(theirs.medians), p95: mid(theirs.p95s) },
      });
    }
    // Paired-bar comparison chart instead of a raw table. Everything is
    // precomputed here into static HTML (prerender-safe, no client JS); the
    // medians, p95s, and ratios stay real text for search and screen readers,
    // while tracks, fills, and axis ticks are aria-hidden decoration styled by
    // the `bench-` block in docs/src/styles/site.css.
    // The axis is logarithmic: samples span three decades (0.15-266 ms), so a
    // linear scale would flatten every sub-10 ms bar into invisibility. Domain
    // runs from the nearest decade below the fastest sample to the slowest.
    const samples = comparisons.flatMap(({ ours, theirs }) => [
      ours.median,
      ours.p95,
      theirs.median,
      theirs.p95,
    ]);
    const lowExponent = Math.floor(Math.log10(Math.min(...samples)));
    const low = 10 ** lowExponent;
    const high = Math.max(...samples);
    const decades = Math.log10(high / low);
    const percent = (value: number): string =>
      `${Math.min(100, Math.max(0, (Math.log10(value / low) / decades) * 100)).toFixed(2)}%`;
    const tickValues: number[] = [];
    for (let exponent = lowExponent; 10 ** exponent <= high; exponent += 1) {
      tickValues.push(10 ** exponent);
    }
    const axisLabels = tickValues
      .map(
        (tick, index) =>
          `<i style="left:${percent(tick)}">${tick}${index === tickValues.length - 1 ? " ms" : ""}</i>`,
      )
      .join("");
    const trackTicks = tickValues
      .filter((tick) => tick > low)
      .map((tick) => `<i class="bench-bar__tick" style="left:${percent(tick)}"></i>`)
      .join("");
    const engineLabels = { sheetwrite: "Sheetwrite", handsontable: "Handsontable" } as const;
    // Median-only presentation: one bar, one number. Percentile spread lives
    // in the raw artifact; it confused readers more than it informed them.
    const bar = (engine: keyof typeof engineLabels, stats: { median: number }): string =>
      `<div class="bench-bar" data-engine="${engine}">` +
      `<span class="bench-bar__engine">${engineLabels[engine]}</span>` +
      `<span class="bench-bar__track" aria-hidden="true">${trackTicks}` +
      `<i class="bench-bar__fill" style="width:${percent(stats.median)}"></i></span>` +
      `<span class="bench-bar__value">${ms(stats.median)}</span>` +
      `</div>`;
    lines.push(
      '<figure class="bench-viz">',
      `<div class="bench-viz__scale" aria-hidden="true"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis">${axisLabels}</span><span class="bench-viz__cols">median time</span></div>`,
    );
    for (const { scenario, ours, theirs } of comparisons) {
      const faster = theirs.median >= ours.median;
      const ratio = (faster ? theirs.median / ours.median : ours.median / theirs.median).toFixed(1);
      lines.push(
        `<div class="bench-viz__row" data-outcome="${faster ? "faster" : "slower"}">`,
        `<div class="bench-viz__head"><code>${scenario}</code><span class="bench-viz__ratio"><strong>${ratio}×</strong> ${faster ? "faster" : "slower"}</span></div>`,
        bar("sheetwrite", ours),
        bar("handsontable", theirs),
        "</div>",
      );
    }
    lines.push(
      "<figcaption>Bars are the median time per interaction on a logarithmic axis — every tick is one 10× step, shorter is faster. Percentiles, spread, and memory counters live in the raw artifact.</figcaption>",
      "</figure>",
    );
    lines.push(
      "",
      "Per-round samples, spread, and memory counters live in the raw artifact. Reproduce and validate with:",
      "",
      '```sh verify title="Controlled render evidence"',
      "bun run --filter @sheetwrite/bench bench:render:prepare",
      "bun run --filter @sheetwrite/bench bench:render",
      "bun run --filter @sheetwrite/bench bench:render:validate",
      "```",
      "",
    );
  } else {
    states.unshift(render);
  }
  if (states.length > 0) {
    lines.push(
      "## Pending local evidence",
      "",
      "These protocols have no validated artifact in this environment yet, so no numbers are published for them.",
      "",
      "| Artifact | Status | Reproduce with |",
      "| --- | --- | --- |",
      ...states.map(
        (state) => `| \`${state.source}\` | ${state.reason} | \`${state.reproduction}\` |`,
      ),
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function expectedGeneratedFiles(manifest: PublicApiManifest): Promise<ExpectedFile[]> {
  const apiFiles: ExpectedFile[] = [
    { path: join(contentRoot, "api/index.md"), content: renderApiIndex(manifest) },
  ];
  const symbolOwners = new Map<string, string>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      apiFiles.push({
        path: join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
        content: renderEntryPage(pkg, entry),
      });
      for (const item of entry.exports) {
        const symbolPath = join(
          contentRoot,
          `api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}.md`,
        );
        const owner = `${pkg.name}|${entry.subpath}|${item.name}`;
        const existingOwner = symbolOwners.get(symbolPath);
        if (existingOwner !== undefined) {
          throw new Error(`API symbol route collision: ${existingOwner} and ${owner}`);
        }
        symbolOwners.set(symbolPath, owner);
        apiFiles.push({
          path: symbolPath,
          content: await renderSymbolPage(pkg, entry, item),
        });
      }
    }
  }
  const exportCount = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((entryCount, entry) => entryCount + entry.exports.length, 0),
    0,
  );
  const contract = {
    formatVersion: 2,
    generatedBy: "scripts/docs.ts",
    movedGuideRoutes: MIGRATION_ROUTES,
    requiredSearchTerms: REQUIRED_SEARCH_TERMS,
    entryPointCount: manifest.packages.reduce((count, pkg) => count + pkg.entryPoints.length, 0),
    exportCount,
    symbolPageCount: exportCount,
    apiSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
  return [
    ...apiFiles,
    {
      path: join(contentRoot, "reference/package-entry-points.md"),
      content: renderEntryPointInventory(manifest),
    },
    {
      path: join(contentRoot, "reference/moved-guides.md"),
      content: renderMovedGuides(),
    },
    {
      path: join(contentRoot, "guides/performance-resources.md"),
      content: await renderEvidencePage(),
    },
    { path: generatedManifestPath, content: stableJson(manifest) },
    { path: docsContractPath, content: stableJson(contract) },
    {
      // Sidebar navigation source: one entry per package's primary entry point.
      path: join(generatedDataRoot, "api-nav.json"),
      content: stableJson(
        manifest.packages.map((pkg) => ({
          label: pkg.name,
          href: `/docs/api/${entrySlug(pkg.name, ".")}/`,
        })),
      ),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
}

async function writeIfChanged(path: string, content: string): Promise<void> {
  if ((await exists(path)) && (await readFile(path, "utf8")) === content) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function removeStaleApiPages(expected: readonly ExpectedFile[]): Promise<void> {
  const apiRoot = join(contentRoot, "api");
  if (!(await exists(apiRoot))) return;
  const keep = new Set(
    expected.filter((file) => file.path.startsWith(`${apiRoot}${sep}`)).map((file) => file.path),
  );
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        if ((await readdir(path)).length === 0) await rm(path, { recursive: true });
      } else if (entry.isFile() && entry.name.endsWith(".md") && !keep.has(path)) {
        await rm(path);
      }
    }
  };
  await visit(apiRoot);
}

async function markdownDocuments(root: string): Promise<MarkdownDocument[]> {
  const documents: MarkdownDocument[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        documents.push({ path, content: await readFile(path, "utf8") });
      }
    }
  };
  await visit(root);
  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

const CSS_TOKEN_SOURCE_EXTENSIONS = new Set([".css", ".md", ".mdx", ".svelte", ".ts", ".tsx"]);

/** Report every referenced Sheetwrite CSS token that has no source definition. */
export async function unresolvedCssTokens(root: string): Promise<string[]> {
  const definitions = new Set<string>();
  const references = new Map<string, Set<string>>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (!CSS_TOKEN_SOURCE_EXTENSIONS.has(extension)) continue;
      const content = await readFile(path, "utf8");
      for (const match of content.matchAll(/(--sw-[\w-]+)\s*:/g)) {
        if (match[1] !== undefined) definitions.add(match[1]);
      }
      for (const match of content.matchAll(/var\(\s*(--sw-[\w-]+)/g)) {
        const token = match[1];
        if (token === undefined) continue;
        const owners = references.get(token) ?? new Set<string>();
        owners.add(posix(relative(root, path)));
        references.set(token, owners);
      }
    }
  };
  await visit(root);
  return [...references.entries()]
    .filter(([token]) => !definitions.has(token))
    .map(
      ([token, owners]) =>
        `undefined Sheetwrite CSS token ${token}: ${[...owners].sort().join(", ")}`,
    )
    .sort();
}

export function parseFences(content: string): Fence[] {
  const fences: Fence[] = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^```([^\s`]*)\s*(.*)$/.exec(lines[index] ?? "");
    if (match === null) continue;
    const language = match[1] ?? "";
    const meta = match[2]?.trim() ?? "";
    const start = index;
    const body: string[] = [];
    for (index += 1; index < lines.length && !/^```\s*$/.test(lines[index] ?? ""); index += 1) {
      body.push(lines[index] ?? "");
    }
    if (index >= lines.length) throw new Error(`Unclosed code fence at line ${start + 1}`);
    fences.push({ language, meta, code: body.join("\n"), line: start + 1 });
  }
  return fences;
}
function fenceMetaValue(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]+)"|'([^']+)')`).exec(meta);
  return match?.[1] ?? match?.[2];
}

function maskCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
}

function routeForContentPath(path: string): string {
  const relativePath = posix(relative(contentRoot, path)).replace(/\.mdx?$/, "");
  const withoutIndex = relativePath === "index" ? "" : relativePath.replace(/\/index$/, "");
  return `/docs/${withoutIndex}${withoutIndex.length === 0 ? "" : "/"}`;
}

export function contentPathForRoute(
  route: string,
  documents: readonly MarkdownDocument[],
): string | undefined {
  const normalizedRoute = route.endsWith("/") ? route : `${route}/`;
  return documents.find((document) => routeForContentPath(document.path) === normalizedRoute)?.path;
}

function headingAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  const masked = content.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "));
  for (const line of masked.split("\n")) {
    const explicit = /<[a-z][^>]*\sid=["']([^"']+)["']/i.exec(line);
    if (explicit !== null) anchors.add(explicit[1] ?? "");
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading === null) continue;
    const slug = (heading[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    if (slug.length > 0) anchors.add(slug);
  }
  return anchors;
}

function packageAndSubpath(
  specifier: string,
): { packageName: string; subpath: string } | undefined {
  const clean = specifier.split("?")[0] ?? specifier;
  const match = /^(@sheetwrite\/[^/]+)(?:\/(.+))?$/.exec(clean);
  if (match === null) return undefined;
  return { packageName: match[1] ?? "", subpath: match[2] === undefined ? "." : `./${match[2]}` };
}

function validateImports(
  document: MarkdownDocument,
  fence: Fence,
  manifest: PublicApiManifest,
): string[] {
  const failures: string[] = [];
  const imports = fence.code.matchAll(
    /import\s+(?:(?:type\s+)?\{([^}]+)\}|[^"']+)?\s*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g,
  );
  for (const match of imports) {
    const specifier = match[2] ?? match[3] ?? "";
    const parsed = packageAndSubpath(specifier);
    if (parsed === undefined) continue;
    const pkg = manifest.packages.find((item) => item.name === parsed.packageName);
    const entry = pkg?.entryPoints.find((item) => item.subpath === parsed.subpath);
    if (entry === undefined) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}:${fence.line} imports unsupported entry point ${specifier}`,
      );
      continue;
    }
    const names = (match[1] ?? "")
      .split(",")
      .map(
        (name) =>
          name
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0] ?? "",
      )
      .filter(Boolean);
    for (const name of names) {
      if (!entry.exports.some((item) => item.name === name)) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))}:${fence.line} imports missing ${specifier} export ${name}`,
        );
      }
    }
  }
  return failures;
}

async function validateCompiledSnippets(
  snippets: Array<{ document: MarkdownDocument; fence: Fence }>,
): Promise<string[]> {
  if (snippets.length === 0) return [];
  const directory = await mkdtemp(join(repositoryRoot, ".docs-snippets-"));
  try {
    const files: string[] = [];
    for (const [index, snippet] of snippets.entries()) {
      const extension = snippet.fence.language === "tsx" ? "tsx" : "ts";
      const path = join(directory, `snippet-${index}.${extension}`);
      const compileSource = snippet.fence.code.replace(
        /^\s*import\s+["'][^"']+\.css["'];?\s*$/gm,
        "",
      );
      await writeFile(path, `${compileSource}\nexport {};\n`);
      files.push(path);
    }
    const program = ts.createProgram(files, {
      baseUrl: repositoryRoot,
      jsx: ts.JsxEmit.ReactJSX,
      ignoreDeprecations: "6.0",
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: {
        "@sheetwrite/core": ["packages/core/dist/index.d.ts"],
        "@sheetwrite/core/*": ["packages/core/dist/*"],
        "@sheetwrite/react": ["packages/react/dist/index.d.ts"],
        "@sheetwrite/svelte": ["packages/svelte/src/index.ts"],
        "@sheetwrite/vue": ["packages/vue/dist/index.d.ts"],
        "@sheetwrite/xlsx": ["packages/xlsx/dist/index.d.ts"],
      },
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const index = diagnostic.file === undefined ? -1 : files.indexOf(diagnostic.file.fileName);
      if (index < 0) return `compiled snippet: ${message}`;
      const snippet = snippets[index];
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return `${posix(relative(repositoryRoot, snippet?.document.path ?? ""))}:${
        (snippet?.fence.line ?? 0) + (position?.line ?? 0) + 1
      } compiled snippet: ${message}`;
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function validateVerifiedShell(
  document: MarkdownDocument,
  fence: Fence,
  manifest: PublicApiManifest,
): string[] {
  const failures: string[] = [];
  const knownPackages = new Set(manifest.packages.map((pkg) => pkg.name));
  for (const match of fence.code.matchAll(
    /(?:bun\s+add|npm\s+install)\s+(@sheetwrite\/[^\s#]+)/g,
  )) {
    const packageName = match[1] ?? "";
    if (!knownPackages.has(packageName)) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}:${fence.line} installs unknown package ${packageName}`,
      );
    }
  }
  return failures;
}

async function validateMarkdown(
  documents: readonly MarkdownDocument[],
  manifest: PublicApiManifest,
): Promise<string[]> {
  const failures: string[] = [];
  const hoverAnalyzer = new SheetwriteTypeEngine({ cwd: join(repositoryRoot, "docs") });
  const compiled: Array<{ document: MarkdownDocument; fence: Fence }> = [];
  for (const document of documents) {
    let fences: Fence[];
    try {
      fences = parseFences(document.content);
    } catch (error) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}: ${(error as Error).message}`,
      );
      continue;
    }
    for (const fence of fences) {
      const classified =
        /(?:^|\s)(?:compile|generated|verify|diagram)(?:\s|$)/.test(fence.meta) ||
        /(?:^|\s)partial=(?:"[^"]+"|'[^']+')/.test(fence.meta);
      if (!classified) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))}:${fence.line} code fence is not compile-checked or explicitly classified`,
        );
      }
      const typedLanguage =
        fence.language === "ts" ||
        fence.language === "tsx" ||
        fence.language === "vue" ||
        fence.language === "svelte";
      const generated = /(?:^|\s)generated(?:\s|$)/.test(fence.meta);
      const partial = /(?:^|\s)partial=(?:"[^"]+"|'[^']+')/.test(fence.meta);
      const prelude = fenceMetaValue(fence.meta, "prelude");
      if (typedLanguage && !generated) {
        if (partial && prelude === undefined) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} typed partial fence requires a named hover prelude`,
          );
        }
        try {
          const hovers = collectFenceHovers(fence.code, fence.language, hoverAnalyzer, prelude);
          for (const hover of hovers) {
            if (isHighQualityHover(hover, fence.language)) continue;
            failures.push(
              `${posix(relative(repositoryRoot, document.path))}:${fence.line + hover.line} low-quality hover for ${hover.target}: ${hover.text}`,
            );
          }
        } catch (error) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} hover analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (/(?:^|\s)compile(?:\s|$)/.test(fence.meta)) {
        if (fence.language !== "ts" && fence.language !== "tsx") {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} compile is only valid for ts/tsx fences`,
          );
        } else compiled.push({ document, fence });
      }
      if (fence.language === "ts" || fence.language === "tsx") {
        failures.push(...validateImports(document, fence, manifest));
      }
      if (fence.language === "sh" && /(?:^|\s)verify(?:\s|$)/.test(fence.meta)) {
        failures.push(...validateVerifiedShell(document, fence, manifest));
      }
    }

    const masked = maskCode(document.content);
    for (const match of masked.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const rawTarget = match[1]?.trim() ?? "";
      if (
        rawTarget.length === 0 ||
        /^(?:https?:|mailto:|tel:)/.test(rawTarget) ||
        rawTarget.startsWith("{")
      ) {
        continue;
      }
      const [targetWithoutFragment = "", fragment] = rawTarget.split("#", 2);
      let targetPath: string | undefined;
      if (targetWithoutFragment === "") targetPath = document.path;
      else if (targetWithoutFragment.startsWith("/docs/")) {
        targetPath = contentPathForRoute(targetWithoutFragment, documents);
      } else if (/^\/(?:vanilla|react|vue|svelte)\/?$/.test(targetWithoutFragment)) {
        targetPath = join(
          repositoryRoot,
          `docs/src/routes/${targetWithoutFragment.replace(/^\//, "").replace(/\/$/, "")}.tsx`,
        );
      } else if (targetWithoutFragment.startsWith("/")) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links unknown internal route ${rawTarget}`,
        );
        continue;
      } else {
        targetPath = resolve(dirname(document.path), targetWithoutFragment);
        if (!/\.[a-zA-Z]+$/.test(targetPath)) {
          targetPath = `${targetPath}.md`;
        }
      }
      if (targetPath === undefined || !(await exists(targetPath))) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links missing target ${rawTarget}`,
        );
        continue;
      }
      if (fragment !== undefined && fragment.length > 0 && /\.mdx?$/.test(targetPath)) {
        const target = documents.find((item) => item.path === targetPath);
        if (target !== undefined && !headingAnchors(target.content).has(fragment)) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))} links missing anchor ${rawTarget}`,
          );
        }
      }
    }
  }
  failures.push(...(await validateCompiledSnippets(compiled)));
  return failures;
}

async function readReadmes(): Promise<MarkdownDocument[]> {
  const paths = [
    join(repositoryRoot, "README.md"),
    ...Object.values(PACKAGE_DIRECTORIES).map((directory) =>
      join(repositoryRoot, directory, "README.md"),
    ),
  ];
  const documents: MarkdownDocument[] = [];
  for (const path of paths) {
    if (await exists(path)) documents.push({ path, content: await readFile(path, "utf8") });
  }
  return documents;
}

async function checkDocs(
  manifest: PublicApiManifest,
  expected: readonly ExpectedFile[],
  apiIssues: readonly { code: string; message: string }[],
): Promise<string[]> {
  const failures = apiIssues.map((issue) => `${issue.code}: ${issue.message}`);
  for (const file of expected) {
    if (!(await exists(file.path))) {
      failures.push(`generated file missing: ${posix(relative(repositoryRoot, file.path))}`);
      continue;
    }
    const actual = await readFile(file.path, "utf8");
    if (actual !== file.content) {
      failures.push(`generated file is stale: ${posix(relative(repositoryRoot, file.path))}`);
    }
  }

  for (const oldPath of Object.keys(MIGRATION_ROUTES)) {
    if (await exists(join(repositoryRoot, oldPath)))
      failures.push(`duplicate migrated guide remains: ${oldPath}`);
  }

  const documents = await markdownDocuments(contentRoot);
  for (const route of Object.values(MIGRATION_ROUTES)) {
    if (contentPathForRoute(route, documents) === undefined) {
      failures.push(`migration route has no page: ${route}`);
    }
  }
  failures.push(...(await validateMarkdown(documents, manifest)));
  failures.push(...(await unresolvedCssTokens(join(repositoryRoot, "docs/src"))));

  const searchedText = documents.map((document) => document.content).join("\n");
  for (const term of REQUIRED_SEARCH_TERMS) {
    if (!searchedText.includes(term)) failures.push(`required search term is absent: ${term}`);
  }
  const allDocumentation = [...documents, ...(await readReadmes())];
  const removedDirectory = ["examples", "site"].join("/");
  const removedPackage = ["@sheetwrite", "example-site"].join("/");
  for (const document of allDocumentation) {
    if (document.content.includes(removedDirectory) || document.content.includes(removedPackage)) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))} references the removed example site`,
      );
    }
    for (const forbidden of FORBIDDEN_NAMES) {
      if (document.content.includes(forbidden)) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} names removed API ${forbidden}`,
        );
      }
    }
  }

  const apiPageKeys = new Set(
    expected
      .filter(
        (file) =>
          file.path.startsWith(join(contentRoot, "api/")) &&
          file.path !== join(contentRoot, "api/index.md"),
      )
      .map((file) => file.path),
  );
  const entryPageKeys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.map((entry) =>
        join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
      ),
    ),
  );
  const symbolPageKeys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) =>
        entry.exports.map((item) =>
          join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}.md`),
        ),
      ),
    ),
  );
  const entryCount = entryPageKeys.size;
  const exportCount = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  if (symbolPageKeys.size !== exportCount) {
    failures.push(
      `API symbol route coverage mismatch: expected ${exportCount}, received ${symbolPageKeys.size}`,
    );
  }
  for (const symbolPagePath of symbolPageKeys) {
    if (!apiPageKeys.has(symbolPagePath)) {
      failures.push(`generated API symbol page is missing: ${symbolPagePath}`);
    }
  }
  if (apiPageKeys.size !== entryCount + symbolPageKeys.size) {
    failures.push(
      `API page coverage mismatch: expected ${entryCount + symbolPageKeys.size}, received ${apiPageKeys.size}`,
    );
  }

  const apiIndex = await readFile(join(contentRoot, "api/index.md"), "utf8");
  for (const apiPagePath of entryPageKeys) {
    const route = `/docs/${posix(relative(contentRoot, apiPagePath)).replace(/\.md$/, "/")}`;
    // The index links entries from raw-HTML table rows; markdown links stay
    // recognized so prose references also satisfy the contract.
    if (!apiIndex.includes(`](${route})`) && !apiIndex.includes(`href="${route}"`)) {
      failures.push(`generated API entry page is missing from the API index: ${route}`);
    }
  }

  const navigationSource = await readFile(
    join(repositoryRoot, "docs/src/lib/navigation.ts"),
    "utf8",
  );
  if (!navigationSource.includes('href: "/docs/api/"')) {
    failures.push("generated API index is missing from the documentation navigation");
  }

  const testPages = [
    join(repositoryRoot, "docs/src/routes/test.xlsx.tsx"),
    join(repositoryRoot, "docs/src/routes/test.collaboration.tsx"),
  ];
  for (const testPage of testPages) {
    if (!(await exists(testPage))) {
      failures.push(`${posix(relative(repositoryRoot, testPage))} is missing`);
    } else if (!(await readFile(testPage, "utf8")).includes("noindex, nofollow")) {
      failures.push(`${posix(relative(repositoryRoot, testPage))} is not marked noindex`);
    }
  }
  return [...new Set(failures)].sort();
}

export async function generateDocs(): Promise<void> {
  const analysis = await analyzePublicApi(repositoryRoot);
  const fatalIssues = analysis.issues.filter((issue) =>
    ["malformed-report", "parse-error", "unclassified-entry", "unresolved-entry"].includes(
      issue.code,
    ),
  );
  if (fatalIssues.length > 0) throw new Error(fatalIssues.map((issue) => issue.message).join("\n"));
  const expected = await expectedGeneratedFiles(analysis.manifest);
  await removeStaleApiPages(expected);
  for (const file of expected) await writeIfChanged(file.path, file.content);
  const entryCount = analysis.manifest.packages.reduce(
    (count, pkg) => count + pkg.entryPoints.length,
    0,
  );
  const symbolCount = analysis.manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  console.log(
    `Generated ${entryCount} API entry-point indexes, ${symbolCount} symbol pages, and documentation contracts`,
  );
}

export async function verifyDocs(): Promise<void> {
  const analysis = await analyzePublicApi(repositoryRoot);
  const expected = await expectedGeneratedFiles(analysis.manifest);
  const failures = await checkDocs(analysis.manifest, expected, analysis.issues);
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log("Documentation contract check passed");
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === "generate") await generateDocs();
  else if (mode === "check") await verifyDocs();
  else throw new Error("Usage: bun scripts/docs.ts <generate|check>");
}
