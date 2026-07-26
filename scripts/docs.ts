import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
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
import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "../docs/src/showcases/capabilities.js";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
} from "../docs/src/showcases/capability-validation.js";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityFixture,
  type CompatibilityRecord,
} from "../docs/src/showcases/compatibility.js";
import {
  buildCompatibilityResults,
  type CompatibilityResults,
} from "../docs/src/showcases/compatibility-results.js";
import {
  collectCompatibilityIssues,
  collectMissingCompatibilityFiles,
} from "../docs/src/showcases/compatibility-validation.js";
import { compareReviewedObservation } from "./conformance/compare.js";
import { loadCorpus } from "./conformance/corpus.js";
import { readConformanceManifest } from "./conformance/generate.js";
import { runOffline } from "./conformance/offline.js";
import { loadFormulaContractInventory, renderFormulaFunctionContract } from "./formula-docs.js";
import {
  type ApiEntryPoint,
  type ApiExport,
  type ApiPackage,
  analyzePublicApi,
  type PublicApiManifest,
} from "./public-api.js";
import {
  formatMetricDelta,
  formatMetricDisplay,
  type SizeHistory,
  validateSizeHistory,
} from "./size-report.js";

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
/**
 * Sheetwrite-owned adapter surface every framework package must document.
 * `inputs` mirrors `GRID_OPTION_POLICY` plus explicit WASM initialization, and
 * `vueEvents` mirrors `handlerEvents` in template casing; `docs.test.ts` locks
 * both mirrors against `@sheetwrite/core/adapter`.
 */
export const ADAPTER_DOC_CONTRACT = {
  packages: ["@sheetwrite/react", "@sheetwrite/svelte", "@sheetwrite/vue"],
  inputs: [
    "workbook",
    "data",
    "datasource",
    "datasourceStorage",
    "presentation",
    "editors",
    "renderer",
    "workerUrl",
    "renderers",
    "protectionResolver",
    "mutationPolicy",
    "transactionResourceLimits",
    "hyperlinkActivation",
    "theme",
    "readOnly",
    "config",
    "overscan",
    "minColumns",
    "wasmSource",
  ],
  handlerEvents: [
    "onGridChange",
    "onSelectionChange",
    "onViewportChange",
    "onEditBegin",
    "onEditCommit",
    "onSearch",
    "onActiveSheetChange",
    "onCommandStateChange",
    "onReady",
    "onInitializationError",
  ],
  vueEvents: [
    "grid-change",
    "selection-change",
    "viewport-change",
    "edit-begin",
    "edit-commit",
    "search",
    "active-sheet-change",
    "command-state-change",
    "ready",
    "initialization-error",
  ],
  readyReasons: ["initial", "input-reset", "renderer-reset"],
} as const;

/**
 * Every adapter package must document the canonical advanced inputs, event
 * surface, and readiness contract through its generated API pages: the
 * flattened props/emits interfaces must declare each member with source JSDoc,
 * and the core adapter entry must document exactly the implemented readiness
 * reasons.
 */
export function adapterContractIssues(manifest: PublicApiManifest): string[] {
  const failures: string[] = [];
  const exportOf = (packageName: string, name: string): ApiExport | undefined =>
    manifest.packages
      .find((pkg) => pkg.name === packageName)
      ?.entryPoints.find((entry) => entry.subpath === ".")
      ?.exports.find((item) => item.name === name);

  const gridOptions = exportOf("@sheetwrite/core", "GridOptions");
  const expectedInputs = ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource");
  if (gridOptions === undefined) {
    failures.push("@sheetwrite/core does not export GridOptions");
  } else {
    const implementedInputs = new Set(gridOptions.memberDocs.map((member) => member.name));
    for (const input of expectedInputs) {
      if (!implementedInputs.has(input)) {
        failures.push(
          `GridOptions member ${input} is missing from the adapter documentation contract`,
        );
      }
    }
    for (const input of implementedInputs) {
      if (!(expectedInputs as readonly string[]).includes(input)) {
        failures.push(
          `GridOptions member ${input} is not covered by the adapter documentation contract`,
        );
      }
    }
  }

  const requireMembers = (
    packageName: string,
    exportName: string,
    members: readonly string[],
  ): void => {
    const item = exportOf(packageName, exportName);
    if (item === undefined) {
      failures.push(`${packageName} does not export ${exportName}`);
      return;
    }
    const documented = new Set(item.memberDocs.map((member) => member.name));
    for (const member of members) {
      if (
        !item.signature.includes(`${member}:`) &&
        !item.signature.includes(`${member}?:`) &&
        !item.signature.includes(`"${member}":`) &&
        !item.signature.includes(`"${member}"?:`)
      ) {
        failures.push(`${packageName} ${exportName} does not declare ${member}`);
      } else if (!documented.has(member)) {
        failures.push(`${packageName} ${exportName} member ${member} has no documentation`);
      }
    }
  };

  for (const packageName of ADAPTER_DOC_CONTRACT.packages) {
    requireMembers(packageName, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.inputs);
    if (packageName === "@sheetwrite/vue") {
      requireMembers(packageName, "SheetwriteGridEmits", ADAPTER_DOC_CONTRACT.vueEvents);
    } else {
      requireMembers(packageName, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.handlerEvents);
    }
    requireMembers(packageName, "GridReadyEvent", ["grid", "generation", "reason"]);
  }

  const adapterEntry = manifest.packages
    .find((pkg) => pkg.name === "@sheetwrite/core")
    ?.entryPoints.find((entry) => entry.subpath === "./adapter");
  const documentedReasons = new Set<string>();
  for (const name of ["GridReadyReason", "GridResetReason"]) {
    const item = adapterEntry?.exports.find((candidate) => candidate.name === name);
    for (const match of item?.signature.matchAll(/"([a-z-]+)"/g) ?? []) {
      documentedReasons.add(match[1] ?? "");
    }
  }
  const canonicalReasons: readonly string[] = ADAPTER_DOC_CONTRACT.readyReasons;
  if (documentedReasons.size === 0) {
    failures.push("@sheetwrite/core ./adapter does not document GridReadyReason");
  } else if (
    canonicalReasons.some((reason) => !documentedReasons.has(reason)) ||
    [...documentedReasons].some((literal) => !canonicalReasons.includes(literal))
  ) {
    failures.push(
      `GridReadyReason documents [${[...documentedReasons].sort().join(", ")}] but adapters implement [${canonicalReasons.join(", ")}]`,
    );
  }
  return failures;
}

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
let compatibilityResultsPromise: Promise<CompatibilityResults> | undefined;

function compatibilityResults(): Promise<CompatibilityResults> {
  compatibilityResultsPromise ??= (async () => {
    const testDirectory = join(repositoryRoot, "test/conformance");
    const paths = {
      manifest: join(testDirectory, "corpus.manifest.json"),
      inventory: join(testDirectory, "formula-contract.inventory.json"),
      captures: join(repositoryRoot, "scripts/conformance/captures"),
    };
    const [corpus, manifest, packageJson] = await Promise.all([
      loadCorpus(join(testDirectory, "corpus.json"), paths),
      readConformanceManifest(paths.manifest),
      readFile(join(repositoryRoot, "packages/core/package.json"), "utf8").then(
        (content) => JSON.parse(content) as { version: string },
      ),
    ]);
    const offline = await runOffline(corpus, paths);
    return buildCompatibilityResults({
      corpus,
      manifest,
      offline,
      libraryVersion: packageJson.version,
      compareObservation: compareReviewedObservation,
    });
  })();
  return compatibilityResultsPromise;
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
interface DocumentationLinkCandidate {
  readonly packageName: string;
  readonly route: string;
  readonly item: ApiExport;
}

type DocumentationLinkRoutes = ReadonlyMap<string, readonly DocumentationLinkCandidate[]>;

function documentationLinkRoutes(manifest: PublicApiManifest): DocumentationLinkRoutes {
  const routes = new Map<string, DocumentationLinkCandidate[]>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const candidates = routes.get(item.name) ?? [];
        candidates.push({
          packageName: pkg.name,
          route: symbolRoute(pkg, entry, item),
          item,
        });
        routes.set(item.name, candidates);
      }
    }
  }
  return routes;
}

function uniqueDocumentationCandidate(
  routes: DocumentationLinkRoutes,
  packageName: string,
  target: string,
): DocumentationLinkCandidate | undefined {
  const candidates = routes.get(target) ?? [];
  const packageCandidates = candidates.filter((candidate) => candidate.packageName === packageName);
  if (packageCandidates.length === 1) return packageCandidates[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

function hasRenderedMember(item: ApiExport, memberName: string): boolean {
  return declarationShape(parseableDeclaration(item)).members.some(
    (member) => member.name === memberName,
  );
}

function documentationLinkRoute(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  target: string,
  routes: DocumentationLinkRoutes,
): string | undefined {
  const targetParts = target.split(".");
  if (targetParts.length > 2) return undefined;
  const [ownerName, memberName] = targetParts;
  if (memberName !== undefined) {
    const localOwner = entry.exports.find((candidate) => candidate.name === ownerName);
    const owner =
      localOwner === undefined
        ? uniqueDocumentationCandidate(routes, pkg.name, ownerName ?? "")
        : {
            packageName: pkg.name,
            route: symbolRoute(pkg, entry, localOwner),
            item: localOwner,
          };
    return owner === undefined || !hasRenderedMember(owner.item, memberName)
      ? undefined
      : `${owner.route}#${anchor(ownerName ?? "")}-${anchor(memberName)}`;
  }
  const local = entry.exports.find((candidate) => candidate.name === target);
  if (local !== undefined) return symbolRoute(pkg, entry, local);
  if (hasRenderedMember(item, target)) {
    return `${symbolRoute(pkg, entry, item)}#${anchor(item.name)}-${anchor(target)}`;
  }
  return uniqueDocumentationCandidate(routes, pkg.name, target)?.route;
}

export function unresolvedDocumentationLinks(manifest: PublicApiManifest): string[] {
  const routes = documentationLinkRoutes(manifest);
  const issues: string[] = [];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const documentation = [
          item.documentation,
          ...item.memberDocs.map((member) => member.documentation),
        ];
        for (const source of documentation) {
          for (const match of source.matchAll(/\{@link\s+([^\s|}]+)/g)) {
            const target = match[1] ?? "";
            if (documentationLinkRoute(pkg, entry, item, target, routes) === undefined) {
              issues.push(
                `${pkg.name} ${entry.subpath} ${item.name} has unresolved documentation link ${target}`,
              );
            }
          }
        }
      }
    }
  }
  return issues;
}

function documentationMarkdown(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes = new Map(),
): string {
  const documentation =
    item.documentation.trim() || "Source summary unavailable; docs:check rejects this omission.";
  return documentation.replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const route = documentationLinkRoute(pkg, entry, item, target, routes);
      return route === undefined ? `\`${text}\`` : `[\`${text}\`](${route})`;
    },
  );
}

function memberDocumentationHtml(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  documentation: string,
  routes: DocumentationLinkRoutes,
): string {
  return html(documentation).replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const route = documentationLinkRoute(pkg, entry, item, target, routes);
      return route === undefined
        ? `<code>${text}</code>`
        : `<a href="${route}"><code>${text}</code></a>`;
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
  routes: DocumentationLinkRoutes,
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
        : ` <span class="api-member-summary">${memberDocumentationHtml(pkg, entry, item, summary, routes)}</span>`;
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
        : [
            `<p class="api-member-doc">${memberDocumentationHtml(pkg, entry, item, documentation, routes)}</p>`,
          ]),
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
  routes: DocumentationLinkRoutes = new Map(),
): Promise<string> {
  const label = entryLabel(pkg, entry);
  const source = packageSourcePath(pkg.name, item.source);
  const summary = documentationMarkdown(pkg, entry, item, routes);
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
    body.push(renderMembers(pkg, entry, item, shape.members, routes), "");
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

export function renderEntryPage(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  routes: DocumentationLinkRoutes = new Map(),
): string {
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
          const summary = compactSummary(documentationMarkdown(pkg, entry, item, routes));
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
  rows: number;
  status: string;
  medianMs: number;
  p95Ms: number;
  madMs: number;
  memory: { beforeBytes: number; afterBytes: number; deltaBytes: number };
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
  completeness?: { failedKeys: string[]; missingKeys: string[]; complete: boolean };
}

interface CaptureMeta {
  commit: string;
  dirty: boolean;
  timestamp: string;
}

function captureMetaOf(value: Record<string, unknown>): CaptureMeta | undefined {
  const raw = value.metadata ?? value.meta;
  if (raw === null || typeof raw !== "object") return undefined;
  const meta = raw as Record<string, unknown>;
  if (
    typeof meta.commit !== "string" ||
    meta.dirty !== false ||
    typeof meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(meta.timestamp))
  ) {
    return undefined;
  }
  return { commit: meta.commit, dirty: meta.dirty, timestamp: meta.timestamp };
}

/**
 * Landing-page benchmark summary. Each engine is aggregated across rounds
 * exactly like the evidence page, then ratios pair per scenario - never a
 * ratio of cross-scenario medians. Real numbers only: when the artifact is
 * missing or invalid the landing renders a "run the protocol" placeholder.
 */
async function renderLandingBench(): Promise<string> {
  return landingBenchPayload(
    await loadEvidence(
      "bench/results/render-scale.json",
      "bun run --filter @sheetwrite/bench bench:render:scale",
      validateRenderArtifact,
    ),
  );
}

/** Pure payload builder, exported so the finite/fallback contract is testable. */
export function landingBenchPayload(
  scale: { evidence: ValidatedRenderEvidence; source: string } | EvidenceState,
): string {
  const round1 = (value: number): number => Math.round(value * 10) / 10;
  if (!("evidence" in scale)) {
    return `${JSON.stringify({ available: false, reason: scale.reason }, null, 2)}\n`;
  }
  const { evidence } = scale;
  const mid = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  };
  const successes = (size: number, engine: string, scenario: string): RenderEvidenceResult[] =>
    evidence.results.filter(
      (result) =>
        result.rows === size &&
        result.engine === engine &&
        result.scenarioId === scenario &&
        result.status === "success",
    );
  // Sizes with zero full-round pairs are omitted rather than emitted as NaN
  // (JSON.stringify silently turns NaN into null and the landing would render
  // it as a number).
  const sizes = evidence.config.rows.flatMap((size) => {
    const ratios: Array<{ scenario: string; ratio: number }> = [];
    let handsontableIncomplete = 0;
    for (const scenario of evidence.config.scenarios) {
      const ours = successes(size, "sheetwrite", scenario);
      const theirs = successes(size, "handsontable", scenario);
      // Round-aware: a bucket with fewer successes than the declared round
      // count is incomplete, and only full-round pairs enter the ratios.
      if (theirs.length < evidence.metadata.rounds) handsontableIncomplete += 1;
      if (ours.length < evidence.metadata.rounds || theirs.length < evidence.metadata.rounds)
        continue;
      ratios.push({
        scenario,
        ratio: mid(theirs.map((r) => r.medianMs)) / mid(ours.map((r) => r.medianMs)),
      });
    }
    if (ratios.length === 0) return [];
    const best = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    return [
      {
        size,
        comparedScenarios: ratios.length,
        medianRatio: round1(mid(ratios.map((r) => r.ratio))),
        bestRatio: round1(best.ratio),
        bestScenario: best.scenario,
        handsontableIncomplete,
      },
    ];
  });
  const scenarioMedians: number[] = [];
  const scenarioHeaps: number[] = [];
  for (const scenario of evidence.config.scenarios) {
    const bucket = successes(1_000_000, "sheetwrite", scenario);
    // Hero stats hold the same full-round bar as the ratio pairs.
    if (bucket.length < evidence.metadata.rounds) continue;
    scenarioMedians.push(mid(bucket.map((r) => r.medianMs)));
    scenarioHeaps.push(mid(bucket.map((r) => r.memory.afterBytes)));
  }
  const heroStats = {
    millionRowScenarios: scenarioMedians.length,
    millionRowMedianMs: round1(mid(scenarioMedians)),
    millionRowHeapMb: Math.round(mid(scenarioHeaps) / 1_000_000),
  };
  const displayed = [
    ...sizes.flatMap((entry) => [entry.medianRatio, entry.bestRatio]),
    heroStats.millionRowMedianMs,
    heroStats.millionRowHeapMb,
  ];
  // Never publish a payload whose displayed values are not all finite: a
  // structurally valid artifact with no comparable pairs must fall back to
  // the "run the protocol" placeholder, not render null.
  if (sizes.length === 0 || displayed.some((value) => !Number.isFinite(value))) {
    return `${JSON.stringify(
      { available: false, reason: "artifact has no full-round engine pairs to compare" },
      null,
      2,
    )}\n`;
  }
  const payload = {
    available: true,
    capture: {
      commit: evidence.metadata.commit,
      timestamp: evidence.metadata.timestamp,
      browser: `Chromium ${evidence.metadata.browserVersion}`,
      rounds: evidence.metadata.rounds,
    },
    heroStats,
    sizes,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function loadEvidence<T>(
  relPath: string,
  reproduction: string,
  validate: (value: Record<string, unknown>) => T | string,
): Promise<{ evidence: T; source: string } | EvidenceState> {
  const path = join(repositoryRoot, relPath);
  const source = posix(relative(repositoryRoot, path));
  if (!(await exists(path)))
    return { available: false, reason: "artifact is missing", source, reproduction };
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (captureMetaOf(value) === undefined) {
      return {
        available: false,
        reason:
          "artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established",
        source,
        reproduction,
      };
    }
    const evidence = validate(value);
    if (typeof evidence === "string") {
      return { available: false, reason: evidence, source, reproduction };
    }
    return { evidence, source };
  } catch {
    return { available: false, reason: "artifact is not valid JSON", source, reproduction };
  }
}

function validateRenderArtifact(value: Record<string, unknown>): ValidatedRenderEvidence | string {
  const artifact = value as unknown as Partial<ValidatedRenderEvidence>;
  const metadata = artifact.metadata;
  const config = artifact.config;
  const results = artifact.results;
  if (
    artifact.protocolVersion !== 1 ||
    metadata === undefined ||
    !Number.isInteger(metadata.rounds) ||
    metadata.rounds < 1 ||
    !Array.isArray(metadata.launchAttempts) ||
    !metadata.launchAttempts.every((attempt) => attempt.success === true) ||
    config === undefined ||
    !Array.isArray(config.engines) ||
    !Array.isArray(config.rows) ||
    !Array.isArray(config.scenarios) ||
    !Array.isArray(results)
  ) {
    return "artifact does not match controlled render protocol version 1";
  }
  // Failed cells are allowed - the page reports them as crashes - but every
  // present result must be internally valid.
  // Failed cells legitimately carry null samples; only successes must be finite.
  const valid = results.every(
    (result) =>
      result.status !== "success" ||
      (Number.isFinite(result.medianMs) &&
        Number.isFinite(result.p95Ms) &&
        Number.isFinite(result.memory?.afterBytes) &&
        Array.isArray(result.validation)),
  );
  if (!valid) return "controlled render results carry non-finite samples";
  return artifact as ValidatedRenderEvidence;
}

interface DataEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta & { bun: string };
  sheetwrite: Record<
    string,
    { rows: number; stats: Record<string, { median: number; p95: number }> }
  >;
  handsontable: Record<
    string,
    { rows: number; stats: Record<string, { median: number; p95: number }> }
  >;
}

function validateDataArtifact(value: Record<string, unknown>): DataEvidence | string {
  const artifact = value as unknown as Partial<DataEvidence>;
  if (artifact.protocolVersion !== 1 || artifact.mode !== "full") {
    return "artifact is not a full-mode data protocol capture";
  }
  for (const engine of ["sheetwrite", "handsontable"] as const) {
    const block = artifact[engine];
    if (block === undefined || typeof block !== "object") return `artifact lacks ${engine} results`;
    for (const entry of Object.values(block)) {
      for (const stat of Object.values(entry.stats)) {
        if (!Number.isFinite(stat.median) || !Number.isFinite(stat.p95)) {
          return "data medians carry non-finite samples";
        }
      }
    }
  }
  return artifact as DataEvidence;
}

interface FormulaEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta;
  workloads: Array<{ id: string; size: number; stat: { median: number; p95: number } }>;
  memory: Array<{ formulas: number; wasmDeltaBytes: number }>;
}

function validateFormulaArtifact(value: Record<string, unknown>): FormulaEvidence | string {
  const artifact = value as unknown as Partial<FormulaEvidence>;
  if (artifact.protocolVersion !== 1 || artifact.mode !== "full") {
    return "artifact is not a full-mode formula protocol capture";
  }
  if (!Array.isArray(artifact.workloads) || artifact.workloads.length === 0) {
    return "artifact carries no formula workloads";
  }
  if (
    !artifact.workloads.every(
      (workload) => Number.isFinite(workload.stat?.median) && Number.isFinite(workload.stat?.p95),
    )
  ) {
    return "formula workloads carry non-finite samples";
  }
  return artifact as FormulaEvidence;
}

const BENCH_SIZES = [1_000, 10_000, 100_000, 1_000_000] as const;
const BENCH_ENGINE_LABELS = { sheetwrite: "Sheetwrite", handsontable: "Handsontable" } as const;
type BenchEngine = keyof typeof BENCH_ENGINE_LABELS;

function fmtMs(value: number): string {
  // "0.00 ms" reads like a broken benchmark; sub-hundredth values are real
  // measurements in the microsecond range.
  if (value > 0 && value < 0.0095) return `${Math.max(1, Math.round(value * 1000))} µs`;
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function fmtMb(value: number): string {
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

interface BenchPairStat {
  main: number;
  faded: number;
}

/** One widget row: label, ratio chip, and a bar per engine (or a crash card). */
function benchPairRow(
  label: string,
  ours: BenchPairStat | undefined,
  theirs: BenchPairStat | undefined,
  fmt: (value: number) => string,
  betterChip: [string, string],
  pct: (value: number) => string,
  fadedBar = true,
): string {
  const bar = (engine: BenchEngine, stats: BenchPairStat | undefined): string => {
    if (stats === undefined) {
      return (
        `<div class="bench-bar" data-engine="${engine}" data-crashed="">` +
        `<span class="bench-bar__engine">${BENCH_ENGINE_LABELS[engine]}</span>` +
        `<span class="bench-crash">did not complete</span>` +
        `</div>`
      );
    }
    return (
      `<div class="bench-bar" data-engine="${engine}">` +
      `<span class="bench-bar__engine">${BENCH_ENGINE_LABELS[engine]}</span>` +
      `<span class="bench-bar__track" aria-hidden="true">` +
      // A faded tail only renders when it can extend past the fill (speed
      // p95 >= median); memory deltas sit under the footprint and would hide.
      (fadedBar ? `<i class="bench-bar__spread" style="width:${pct(stats.faded)}"></i>` : "") +
      `<i class="bench-bar__fill" style="width:${pct(stats.main)}"></i></span>` +
      `<span class="bench-bar__value"><b class="bench-num" data-stat="median">${fmt(stats.main)}</b><b class="bench-num" data-stat="p95">${fmt(stats.faded)}</b></span>` +
      `</div>`
    );
  };
  let chip: string;
  let outcome: string;
  if (ours === undefined || theirs === undefined) {
    outcome = ours === undefined ? "crashed" : "solo";
    chip =
      ours === undefined
        ? '<span class="bench-viz__ratio" data-kind="crashed">Sheetwrite did not complete</span>'
        : '<span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span>';
  } else {
    const faster = theirs.main >= ours.main;
    const ratio = (faster ? theirs.main / ours.main : ours.main / theirs.main).toFixed(1);
    outcome = faster ? "faster" : "slower";
    chip = `<span class="bench-viz__ratio"><strong>${ratio}×</strong> ${faster ? betterChip[0] : betterChip[1]}</span>`;
  }
  return [
    `<div class="bench-viz__row" data-outcome="${outcome}">`,
    `<div class="bench-viz__head"><code>${label}</code>${chip}</div>`,
    bar("sheetwrite", ours),
    bar("handsontable", theirs),
    "</div>",
  ].join("\n");
}

function benchPanel(
  size: number,
  metric: "speed" | "memory",
  rows: string[],
  note: string,
  scale: BenchScale,
): string {
  return [
    `<section class="bench-panel bench-ruled" data-size="${size}" data-metric="${metric}" style="--bench-segs:${scale.segments}">`,
    `<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">${note}</span><span class="bench-viz__legend">${
      metric === "speed"
        ? '<i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95'
        : '<i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span>'
    }</span></div>`,
    scale.ruler,
    ...rows,
    "</section>",
  ].join("\n");
}

interface BenchScale {
  pct: (value: number) => string;
  ruler: string;
  segments: number;
}

function trimTick(value: number): string {
  if (value >= 1000) return `${value / 1000}k`;
  if (value >= 1) return `${Number(value.toFixed(value >= 100 ? 0 : 1))}`;
  return `${Number(value.toPrecision(1))}`;
}

function benchRuler(ticks: string[]): string {
  return (
    '<div class="bench-bar bench-bar--ruler" aria-hidden="true">' +
    '<span class="bench-bar__engine"></span>' +
    `<span class="bench-bar__track">${ticks.join("")}</span>` +
    '<span class="bench-bar__value"></span>' +
    "</div>"
  );
}

/**
 * Shared per-panel log scale: every bar maps through the same decade domain,
 * so lengths compare across rows, and the ruler labels each 10x tick. The
 * domain is the observed values' decade envelope (capped at five decades so
 * sub-microsecond noise cannot flatten the axis).
 */
function benchLogScale(values: number[], fmt: (value: number) => string): BenchScale {
  const positive = values.filter((value) => value > 0);
  const maxValue = positive.length ? Math.max(...positive) : 1;
  const minValue = positive.length ? Math.min(...positive) : 0.1;
  const hi = Math.ceil(Math.log10(maxValue));
  const lo = Math.min(Math.floor(Math.log10(Math.max(minValue, maxValue / 100_000))), hi - 1);
  const segments = hi - lo;
  const pct = (value: number): string => {
    if (!(value > 0)) return "0.60%";
    const t = ((Math.log10(value) - lo) / segments) * 100;
    return `${Math.min(100, Math.max(0.6, t)).toFixed(2)}%`;
  };
  const ticks: string[] = [];
  for (let exp = lo; exp <= hi; exp++) {
    const at = ((exp - lo) / segments) * 100;
    const value = 10 ** exp;
    // The last tick carries the unit; a second reads better than "1000.0 ms".
    const label = exp === hi ? (value >= 1000 ? `${value / 1000} s` : fmt(value)) : trimTick(value);
    ticks.push(`<span class="bench-ruler__tick" style="left:${at.toFixed(2)}%">${label}</span>`);
  }
  return { pct, ruler: benchRuler(ticks), segments };
}

/** Shared linear scale (memory panels: footprints live within one decade). */
function benchLinearScale(values: number[], fmt: (value: number) => string): BenchScale {
  const maxValue = Math.max(...values.filter((value) => value > 0), 1);
  const pct = (value: number): string =>
    `${Math.min(100, Math.max(0.6, (value / maxValue) * 100)).toFixed(2)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    // Every nonzero tick goes through the panel formatter - these are raw
    // values (bytes for memory), not display numbers.
    const label = t === 0 ? "0" : fmt(maxValue * t);
    return `<span class="bench-ruler__tick" style="left:${(t * 100).toFixed(2)}%">${label}</span>`;
  });
  return { pct, ruler: benchRuler(ticks), segments: 4 };
}

/** Collapsible methodology block: protocol prose plus per-scenario meanings. */
function benchMethod(
  summary: string,
  paragraphs: string[],
  entries: Array<[string, string]>,
): string {
  return [
    '<details class="bench-method" data-pagefind-ignore>',
    `<summary>${summary}</summary>`,
    '<div class="bench-method__body">',
    ...paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
    "<dl>",
    ...entries.map(([term, def]) => `<div><dt><code>${term}</code></dt><dd>${def}</dd></div>`),
    "</dl>",
    "</div>",
    "</details>",
  ].join("\n");
}

const RENDER_METHOD = benchMethod(
  "Methodology - what each scenario does",
  [
    "Live grid in controlled headless Chromium. Ten counterbalanced rounds; all fourteen scenarios run warm per mount, and the fixture is rebuilt after any failure so crashes cannot leak state. Every scenario must prove its effect (scroll really moved, editor really opened, rows really changed) or it fails.",
    "Bright = median round, faded = p95 round. <strong>Did not complete</strong> = recorded crash, timeout, or failed checkpoint - never a timing.",
  ],
  [
    [
      "scroll-down.top-left",
      "From the origin, jump-scroll 50 px down: a fresh row band enters the viewport and must paint.",
    ],
    [
      "scroll-down.middle",
      "The same 50 px jump starting from the vertical middle of the scroll range.",
    ],
    [
      "scroll-smooth.same-window",
      "Scroll 1 px without changing the visible row window: pure repaint cost, zero new data.",
    ],
    ["scroll-right.top-left", "Jump-scroll 50 px right: a fresh column band paints."],
    ["edit-open.top-left", "Select a cell near the origin and open its editor."],
    ["edit-open.middle", "Open the editor on the center cell of the workbook."],
    [
      "edit-open.bottom-right",
      "Open the editor on the last row and column - the far end of every index.",
    ],
    ["edit-commit.middle", "Commit a typed value into the center cell and paint the result."],
    ["altering.insert-5-rows-top", "Insert five rows at the top: every following row reindexes."],
    ["altering.remove-5-rows-top", "Remove those five rows again - the inverse reindex."],
    [
      "arrow-down.top-left",
      "Move the selection one cell down with the arrow key, including the selection overlay repaint.",
    ],
    ["arrow-right.middle", "Arrow-key selection move at the workbook center."],
    ["formatted-paint.top-left", "Repaint a viewport dense with per-cell formatting."],
    [
      "merge-heavy.paint",
      "Repaint a viewport dense with merged ranges; Sheetwrite additionally proves it builds exactly one merge revision index.",
    ],
  ],
);

const DATA_METHOD = benchMethod(
  "Methodology - what each operation does",
  [
    "Identical columnar datasets, per-operation warmup and iteration plans. Fresh instance per ingest; window reads rotate offsets to defeat caches; sort and filter reset between runs; Handsontable edits run with rendering suspended so only its data path is timed.",
    "Memory = JS-heap delta around one ingest in an isolated subprocess, plus Sheetwrite's WASM linear-memory delta.",
  ],
  [
    ["ingest", "Load the full dataset into a fresh engine instance."],
    ["windowRead", "Read a 50x5 cell window at a rotating offset that sweeps the whole sheet."],
    ["edit", "1,000 single-cell edits."],
    ["sort", "Sort by the numeric amount column."],
    ["filter", "Substring filter over the city column."],
    ["aggregate", "Numeric aggregation over the amount column."],
  ],
);

const FORMULA_METHOD = benchMethod(
  "Methodology - what each workload does",
  [
    "Each workload builds a fresh WASM cell-store of the named dependency shape and times the recalculation from one action - usually a single edit. Sizes are formula-cell counts; bright = median, faded = p95.",
  ],
  [
    ["linear-chain", "A chain A1 -> A2 -> ... -> AN; editing the head recomputes the full depth."],
    ["wide-fan-out-edit", "One scalar feeds N dependent formulas; edit the scalar."],
    ["diamond-edit", "Fan-out that reconverges (diamond graph); edit the apex."],
    ["shared-range-edit", "N formulas aggregate one shared range; edit one cell inside it."],
    ["distinct-range-edit", "Each formula owns its own range; one edit recomputes only its owner."],
    ["cross-sheet-range-edit", "Summary-sheet formulas range over another sheet; edit the source."],
    [
      "scalar-edit-affects-N",
      "One scalar edit invalidating exactly N dependents; N=0 touches an unrelated cell, so it prices pure dependency lookup.",
    ],
    ["topology-remove-add", "Remove and re-add rows so the dependency graph itself changes shape."],
    ["cycles", "Introduce a reference cycle; detection and cycle-error propagation."],
    [
      "removed-sheet-ref",
      "Formulas referencing a deleted sheet must all degrade to reference errors.",
    ],
    ["error-propagation", "An error value (=1/0) flows through every dependent."],
    [
      "criteria-range-edit",
      "Criteria-style aggregation (SUMIF shape) over 100k cells; edit inside the criteria range.",
    ],
    [
      "lookup-range-edit",
      "Lookup-shape formulas over 100k cells; edit inside the looked-up range.",
    ],
  ],
);

/**
 * Single-engine scaling figure: one row per operation/workload, one bar per
 * input size. Every bar maps through the figure-wide log scale, so even a
 * single-size workload's bar carries information - its position on the ruler.
 */
function benchScaleFigure(
  lead: string,
  groups: Array<{
    label: string;
    entries: Array<{ sizeLabel: string; median: number; p95: number; size: number }>;
  }>,
): string[] {
  const scale = benchLogScale(
    groups.flatMap((group) => group.entries.flatMap((entry) => [entry.median, entry.p95])),
    fmtMs,
  );
  const lines = [
    `<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:${scale.segments}">`,
    `<div class="bench-viz__scale"><span class="bench-viz__lead">${lead}</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>`,
    scale.ruler,
  ];
  for (const group of groups) {
    if (group.entries.length === 0) continue;
    lines.push(
      '<div class="bench-viz__row" data-outcome="faster">',
      `<div class="bench-viz__head"><code>${group.label}</code></div>`,
    );
    for (const entry of group.entries) {
      const pct = scale.pct;
      lines.push(
        `<div class="bench-bar" data-engine="sheetwrite">` +
          `<span class="bench-bar__engine">${entry.sizeLabel}</span>` +
          `<span class="bench-bar__track" aria-hidden="true">` +
          `<i class="bench-bar__spread" style="width:${pct(entry.p95)}"></i>` +
          `<i class="bench-bar__fill" style="width:${pct(entry.median)}"></i></span>` +
          `<span class="bench-bar__value"><b class="bench-num" data-stat="median">${fmtMs(entry.median)}</b><b class="bench-num" data-stat="p95">${fmtMs(entry.p95)}</b></span>` +
          `</div>`,
      );
    }
    lines.push("</div>");
  }
  lines.push("</figure>");
  return lines;
}

/** The two-axis (size x metric) CSS-only tab widget for the render benchmark. */
function renderBenchWidget(evidence: ValidatedRenderEvidence): string {
  const mid = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  };
  const sizes = BENCH_SIZES.filter((size) => evidence.config.rows.includes(size));
  const parts: string[] = ['<figure class="bench-viz bench-widget" data-pagefind-ignore>'];
  for (const size of sizes) {
    parts.push(
      // No checked attribute: hydrated React treats it as a controlled input
      // and reverts user toggles. Default state (100k/speed) lives in CSS.
      `<input type="radio" name="bench-size" id="bench-size-${size}">`,
    );
  }
  parts.push(
    '<input type="radio" name="bench-metric" id="bench-metric-speed">',
    '<input type="radio" name="bench-metric" id="bench-metric-memory">',
    '<div class="bench-widget__tabs">',
    '<div class="bench-tabs" aria-label="Workbook size">',
    ...sizes.map((size) => `<label for="bench-size-${size}">${fmtRows(size)} rows</label>`),
    "</div>",
    '<div class="bench-tabs bench-tabs--metric" aria-label="Metric">',
    '<label for="bench-metric-speed">Speed</label>',
    '<label for="bench-metric-memory">Memory</label>',
    "</div>",
    "</div>",
  );
  for (const size of sizes) {
    const byScenario = new Map<string, Map<string, RenderEvidenceResult[]>>();
    for (const result of evidence.results) {
      if (result.rows !== size || result.status !== "success") continue;
      const engines =
        byScenario.get(result.scenarioId) ?? new Map<string, RenderEvidenceResult[]>();
      byScenario.set(result.scenarioId, engines);
      const bucket = engines.get(result.engine) ?? [];
      engines.set(result.engine, bucket);
      bucket.push(result);
    }
    type Pair = [string, BenchPairStat | undefined, BenchPairStat | undefined];
    const speedPairs: Pair[] = [];
    const memoryPairs: Pair[] = [];
    for (const scenario of evidence.config.scenarios) {
      const engines = byScenario.get(scenario);
      const ours = engines?.get("sheetwrite");
      const theirs = engines?.get("handsontable");
      const speedStat = (bucket?: RenderEvidenceResult[]): BenchPairStat | undefined =>
        bucket?.length
          ? { main: mid(bucket.map((r) => r.medianMs)), faded: mid(bucket.map((r) => r.p95Ms)) }
          : undefined;
      const memoryStat = (bucket?: RenderEvidenceResult[]): BenchPairStat | undefined =>
        bucket?.length
          ? {
              main: mid(bucket.map((r) => r.memory.afterBytes)),
              faded: mid(bucket.map((r) => Math.max(0, r.memory.deltaBytes))),
            }
          : undefined;
      speedPairs.push([scenario, speedStat(ours), speedStat(theirs)]);
      memoryPairs.push([scenario, memoryStat(ours), memoryStat(theirs)]);
    }
    const speedScale = benchLogScale(
      speedPairs.flatMap(([, a, b]) => [a, b].flatMap((s) => (s ? [s.main, s.faded] : []))),
      fmtMs,
    );
    const memoryScale = benchLinearScale(
      memoryPairs.flatMap(([, a, b]) => [a, b].flatMap((s) => (s ? [s.main] : []))),
      fmtMb,
    );
    const speedRows = speedPairs.map(([scenario, a, b]) =>
      benchPairRow(scenario, a, b, fmtMs, ["faster", "slower"], speedScale.pct),
    );
    const memoryRows = memoryPairs.map(([scenario, a, b]) =>
      benchPairRow(scenario, a, b, fmtMb, ["leaner", "heavier"], memoryScale.pct, false),
    );
    parts.push(
      benchPanel(
        size,
        "speed",
        speedRows,
        "log scale — every tick is 10× — shorter is faster",
        speedScale,
      ),
      benchPanel(
        size,
        "memory",
        memoryRows,
        "renderer heap after interaction — linear — shorter is leaner",
        memoryScale,
      ),
    );
  }
  parts.push(
    "<figcaption>Every bar in a panel shares the ruler's scale (speed is logarithmic - each tick is 10x), so lengths compare across rows as well as within them. Bright numbers are the median run; faded numbers are the p95 run (speed) or the interaction's heap delta (memory). Rows marked as not completed are runs the engine could not finish - the recorded failure (crash, timeout, or failed correctness checkpoint) lives in the raw artifact.</figcaption>",
    "</figure>",
  );
  return parts.join("\n");
}

/**
 * Run-completion arithmetic for the evidence headline. `results` already
 * contains failed entries - failedKeys must never be added on top (that
 * double-count published 1120/1140 for a 1120-cell matrix).
 */
export function runCompletionSummary(results: ReadonlyArray<{ status: string }>): {
  successes: number;
  total: number;
  failures: number;
} {
  const successes = results.filter((result) => result.status === "success").length;
  return { successes, total: results.length, failures: results.length - successes };
}

export async function renderEvidencePage(sizeHistoryOverride?: SizeHistory): Promise<string> {
  const scale = await loadEvidence(
    "bench/results/render-scale.json",
    "bun run --filter @sheetwrite/bench bench:render:scale",
    validateRenderArtifact,
  );
  const data = await loadEvidence(
    "bench/results/data-results.json",
    "bun run --filter @sheetwrite/bench bench:data",
    validateDataArtifact,
  );
  const formula = await loadEvidence(
    "bench/results/formula-results.json",
    "bun run --filter @sheetwrite/bench bench:formula",
    validateFormulaArtifact,
  );
  const sizeHistory =
    sizeHistoryOverride ??
    validateSizeHistory(
      JSON.parse(await readFile(resolve(repositoryRoot, "scripts/size-history.json"), "utf8")),
    );
  const pending: EvidenceState[] = [];
  const lines = [
    frontmatter(
      "Performance and delivery evidence",
      "Freshness-gated benchmark and package-size evidence for Sheetwrite.",
    ).trimEnd(),
    "Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.",
    "",
    "## Matched local regression check",
    "",
    "Timing comparisons run deliberately on a controlled local machine, not as a required CI job. Capture ten fresh matched rounds, retain every raw sample, and compare the fresh artifact with the committed baseline. Any unapproved slowdown fails the local command.",
    "",
    '```sh verify title="Zero-regression benchmark"',
    "bun run --filter @sheetwrite/bench bench:render:prepare",
    "cd bench",
    "bun run src/render-driver.ts --rounds 10 --output results/render-fresh.json --markdown-output results/render-fresh.md",
    "bun run src/check.ts --baseline results/render-baseline.json --fresh results/render-fresh.json --power-mode balanced --concurrency 1",
    "```",
    "",
    "A result is a regression decision only when that final baseline check passes on the declared power mode and concurrency. `bench:verify` remains a smoke and safety-ceiling check.",
    "",
    "## Render benchmark",
    "",
  ];
  if ("evidence" in scale) {
    const { evidence, source } = scale;
    const metadata = evidence.metadata;
    const { successes, total, failures } = runCompletionSummary(evidence.results);
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${successes}/${total} engine/scenario/round runs completed across ${evidence.config.rows.length} workbook sizes; every completed run passed its correctness checkpoints${failures > 0 ? `; ${failures} runs did not finish and are shown as such` : ""}.</div>`,
      "",
      "Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:",
      "",
      '<dl class="bench-meta" data-pagefind-ignore>',
      `<div><dt>Captured</dt><dd>${metadata.timestamp.slice(0, 16).replace("T", " ")} UTC</dd></div>`,
      `<div><dt>Commit</dt><dd><code>${metadata.commit.slice(0, 12)}</code> clean worktree</dd></div>`,
      `<div><dt>Environment</dt><dd>Chromium ${metadata.browserVersion} · ${html(metadata.cpu)}</dd></div>`,
      `<div><dt>Protocol</dt><dd>${metadata.rounds} rounds · raw artifact <code>${source}</code></dd></div>`,
      "</dl>",
      "",
      renderBenchWidget(evidence),
      "",
      RENDER_METHOD,
      "",
      "Reproduce and validate with:",
      "",
      '```sh verify title="Controlled render evidence"',
      "bun run --filter @sheetwrite/bench bench:render:prepare",
      "bun run --filter @sheetwrite/bench bench:render:scale",
      "```",
      "",
    );
  } else {
    pending.push(scale);
  }
  lines.push(
    "## Runtime resource ownership",
    "",
    "The performance showcase at `/showcases/performance#resource-ownership` renders the public [`RuntimeResourceSnapshot`](/docs/api/core/runtime-resource-snapshot/) protocol directly. It keeps exclusive-owner logical bytes, allocated capacity, WASM committed pages, and independent browser runtime observations in separate buckets; committed pages are never summed into live payload. Bulk-edit before/settled deltas use [`diffRuntimeResourcePhases`](/docs/api/core/diff-runtime-resource-phases/) and omit unchanged owners.",
    "",
    "The UI and this reference share [`RUNTIME_RESOURCE_SCHEMA_VERSION`](/docs/api/core/runtime-resource-schema-version/). Detailed peak phases remain in the validated benchmark artifact rather than being presented as measurements from the visitor's browser.",
    "",
    "Reproduce and validate the full owner/operation matrix with:",
    "",
    '```sh verify title="Runtime resource evidence"',
    "bun run --filter @sheetwrite/bench bench:resource",
    "```",
    "",
  );
  lines.push("## Data engine benchmark", "");
  if ("evidence" in data) {
    const { evidence, source } = data;
    const ops = ["ingest", "windowRead", "edit", "sort", "filter", "aggregate"] as const;
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>`,
      "",
      '<dl class="bench-meta" data-pagefind-ignore>',
      `<div><dt>Captured</dt><dd>${evidence.meta.timestamp.slice(0, 16).replace("T", " ")} UTC</dd></div>`,
      `<div><dt>Commit</dt><dd><code>${evidence.meta.commit.slice(0, 12)}</code> clean worktree</dd></div>`,
      `<div><dt>Raw artifact</dt><dd><code>${source}</code></dd></div>`,
      "</dl>",
      "",
      '<figure class="bench-viz bench-widget bench-widget--data" data-pagefind-ignore>',
      // Uncontrolled radios (a checked attr would make hydrated React revert
      // user toggles); the 10k default lives in CSS fallbacks.
      '<input type="radio" name="bench-data-size" id="bench-data-1000">',
      '<input type="radio" name="bench-data-size" id="bench-data-10000">',
      '<div class="bench-widget__tabs">',
      '<div class="bench-tabs" aria-label="Workbook size">',
      '<label for="bench-data-1000">1k rows</label>',
      '<label for="bench-data-10000">10k rows</label>',
      "</div>",
      "</div>",
    );
    for (const rows of [1_000, 10_000]) {
      const ours = evidence.sheetwrite[String(rows)];
      const theirs = evidence.handsontable[String(rows)];
      if (!ours || !theirs) continue;
      const scale = benchLogScale(
        ops.flatMap((op) =>
          [ours.stats[op], theirs.stats[op]].flatMap((s) => (s ? [s.median, s.p95] : [])),
        ),
        fmtMs,
      );
      lines.push(
        `<section class="bench-panel bench-ruled" data-size="${rows}" data-metric="speed" style="--bench-segs:${scale.segments}">`,
        `<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>`,
        scale.ruler,
      );
      for (const op of ops) {
        const a = ours.stats[op];
        const b = theirs.stats[op];
        if (!a || !b) continue;
        lines.push(
          benchPairRow(
            op,
            { main: a.median, faded: a.p95 },
            { main: b.median, faded: b.p95 },
            fmtMs,
            ["faster", "slower"],
            scale.pct,
          ),
        );
      }
      lines.push("</section>");
    }
    lines.push(
      "</figure>",
      "",
      "Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:",
      "",
      ...benchScaleFigure(
        "operation",
        ops.map((op) => ({
          label: op,
          entries: [100_000, 500_000, 1_000_000].flatMap((rows) => {
            const stat = evidence.sheetwrite[String(rows)]?.stats[op];
            return stat === undefined
              ? []
              : [
                  {
                    sizeLabel: `${fmtRows(rows)} rows`,
                    median: stat.median,
                    p95: stat.p95,
                    size: rows,
                  },
                ];
          }),
        })),
      ),
    );
    lines.push(
      "",
      DATA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Data engine evidence"',
      "bun run --filter @sheetwrite/bench bench:data",
      "```",
      "",
    );
  } else {
    pending.push(data);
  }
  lines.push("## Formula engine benchmark", "");
  if ("evidence" in formula) {
    const { evidence, source } = formula;
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.workloads.length} recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>`,
      "",
      '<dl class="bench-meta" data-pagefind-ignore>',
      `<div><dt>Captured</dt><dd>${evidence.meta.timestamp.slice(0, 16).replace("T", " ")} UTC</dd></div>`,
      `<div><dt>Commit</dt><dd><code>${evidence.meta.commit.slice(0, 12)}</code> clean worktree</dd></div>`,
      `<div><dt>Raw artifact</dt><dd><code>${source}</code></dd></div>`,
      "</dl>",
      "",
    );
    // The scalar-edit-affects-N workloads are one scaling series (recompute
    // cost tracks affected dependents, not sheet size); published as separate
    // one-row groups their near-zero baselines read like broken benchmarks.
    const SCALAR_FAMILY = /^scalar-edit-affects-(\d+)$/;
    const scalarEntries = evidence.workloads
      .filter((workload) => SCALAR_FAMILY.test(workload.id))
      .map((workload) => {
        const affected = Number(SCALAR_FAMILY.exec(workload.id)![1]);
        return { workload, affected };
      })
      .sort((left, right) => left.affected - right.affected);
    const workloadIds = [
      ...new Set(
        evidence.workloads.map((workload) => workload.id).filter((id) => !SCALAR_FAMILY.test(id)),
      ),
    ].sort();
    const scalarGroup =
      scalarEntries.length === 0
        ? []
        : [
            {
              label: "scalar-edit-affects",
              entries: scalarEntries.map(({ workload, affected }) => ({
                sizeLabel: `${affected.toLocaleString("en-US")} affected`,
                median: workload.stat.median,
                p95: workload.stat.p95,
                size: Math.max(affected, 1),
              })),
            },
          ];
    lines.push(
      ...benchScaleFigure("workload", [
        ...workloadIds.map((id) => ({
          label: id,
          entries: evidence.workloads
            .filter((workload) => workload.id === id)
            .sort((left, right) => left.size - right.size)
            .map((workload) => ({
              sizeLabel: `${workload.size.toLocaleString("en-US")} ${workload.size === 1 ? "cell" : "cells"}`,
              median: workload.stat.median,
              p95: workload.stat.p95,
              size: workload.size,
            })),
        })),
        ...scalarGroup,
      ]),
    );
    lines.push(
      "",
      FORMULA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Formula engine evidence"',
      "bun run --filter @sheetwrite/bench bench:formula",
      "```",
      "",
    );
  } else {
    pending.push(formula);
  }
  lines.push("## Delivery size", "");
  const latestRelease = sizeHistory.releases.at(-1);
  if (latestRelease !== undefined) {
    const packageMetricKeys = Object.keys(latestRelease.metrics).filter((name) =>
      name.endsWith(".tarballBytes"),
    );
    lines.push(
      '<section class="size-history" aria-label="Published package size history">',
      '<p class="size-history__intro">Registry measurements for every published release. Each delta is measured against the release immediately before it.</p>',
    );
    for (let index = sizeHistory.releases.length - 1; index >= 0; index -= 1) {
      const release = sizeHistory.releases[index];
      if (release === undefined) continue;
      const previous = sizeHistory.releases[index - 1];
      const releaseDate =
        release.capturedAt === undefined
          ? "Date not recorded"
          : new Intl.DateTimeFormat("en", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(release.capturedAt));
      const versionStep =
        previous === undefined
          ? `<strong>v${release.version}</strong>`
          : `<span>v${previous.version}</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v${release.version}</strong>`;
      lines.push(
        `<details class="size-history__release"${index === sizeHistory.releases.length - 1 ? ' data-current="true" open' : ""}>`,
        '<summary class="size-history__release-head">',
        `<span class="size-history__version-step">${versionStep}</span>`,
        `<time${release.capturedAt === undefined ? "" : ` datetime="${release.capturedAt}"`}>${release.capturedAt === undefined ? releaseDate : `Measured ${releaseDate}`}</time>`,
        '<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="size-history__table-wrap">',
        '<table class="size-history__table">',
        '<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>',
        "<tbody>",
      );
      for (const key of packageMetricKeys) {
        const packageName = key.slice("package.".length, -".tarballBytes".length);
        const unpackedKey = `package.${packageName}.unpackedBytes`;
        const tarball = release.metrics[key];
        const unpacked = release.metrics[unpackedKey];
        if (!tarball || !unpacked) continue;
        const previousTarball = previous?.metrics[key];
        const previousUnpacked = previous?.metrics[unpackedKey];
        const tarballChange =
          previousTarball === undefined ? undefined : formatMetricDelta(tarball, previousTarball);
        const unpackedChange =
          previousUnpacked === undefined
            ? undefined
            : formatMetricDelta(unpacked, previousUnpacked);
        const tarballDirection =
          previousTarball === undefined || tarball.actual === previousTarball.actual
            ? "flat"
            : tarball.actual > previousTarball.actual
              ? "increase"
              : "decrease";
        const unpackedDirection =
          previousUnpacked === undefined || unpacked.actual === previousUnpacked.actual
            ? "flat"
            : unpacked.actual > previousUnpacked.actual
              ? "increase"
              : "decrease";
        lines.push(
          "<tr>",
          `<th scope="row"><code>${packageName}</code></th>`,
          `<td>${formatMetricDisplay(tarball).join(" ")}${tarballChange ? `<small data-direction="${tarballDirection}"><span>${tarballChange[0]}</span><span>${tarballChange[1]}</span></small>` : ""}</td>`,
          `<td>${formatMetricDisplay(unpacked).join(" ")}${unpackedChange ? `<small data-direction="${unpackedDirection}"><span>${unpackedChange[0]}</span><span>${unpackedChange[1]}</span></small>` : ""}</td>`,
          "</tr>",
        );
      }
      lines.push("</tbody>", "</table>", "</div>", "</details>");
    }
    lines.push(
      '<footer class="size-history__footer"><span>Increase</span><span>Decrease</span><code>scripts/size-history.json</code></footer>',
      "</section>",
      "",
    );
  }
  if (pending.length > 0) {
    lines.push(
      "## Pending local evidence",
      "",
      "These protocols have no validated artifact in this environment yet, so no numbers are published for them.",
      "",
      "| Artifact | Status | Reproduce with |",
      "| --- | --- | --- |",
      ...pending.map(
        (state) => `| \`${state.source}\` | ${state.reason} | \`${state.reproduction}\` |`,
      ),
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function compatibilityCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function compatibilitySource(source: string): string {
  return source.startsWith("https://")
    ? `[spec/source](${source})`
    : `[checked source file](https://github.com/chh-ay/sheetwrite/blob/main/${source})`;
}

function publicCompatibilitySource(source: string): string {
  return source.startsWith("https://") ? source : "/docs/reference/compatibility-results/#sources";
}

export function renderCompatibilityResults(
  records: readonly CompatibilityRecord[] = COMPATIBILITY_INVENTORY,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): string {
  const lines = [
    "---",
    'title: "Detailed compatibility results"',
    'description: "Checked formula, workbook, clipboard, and XLSX examples with exact sources and limits."',
    "---",
    "",
    "# Detailed compatibility results",
    "",
    "This page is generated from checked examples and evidence records. It states only what each named result proves; it is not a percentage or a blanket Excel, Google Sheets, LibreOffice, or OpenFormula compatibility claim.",
    "",
    "Result labels distinguish **evaluated** formulas or structures, **preserved** source or metadata, deliberately **flattened** interchange, explicit **warning** boundaries, and **unsupported** behavior.",
    "",
    '<section class="compat-results" aria-label="Checked compatibility results">',
    ...records.flatMap((record) => {
      const evidence = `${record.fixtureIds.length} checked evidence ${record.fixtureIds.length === 1 ? "record" : "records"}`;
      return [
        '<details class="compat-result">',
        '<summary class="compat-result__summary">',
        `<span class="compat-result__title">${html(record.label)}</span>`,
        '<span class="compat-result__meta">',
        `<code>${html(record.area)}</code>`,
        `<code>${html(record.dialect)}</code>`,
        `<span data-status="${record.status}">${record.status}</span>`,
        "</span>",
        '<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="compat-result__body">',
        "<dl>",
        `<div><dt>Result</dt><dd>${html(record.resultMode)}</dd></div>`,
        `<div><dt>Import</dt><dd>${html(record.importBehavior)}</dd></div>`,
        `<div><dt>Export</dt><dd>${html(record.exportBehavior)}</dd></div>`,
        `<div><dt>Known boundary</dt><dd>${html(record.divergence)}</dd></div>`,
        `<div><dt>Evidence</dt><dd>${evidence}</dd></div>`,
        "</dl>",
        `<a href="/showcases/interoperability/?compatibility=${encodeURIComponent(record.id)}">Open the checked interactive result</a>`,
        "</div>",
        "</details>",
      ];
    }),
    "</section>",
    "",
    "## Warning boundaries",
    "",
    "| Feature | Warning code | Meaning |",
    "| --- | --- | --- |",
    ...records
      .filter((record) => record.warningCode !== null)
      .map(
        (record) =>
          `| ${compatibilityCell(record.label)} | \`${record.warningCode}\` | ${compatibilityCell(record.semantics)} |`,
      ),
    "",
    "<details>",
    "<summary>Technical evidence file details and checksums</summary>",
    "",
    '<div class="compat-evidence-files">',
    ...fixtures.flatMap((fixture) => [
      '<article class="compat-evidence-file">',
      "<header>",
      `<code>${html(fixture.id)}</code>`,
      `<span>${html(fixture.kind)}</span>`,
      "</header>",
      `<p>${html(`${fixture.producer} ${fixture.producerVersion}`)}</p>`,
      "<dl>",
      `<div><dt>Source</dt><dd>${html(fixture.provenance)}</dd></div>`,
      `<div><dt>SHA-256</dt><dd><code>${fixture.sha256 ? html(fixture.sha256) : "source-controlled test or manifest"}</code></dd></div>`,
      `<div><dt>Checked result</dt><dd>${html(fixture.expected.join("; "))}</dd></div>`,
      `<div><dt>Warnings</dt><dd>${html(fixture.expectedWarnings.join("; ") || "none")}</dd></div>`,
      "</dl>",
      "</article>",
    ]),
    "</div>",
    "",
    "</details>",
    "",
    "## Exact sources",
    "",
    ...records.map(
      (record) => `- ${compatibilityCell(record.label)}: ${compatibilitySource(record.source)}`,
    ),
    "",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function collectCompatibilityDigestIssues(
  root: string = repositoryRoot,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): Promise<string[]> {
  const issues: string[] = [];
  for (const fixture of fixtures) {
    if (!fixture.sha256) continue;
    try {
      const bytes = await readFile(join(root, fixture.path));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== fixture.sha256) {
        issues.push(
          `compatibility fixture digest mismatch: ${fixture.id} expected=${fixture.sha256} actual=${actual}`,
        );
      }
    } catch {
      issues.push(`missing compatibility fixture for digest: ${fixture.path}`);
    }
  }
  return issues;
}

export async function expectedGeneratedFiles(manifest: PublicApiManifest): Promise<ExpectedFile[]> {
  const compatibilityIssues = [
    ...collectCompatibilityIssues(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES),
    ...collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
    ...(await collectCompatibilityDigestIssues()),
  ];
  if (compatibilityIssues.length > 0) throw new Error(compatibilityIssues.join("\n"));
  const [formulaInventory, publishedCompatibilityResults] = await Promise.all([
    loadFormulaContractInventory(repositoryRoot),
    compatibilityResults(),
  ]);
  const documentationLinkIssues = unresolvedDocumentationLinks(manifest);
  if (documentationLinkIssues.length > 0) throw new Error(documentationLinkIssues.join("\n"));
  const linkRoutes = documentationLinkRoutes(manifest);
  const apiFiles: ExpectedFile[] = [
    { path: join(contentRoot, "api/index.md"), content: renderApiIndex(manifest) },
    { path: join(generatedDataRoot, "landing-bench.json"), content: await renderLandingBench() },
  ];
  const symbolOwners = new Map<string, string>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      apiFiles.push({
        path: join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
        content: renderEntryPage(pkg, entry, linkRoutes),
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
          content: await renderSymbolPage(pkg, entry, item, linkRoutes),
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
    compatibilitySha256: createHash("sha256")
      .update(JSON.stringify([COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES]))
      .digest("hex"),
    formulaContractSha256: createHash("sha256")
      .update(JSON.stringify(formulaInventory))
      .digest("hex"),
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
      path: join(contentRoot, "reference/compatibility-results.md"),
      content: renderCompatibilityResults(),
    },
    {
      path: join(contentRoot, "reference/formula-functions.md"),
      content: renderFormulaFunctionContract(formulaInventory),
    },
    {
      path: join(generatedDataRoot, "compatibility.json"),
      content: stableJson({
        schemaVersion: 1,
        records: COMPATIBILITY_INVENTORY.map(({ evidence: _evidence, source, ...record }) => ({
          ...record,
          source: publicCompatibilitySource(source),
        })),
        fixtures: COMPATIBILITY_FIXTURES.map(({ path: _path, ...fixture }) => fixture),
      }),
    },
    {
      path: join(generatedDataRoot, "compatibility-results.json"),
      content: stableJson(publishedCompatibilityResults),
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

export function headingAnchors(content: string): Set<string> {
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
      .replace(/\s/g, "-");
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
        const language = fence.language as "ts" | "tsx" | "vue" | "svelte";
        if (partial && prelude === undefined) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} typed partial fence requires a named hover prelude`,
          );
        }
        try {
          const hovers = collectFenceHovers(fence.code, language, hoverAnalyzer, prelude);
          for (const hover of hovers) {
            if (isHighQualityHover(hover, language)) continue;
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
    const linkTargets = [
      ...[...masked.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...masked.matchAll(/\shref=["']([^"']+)["']/gi)].map((match) => match[1]),
    ];
    for (const target of linkTargets) {
      const rawTarget = target?.trim() ?? "";
      if (
        rawTarget.length === 0 ||
        /^(?:https?:|mailto:|tel:)/.test(rawTarget) ||
        rawTarget.startsWith("{")
      ) {
        continue;
      }
      const [targetWithoutFragment = "", fragment] = rawTarget.split("#", 2);
      const [targetRoute = ""] = targetWithoutFragment.split("?", 1);
      let targetPath: string | undefined;
      if (targetRoute === "") targetPath = document.path;
      else if (targetRoute.startsWith("/docs/")) {
        targetPath = contentPathForRoute(targetRoute, documents);
      } else if (targetRoute.startsWith("/") && !targetRoute.includes("..")) {
        const routeSlug = targetRoute.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", ".");
        targetPath = join(repositoryRoot, `docs/src/routes/${routeSlug || "index"}.tsx`);
      } else if (targetRoute.startsWith("/")) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links invalid internal route ${rawTarget}`,
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
  failures.push(...adapterContractIssues(manifest));

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
  // The showcase capability contract gates the docs build: a capability
  // without an owner, route, browser contract, or shared binding must not ship.
  failures.push(
    ...collectCapabilityIssues(CAPABILITY_INVENTORY, CAPABILITY_OWNERS),
    ...collectMissingCapabilityFiles(CAPABILITY_INVENTORY, CAPABILITY_OWNERS, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log("Documentation contract check passed");
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === "generate") await generateDocs();
  else if (mode === "check") await verifyDocs();
  else throw new Error("Usage: bun scripts/docs.ts <generate|check>");
}
